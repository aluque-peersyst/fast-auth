import type { ConsoleEmail, Emailer } from "./emailer";

export class FakeEmailer implements Emailer {
    readonly calls: { email: ConsoleEmail }[] = [];
    private failures = 0;

    failNext(): this {
        this.failures += 1;
        return this;
    }

    reset(): void {
        this.calls.length = 0;
        this.failures = 0;
    }

    async send(email: ConsoleEmail): Promise<void> {
        this.calls.push({ email });
        if (this.failures > 0) {
            this.failures -= 1;
            throw new Error(`Fake emailer: scripted failure for ${email.template}`);
        }
    }
}
