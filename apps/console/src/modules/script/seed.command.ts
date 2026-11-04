import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getConfigEnv } from "@backend/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { Command } from "nestjs-command";
import { DataSource } from "typeorm";
import { Dapp } from "@database/console/entities";
import { MauBracket } from "@shared/modules/dapp";
import { Auth0ProvisionerName } from "../../config/auth0.config";
import { EmailProviderName } from "../../config/email.config";
import { AdminService } from "../admin/admin.service";
import { AdminDappDto } from "../admin/dtos/admin-dapp.dto";
import { Role, SessionUser } from "../auth/types/session-user";
import { DappService } from "../dapp/dapp.service";
import { UpsertDappRequest } from "../dapp/requests/upsert-dapp.request";
import { SettingService } from "../setting/setting.service";

export enum SeedState {
    PENDING = "pending",
    APPROVED = "approved",
    CHANGE_REQUESTED = "change-requested",
    REJECTED = "rejected",
    REMOVED = "removed",
}

export type SeedResult = { state: SeedState; ownerEmail: string; created: boolean };

const SEED_ADMIN: SessionUser = { sub: "seed|admin", email: "seed-admin@example.com", emailVerified: true, role: Role.ADMIN };
const REJECTION_REASON = "Seeded rejection: please host the logo on a domain you control.";

/**
 * Builds the owner of the seeded dApp in a state, whose email is unique to that state.
 * @param state The seed state.
 * @returns The owner.
 */
export const seedOwner = (state: SeedState): SessionUser => ({
    sub: `seed|${state}`,
    email: `seed-${state}@example.com`,
    emailVerified: true,
    role: Role.USER,
});

/**
 * Builds valid form fields for the seeded dApp in a state, on hosts under example.com.
 * @param state The seed state.
 * @returns The dApp fields.
 */
export function seedFields(state: SeedState): UpsertDappRequest {
    const host = `${state}.seed.example.com`;
    return {
        name: `Seed ${state}`,
        description: `A dApp seeded in the ${state} state for local development.`,
        logoUrl: `https://${host}/logo.png`,
        callbackUrls: [`https://${host}/callback`],
        logoutUrls: [`https://${host}/`],
        webOrigins: [`https://${host}`],
        contactEmail: `team@${host}`,
        mauBracket: MauBracket.LT_1K,
    };
}

@Injectable()
export class SeedCommand {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly dappService: DappService,
        private readonly adminService: AdminService,
        private readonly settingService: SettingService,
        @Inject(ConfigService) private readonly configService: ConfigService,
    ) {}

    /**
     * Seeds one dApp per state through the services and prints one line per state. Exits with 1 when it refuses or fails.
     */
    @Command({ command: "seed", describe: "Add one dApp in each status for local development" })
    async run(): Promise<void> {
        try {
            for (const { state, ownerEmail, created } of await this.seed()) {
                const outcome = created ? "created" : "skipped: this owner already has a dApp";
                process.stdout.write(`${state.padEnd(16)} ${ownerEmail.padEnd(36)} ${outcome}\n`);
            }
        } catch (error) {
            process.stderr.write(`seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        }
    }

    /**
     * Seeds one dApp per state, skipping each owner that already has a dApp. Refuses unless the config is local with every
     * outside effect faked, and while auto-approval is on, which would approve the pending and rejected dApps.
     * @returns One result per state.
     */
    async seed(): Promise<SeedResult[]> {
        this.assertSeedAllowed();
        if (await this.settingService.isAutoApprovalEnabled()) {
            throw new Error("Auto-approval is on: turn it off before seeding, or the pending and rejected dApps would be approved");
        }
        const results: SeedResult[] = [];
        for (const state of Object.values(SeedState)) {
            const ownerEmail = seedOwner(state).email;
            const exists = await this.dataSource.manager.existsBy(Dapp, { ownerEmail });
            if (!exists) await this.seedDapp(state);
            results.push({ state, ownerEmail, created: !exists });
        }
        return results;
    }

    /**
     * Throws unless CONFIG_ENV is development or test, both adapters are fake and Slack is off, so a seed cannot reach real Auth0, email or Slack.
     */
    private assertSeedAllowed(): void {
        const env = getConfigEnv();
        const provisioner = this.configService.get<string>("auth0.provisioner");
        const emailProvider = this.configService.get<string>("email.provider");
        const slackOn = this.configService.get<string | null>("slack.webhookUrl") !== null;
        const local = env === "development" || env === "test";
        if (!local || provisioner !== Auth0ProvisionerName.FAKE || emailProvider !== EmailProviderName.FAKE || slackOn) {
            throw new Error(
                `seed runs only with CONFIG_ENV development or test, both adapters fake and SLACK_WEBHOOK_URL empty; ` +
                    `got CONFIG_ENV=${env}, AUTH0_PROVISIONER=${provisioner}, EMAIL_PROVIDER=${emailProvider}, ` +
                    `SLACK_WEBHOOK_URL ${slackOn ? "set" : "empty"}`,
            );
        }
    }

    /**
     * Submits a dApp and drives it through the services to the given state.
     * @param state The state to reach.
     */
    private async seedDapp(state: SeedState): Promise<void> {
        const owner = seedOwner(state);
        const fields = seedFields(state);
        const submitted = await this.dappService.submit(owner, fields);
        const approve = (): Promise<AdminDappDto> => this.adminService.approve(SEED_ADMIN, submitted.id, submitted.version);
        switch (state) {
            case SeedState.PENDING:
                return;
            case SeedState.APPROVED:
                await approve();
                return;
            case SeedState.CHANGE_REQUESTED: {
                const approved = await approve();
                const change = { name: `${fields.name} v2`, callbackUrls: [...fields.callbackUrls, `${fields.webOrigins[0]}/v2/callback`] };
                await this.dappService.editOwn(owner, approved.id, { ...fields, ...change, expectedVersion: approved.version });
                return;
            }
            case SeedState.REJECTED:
                await this.adminService.reject(SEED_ADMIN, submitted.id, { expectedVersion: submitted.version, reason: REJECTION_REASON });
                return;
            case SeedState.REMOVED: {
                const approved = await approve();
                await this.dappService.removeOwn(owner, approved.id, approved.version);
                return;
            }
        }
    }
}
