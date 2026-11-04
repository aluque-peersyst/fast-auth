import axios, { AxiosError, AxiosHeaders } from "axios";
import { DappEventType, MauBracket } from "@shared/modules/dapp";
import { slackMessage, SlackService } from "../../../../../src/modules/notification/providers/slack/slack.service";
import { DappMock } from "../../../../mocks/dapp/dapp.mock";

jest.mock("axios", () => ({ ...jest.requireActual("axios"), __esModule: true, default: { post: jest.fn() } }));
const mockedAxios = axios as jest.Mocked<typeof axios>;

const PUBLIC_URL = "https://console.example.test";
const WEBHOOK_URL = "https://hooks.slack.com/services/T0/B0/x";

describe("SlackService", () => {
    const dapp = new DappMock({ logoutUrls: [], callbackUrls: ["https://acme.example/callback", "https://acme.example/silent"] });

    describe("slackMessage", () => {
        it("should list every field after the summary and the review link, with a dash for an empty list, and never unfurl", () => {
            expect(slackMessage({ kind: DappEventType.SUBMITTED, dapp }, PUBLIC_URL)).toEqual({
                text: [
                    "*New dApp submission to review*",
                    "Acme &amp; Co was submitted and is waiting for review.",
                    `<${PUBLIC_URL}/admin/dapps/${dapp.id}|Review it in the console>`,
                    "*Name:* Acme &amp; Co",
                    "*Description:* A wallet",
                    "*Logo:* https://acme.example/logo.png",
                    "*Expected MAU:* Less than 1,000",
                    "*Callback URLs:* https://acme.example/callback, https://acme.example/silent",
                    "*Logout URLs:* —",
                    "*Web origins:* https://acme.example",
                    "*Contact:* dev@acme.example",
                ].join("\n"),
                unfurl_links: false,
                unfurl_media: false,
            });
        });

        it("should keep a description with line breaks on one line, so it cannot fake another field", () => {
            const { text } = slackMessage(
                { kind: DappEventType.SUBMITTED, dapp: new DappMock({ description: "Fine\n*Contact:* <!channel>" }) },
                PUBLIC_URL,
            );

            expect(text).toContain("*Description:* Fine *Contact:* &lt;!channel&gt;\n");
        });

        it("should give a resubmission's rejection reason and mark each changed field with its old value", () => {
            const rejected = { ...dapp, name: "Old Acme", mauBracket: MauBracket.GT_25K };

            const { text } = slackMessage(
                { kind: DappEventType.RESUBMITTED, dapp, rejected, rejectionReason: "Logo is broken." },
                PUBLIC_URL,
            );

            expect(text).toContain("*Rejected because:* Logo is broken.\n*Name (changed):* Acme &amp; Co (was: Old Acme)\n");
            expect(text).toContain("*Expected MAU (changed):* Less than 1,000 (was: More than 25,000)");
        });

        it("should say when a resubmission changed nothing", () => {
            const { text } = slackMessage(
                { kind: DappEventType.RESUBMITTED, dapp, rejected: { ...dapp }, rejectionReason: "Broken." },
                PUBLIC_URL,
            );

            expect(text).toContain("*Rejected because:* Broken.\nNothing was changed since the rejection.\n");
        });
    });

    describe("notify", () => {
        const notifier = new SlackService(WEBHOOK_URL, PUBLIC_URL, 5000);

        beforeEach(() => {
            mockedAxios.post.mockReset();
        });

        it("should post the message to the webhook within the timeout", async () => {
            mockedAxios.post.mockResolvedValueOnce({ status: 200 });

            await notifier.notify({ kind: DappEventType.AUTO_APPROVED, dapp });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                WEBHOOK_URL,
                slackMessage({ kind: DappEventType.AUTO_APPROVED, dapp }, PUBLIC_URL),
                {
                    timeout: 5000,
                },
            );
        });

        it("should throw on an error answer, naming the status in the error code", async () => {
            const response = {
                status: 404,
                statusText: "Not Found",
                data: "no_service",
                headers: {},
                config: { headers: new AxiosHeaders() },
            };
            mockedAxios.post.mockRejectedValueOnce(new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, response));

            await expect(notifier.notify({ kind: DappEventType.SUBMITTED, dapp })).rejects.toMatchObject({
                message: "Slack webhook answered 404",
                code: "HTTP_404",
            });
        });
    });
});
