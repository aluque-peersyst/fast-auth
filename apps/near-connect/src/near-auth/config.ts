import routing from "../../dapps.json";
import type { Network } from "../utils/types";

interface NearAuthNetworkConfig {
    /** Auth0 tenant that issues the JWTs the on-chain guard trusts. */
    auth0Domain: string;
    /** Auth0 application (SPA, PKCE) registered for NEAR Auth. */
    auth0ClientId: string;
    /** Audience that makes Auth0 mint a token carrying the `fatxn` signing claim. */
    signingAudience: string;
    /** MPC contract deriving the user key from the JWT path. */
    mpcContractId: string;
    /** Contract calling the MPC on behalf of the user, also the derivation predecessor. */
    fastAuthContractId: string;
    /** Indexer used to map a derived public key back to its account ids. */
    fastNearApiBaseUrl: string;
    /** NEAR Auth relayer paying gas for the `sign` call. */
    relayerBaseUrl: string;
    /** Fallback RPCs, used when the dapp does not pass its own to NearConnector. */
    rpcUrls: string[];
}

type DappConfig = Pick<NearAuthNetworkConfig, "auth0ClientId" | "relayerBaseUrl">;

const NEAR_AUTH_CONFIG: Record<Network, Omit<NearAuthNetworkConfig, keyof DappConfig>> = {
    mainnet: {
        auth0Domain: "login.auth.near.org",
        signingAudience: "auth0.jwt.fast-auth.near",
        mpcContractId: "v1.signer",
        fastAuthContractId: "fast-auth.near",
        fastNearApiBaseUrl: "https://api.fastnear.com/v0",
        rpcUrls: ["https://rpc.mainnet.near.org", "https://free.rpc.fastnear.com"],
    },

    testnet: {
        auth0Domain: "login.testnet.fast-auth.com",
        signingAudience: "auth0.jwt.fast-auth.testnet",
        mpcContractId: "v1.signer-prod.testnet",
        fastAuthContractId: "fast-auth.testnet",
        fastNearApiBaseUrl: "https://test.api.fastnear.com/v0",
        rpcUrls: ["https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"],
    },
};

/** Peersyst's application and relayer, for dapps not in DAPPS. */
const DEFAULT_DAPP: Partial<Record<Network, DappConfig>> = routing.default;

/** Dapps with their own application and relayer, by exact origin, e.g. `https://app.example.com`. */
const DAPPS: Record<string, Partial<Record<Network, DappConfig>>> = routing.dapps;

/** The calling dapp's DAPPS entry, else DEFAULT_DAPP; throws if that does not cover the network. */
export const getConfig = (network: Network): NearAuthNetworkConfig => {
    const origin = new URL(window.selector.location).origin;
    // The dapp picks the network, so inherited keys such as "constructor" must not count as one.
    const dapp = Object.keys(NEAR_AUTH_CONFIG).includes(network) ? (DAPPS[origin] ?? DEFAULT_DAPP)[network] : undefined;
    if (!dapp) throw new Error(`NEAR Auth is not available for ${origin} on ${network}`);
    return { ...NEAR_AUTH_CONFIG[network], auth0ClientId: dapp.auth0ClientId, relayerBaseUrl: dapp.relayerBaseUrl };
};

/** ed25519 domain in the MPC contract. */
export const ED25519_DOMAIN_ID = 1;

/** Guard the fast-auth contract uses to verify JWTs of this Auth0 tenant. */
export const getGuardId = (auth0Domain: string) => `jwt#https://${auth0Domain}/`;

/** Derivation path: the guard plus the subject claim, so each user gets its own key. */
export const getDerivationPath = (auth0Domain: string, sub: string) => `${getGuardId(auth0Domain)}#${sub}`;
