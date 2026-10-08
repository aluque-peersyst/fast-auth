import * as real from "../near-auth/config";

export * from "../near-auth/config";

/** Local build: testnet relays through the relayer on this machine; mainnet keeps the production relayer. */
export const getConfig: typeof real.getConfig = (network) =>
    network === "testnet" ? { ...real.getConfig(network), relayerBaseUrl: "http://localhost:3001/api" } : real.getConfig(network);
