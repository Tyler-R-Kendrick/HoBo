import { describe, expect, it } from "vitest";

import {
	asHoboSecretsStore,
	assertNoPlaintextConformance,
	assertNoPlaintextInEvent,
	createAwsSecretsManagerPort,
	createAzureKeyVaultPort,
	createCampSecretsPort,
	createContractAssertedConfigFixtures,
	createMemorySecretsPort,
	createOpenBaoSecretsPort,
	createVaultJwtSecretsPort,
	decryptLocalOverrides,
	encryptLocalOverrides,
	requireNoPlaintextConformance,
	resolveConfigEntry,
	resolveConfigSchema,
} from "../src/index.js";

const schema = {
	kind: "config-schema" as const,
	schemaVersion: "hobo.config-schema/v1" as const,
	schemaHash: "sha256:test" as const,
	fields: {
		LOG_LEVEL: {
			kind: "config-field" as const,
			name: "LOG_LEVEL",
			type: "string" as const,
			required: false,
			sensitive: false,
			source: "camp-value" as const,
			defaultValue: "info",
		},
		DB_URL: {
			kind: "config-field" as const,
			name: "DB_URL",
			type: "string" as const,
			required: true,
			sensitive: true,
			source: "bound-resource" as const,
		},
		API_KEY: {
			kind: "config-field" as const,
			name: "API_KEY",
			type: "string" as const,
			required: true,
			sensitive: true,
			source: "provider-federation" as const,
		},
	},
};

describe("secretless resolution ladder", () => {
	it("prefers bound-resource over lower ranks", async () => {
		const result = await resolveConfigEntry({
			name: "DB_URL",
			sensitive: true,
			preferredSource: "bound-resource",
			allowedSources: [
				"bound-resource",
				"provider-federation",
				"camp-value",
				"static-escape",
			],
			boundToken: async () => "short-lived-svid-token",
			campValue: "should-not-use",
		});
		expect(result.status).toBe("resolved");
		if (result.status === "resolved") {
			expect(result.entry.source).toBe("bound-resource");
			expect(result.entry.placeholder).toMatch(/REDACTED/);
			expect(result.entry.value).toBeUndefined();
		}
	});

	it("provider-federation uses secrets port without exposing material on entry", async () => {
		const port = createMemorySecretsPort();
		await port.put("API_KEY", "real-secret-value-xyz");
		const result = await resolveConfigEntry({
			name: "API_KEY",
			sensitive: true,
			preferredSource: "provider-federation",
			allowedSources: ["provider-federation"],
			secretsPort: port,
		});
		expect(result.status).toBe("resolved");
		if (result.status === "resolved") {
			expect(result.entry.placeholder).toMatch(/REDACTED/);
			expect(JSON.stringify(result.entry)).not.toContain("real-secret-value-xyz");
		}
	});

	it("resolveConfigSchema emits redacted events", async () => {
		const port = createMemorySecretsPort();
		await port.put("API_KEY", "real-secret-value-xyz");
		const resolved = await resolveConfigSchema({
			tenant: "t1",
			schema,
			campValues: { LOG_LEVEL: "debug" },
			secretsPort: port,
			boundTokens: {
				DB_URL: async () => "tok_db",
			},
			forbidStaticEscape: true,
		});
		expect(resolved.agentView.LOG_LEVEL).toBe("debug");
		expect(resolved.agentView.DB_URL).toMatch(/REDACTED/);
		expect(resolved.agentView.API_KEY).toMatch(/REDACTED/);
		expect(JSON.stringify(resolved.agentView)).not.toContain(
			"real-secret-value-xyz",
		);
		for (const e of resolved.events) {
			assertNoPlaintextInEvent(e);
			expect(e.data.redacted).toBe(true);
		}
		expect(resolved.events.some((e) => e.type === "config.Resolved")).toBe(
			true,
		);
		expect(resolved.events.some((e) => e.type === "secret.Accessed")).toBe(
			true,
		);
	});

	it("Vault JWT adapter works without static vault token", async () => {
		const vault = createVaultJwtSecretsPort({
			vaultAddr: "https://vault.example",
			role: "hobo-workload",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
		});
		await vault.put("app/db", "seed");
		const accessed = await vault.access("app/db");
		expect(accessed.status).toBe("ok");
		if (accessed.status === "ok") {
			expect(accessed.valueRef).toMatch(/^vault:\/\//);
			expect(accessed.expiresAt).toBeTruthy();
		}
	});

	it("OpenBao offline adapter is deterministic and JWT-only (no static token)", async () => {
		const a = createOpenBaoSecretsPort({
			openbaoAddr: "https://openbao.example:8200",
			role: "hobo-workload",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
			offline: true,
		});
		const b = createOpenBaoSecretsPort({
			openbaoAddr: "https://openbao.example:8200",
			role: "hobo-workload",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
			offline: true,
		});
		expect(a.kind).toBe("openbao");
		const r1 = await a.access("app/db");
		const r2 = await b.access("app/db");
		expect(r1.status).toBe("ok");
		expect(r2.status).toBe("ok");
		if (r1.status === "ok" && r2.status === "ok") {
			expect(r1.material).toBe(r2.material);
			expect(r1.valueRef).toMatch(/^openbao:\/\//);
			expect(r1.valueRef).toContain("@");
			expect(r1.expiresAt).toBeTruthy();
			// valueRef must not embed material
			expect(r1.valueRef).not.toContain(r1.material ?? "___");
		}
		await a.put("app/db", "seed-v1");
		const versions = await a.listVersions("app/db");
		expect(versions.length).toBeGreaterThan(0);
		const byVer = await a.accessVersion("app/db", versions[0]!);
		expect(byVer.status).toBe("ok");
	});

	it("OpenBao live path uses JWT login + KV v2 via injected fetch", async () => {
		const calls: { url: string; method?: string; body?: string }[] = [];
		let loggedIn = false;
		const fetch = async (
			url: string,
			init?: { method?: string; headers?: Record<string, string>; body?: string },
		) => {
			calls.push({ url, method: init?.method, body: init?.body });
			if (url.includes("/auth/jwt/login")) {
				const body = JSON.parse(init?.body ?? "{}") as {
					role?: string;
					jwt?: string;
				};
				expect(body.role).toBe("hobo-workload");
				expect(body.jwt).toMatch(/^eyJ/);
				// Must not accept a static vault token as the SVID field
				expect(body.jwt).not.toMatch(/^hvs\./);
				loggedIn = true;
				return {
					ok: true,
					status: 200,
					json: async () => ({
						auth: { client_token: "s.short-lived", lease_duration: 600 },
					}),
					text: async () => "",
				};
			}
			if (url.includes("/data/app%2Fkey") || url.includes("/data/app/key")) {
				expect(loggedIn).toBe(true);
				expect(init?.headers?.["X-Vault-Token"]).toBe("s.short-lived");
				expect(init?.headers?.["X-Vault-Namespace"]).toBe("team-a");
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							data: { value: "live-openbao-material" },
							metadata: { version: 3 },
						},
						lease_duration: 300,
					}),
					text: async () => "",
				};
			}
			if (url.includes("/metadata/")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: { versions: { "1": {}, "3": {} } },
					}),
					text: async () => "",
				};
			}
			return {
				ok: false,
				status: 404,
				json: async () => ({}),
				text: async () => "not found",
			};
		};
		const port = createOpenBaoSecretsPort({
			openbaoAddr: "https://openbao.example:8200",
			role: "hobo-workload",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
			namespace: "team-a",
			mountPath: "secret",
			fetch,
			offline: false,
		});
		const accessed = await port.access("app/key");
		expect(accessed.status).toBe("ok");
		if (accessed.status === "ok") {
			expect(accessed.material).toBe("live-openbao-material");
			expect(accessed.valueRef).toMatch(/^openbao:\/\//);
			expect(accessed.valueRef).toContain("team-a");
			expect(accessed.versionId).toBe("obv3");
			expect(accessed.expiresAt).toBeTruthy();
		}
		const denied = createOpenBaoSecretsPort({
			openbaoAddr: "https://openbao.example:8200",
			role: "hobo-workload",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
			fetch: async () => ({
				ok: false,
				status: 403,
				json: async () => ({}),
				text: async () => "forbidden",
			}),
			offline: false,
		});
		const d = await denied.access("nope");
		expect(d.status).toBe("denied");
		if (d.status === "denied") {
			expect(d.code).toMatch(/openbao/);
		}
		expect(calls.some((c) => c.url.includes("/auth/jwt/login"))).toBe(true);
	});

	it("Camp factory selects openbao and ladder uses it without agent-visible material", async () => {
		const port = createCampSecretsPort({
			backend: "openbao",
			openbaoAddr: "https://openbao.camp.local",
			vaultRole: "workload",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
			offline: true,
		});
		expect(port.kind).toBe("openbao");
		await port.put("API_KEY", "broker-only-secret");
		const result = await resolveConfigEntry({
			name: "API_KEY",
			sensitive: true,
			preferredSource: "provider-federation",
			allowedSources: ["provider-federation"],
			secretsPort: port,
		});
		expect(result.status).toBe("resolved");
		if (result.status === "resolved") {
			expect(result.entry.placeholder).toMatch(/REDACTED/);
			expect(JSON.stringify(result.entry)).not.toContain("broker-only-secret");
			expect(result.entry.valueRef).toMatch(/^openbao:\/\//);
		}
		const store = asHoboSecretsStore(port);
		const latest = await store.access("API_KEY");
		expect(latest.versionId).toBeTruthy();
		requireNoPlaintextConformance({
			agentContext: { API_KEY: "[REDACTED:provider-federation:API_KEY]" },
			events: [
				{
					type: "secret.Accessed",
					data: {
						name: "API_KEY",
						valueRef: "openbao://x/secret/API_KEY@obv1",
						redacted: true,
					},
				},
			],
			logs: "openbao residual access",
		});
	});

	it("static-escape forbidden when policy forbids", async () => {
		await expect(
			resolveConfigSchema({
				tenant: "t1",
				schema: {
					kind: "config-schema",
					schemaVersion: "hobo.config-schema/v1",
					schemaHash: "sha256:x",
					fields: {
						LEGACY: {
							kind: "config-field",
							name: "LEGACY",
							type: "string",
							required: true,
							sensitive: true,
							source: "static-escape",
							ttl: "7d",
							rotation: "required",
						},
					},
				},
				forbidStaticEscape: true,
				staticMaterials: { LEGACY: "pw" },
			}),
		).rejects.toThrow(/required config/);
	});

	it("contract-asserted dev fixtures resolve without agent-visible secrets", async () => {
		const fixtures = await createContractAssertedConfigFixtures(schema, {
			seedSecrets: { API_KEY: "seeded-only-in-broker" },
		});
		expect(fixtures.forbidStaticEscape).toBe(true);
		const resolved = await resolveConfigSchema({
			tenant: "dev",
			schema,
			campValues: fixtures.campValues,
			secretsPort: fixtures.secretsPort,
			boundTokens: fixtures.boundTokens,
			forbidStaticEscape: fixtures.forbidStaticEscape,
			allowedSources: fixtures.allowedSources,
		});
		expect(resolved.agentView.DB_URL).toMatch(/REDACTED/);
		expect(resolved.agentView.API_KEY).toMatch(/REDACTED/);
		expect(JSON.stringify(resolved.agentView)).not.toContain(
			"seeded-only-in-broker",
		);
		requireNoPlaintextConformance({
			agentContext: resolved.agentView,
			events: resolved.events,
			iacState: { outputs: { db: resolved.entries.DB_URL?.valueRef } },
			logs: "resolved config",
		});
	});

	it("AWS SM and Azure KV ports support injected live fetch", async () => {
		const calls: string[] = [];
		const fetch = async (url: string) => {
			calls.push(url);
			return {
				ok: true,
				status: 200,
				json: async () => ({
					VersionId: "v-live",
					SecretString: "live-material",
					value: "live-material",
					id: "https://vault/secrets/k/v-live",
				}),
				text: async () => "",
			};
		};
		const aws = createAwsSecretsManagerPort({
			region: "eu-west-1",
			fetch,
			accessToken: "brokered",
		});
		const awsAccess = await aws.access("app/key");
		expect(awsAccess.status).toBe("ok");
		if (awsAccess.status === "ok") {
			expect(awsAccess.valueRef).toMatch(/^aws-sm:\/\//);
			expect(awsAccess.material).toBe("live-material");
		}
		const az = createAzureKeyVaultPort({
			vaultName: "prod-kv",
			fetch,
			accessToken: "brokered",
		});
		const azAccess = await az.access("app-key");
		expect(azAccess.status).toBe("ok");
		expect(calls.length).toBeGreaterThan(0);

		const camp = createCampSecretsPort({ backend: "vault-jwt" });
		const store = asHoboSecretsStore(camp);
		const versionId = await store.put(
			"x",
			new Uint8Array(Buffer.from("v", "utf8")),
		);
		expect(versionId).toBeTruthy();
		const latest = await store.access("x");
		expect(latest.versionId).toBe(versionId);
	});

	it("encrypts non-sensitive local overrides only", () => {
		const file = encryptLocalOverrides({
			values: { LOG_LEVEL: "debug", MAX_CONCURRENCY: 8 },
			allowedKeys: ["LOG_LEVEL", "MAX_CONCURRENCY"],
			passphrase: "dev-pass",
		});
		expect(file.schemaVersion).toBe("hobo.local-config-override/v1");
		const plain = decryptLocalOverrides(file, "dev-pass");
		expect(plain.LOG_LEVEL).toBe("debug");
		expect(() =>
			encryptLocalOverrides({
				values: { API_KEY: "sk-super-secret-value-12345" },
				allowedKeys: ["API_KEY"],
				passphrase: "x",
			}),
		).toThrow(/sensitive|not in non-sensitive/i);

		const conf = assertNoPlaintextConformance({
			agentContext: { API_KEY: "[REDACTED:provider-federation:API_KEY]" },
			events: [{ type: "secret.Accessed", valueRef: "secref://API_KEY/v1" }],
		});
		expect(conf.ok).toBe(true);
	});
});
