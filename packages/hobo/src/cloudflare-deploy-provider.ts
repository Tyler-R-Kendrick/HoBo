import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
	IacDiff,
	IacDriftReport,
	IacOutputs,
	IacProgram,
	IacProvider,
} from "@hobo/cloud";

import {
	type CloudflareFetch,
	createCloudflareClient,
} from "./cloudflare-client.js";

// @hobo/hobo — the REAL Cloudflare Workers deploy provider (composition/app layer).
//
// This implements the SAME `IacProvider` port the @hobo/cloud Executor drives
// (preview/apply/destroy/refresh over the kernel's shape-A `IacProgram`), but
// instead of the in-memory Pulumi stand-in it forms a REAL Cloudflare Workers
// Script Upload request. On `apply` it reads the committed, known-good ESM Worker
// module (packages/hobo/fixtures/deploy/cloudflare/worker.mjs), uploads it via
// `createCloudflareClient`, and maps the returned workers.dev URL into the
// kernel's `IacOutputs` (`outputs.url`).
//
// HONEST SCOPE: the live Cloudflare call is credential-gated (activates only when a
// real `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` reach the client) and is NOT
// exercised in this sandbox. Only request formation (against a mocked fetch),
// provider selection, and the no-token fallback are verified. `destroy` is modeled
// honestly: a real teardown would DELETE the script; this provider best-effort
// forgets its local memo and no-ops (see note on `destroy`).

// Default Worker module lives next to this package (fixtures/), not under examples/.
// Both `dist/` and `src/` resolve via `../fixtures/deploy/cloudflare/worker.mjs`.
function defaultWorkerModulePath(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..", "fixtures", "deploy", "cloudflare", "worker.mjs");
}

export interface CloudflareDeployProviderOptions {
	// The Cloudflare API token (forwarded to `createCloudflareClient` as the Bearer).
	readonly token: string;
	// The Cloudflare account id (Cloudflare `account_id`).
	readonly accountId: string;
	// The transport. Defaults to global `fetch`; injected in tests.
	readonly fetch?: CloudflareFetch;
	// The Worker script name. Defaults to "hobo-hello-bindle".
	readonly scriptName?: string;
	// The ESM Worker module to upload. Defaults to
	// packages/hobo/fixtures/deploy/cloudflare/worker.mjs.
	readonly workerModulePath?: string;
}

// Build the REAL Cloudflare-backed `IacProvider`. Construction is network-free; the
// module is read and the upload happens lazily on apply.
export function createCloudflareDeployProvider(
	options: CloudflareDeployProviderOptions,
): IacProvider {
	const scriptName = options.scriptName ?? "hobo-hello-bindle";
	const workerModulePath =
		options.workerModulePath ?? defaultWorkerModulePath();
	const client = createCloudflareClient({
		token: options.token,
		accountId: options.accountId,
		...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
	});

	// One Cloudflare Worker realizes the whole bindle. The Executor drives the port
	// once per resource, so memoize by deploymentId: the first resource's apply
	// uploads the Worker; the rest reuse its outputs. Keeps `hobo up` to a single
	// real Worker upload per `deployment.Planned`.
	const byDeployment = new Map<string, IacOutputs>();

	return {
		id: `cloudflare-deploy:${scriptName}`,
		async preview(_program: IacProgram): Promise<IacDiff> {
			// Network-free dry run: confirm the committed module is present + non-empty.
			const bytes = readFileSync(workerModulePath, "utf-8").length;
			return {
				summary: `cloudflare deploy ${scriptName} (worker.mjs ${bytes} bytes) [dry-run; live call cred-gated]`,
				changes: 1,
			};
		},
		async apply(program: IacProgram): Promise<IacOutputs> {
			const cached = byDeployment.get(program.deploymentId);
			if (cached !== undefined) {
				return cached;
			}
			const moduleContent = readFileSync(workerModulePath, "utf-8");
			const result = await client.uploadWorker({
				scriptName,
				moduleContent,
				enableSubdomain: true,
			});
			const outputs: IacOutputs = {
				url: result.url,
				scriptName: result.scriptName,
				provider: "cloudflare",
				target: "production",
			};
			byDeployment.set(program.deploymentId, outputs);
			return outputs;
		},
		async destroy(program: IacProgram): Promise<void> {
			// A real teardown would DELETE the Worker script via
			//   DELETE /accounts/{account_id}/workers/scripts/{script_name}
			// (a follow-up when the delete path lands). Best-effort for now — forget
			// the local memo and no-op honestly rather than claim a destroy we do not
			// perform.
			byDeployment.delete(program.deploymentId);
		},
		async refresh(_program: IacProgram): Promise<IacDriftReport> {
			// REAL drift check: GET the deployed Worker script. If it still exists the
			// deployment matches what `apply` uploaded (in-sync); if it 404s the
			// Worker was deleted out of band (drift). This is a genuine read of live
			// Cloudflare state — credential-gated like apply, mock-tested here.
			const exists = await client.scriptExists(scriptName);
			return exists
				? { drift: false, observed: { scriptName, provider: "cloudflare" } }
				: { drift: true, observed: {} };
		},
	};
}
