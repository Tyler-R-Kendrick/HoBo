import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { must } from "@hobo/core/total-access";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CloudflareFetch,
	type CloudflareFetchResponse,
	createComposedHoboCli,
	createDefaultYardRuntime,
	type VercelFetch,
	type VercelFetchResponse,
} from "../src/index.js";

// END-TO-END proof of the REAL deploy lane THROUGH the composed runtime.
//
// The provider unit tests (vercel-deploy / cloudflare-deploy) call
// `provider.apply()` directly — they prove the request SHAPE but bypass the
// kernel. This file closes the remaining gap: it drives a full `hobo up`
// (parse bindle -> gateway -> Planner -> Orchestrator/ResourceActors ->
// Executor -> IacProvider) with a deploy token present in the INJECTED env, and
// asserts the executor actually reaches the real provider's HTTP call. The only
// thing swapped out is the socket (an injected recording `fetch`): no live token,
// no network, but the entire in-process control plane runs for real. This is the
// exact path a real `VERCEL_TOKEN` / `CLOUDFLARE_*` would light up in production.

const HELLO_BINDLE = {
	schema: "hobo.manifest/v1",
	componentHost: { kind: "wasmtime", version: "1.0.0" },
	resources: {
		service: {
			type: "component.v1",
			image: "oci://registry.example.com/hello-bindle@sha256:abc123",
			runtime: "wasm",
			exports: ["wasi:http/incoming-handler"],
			bind: ["sessions", "assets"],
		},
		sessions: { type: "data.v1", port: "kv" },
		assets: { type: "data.v1", port: "objectStore" },
	},
};

interface VercelCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
}

interface CloudflareCall {
	url: string;
	method: string;
	headers: Record<string, string>;
}

let openStores: RuntimeLocalEventStore[] = [];
afterEach(() => {
	for (const store of openStores) store.close();
	openStores = [];
});

async function withProject(
	callback: (cwd: string) => Promise<void>,
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-live-e2e-"));
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

// Recording VercelFetch — captures each request and returns a Create-Deployment
// success body. No socket is opened.
function recordingVercelFetch() {
	const calls: VercelCall[] = [];
	const fetch: VercelFetch = async (url, init) => {
		calls.push({
			url,
			method: init.method,
			headers: init.headers,
			body: init.body,
		});
		const response: VercelFetchResponse = {
			ok: true,
			status: 200,
			async text() {
				return JSON.stringify({
					id: "dpl_e2e",
					url: "hello-bindle-e2e.vercel.app",
				});
			},
			async json() {
				return { id: "dpl_e2e", url: "hello-bindle-e2e.vercel.app" };
			},
		};
		return response;
	};
	return { fetch, calls };
}

// Recording CloudflareFetch — captures each request and returns a canned success
// body per endpoint (script upload / subdomain lookup). No socket is opened.
function recordingCloudflareFetch() {
	const calls: CloudflareCall[] = [];
	const fetch: CloudflareFetch = async (url, init) => {
		calls.push({ url, method: init.method, headers: init.headers });
		const body = url.endsWith("/workers/subdomain")
			? { result: { subdomain: "acme" }, success: true }
			: { success: true, result: {} };
		const response: CloudflareFetchResponse = {
			ok: true,
			status: 200,
			async text() {
				return JSON.stringify(body);
			},
			async json() {
				return body;
			},
		};
		return response;
	};
	return { fetch, calls };
}

describe("hobo up drives the REAL deploy lane end to end (injected transport)", () => {
	it("routes through to a real Vercel deployment when VERCEL_TOKEN is in the env", async () => {
		await withProject(async (cwd) => {
			const { fetch, calls } = recordingVercelFetch();
			const runtime = createDefaultYardRuntime({
				env: { VERCEL_TOKEN: "tok_e2e" },
				vercelFetch: fetch,
			});
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const result = await cli.run(["up", "--json"], { cwd });
			// SAFETY: assertion required at this I/O or test boundary.
			const up = JSON.parse(result.stdout) as {
				ok: boolean;
				status: string;
				code?: string;
			};

			// The full control plane converged to Deployed — NOT the shell stub.
			expect(up.code).not.toBe("HOBO_CLI_STUB");
			expect(up.ok).toBe(true);
			expect(up.status).toBe("deployed");

			// The executor actually reached the REAL Vercel provider's HTTP calls:
			// a lookup of the project (answered 200 here, so nothing is created),
			// then exactly one Create-Deployment POST (memoized per deployment),
			// each with the Bearer token that came from the injected env.
			expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
				"GET https://api.vercel.com/v9/projects/hobo-hello-bindle",
				"POST https://api.vercel.com/v13/deployments",
			]);
			for (const call of calls) {
				expect(call.headers.Authorization).toBe("Bearer tok_e2e");
			}
		});
	});

	it("routes through to a real Cloudflare Workers upload when CLOUDFLARE_* are in the env", async () => {
		await withProject(async (cwd) => {
			const { fetch, calls } = recordingCloudflareFetch();
			const runtime = createDefaultYardRuntime({
				env: {
					CLOUDFLARE_API_TOKEN: "cf_e2e",
					CLOUDFLARE_ACCOUNT_ID: "acct_e2e",
				},
				cloudflareFetch: fetch,
			});
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const result = await cli.run(["up", "--json"], { cwd });
			// SAFETY: assertion required at this I/O or test boundary.
			const up = JSON.parse(result.stdout) as {
				ok: boolean;
				status: string;
				code?: string;
			};

			expect(up.code).not.toBe("HOBO_CLI_STUB");
			expect(up.ok).toBe(true);
			expect(up.status).toBe("deployed");

			// The executor reached the REAL Cloudflare provider: a Workers script
			// upload (PUT) authenticated with the token from the injected env.
			const upload = calls.find((c) => c.method === "PUT");
			expect(upload).toBeDefined();
			expect(must(upload).url).toContain("/accounts/acct_e2e/workers/scripts/");
			expect(must(upload).headers.Authorization).toBe("Bearer cf_e2e");
		});
	});

	it("still uses the in-memory lane when no deploy credential is present", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime({ env: {} });
			// SAFETY: assertion required at this I/O or test boundary.
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const result = await cli.run(["up", "--json"], { cwd });
			// SAFETY: assertion required at this I/O or test boundary.
			const up = JSON.parse(result.stdout) as { ok: boolean; status: string };

			// No token, no injected transport: the deploy still converges, on the
			// in-memory Pulumi-backed provider (no real HTTP call attempted).
			expect(up.ok).toBe(true);
			expect(up.status).toBe("deployed");
		});
	});
});
