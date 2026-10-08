import type * as real from "../near-auth/relayer";

export * from "../near-auth/relayer";

/** Demo build: a fabricated signature, without contacting the relayer. */
export const relaySignature: typeof real.relaySignature = async (_network, request) => {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const signature = new Uint8Array(64);
    request.signPayload.forEach((byte, i) => (signature[i % 64] ^= byte));
    return signature;
};
