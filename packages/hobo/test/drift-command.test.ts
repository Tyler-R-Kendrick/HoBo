import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	type CloudflareFetch,
	type CloudflareFetchResponse,
	createComposedHoboCli,
	createDefaultYardRuntime,
	createDriftCommand,
} from "../src/index.js";

// `hobo drift` checks a recorded deployment against its LIVE backend via the IaC
// port's refresh(). On the in-memory lane there is nothing live to drift, so it
// says so. On the live Cloudflare lane it does a REAL refresh (GET the Worker
// script): present -> in-sync, 404 -> drifted with a governed remediation. The
// network is mocked throughout — no live token, no socket.

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
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-drift-"));
	await writeFile(
		path.join(dir, "hobo.bindle.json"),
		`${JSON.stringify(HELLO_BINDLE, null, 2)}\n`,
	);
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

describe("createDriftCommand", () => {
	it("reports no-live-backend on the in-memory lane (nothing to drift)", async () => {
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
				data: { checked: number };
			};

			expect(drift.code).not.toBe("HOBO_CLI_STUB");
			expect(drift.ok).toBe(true);
			expect(drift.status).toBe("no_live_backend");
			expect(drift.data.checked).toBe(0);
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
			expect((result.data as { checked: number }).checked).toBe(2);
			expect((result.data as { drifted: string[] }).drifted).toEqual([]);
		});
	});

	it("reports drift + a governed remediation when the live Worker is gone (404)", async () => {
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
			expect((result.data as { checked: number }).checked).toBe(2);
			expect((result.data as { drifted: string[] }).drifted.sort()).toEqual([
				"service",
				"sessions",
			]);
			expect(result.remediation?.[0]).toMatch(/hobo up/);
			expect(emitted.every((m) => m.endsWith("drifted"))).toBe(true);
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
			expect((result.data as { checked: number }).checked).toBe(0);
		});
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createDriftCommand().run(runInput("/tmp"));
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
