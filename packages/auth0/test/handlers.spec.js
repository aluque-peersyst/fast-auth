/**
 * @jest-environment node
 *
 * Tests for the Auth0 PostLogin handler (`onExecutePostLogin`) — the security-relevant
 * branching that the decoding specs don't touch: audience gating, OIDC scope stripping,
 * tx/delegate/NEP-413 dispatch, NEP-413 payload validation, the `fields` shape handed to
 * `api.prompt.render`, and the `fatxn` custom claim. The `event`/`api` objects are mocked
 * to the minimal surface the handler reads.
 */
const { onExecutePostLogin, onContinuePostLogin, SCHEMA } = require("../src/actions/authorize-app.action.js");
const { serialize } = require("borsh");
const { buildTransaction, buildDelegateAction, buildAction } = require("./fixtures/builders.js");

const ONCHAIN_AUDIENCE = "https://onchain.example";

function makeApi() {
    const calls = {
        deny: [],
        removedScopes: [],
        customClaims: {},
        render: null,
    };
    const api = {
        access: {
            deny: (msg) => {
                calls.deny.push(msg);
            },
        },
        accessToken: {
            removeScope: (s) => {
                calls.removedScopes.push(s);
            },
            setCustomClaim: (k, v) => {
                calls.customClaims[k] = v;
            },
        },
        prompt: {
            render: (modalId, opts) => {
                calls.render = { modalId, opts };
            },
        },
    };
    return { api, calls };
}

function makeEvent({ query = {}, audience = ONCHAIN_AUDIENCE } = {}) {
    return {
        secrets: {
            ONCHAIN_AUDIENCE,
            TRANSACTION_FORM: "modal_tx",
            DELEGATE_ACTION_FORM: "modal_delegate",
            NEP413_FORM: "modal_nep413",
        },
        request: { query },
        resource_server: audience == null ? undefined : { identifier: audience },
        client: { name: "Test App", metadata: { logo_uri: "https://logo.example/x.png" } },
    };
}

describe("onExecutePostLogin — audience gating", () => {
    test("denies a signing-audience request that carries no payload", async () => {
        const { api, calls } = makeApi();
        await onExecutePostLogin(makeEvent({ query: {} }), api);
        expect(calls.deny).toEqual(["Signing audience requested without transaction payload"]);
        expect(calls.render).toBeNull();
    });

    test("denies a payload sent to a non-signing audience", async () => {
        const { api, calls } = makeApi();
        const { csv } = buildTransaction();
        await onExecutePostLogin(makeEvent({ query: { transaction: csv }, audience: "https://other.example" }), api);
        expect(calls.deny).toEqual(["Transaction payload only allowed with signing audience"]);
        expect(calls.render).toBeNull();
    });

    test("no-ops (no deny, no render) for a non-signing audience without payload", async () => {
        const { api, calls } = makeApi();
        await onExecutePostLogin(makeEvent({ query: {}, audience: "https://other.example" }), api);
        expect(calls.deny).toEqual([]);
        expect(calls.render).toBeNull();
        expect(calls.removedScopes).toEqual([]);
    });
});

describe("onExecutePostLogin — transaction payload", () => {
    test("strips OIDC scopes, renders the tx modal with decoded fields, and sets the fatxn claim", async () => {
        const { api, calls } = makeApi();
        const { csv } = buildTransaction({
            signerId: "alice.near",
            receiverId: "bob.near",
            actions: [buildAction.transfer({ deposit: "1500000000000000000000000" })],
        });
        await onExecutePostLogin(makeEvent({ query: { transaction: csv } }), api);

        expect(calls.deny).toEqual([]);
        expect(calls.removedScopes.sort()).toEqual(["email", "offline_access", "profile"]);

        expect(calls.render.modalId).toBe("modal_tx");
        const { fields } = calls.render.opts;
        expect(fields.signerId).toBe("alice.near");
        expect(fields.receiverId).toBe("bob.near");
        expect(fields.name).toBe("Test App");
        expect(fields.imageUrl).toBe("https://logo.example/x.png");
        // actions is a JSON string with the decoded action shape.
        const actions = JSON.parse(fields.actions);
        expect(actions[0].transfer.deposit).toBe("1500000000000000000000000");

        // fatxn is the raw numeric byte array of the payload.
        expect(calls.customClaims.fatxn).toEqual(csv.split(",").map(Number));
    });
});

describe("onExecutePostLogin — delegate-action payload", () => {
    test("renders the delegate modal with senderId/maxBlockHeight and sets the fatxn claim", async () => {
        const { api, calls } = makeApi();
        const { csv } = buildDelegateAction({
            senderId: "alice.near",
            receiverId: "bob.near",
            maxBlockHeight: BigInt(1000),
            actions: [buildAction.transfer()],
        });
        await onExecutePostLogin(makeEvent({ query: { delegateAction: csv } }), api);

        expect(calls.deny).toEqual([]);
        expect(calls.render.modalId).toBe("modal_delegate");
        const { fields } = calls.render.opts;
        expect(fields.senderId).toBe("alice.near");
        expect(fields.receiverId).toBe("bob.near");
        expect(fields.maxBlockHeight).toBe("1000");
        expect(calls.customClaims.fatxn).toEqual(csv.split(",").map(Number));
    });
});

/** NEP-413 payload as a byte array; join with "," for the nep413 query param. */
function buildMessage(overrides = {}) {
    const bytes = serialize(SCHEMA.SignMessagePayload, {
        tag: 2147484061,
        message: "Sign in to Example",
        nonce: new Array(32).fill(7),
        recipient: "example.near",
        callbackUrl: null,
        ...overrides,
    });
    return Array.from(bytes);
}

describe("onExecutePostLogin — NEP-413 payload", () => {
    test("renders the NEP-413 modal with decoded fields and sets the fatxn claim", async () => {
        const { api, calls } = makeApi();
        const bytes = buildMessage({ message: "héllo 👋\nworld", callbackUrl: "https://example.com/cb" });
        await onExecutePostLogin(makeEvent({ query: { nep413: bytes.join(",") } }), api);

        expect(calls.deny).toEqual([]);
        expect(calls.removedScopes.sort()).toEqual(["email", "offline_access", "profile"]);

        expect(calls.render.modalId).toBe("modal_nep413");
        expect(calls.render.opts.fields).toEqual({
            name: "Test App",
            imageUrl: "https://logo.example/x.png",
            message: "héllo 👋\nworld",
            recipient: "example.near",
            callbackUrl: "https://example.com/cb",
        });
        expect(calls.customClaims.fatxn).toEqual(bytes);
    });

    test("is denied on a non-signing audience", async () => {
        const { api, calls } = makeApi();
        await onExecutePostLogin(makeEvent({ query: { nep413: buildMessage().join(",") }, audience: "https://other.example" }), api);
        expect(calls.deny).toEqual(["Transaction payload only allowed with signing audience"]);
        expect(calls.render).toBeNull();
    });

    test("decodes a payload laid out byte-for-byte as the NEP-413 spec describes", async () => {
        // u32 tag 2^31 + 413 (LE), borsh strings as u32 LE length + UTF-8, 32-byte nonce, Some(callbackUrl).
        const bytes = [
            ...[0x9d, 0x01, 0x00, 0x80],
            ...[3, 0, 0, 0, 0x68, 0xc3, 0xa9],
            ...Array.from({ length: 32 }, (_, i) => i),
            ...[1, 0, 0, 0, 0x61],
            ...[1, 1, 0, 0, 0, 0x63],
        ];
        const { api, calls } = makeApi();
        await onExecutePostLogin(makeEvent({ query: { nep413: bytes.join(",") } }), api);

        expect(calls.deny).toEqual([]);
        expect(calls.render.opts.fields).toEqual(expect.objectContaining({ message: "hé", recipient: "a", callbackUrl: "c" }));
        expect(calls.customClaims.fatxn).toEqual(bytes);
    });

    test("renders an empty callback url when the payload has none", async () => {
        const { api, calls } = makeApi();
        await onExecutePostLogin(makeEvent({ query: { nep413: buildMessage().join(",") } }), api);

        expect(calls.render.opts.fields.callbackUrl).toBe("");
    });

    test("binds the claim to the NEP-413 payload when a transaction or delegate action is also sent", async () => {
        const bytes = buildMessage();
        const transaction = buildTransaction().csv;
        const delegateAction = buildDelegateAction().csv;

        for (const extra of [{ transaction }, { delegateAction }, { transaction, delegateAction }]) {
            const { api, calls } = makeApi();
            await onExecutePostLogin(makeEvent({ query: { ...extra, nep413: bytes.join(",") } }), api);

            expect(calls.render.modalId).toBe("modal_nep413");
            expect(calls.customClaims.fatxn).toEqual(bytes);
        }
    });

    test("refuses without rendering or minting a claim when NEP413_FORM is not set", async () => {
        const { api, calls } = makeApi();
        const event = makeEvent({ query: { nep413: buildMessage().join(",") } });
        event.secrets.NEP413_FORM = undefined;
        await onExecutePostLogin(event, api);

        expect(calls.deny).toEqual(["NEP-413 consent form is not configured"]);
        expect(calls.render).toBeNull();
        expect(calls.customClaims.fatxn).toBeUndefined();
    });

    test.each([
        ["a payload without the NEP-413 tag", () => buildMessage({ tag: 1 }).join(",")],
        ["trailing bytes after the payload", () => [...buildMessage(), 0].join(",")],
        ["a truncated payload", () => buildMessage().slice(0, 10).join(",")],
        ["a value above 255", () => [...buildMessage().slice(0, -1), 256].join(",")],
        ["a repeated query parameter", () => [buildMessage().join(","), buildMessage().join(",")]],
        [
            "malformed UTF-8 in the message",
            () => {
                const bytes = buildMessage();
                bytes[8] = 0x80;
                return bytes.join(",");
            },
        ],
    ])("denies %s without rendering or minting a claim", async (_, build) => {
        const { api, calls } = makeApi();
        await onExecutePostLogin(makeEvent({ query: { nep413: build() } }), api);

        expect(calls.deny).toEqual(["Invalid NEP-413 payload"]);
        expect(calls.render).toBeNull();
        expect(calls.customClaims.fatxn).toBeUndefined();
    });

    test("refuses NEP-413 bytes sent as a delegate action", async () => {
        const { api, calls } = makeApi();

        await expect(onExecutePostLogin(makeEvent({ query: { delegateAction: buildMessage().join(",") } }), api)).rejects.toThrow(
            "Payload is not a delegate action",
        );
        expect(calls.render).toBeNull();
        expect(calls.customClaims.fatxn).toBeUndefined();
    });
});

describe("onContinuePostLogin — decision gating", () => {
    test("denies access when the user rejected the signing request", async () => {
        const { api, calls } = makeApi();

        await onContinuePostLogin({ prompt: { fields: { decision: "denied" } } }, api);

        expect(calls.deny).toEqual(["User rejected the signing request"]);
    });

    test("does nothing (resumes the flow) when the user approved", async () => {
        const { api, calls } = makeApi();

        await onContinuePostLogin({ prompt: { fields: { decision: "approved" } } }, api);

        expect(calls.deny).toEqual([]);
    });

    test("denies when no decision/prompt is present, without calling it a user rejection", async () => {
        const { api, calls } = makeApi();

        await onContinuePostLogin({}, api);

        expect(calls.deny).toEqual(["Signing request was not approved"]);
    });

    test("denies any decision other than approved", async () => {
        const { api, calls } = makeApi();

        await onContinuePostLogin({ prompt: { fields: { decision: "Approved" } } }, api);

        expect(calls.deny).toEqual(["Signing request was not approved"]);
    });
});
