import { transactions as nearApiTransactions, utils as nearApiUtils } from "near-api-js";

import { connectorActionsToNearApiJsActions, type ConnectorAction } from "../utils/action";
import type { Network, SignInAndSignMessageParams, SignInParams, SignMessageParams, SignedMessage } from "../utils/types";

import { Auth0Client, decodeJwt } from "./auth0";
import { getConfig, getDerivationPath } from "./config";
import * as near from "./near";
import type { NearTransaction } from "./near";
import { relaySignature } from "./relayer";
import { pickAccount } from "./ui";

interface Session {
    sub: string;
    accountId: string;
    publicKey: string;
}

const SIGN_IN_SCOPE = "openid";
const SIGNING_SCOPE = "openid transaction:sign";

const sessionKey = (network: Network) => `session:${network}`;

const loadSession = async (network: Network): Promise<Session | null> => {
    const raw = await window.selector.storage.get(sessionKey(network));
    return raw ? JSON.parse(raw) : null;
};

const saveSession = async (network: Network, session: Session) => {
    await window.selector.storage.set(sessionKey(network), JSON.stringify(session));
};

const requireSession = async (network: Network, signerId?: string): Promise<Session> => {
    // Refuses an unsupported dapp or network before any RPC call, so the user sees why instead of an RPC error.
    getConfig(network);
    const session = await loadSession(network);
    if (!session) throw new Error("NEAR Auth is not signed in");
    if (signerId && signerId !== session.accountId) throw new Error(`NEAR Auth is not signed in as ${signerId}`);
    return session;
};

const createAuth0Client = (network: Network) => {
    const { auth0Domain, auth0ClientId } = getConfig(network);
    return new Auth0Client(auth0Domain, auth0ClientId);
};

const resolveAccountId = async (network: Network, publicKey: string): Promise<string> => {
    const accountIds = await near.findAccountIds(network, publicKey);
    if (accountIds.length === 1) return accountIds[0];
    if (accountIds.length > 1) return await pickAccount(accountIds);
    return near.implicitAccountId(publicKey);
};

const connectSession = async ({ network, addFunctionCallKey }: SignInParams): Promise<Session> => {
    if (addFunctionCallKey) throw new Error("NEAR Auth cannot add a function call access key during sign in");

    const tokens = await createAuth0Client(network).authorize({
        scope: SIGN_IN_SCOPE,
        fallbackPrompt: { title: "Sign in with NEAR Auth", button: "Continue" },
        // Never connect silently with a login Auth0 still remembers in this browser.
        prompt: "login",
    });

    const { sub } = decodeJwt<{ sub: string }>(tokens.idToken);
    const publicKey = await near.derivePublicKey(network, getDerivationPath(getConfig(network).auth0Domain, sub));
    return { sub, accountId: await resolveAccountId(network, publicKey), publicKey };
};

const approveAndSign = async (network: Network, expectedSub: string, kind: "transaction" | "message", payload: Uint8Array) => {
    const config = getConfig(network);
    const encoded = Array.from(payload).join(",");

    const tokens = await createAuth0Client(network).authorize({
        audience: config.signingAudience,
        scope: SIGNING_SCOPE,
        extraParams: { [kind === "message" ? "nep413" : "transaction"]: encoded },
        fallbackPrompt: { title: `Approve this ${kind}`, button: "Review in NEAR Auth" },
    });

    const { fatxn, sub } = decodeJwt<{ fatxn?: number[]; sub?: string }>(tokens.accessToken);
    if (!Array.isArray(fatxn)) throw new Error("NEAR Auth returned no approved payload");
    if (sub !== expectedSub) throw new Error("NEAR Auth approved as a different account. Sign out and sign in again.");

    // Before relaying, so the relayer never pays for a signature over bytes the dapp did not send.
    if (fatxn.join(",") !== encoded) throw new Error(`NEAR Auth approved a different ${kind}`);

    return await relaySignature(network, { verifyPayload: tokens.accessToken, signPayload: fatxn });
};

const signMessageAs = async (network: Network, session: Session, payload: Uint8Array): Promise<SignedMessage> => {
    const signature = await approveAndSign(network, session.sub, "message", payload);
    return { accountId: session.accountId, publicKey: session.publicKey, signature: Buffer.from(signature).toString("base64") };
};

const checkTransactionSize = (transaction: NearTransaction) => {
    const encodedSize = transaction.encode().length;
    if (encodedSize > near.MAX_PAYLOAD_BYTES) {
        throw new Error(`NEAR Auth can sign transactions up to ${near.MAX_PAYLOAD_BYTES} bytes, this one is ${encodedSize}`);
    }
};

const signAndSend = async (network: Network, expectedSub: string, transaction: NearTransaction) => {
    const signature = await approveAndSign(network, expectedSub, "transaction", transaction.encode());

    const signedTransaction = new nearApiTransactions.SignedTransaction({
        transaction,
        signature: new nearApiTransactions.Signature({
            keyType: nearApiUtils.key_pair.KeyType.ED25519,
            data: signature,
        }),
    });

    return await near.broadcast(network, signedTransaction);
};

const NearAuthWallet = {
    async signIn(params: SignInParams) {
        const session = await connectSession(params);
        await saveSession(params.network, session);
        return [{ accountId: session.accountId, publicKey: session.publicKey }];
    },

    async signInAndSignMessage({ messageParams, ...params }: SignInAndSignMessageParams) {
        // Encoded before the login popup, so a malformed message fails before the user signs in.
        const payload = near.encodeSignMessagePayload(messageParams);
        const session = await connectSession(params);
        const signedMessage = await signMessageAs(params.network, session, payload);

        // Saved only now, so a sign in whose message fails or is dismissed leaves the dapp signed out.
        await saveSession(params.network, session);
        return [{ accountId: session.accountId, publicKey: session.publicKey, signedMessage }];
    },

    async signMessage({ network, signerId, ...messageParams }: SignMessageParams): Promise<SignedMessage> {
        const session = await requireSession(network, signerId);
        return await signMessageAs(network, session, near.encodeSignMessagePayload(messageParams));
    },

    async signOut({ network }: { network: Network }) {
        // Only the session is stored and sign in always asks for the account, so no Auth0 logout is needed.
        await window.selector.storage.remove(sessionKey(network));
    },

    async getAccounts({ network }: { network: Network }) {
        // An unsupported dapp or network reads as signed out, since every signature there would be refused.
        try {
            getConfig(network);
        } catch {
            return [];
        }

        const session = await loadSession(network);
        if (!session) return [];
        return [{ accountId: session.accountId, publicKey: session.publicKey }];
    },

    async signAndSendTransaction({
        network,
        signerId,
        receiverId,
        actions,
    }: {
        network: Network;
        signerId?: string;
        receiverId: string;
        actions: ConnectorAction[];
    }) {
        const session = await requireSession(network, signerId);

        const transaction = await near.buildTransaction(network, {
            signerId: session.accountId,
            publicKey: session.publicKey,
            receiverId,
            actions: connectorActionsToNearApiJsActions(actions),
        });

        checkTransactionSize(transaction);
        return await signAndSend(network, session.sub, transaction);
    },

    async signAndSendTransactions({
        network,
        signerId,
        transactions,
    }: {
        network: Network;
        signerId?: string;
        transactions: { receiverId: string; actions: ConnectorAction[] }[];
    }) {
        const session = await requireSession(network, signerId);
        const built: NearTransaction[] = [];
        const outcomes = [];

        // Numbered locally: the access key's nonce only moves once the first transaction lands.
        let nonce: bigint | undefined;

        for (const { receiverId, actions } of transactions) {
            const next = await near.buildTransaction(network, {
                signerId: session.accountId,
                publicKey: session.publicKey,
                receiverId,
                actions: connectorActionsToNearApiJsActions(actions),
                nonce,
            });

            nonce = next.nonce + 1n;
            built.push(next);
        }

        // Every size before the first popup, so an oversized transaction cannot fail a batch halfway.
        built.forEach(checkTransactionSize);

        for (const transaction of built) {
            outcomes.push(await signAndSend(network, session.sub, transaction));
        }

        return outcomes;
    },
};

window.selector.ready(NearAuthWallet);
