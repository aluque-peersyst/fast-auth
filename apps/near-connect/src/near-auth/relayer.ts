import { getConfig, getGuardId } from "./config";
import type { Network } from "../utils/types";

export interface SignatureRequest {
    /** The Auth0 access token, verified by the on-chain guard. */
    verifyPayload: string;
    /** Borsh bytes the user approved (a transaction or a NEP-413 message), from the token's `fatxn` claim. */
    signPayload: number[];
}

/** Relays the approved payload to the fast-auth contract and returns the MPC signature. */
export const relaySignature = async (network: Network, request: SignatureRequest): Promise<Uint8Array> => {
    const { relayerBaseUrl, auth0Domain } = getConfig(network);

    const response = await fetch(`${relayerBaseUrl}/relayer/fast-auth/sign-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            guard_id: getGuardId(auth0Domain),
            verify_payload: request.verifyPayload,
            sign_payload: request.signPayload,
            algorithm: "eddsa",
        }),
    }).catch(() => null);

    if (!response) throw new Error("NEAR Auth relayer is unreachable");

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message || `NEAR Auth relayer rejected the request (${response.status})`);

    const successValue = body?.result?.status?.SuccessValue;
    if (successValue === "") throw new Error("NEAR Auth could not verify the approval on chain");

    const signature = successValue && JSON.parse(Buffer.from(successValue, "base64").toString())?.signature;
    if (!Array.isArray(signature) || signature.length !== 64) throw new Error("NEAR Auth MPC did not return a signature");
    return Uint8Array.from(signature);
};
