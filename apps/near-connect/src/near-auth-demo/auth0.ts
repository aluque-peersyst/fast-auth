import type { Auth0Client as RealAuth0Client, Auth0Tokens, AuthorizeParams } from "../near-auth/auth0";
import { getConfig } from "../near-auth/config";

export * from "../near-auth/auth0";

// Demo build: stands in for Auth0 with a fixed identity.

const DEMO_SUB = "google-oauth2|100000000000000000000";

// Pick keeps only the public surface: the real class's private members would make it nominal.
export class Auth0Client implements Pick<RealAuth0Client, keyof RealAuth0Client> {
    constructor(
        readonly domain: string,
        readonly clientId: string,
    ) {}

    async authorize(params: AuthorizeParams): Promise<Auth0Tokens> {
        // On mainnet the fixed identity maps to an implicit account no demo user controls, which someone could fund.
        if (this.domain !== getConfig("testnet").auth0Domain) throw new Error("The NEAR Auth demo build only supports testnet");

        await window.selector.ui.whenApprove({
            title: `Demo build: ${params.fallbackPrompt.title}. Nothing is actually signed or sent to the network.`,
            button: "Continue (demo)",
        });

        const approved = params.extraParams?.transaction ?? params.extraParams?.nep413;
        // Unsigned, and only its body is ever read.
        const token = `demo.${btoa(JSON.stringify({ sub: DEMO_SUB, fatxn: approved?.split(",").map(Number) }))}.demo`;
        return { accessToken: token, idToken: token };
    }
}
