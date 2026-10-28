import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clone, create, toJsonString } from "@bufbuild/protobuf";
import {
	AccountSchema,
	ConfigurationSchema,
	OfferSchema,
	SandboxPricingSchema,
} from "@hobo/ci";
import { expect, it } from "vitest";
import { z } from "zod";
import { createCiRelayClient } from "../src/client.js";
import { startRelayFromEnvironment } from "../src/main.js";
import { runCiProjectCli } from "../src/project-cli.js";
import {
	ciEnvironmentPolicySha256,
	parseCiProjectConfig,
} from "../src/project-config.js";
import {
	controlHttp,
	initialConfiguration,
	TOKEN,
} from "./fixtures/control-api-github.js";
import { ContractApi, config, job, SECRET } from "./fixtures.js";

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = z
		.object({ port: z.number().int().positive() })
		.parse(server.address());
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

function desired(enabled: boolean, limitMicros: number) {
	return {
		accountId: "account-a",
		tenantId: "account-a",
		pool: { label: "hobo", os: "linux", architecture: "x64" },
		providers: [
			{
				id: "blacksmith-a",
				kind: "blacksmith",
				connectionRef: "owned-blacksmith-account",
				runsOn: "blacksmith-2vcpu-ubuntu-2404",
				enabled,
			},
		],
		budget: {
			scope: "ci-account",
			currency: "USD",
			limitMicros,
			period: "manual",
			timeZone: "UTC",
		},
		routing: {
			strategy: "lowest-total-incremental-cost",
			noEligibleProvider: "queue",
			unknownAllocation: "zero",
		},
		thresholds: [],
	};
}

it("applies a pinned repo profile to the real local relay, enforces budget and provider rules, and retains them on restart", async () => {
	const directory = mkdtempSync(join(tmpdir(), "hobo-ci-local-policy-"));
	const token = "synthetic-local-account-token-".repeat(2);
	const appKey = join(directory, "app-key.pem");
	const tokenFile = join(directory, "tokens.json");
	const initialFile = join(directory, "initial.json");
	const repoFile = join(directory, "ci.json");
	const db = join(directory, "relay.sqlite");
	const pair = generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});
	writeFileSync(appKey, pair.privateKey, { mode: 0o600 });
	writeFileSync(
		tokenFile,
		JSON.stringify({
			tokens: [
				{
					accountId: "account-a",
					tokenSha256: createHash("sha256").update(token).digest("hex"),
					installationIds: [10],
					scopes: ["policy:read", "policy:write"],
				},
			],
		}),
		{ mode: 0o600 },
	);
	const initial = config();
	const staleAccount = initial.accounts[0];
	const offer = staleAccount?.offers[0];
	if (!staleAccount || !offer) throw new Error("missing fixture account");
	const now = Date.now();
	offer.observedAt = new Date(now - 60000).toISOString();
	offer.validUntil = new Date(now + 3600000).toISOString();
	offer.freeMinutes = 0;
	writeFileSync(initialFile, toJsonString(ConfigurationSchema, initial));
	const port = await freePort();
	const origin = `http://127.0.0.1:${port}`;
	const env = {
		HOBO_CI_PUBLIC_URL: origin,
		HOBO_CI_HOST: "127.0.0.1",
		HOBO_CI_PORT: String(port),
		HOBO_CI_ALLOW_INSECURE_LOOPBACK: "1",
		HOBO_CI_GITHUB_APP_ID: "123",
		HOBO_CI_GITHUB_APP_KEY_FILE: appKey,
		HOBO_CI_CONTROL_TOKENS_FILE: tokenFile,
		HOBO_CI_WEBHOOK_SECRET: SECRET,
		HOBO_CI_DB: db,
		HOBO_CI_CONFIG: initialFile,
	};
	async function apply(enabled: boolean, limitMicros: number) {
		const configJson = JSON.stringify({
			defaultEnvironment: "local",
			environments: {
				local: {
					relayOrigin: origin,
					allowInsecureLoopback: true,
					policy: desired(enabled, limitMicros),
				},
			},
		});
		writeFileSync(repoFile, configJson);
		const digest = await ciEnvironmentPolicySha256(
			parseCiProjectConfig(configJson),
			"local",
		);
		await runCiProjectCli(
			[
				"apply",
				"--config",
				repoFile,
				"--environment",
				"local",
				"--trusted-origin",
				origin,
				"--trusted-account",
				"account-a",
				"--trusted-policy-sha256",
				digest,
			],
			{
				cwd: directory,
				env: { HOBO_CI_ACCOUNT_TOKEN: token },
				write: () => {},
			},
		);
	}
	let running:
		| Awaited<ReturnType<typeof startRelayFromEnvironment>>
		| undefined;
	try {
		running = await startRelayFromEnvironment(env);
		await running.service.checkReadiness();
		const api = new ContractApi();
		running.relay.options.github = api;
		const store = running.relay.options.store;
		await apply(false, 50000);
		expect(
			store.reserve(staleAccount, job(), new Date().toISOString()),
		).toBeUndefined();
		await apply(true, 20000);
		expect(
			store.reserve(staleAccount, job(), new Date().toISOString()),
		).toBeUndefined();
		await apply(true, 50000);
		const alteredInstallation = job();
		alteredInstallation.installationId = 11;
		expect(
			store.reserve(
				staleAccount,
				alteredInstallation,
				new Date().toISOString(),
			),
		).toBeUndefined();
		const alteredRepository = job();
		alteredRepository.repository = "other/repository";
		expect(
			store.reserve(staleAccount, alteredRepository, new Date().toISOString()),
		).toBeUndefined();
		const beforeRevocation = store.configuration();
		if (!beforeRevocation?.configuration)
			throw new Error("missing configuration");
		const removed = clone(ConfigurationSchema, beforeRevocation.configuration);
		removed.connections = [];
		const afterRevocation = store.configure(
			removed,
			beforeRevocation.revision,
			new Date().toISOString(),
		);
		expect(
			store.reserve(staleAccount, job(), new Date().toISOString()),
		).toBeUndefined();
		store.configure(
			beforeRevocation.configuration,
			afterRevocation.revision,
			new Date().toISOString(),
		);
		const lease = store.reserve(staleAccount, job(), new Date().toISOString());
		expect(lease).toBeDefined();
		if (!lease) throw new Error("expected eligible lease");
		api.leaseId = lease.id;
		const client = createCiRelayClient({
			origin,
			allowInsecureLoopback: true,
			accountToken: () => token,
		});
		await expect(
			client.putDesiredPolicy(desired(false, 50000), { revision: 1 }),
		).rejects.toMatchObject({ status: 409 });
		const current = await client.getPolicy();
		const malformed = desired(false, 50000);
		malformed.pool.os = "windows";
		const invalidV2 = await fetch(`${origin}/v2/accounts/self/policy`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"If-Match": `"${current.revision}"`,
			},
			body: JSON.stringify(malformed),
		});
		expect(invalidV2.status).toBe(400);
		const oldV1 = await fetch(`${origin}/v1/accounts/self/policy`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"If-Match": `"${current.revision}"`,
			},
			body: toJsonString(AccountSchema, staleAccount),
		});
		expect(oldV1.status).toBe(410);
		await apply(false, 50000);
		await running.relay.dispatchPending();
		expect(api.dispatches).toBe(0);
		expect(store.get(lease.id)?.state).toBe("cancelled");
		const before = store.configuration();
		if (!before?.configuration) throw new Error("missing saved configuration");
		expect(() =>
			store.configureWithRecord(
				before.configuration,
				before.revision,
				new Date().toISOString(),
				"ci-policy:account-a",
				"different-account",
				"{}",
			),
		).toThrow(/another account/);
		expect(store.configuration()?.revision).toBe(before.revision);
		store.rebuild();
		expect(store.configuration()?.revision).toBe(before.revision);
		expect(store.controlRecord("ci-policy:account-a")).toBeDefined();
		expect(
			store.reserve(staleAccount, job(), new Date().toISOString()),
		).toBeUndefined();
		await running.stop();
		running = undefined;
		running = await startRelayFromEnvironment(env);
		await running.service.checkReadiness();
		expect(
			running.relay.options.store.reserve(
				staleAccount,
				job(),
				new Date().toISOString(),
			),
		).toBeUndefined();
		expect(
			running.relay.options.store.controlRecord("ci-policy:account-a"),
		).toBeDefined();
	} finally {
		await running?.stop();
		rmSync(directory, { recursive: true, force: true });
	}
});

it("rejects an unsupported Sandbox provider before saving a local desired policy", async () => {
	const configuration = initialConfiguration();
	const account = configuration.accounts.find((entry) => entry.id === "tenant");
	if (!account) throw new Error("missing fixture account");
	account.offers.push(
		create(OfferSchema, {
			id: "sandbox",
			provider: "vercel",
			backend: "sandbox",
			providerAccountId: "team",
			runsOn: "sandbox",
			enabled: true,
			bridgeAcknowledged: true,
			budgetMicros: 1000000,
			concurrency: 1,
			observedAt: "2026-10-26T11:00:00Z",
			validUntil: "2026-10-26T14:00:00Z",
			sourceUrl: "https://example.test/rates",
			sandboxPricing: create(SandboxPricingSchema, {
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
			}),
		}),
	);
	const h = await controlHttp({ configuration });
	try {
		const p = desired(true, 50000);
		p.accountId = "tenant";
		p.tenantId = "tenant";
		p.providers = [
			{
				id: "sandbox",
				kind: "vercel",
				connectionRef: "team",
				runsOn: "sandbox",
				enabled: true,
			},
		];
		const response = await fetch(`${h.base}/v2/accounts/self/policy`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				"Content-Type": "application/json",
				"If-Match": '"1"',
			},
			body: JSON.stringify(p),
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "sandbox providers are unavailable on this relay",
		});
		expect(h.store.configuration()?.revision).toBe(1);
		expect(h.store.controlRecord("ci-policy:tenant")).toBeUndefined();
	} finally {
		await h.stop();
	}
});
