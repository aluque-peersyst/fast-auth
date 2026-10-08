import { sha256 } from "@noble/hashes/sha2";

// Not @auth0/auth0-spa-js: it needs a real popup handle and an origin, and the sandbox has neither.

const PKCE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;

export interface Auth0Tokens {
    accessToken: string;
    idToken: string;
}

export interface AuthorizeParams {
    scope: string;
    /** Omitted for plain sign in, set to the signing audience to mint a `fatxn` token. */
    audience?: string;
    /** Extra authorize params, e.g. the borsh transaction the consent screen renders. */
    extraParams?: Record<string, string>;
    /** Copy shown in the sandbox when the browser blocks the popup. */
    fallbackPrompt: { title: string; button: string };
    prompt?: "login";
}

const randomString = (length: number): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (byte) => PKCE_CHARSET[byte % PKCE_CHARSET.length]).join("");
};

const base64UrlEncode = (bytes: Uint8Array): string => {
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const decodeJwt = <T>(token: string): T => {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
};

const popupFeatures = () => {
    const left = window.selector.screenX + (window.selector.outerWidth - POPUP_WIDTH) / 2;
    const top = window.selector.screenY + (window.selector.outerHeight - POPUP_HEIGHT) / 2;
    return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},top=${top},left=${left},resizable,scrollbars=yes,status=1`;
};

export class Auth0Client {
    constructor(
        readonly domain: string,
        readonly clientId: string,
    ) {}

    private authorizeUrl(params: AuthorizeParams, redirectUri: string, state: string, codeChallenge: string): string {
        const url = new URL(`https://${this.domain}/authorize`);
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        // The sandbox cannot read the popup's url, so Auth0 posts the response to the dapp instead.
        url.searchParams.set("response_mode", "web_message");
        url.searchParams.set("scope", params.scope);
        url.searchParams.set("state", state);
        url.searchParams.set("code_challenge", codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");
        if (params.audience) url.searchParams.set("audience", params.audience);
        if (params.prompt) url.searchParams.set("prompt", params.prompt);

        Object.entries(params.extraParams ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
        return url.toString();
    }

    private async requestCode(url: string, state: string, fallbackPrompt: { title: string; button: string }): Promise<string> {
        const popup = window.selector.open(url, "_blank", popupFeatures());

        // The browser blocked the popup: ask for a click inside the sandbox and retry within its gesture.
        if (!(await popup.windowIdPromise)) {
            await window.selector.ui.whenApprove(fallbackPrompt);
            return await this.requestCode(url, state, fallbackPrompt);
        }

        try {
            return await new Promise<string>((resolve, reject) => {
                const stop = () => {
                    window.removeEventListener("message", onMessage);
                    clearInterval(closeWatcher);
                };

                const onMessage = (event: MessageEvent) => {
                    const data = event.data;
                    if (!data || data.type !== "authorization_response") return;

                    const payload = data.response ?? {};

                    // Before the error branch: only `state` ties a forwarded message to this request.
                    if (payload.state !== state) return;

                    stop();
                    if (payload.error) reject(new Error(payload.error_description || payload.error));
                    else resolve(payload.code);
                };

                const closeWatcher = setInterval(() => {
                    if (!popup.closed) return;
                    stop();
                    reject(new Error("User closed the NEAR Auth window"));
                }, 300);

                window.addEventListener("message", onMessage);
            });
        } finally {
            popup.close();
        }
    }

    private async exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<Auth0Tokens> {
        const response = await fetch(`https://${this.domain}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: this.clientId,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
                code,
            }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error_description || body.error || "NEAR Auth token exchange failed");

        return { accessToken: body.access_token, idToken: body.id_token };
    }

    async authorize(params: AuthorizeParams): Promise<Auth0Tokens> {
        const redirectUri = new URL(window.selector.location).origin;
        const codeVerifier = randomString(64);
        const codeChallenge = base64UrlEncode(sha256(new TextEncoder().encode(codeVerifier)));
        const state = randomString(32);

        const url = this.authorizeUrl(params, redirectUri, state, codeChallenge);
        const code = await this.requestCode(url, state, params.fallbackPrompt);
        return await this.exchangeCode(code, codeVerifier, redirectUri);
    }
}
