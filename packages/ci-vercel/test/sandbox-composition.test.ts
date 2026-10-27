import { create } from "@bufbuild/protobuf";
import {
	AccountSchema,
	ConfigurationSchema,
	ConfigurationStateSchema,
	ConnectionSchema,
	LeaseSchema,
	OfferSchema,
	route,
	SandboxPricingSchema,
} from "@hobo/ci";
import { PostgresCiStore } from "@hobo/ci/postgres";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { createSandboxComposition } from "../src/sandbox-composition.js";

describe("Sandbox billing team binding", () => {
	it.each([
		{ offerTeam: "team_other", accepted: false },
		{ offerTeam: "team_real", accepted: true },
	])("checks the offer's billing team before creating a VM: $offerTeam", async ({
		offerTeam,
		accepted,
	}) => {
		const now = Date.now();
		const pricing = create(SandboxPricingSchema, {
			vcpus: 1,
			memoryMb: 2048,
			cpuMicrosPerVcpuHour: 128000,
			memoryMicrosPerGbHour: 21200,
			creationMicros: 1,
			egressMicrosPerGb: 150000,
			maxEgressBytes: 1000000,
			proxyMicrosPerGb: 150000,
			proxyFixedMicros: 1,
			bootstrapFixedMicros: 1,
			networkHeadroomBytes: 1000,
			proxyVmRequired: true,
			proxyVmVcpus: 1,
			proxyVmMemoryMb: 2048,
			proxyVmExtraMs: 120000,
			proxyVmNetworkBytes: 10000000,
			proxyVmNetworkHeadroomBytes: 1000,
			proxyControlMaxCalls: 100,
			proxyControlCallMicros: 1,
			region: "iad1",
			plan: "hobby",
		});
		const offer = create(OfferSchema, {
			id: "vercel",
			provider: "vercel",
			backend: "sandbox",
			providerAccountId: offerTeam,
			enabled: true,
			runsOn: "sandbox",
			bridgeAcknowledged: true,
			budgetMicros: 1000000,
			concurrency: 1,
			sandboxPricing: pricing,
			observedAt: new Date(now - 60_000).toISOString(),
			validUntil: new Date(now + 24 * 60 * 60_000).toISOString(),
		});
		const account = create(AccountSchema, {
			id: "account",
			budgetMicros: 1000000,
			maxRuntimeMinutes: 5,
			startupMinutes: 1,
			offers: [offer],
		});
		const quote = route(account, [], new Date(now).toISOString());
		if (!quote) throw new Error("fixture quote unavailable");
		const connection = create(ConnectionSchema, {
			accountId: "account",
			repository: "owner/repo",
			repositoryId: 1,
			installationId: 2,
			runnerGroupId: 1,
			isolatedOnly: true,
			trustedRepositoryAcknowledged: true,
			publicRepositoryAcknowledged: true,
			acceptAllMatchingRepositoryJobs: true,
		});
		const lease = create(LeaseSchema, {
			id: "c0e6cf50-30ef-4b9b-8e03-6411aaf578cf",
			state: "reserved",
			accountId: "account",
			offerId: "vercel",
			provider: "vercel",
			repository: "owner/repo",
			repositoryId: 1,
			installationId: 2,
			jobId: 3,
			originalRunId: 4,
			runAttempt: 1,
			sandboxPricing: pricing,
			reservedMinutes: quote.minutes,
			reservedPaidMicros: quote.paidMicros,
			sandboxReservedAllowance: quote.sandboxReservedAllowance,
		});
		const pool = new pg.Pool();
		const store = new PostgresCiStore(pool);
		vi.spyOn(store, "get").mockResolvedValue(lease);
		vi.spyOn(store, "policySnapshot").mockResolvedValue({
			state: create(ConfigurationStateSchema, {
				revision: 1,
				configuration: create(ConfigurationSchema, {
					accounts: [account],
					connections: [connection],
				}),
			}),
			policies: [],
		});
		vi.spyOn(store, "accountLeases").mockResolvedValue([]);
		const transition = vi
			.spyOn(store, "transition")
			.mockResolvedValue(undefined);
		const cancelAndRequeue = vi
			.spyOn(store, "cancelAndRequeue")
			.mockResolvedValue(undefined);
		const composition = createSandboxComposition({
			env: {
				HOBO_CI_SANDBOX_ENABLED: "1",
				HOBO_CI_SANDBOX_TEAM_ID: "team_real",
				HOBO_CI_SANDBOX_PROJECT_ID: "prj_real",
				HOBO_CI_SANDBOX_ISSUER: "https://oidc.vercel.com/team",
				HOBO_CI_SANDBOX_DOMAINS_JSON: '["github.com"]',
			},
			publicOrigin: "https://ci.example.com",
			store,
			github: {
				request: async () => {
					throw new Error("unexpected GitHub call");
				},
			},
		});
		if (!composition) throw new Error("sandbox composition unavailable");
		await composition.host.launch(lease.id);
		expect(transition).toHaveBeenCalledTimes(accepted ? 1 : 0);
		expect(cancelAndRequeue).toHaveBeenCalledTimes(accepted ? 0 : 1);
		await pool.end();
	});
});
