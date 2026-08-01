/**
 * Local Station + wasm component host residual secrets (OpenBao).
 *
 * Host owns residual SecretsPort (OpenBao offline by default). Wasm guests only
 * receive redacted agentView / mesh env — never material. Mirrors
 * runtime-wasm / bare-metal `x-hobo-env-*` injection posture.
 */
import { describe, expect, it } from "vitest";

import {
	asHoboSecretsStore,
	createContractAssertedConfigFixtures,
	createLocalStationSecretsPort,
	createOpenBaoSecretsPort,
	requireNoPlaintextConformance,
	resolveConfigSchema,
} from "../src/index.js";

const stationSchema = {
	kind: "config-schema" as const,
	schemaVersion: "hobo.config-schema/v1" as const,
	schemaHash: "sha256:station-wasm-openbao" as const,
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
		DB_PASSWORD: {
			kind: "config-field" as const,
			name: "DB_PASSWORD",
			type: "string" as const,
			required: true,
			sensitive: true,
			source: "provider-federation" as const,
		},
		DB_URL: {
			kind: "config-field" as const,
			name: "DB_URL",
			type: "string" as const,
			required: true,
			sensitive: true,
			source: "bound-resource" as const,
		},
	},
};

describe("local Station residual OpenBao (wasm host path)", () => {
	it("default local station secrets port is OpenBao offline", async () => {
		const port = createLocalStationSecretsPort({
			stationId: "wasm-dev",
			offline: true,
		});
		expect(port.kind).toBe("openbao");
		expect(port.id).toMatch(/openbao|station/);
		await port.put("DB_PASSWORD", "broker-only-material");
		const access = await port.access("DB_PASSWORD");
		expect(access.status).toBe("ok");
		if (access.status === "ok") {
			expect(access.valueRef).toMatch(/^openbao:\/\//);
			expect(access.valueRef).not.toContain("broker-only-material");
			expect(access.expiresAt).toBeTruthy();
		}
	});

	it("contract fixtures default residual backend to OpenBao offline", async () => {
		const fixtures = await createContractAssertedConfigFixtures(stationSchema, {
			stationId: "station-local",
			seedSecrets: { DB_PASSWORD: "seeded-broker-secret" },
		});
		expect(fixtures.secretsPort.kind).toBe("openbao");
		const resolved = await resolveConfigSchema({
			tenant: "t-wasm",
			schema: stationSchema,
			campValues: fixtures.campValues,
			secretsPort: fixtures.secretsPort,
			boundTokens: fixtures.boundTokens,
			forbidStaticEscape: fixtures.forbidStaticEscape,
			allowedSources: fixtures.allowedSources,
		});
		// Wasm guest mesh view: placeholders only
		expect(resolved.agentView.DB_PASSWORD).toMatch(/REDACTED/);
		expect(resolved.agentView.DB_URL).toMatch(/REDACTED/);
		expect(JSON.stringify(resolved.agentView)).not.toContain(
			"seeded-broker-secret",
		);
		// Residual federation used OpenBao valueRef shape
		expect(resolved.entries.DB_PASSWORD?.valueRef).toMatch(/^openbao:\/\//);
		requireNoPlaintextConformance({
			agentContext: resolved.agentView,
			events: resolved.events,
			// Mesh env that would be injected as x-hobo-env-* (non-sensitive only)
			iacState: {
				meshEnv: {
					LOG_LEVEL: resolved.agentView.LOG_LEVEL,
					// sensitive must stay placeholder if ever mirrored to guest
					DB_PASSWORD: resolved.agentView.DB_PASSWORD,
				},
			},
			logs: "wasm station residual openbao resolve",
		});
	});

	it("host WIT residual store works while guest view stays redacted", async () => {
		const port = createLocalStationSecretsPort({
			stationId: "wit-host",
			offline: true,
		});
		const store = asHoboSecretsStore(port);
		const versionId = await store.put(
			"API_KEY",
			new Uint8Array(Buffer.from("host-broker-secret", "utf8")),
		);
		const latest = await store.access("API_KEY");
		expect(latest.versionId).toBe(versionId);
		// Material exists only on host WIT residual path
		expect(Buffer.from(latest.value).toString("utf8").length).toBeGreaterThan(0);

		const resolved = await resolveConfigSchema({
			tenant: "t1",
			schema: {
				kind: "config-schema",
				schemaVersion: "hobo.config-schema/v1",
				schemaHash: "sha256:wit",
				fields: {
					API_KEY: {
						kind: "config-field",
						name: "API_KEY",
						type: "string",
						required: true,
						sensitive: true,
						source: "provider-federation",
					},
				},
			},
			secretsPort: port,
			forbidStaticEscape: true,
			allowedSources: ["provider-federation"],
		});
		expect(resolved.agentView.API_KEY).toMatch(/REDACTED/);
		expect(JSON.stringify(resolved.agentView)).not.toMatch(/host-broker/);
	});

	it("live OpenBao path can be selected with injected fetch (local OpenBao)", async () => {
		const calls: string[] = [];
		const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
			calls.push(url);
			if (url.includes("/auth/jwt/login")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						auth: { client_token: "s.station-local", lease_duration: 120 },
					}),
					text: async () => "",
				};
			}
			if (url.includes("/data/")) {
				expect(init?.headers?.["X-Vault-Token"]).toBe("s.station-local");
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							data: { value: "from-local-openbao" },
							metadata: { version: 1 },
						},
						lease_duration: 60,
					}),
					text: async () => "",
				};
			}
			return {
				ok: false,
				status: 404,
				json: async () => ({}),
				text: async () => "",
			};
		};
		const port = createLocalStationSecretsPort({
			stationId: "live",
			env: {
				HOBO_OPENBAO_LIVE: "1",
				HOBO_OPENBAO_ADDR: "http://127.0.0.1:8200",
				HOBO_SVID_JWT: "eyJhbGciOiJFUzI1NiJ9.svid.live",
			},
			fetch,
		});
		expect(port.kind).toBe("openbao");
		const r = await port.access("app/secret");
		expect(r.status).toBe("ok");
		if (r.status === "ok") {
			expect(r.material).toBe("from-local-openbao");
			expect(r.valueRef).toMatch(/^openbao:\/\/http:\/\/127\.0\.0\.1:8200\//);
		}
		expect(calls.some((u) => u.includes("/auth/jwt/login"))).toBe(true);
	});

	it("pure OpenBao offline is deterministic across station hosts", async () => {
		const a = createOpenBaoSecretsPort({
			openbaoAddr: "http://127.0.0.1:8200",
			role: "hobo-station-local",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.same",
			offline: true,
		});
		const b = createOpenBaoSecretsPort({
			openbaoAddr: "http://127.0.0.1:8200",
			role: "hobo-station-local",
			svidJwt: "eyJhbGciOiJFUzI1NiJ9.same",
			offline: true,
		});
		const ra = await a.access("k");
		const rb = await b.access("k");
		expect(ra.status).toBe("ok");
		expect(rb.status).toBe("ok");
		if (ra.status === "ok" && rb.status === "ok") {
			expect(ra.material).toBe(rb.material);
		}
	});
});
