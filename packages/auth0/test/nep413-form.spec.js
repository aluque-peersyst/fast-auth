/**
 * @jest-environment jsdom
 *
 * Renders the NEP-413 form's details component the way Auth0 does: the built `config.code` is
 * evaluated as a single expression and the resulting factory is initialized with the form params.
 */
const path = require("path");
const buildModule = require("../src/forms/build.js");

function renderDetails(params) {
    const { code } = buildModule.readComponent(path.join(buildModule.FORMS_DIR, "nep413"), "details", buildModule.readHelpersPreamble());
    const factory = new Function(`return ${code}`)();
    return factory({ custom: { getParams: () => params } }).init();
}

describe("NEP-413 form details component", () => {
    test("renders the message as text, never as HTML", () => {
        const box = renderDetails({ message: "<img src=x onerror=alert(1)>\nline two", recipient: "example.near", callbackUrl: "" });

        expect(box.querySelector(".message-body").textContent).toBe("<img src=x onerror=alert(1)>\nline two");
        expect(box.querySelector("img")).toBeNull();
        expect(box.textContent).toContain("example.near");
        expect(box.textContent).not.toContain("Callback URL");
    });

    test("keeps the message's whitespace and never caps or clips its height", () => {
        const { css } = buildModule.readComponent(path.join(buildModule.FORMS_DIR, "nep413"), "details", buildModule.readHelpersPreamble());
        const messageBody = css.match(/\.message-body\s*\{([^}]*)\}/)[1];

        expect(messageBody).toContain("white-space: pre-wrap");
        expect(css).not.toMatch(/(?<![-\w])(max-)?(height|block-size)\s*:|overflow(-[xy])?\s*:\s*(hidden|clip)|line-clamp/);
    });

    test("makes bidi controls visible instead of letting them reorder the text", () => {
        const rlo = "\u202E";
        const box = renderDetails({
            message: `pay ${rlo}moc.ppa-laer`,
            recipient: `${rlo}moc.ppa-laer`,
            callbackUrl: `https://cb.example/${"\u2066"}x`,
        });

        expect(box.textContent).not.toMatch(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/);
        expect(box.textContent).toContain("\uFFFDmoc.ppa-laer");
        expect(box.querySelector(".message-body").textContent).toBe("pay \uFFFDmoc.ppa-laer");
    });

    test("shows the callback url when the payload has one", () => {
        const box = renderDetails({ message: "hi", recipient: "example.near", callbackUrl: "https://example.com/cb" });

        expect(box.textContent).toContain("Callback URL");
        expect(box.textContent).toContain("https://example.com/cb");
    });
});
