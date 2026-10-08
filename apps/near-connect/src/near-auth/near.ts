import type { AccessKeyViewRaw, FinalExecutionOutcome } from "@near-js/types";
import * as nearAPI from "near-api-js";

import { NearRpc } from "../utils/rpc";
import { ED25519_DOMAIN_ID, getConfig } from "./config";
import type { Network, SignMessageDuringSignInParams } from "../utils/types";

const { transactions: nearApiTransactions, utils: nearApiUtils } = nearAPI;

export type NearTransaction = nearAPI.transactions.Transaction;

const rpcs: Partial<Record<Network, NearRpc>> = {};

const getRpc = (network: Network): NearRpc => {
    if (!rpcs[network]) {
        const dappProviders = window.selector?.providers?.[network] ?? [];
        rpcs[network] = new NearRpc(dappProviders.length ? dappProviders : getConfig(network).rpcUrls);
    }
    return rpcs[network]!;
};

export const derivePublicKey = async (network: Network, path: string): Promise<string> => {
    const config = getConfig(network);
    return await getRpc(network).viewMethod({
        contractId: config.mpcContractId,
        methodName: "derived_public_key",
        args: { path, predecessor: config.fastAuthContractId, domain_id: ED25519_DOMAIN_ID },
    });
};

const INDEXER_TIMEOUT_MS = 6000;
const INDEXER_ATTEMPTS = 3;
const INDEXER_RETRY_DELAY_MS = 500;

/** Throws instead of returning [] when the indexer cannot answer: [] means "use the implicit account". */
export const findAccountIds = async (network: Network, publicKey: string): Promise<string[]> => {
    const { fastNearApiBaseUrl } = getConfig(network);
    const url = `${fastNearApiBaseUrl}/public_key/${encodeURIComponent(publicKey)}/all`;

    for (let attempt = 1; attempt <= INDEXER_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), INDEXER_TIMEOUT_MS);
        const body = await fetch(url, { signal: controller.signal })
            .then((response) => response.json())
            .catch(() => null)
            .finally(() => clearTimeout(timer));
        if (Array.isArray(body?.account_ids)) return body.account_ids;
        if (attempt < INDEXER_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, INDEXER_RETRY_DELAY_MS * attempt));
    }

    throw new Error("NEAR Auth could not reach the account indexer. Try again in a moment.");
};

export const implicitAccountId = (publicKey: string): string => {
    return Buffer.from(nearApiUtils.PublicKey.from(publicKey).data).toString("hex");
};

export const buildTransaction = async (
    network: Network,
    params: { signerId: string; publicKey: string; receiverId: string; actions: any[]; nonce?: bigint },
): Promise<NearTransaction> => {
    const rpc = getRpc(network);

    const [block, nonce] = await Promise.all([
        rpc.block({ finality: "final" }),
        params.nonce ??
            rpc
                .query<AccessKeyViewRaw>({
                    request_type: "view_access_key",
                    // "final" can miss a transaction that just landed, and nonce + 1 would then reuse its nonce.
                    finality: "optimistic",
                    account_id: params.signerId,
                    public_key: params.publicKey,
                })
                .then((accessKey) => BigInt(accessKey.nonce) + 1n),
    ]);

    return nearApiTransactions.createTransaction(
        params.signerId,
        nearApiUtils.PublicKey.from(params.publicKey),
        params.receiverId,
        nonce,
        params.actions,
        nearApiUtils.serialize.base_decode(block.header.hash),
    );
};

export const broadcast = async (
    network: Network,
    signedTransaction: nearAPI.transactions.SignedTransaction,
): Promise<FinalExecutionOutcome> => {
    const encoded = Buffer.from(signedTransaction.encode()).toString("base64");
    return await getRpc(network).sendJsonRpc<FinalExecutionOutcome>("send_tx", {
        signed_tx_base64: encoded,
        wait_until: "EXECUTED_OPTIMISTIC",
    });
};

/** NEP-413 prefix tag: 2^31 + 413, so a signed message can never be read as a transaction. */
const NEP413_TAG = 2147484061;

/** Keeps the signing JWT, which carries the payload as decimal bytes, under the guard's 7168-byte limit. */
export const MAX_PAYLOAD_BYTES = 1024;

/** Borsh NEP-413 payload: u32 tag, message, [u8; 32] nonce, recipient, option<callbackUrl>. */
export const encodeSignMessagePayload = (payload: SignMessageDuringSignInParams): Uint8Array => {
    if (!(payload.nonce instanceof Uint8Array) || payload.nonce.length !== 32) {
        throw new Error("NEAR Auth requires a 32 byte nonce to sign a message");
    }

    const parts: Uint8Array[] = [];
    const u32 = (value: number) => {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setUint32(0, value, true);
        return bytes;
    };
    const string = (value: string) => {
        const bytes = new TextEncoder().encode(value);
        return [u32(bytes.length), bytes];
    };

    parts.push(u32(NEP413_TAG));
    parts.push(...string(payload.message));
    parts.push(payload.nonce);
    parts.push(...string(payload.recipient));

    if (payload.callbackUrl == null) parts.push(Uint8Array.of(0));
    else parts.push(Uint8Array.of(1), ...string(payload.callbackUrl));

    const bytes = Uint8Array.from(parts.flatMap((part) => Array.from(part)));
    if (bytes.length > MAX_PAYLOAD_BYTES) {
        throw new Error(`NEAR Auth can sign messages up to ${MAX_PAYLOAD_BYTES} bytes, this one is ${bytes.length}`);
    }
    return bytes;
};
