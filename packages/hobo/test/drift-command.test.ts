import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import { deploymentIdFor } from "@hobo/cli";
import { collectStream } from "@hobo/cloud";
import { must } from "@hobo/core/total-access";
import {
	createInMemoryStateBackend,
	createPulumiAutomationAdapter,
} from "@hobo/iac-pulumi";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CloudflareFetch,
	type CloudflareFetchResponse,
	createComposedHoboCli,
	createDefaultYardRuntime,
	createDriftCommand,
	DRIFT_CHECKED_EVENT,
	DRIFT_DETECTED_EVENT,
	type PulumiAutomationAdapter,
} from "../src/index.js";

// `hobo drift` — REAL drift detection: the declared bindle manifest's desired
// resources are compared against the state the IaC backend actually holds.
// On the Pulumi lanes the estate comes from the shared adapter's state backend
// (seeded by a prior `hobo up`); per-resource verdicts are missing / orphaned /
// diverged (the latter via a refresh through the engine seam). On the live
// Cloudflare lane the recorded DeploymentView is the held state and the REAL
// refresh (GET the Worker script) decides divergence. Every run appends
// `drift.Checked` (+ per-finding `drift.Detected`) facts to the durable log.

const HELLO_BINDLE = {
	schema: "hobo.manifest/v1",
	componentHost: { kind: "wasmtime", version: "1.0.0" },
	resources: {
		service: {
			type: "component.v1",
			image: "oci://registry.example.com/hello-bindle@sha256:abc123",
			runtime: "wasm",
			exports: ["wasi:http/incoming-handler"],
			bind: ["sessions"],
		},
		sessions: { type: "data.v1", port: "kv" },
	},
};

const CF_ENV = {
	CLOUDFLARE_API_TOKEN: "cf-tok",
	CLOUDFLARE_ACCOUNT_ID: "acct-1",
};

// A CloudflareFetch that answers a Worker-script GET with `scriptGetStatus`
// (200 = present/in-sync, 404 = deleted/drifted) and everything else with 2xx.
function cfFetch(scriptGetStatus: number): CloudflareFetch {
	return async (url, init): Promise<CloudflareFetchResponse> => {
		const isScriptGet =
			init.method === "GET" && /\/workers\/scripts\/[^/]+$/.test(url);
		const status = isScriptGet ? scriptGetStatus : 200;
		const ok = status >= 200 && status < 300;
		const body = url.endsWith("/workers/subdomain")
			? { result: { subdomain: "acme" }, success: true }
			: { success: ok, result: {} };
		return {
			ok,
			status,
			async text() {
				return JSON.stringify(body);
			},
			async json() {
				return body;
			},
		};
	};
}

let openStores: RuntimeLocalEventStore[] = [];
afterEach(() => {
	for (const store of openStores) store.close();
	openStores = [];
});

async function withProject(
	callback: (cwd: string) => Promise<void>,
	writeManifest = true,
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-drift-"));
	if (writeManifest) {
		await writeFile(
			path.join(dir, "hobo.bindle.json"),
			`${JSON.stringify(HELLO_BINDLE, null, 2)}\n`,
		);
	}
	try {
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function runInput(cwd: string, emit: (m: string) => void = () => {}) {
	return {
		context: { cwd, projectDir: cwd } as unknown as CliContext,
		flags: { cwd } as never,
		args: [] as readonly string[],
		verb: "drift",
		emitProgress: emit,
	};
}

interface DriftData {
	checked: number;
	drifted: string[];
	missing: string[];
	orphaned: string[];
	diverged: string[];
	backend?: string;
	engineCode?: string;
}

describe("createDriftCommand", () => {
	it("reports in-sync on the in-memory lane after `hobo up` (declared == held state)", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			await cli.run(["up", "--json"], { cwd });
			const drift = JSON.parse(
				(await cli.run(["drift", "--json"], { cwd })).stdout,
			) as {
				ok: boolean;
				status: string;
				code?: string;
				data: DriftData;
			};

			expect(drift.code).not.toBe("HOBO_CLI_STUB");
			expect(drift.ok).toBe(true);
			expect(drift.status).toBe("in-sync");
			expect(drift.data.checked).toBe(2);
			expect(drift.data.drifted).toEqual([]);

			// The check is a durable fact on the deployment stream.
			const events = await collectStream(
				runtime.store,
				`deployment:${deploymentIdFor(cwd)}`,
			);
			const checked = events.filter((e) => e.type === DRIFT_CHECKED_EVENT);
			expect(checked.length).toBe(1);
			expect((checked[0]?.data as { checked: number }).checked).toBe(2);
		});
	});

	it("reports a declared-but-absent resource as missing", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			// Declare one MORE resource than the estate holds.
			await writeFile(
				path.join(cwd, "hobo.bindle.json"),
				`${JSON.stringify(
					{
						...HELLO_BINDLE,
						resources: {
							...HELLO_BINDLE.resources,
							cache: { type: "data.v1", port: "kv" },
						},
					},
					null,
					2,
				)}\n`,
			);

			const drift = JSON.parse(
				(await cli.run(["drift", "--json"], { cwd })).stdout,
			) as { ok: boolean; status: string; data: DriftData };
			expect(drift.status).toBe("drifted");
			expect(drift.data.missing).toEqual(["cache"]);
			expect(drift.data.orphaned).toEqual([]);
			expect(drift.data.drifted).toContain("cache");
		});
	});

	it("reports a held-but-undeclared resource as orphaned", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			// Remove `sessions` from the declaration; the estate still holds it.
			await writeFile(
				path.join(cwd, "hobo.bindle.json"),
				`${JSON.stringify(
					{
						...HELLO_BINDLE,
						resources: {
							service: {
								...HELLO_BINDLE.resources.service,
								bind: [],
							},
						},
					},
					null,
					2,
				)}\n`,
			);

			const drift = JSON.parse(
				(await cli.run(["drift", "--json"], { cwd })).stdout,
			) as { ok: boolean; status: string; data: DriftData };
			expect(drift.status).toBe("drifted");
			expect(drift.data.orphaned).toEqual(["sessions"]);
			expect(drift.data.missing).toEqual([]);

			// The finding is recorded as a drift.Detected fact.
			const events = await collectStream(
				runtime.store,
				`deployment:${deploymentIdFor(cwd)}`,
			);
			const detected = events.filter((e) => e.type === DRIFT_DETECTED_EVENT);
			expect(
				detected.map((e) => (e.data as { resource: string }).resource),
			).toContain("sessions");
			expect(detected.map((e) => (e.data as { kind: string }).kind)).toContain(
				"orphaned",
			);
		});
	});

	it("reports diverged when the held state no longer matches the stored plan", async () => {
		await withProject(async (cwd) => {
			const stateBackend = createInMemoryStateBackend();
			const adapter = createPulumiAutomationAdapter({
				stateBackend,
			}) as PulumiAutomationAdapter;
			const runtime = createDefaultYardRuntime({ iacAdapter: adapter });
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			// Tamper with the held state OUT OF BAND (the drift story): the stack
			// still exists but its record no longer matches the realized spec.
			const deploymentId = deploymentIdFor(cwd);
			const stackKey = `${deploymentId}/service`;
			const held = stateBackend.read(stackKey) as {
				resources: Record<string, { specHash?: string }>;
			};
			expect(held.resources.service).toBeDefined();
			must(held.resources.service).specHash = "sha256:tampered-out-of-band";
			stateBackend.write(stackKey, held);

			const command = createDriftCommand({ runtime, adapter });
			const result = await command.run(runInput(cwd));
			const data = result.data as DriftData;
			expect(result.ok).toBe(true);
			expect(result.status).toBe("drifted");
			expect(data.diverged).toEqual(["service"]);
			expect(data.missing).toEqual([]);
			expect(data.orphaned).toEqual([]);
		});
	});

	it("reports in-sync against a live Cloudflare backend when the Worker still exists", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			const command = createDriftCommand({
				runtime,
				env: CF_ENV,
				cloudflareFetch: cfFetch(200),
			});
			const result = await command.run(runInput(cwd));

			expect(result.ok).toBe(true);
			expect(result.status).toBe("in-sync");
			expect((result.data as DriftData).checked).toBe(2);
			expect((result.data as DriftData).drifted).toEqual([]);
		});
	});

	it("reports divergence + a governed remediation when the live Worker is gone (404)", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			const emitted: string[] = [];
			const command = createDriftCommand({
				runtime,
				env: CF_ENV,
				cloudflareFetch: cfFetch(404),
			});
			const result = await command.run(runInput(cwd, (m) => emitted.push(m)));

			expect(result.ok).toBe(true);
			expect(result.status).toBe("drifted");
			expect((result.data as DriftData).checked).toBe(2);
			expect([...(result.data as DriftData).diverged].sort()).toEqual([
				"service",
				"sessions",
			]);
			expect([...(result.data as DriftData).drifted].sort()).toEqual([
				"service",
				"sessions",
			]);
			expect(result.remediation?.[0]).toMatch(/hobo up/);
			expect(emitted.every((m) => m.endsWith("diverged"))).toBe(true);
		});
	});

	it("reports no deployment when nothing has been deployed on the live lane", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const command = createDriftCommand({
				runtime,
				env: CF_ENV,
				cloudflareFetch: cfFetch(200),
			});
			const result = await command.run(runInput(cwd));
			expect(result.ok).toBe(true);
			expect(result.status).toBe("no_deployment");
			expect((result.data as DriftData).checked).toBe(0);
		});
	});

	it("fails closed with a typed error when HOBO_PULUMI_LIVE=1 and the pulumi binary is missing", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const command = createDriftCommand({
				runtime,
				env: {
					HOBO_PULUMI_LIVE: "1",
					HOBO_PULUMI_BIN: "definitely-not-pulumi-xyz",
				},
			});
			const result = await command.run(runInput(cwd));
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_PULUMI_UNAVAILABLE");
			expect((result.data as DriftData).backend).toBe("pulumi-live");
			expect((result.data as DriftData).engineCode).toBe("pulumi-cli-missing");
		});
	});

	it("errors when there is no bindle to compare against", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const command = createDriftCommand({ runtime });
			const result = await command.run(runInput(cwd));
			expect(result.ok).toBe(false);
			expect(result.code).toBe("HOBO_NO_BINDLE");
		}, false);
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createDriftCommand().run(runInput("/tmp"));
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
