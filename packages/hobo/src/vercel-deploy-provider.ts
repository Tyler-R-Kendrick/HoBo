import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type {
	IacDiff,
	IacDriftReport,
	IacOutputs,
	IacProgram,
	IacProvider,
} from "@hobo/cloud";

import {
	createVercelClient,
	type VercelDeploymentFile,
	type VercelFetch,
} from "./vercel-client.js";

// @hobo/hobo — the REAL Vercel deploy provider (composition/app layer).
//
// This implements the SAME `IacProvider` port the @hobo/cloud Executor drives
// (preview/apply/destroy/refresh over the kernel's shape-A `IacProgram`), but
// instead of the in-memory Pulumi stand-in it forms a REAL Vercel Create
// Deployment request. On `apply` it reads the committed, known-good Vercel file
// tree (packages/hobo/fixtures/deploy/vercel/), posts it via `createVercelClient`,
// and maps the returned deployment URL into the kernel's `IacOutputs` (`outputs.url`).
//
// HONEST SCOPE: the live Vercel call is credential-gated (activates only when a
// real `VERCEL_TOKEN` reaches `createVercelClient`) and is NOT exercised in this
// sandbox. Only request formation (against a mocked fetch), provider selection,
// and the no-token fallback are verified. `destroy` is modeled honestly: Vercel
// deployments are immutable, so a real teardown would DELETE the deployment; this
// provider best-effort forgets its local memo and no-ops (see note on `destroy`).

// Default Vercel tree lives next to this package (fixtures/), not under examples/.
// Both `dist/` and `src/` resolve via `../fixtures/deploy/vercel`.
function defaultTemplateDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(here, "..", "fixtures", "deploy", "vercel");
}

// Walk the committed artifact tree and produce the Vercel inline-files payload:
// one `{ file, data, encoding:"base64" }` per file, `file` being the POSIX path
// relative to the artifact root. This is the deploy source of truth — the app is
// NOT re-invented here; it is the exact bytes HoBo ships as the known-good target.
function readVercelFileTree(rootDir: string): VercelDeploymentFile[] {
	const files: VercelDeploymentFile[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			files.push({
				file: relative(rootDir, full).split("\\").join("/"),
				data: readFileSync(full).toString("base64"),
				encoding: "base64",
			});
		}
	};
	walk(rootDir);
	files.sort((a, b) => a.file.localeCompare(b.file));
	return files;
}

export interface VercelDeployProviderOptions {
	// The Vercel access token (forwarded to `createVercelClient` as the Bearer).
	readonly token: string;
	// The transport. Defaults to global `fetch`; injected in tests.
	readonly fetch?: VercelFetch;
	// The Vercel project/deployment name. Defaults to "hobo-hello-bindle".
	readonly projectName?: string;
	// The team id, when the token is a team token.
	readonly teamId?: string;
	// The artifact directory to deploy. Defaults to
	// packages/hobo/fixtures/deploy/vercel.
	readonly templateDir?: string;
	// The deploy target. Defaults to "production".
	readonly target?: string;
}

// Build the REAL Vercel-backed `IacProvider`. Construction is network-free; the
// file tree is read and the deployment is created lazily on preview/apply.
export function createVercelDeployProvider(
	options: VercelDeployProviderOptions,
): IacProvider {
	const projectName = options.projectName ?? "hobo-hello-bindle";
	const target = options.target ?? "production";
	const templateDir = options.templateDir ?? defaultTemplateDir();
	const client = createVercelClient({
		token: options.token,
		...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
		...(options.teamId !== undefined ? { teamId: options.teamId } : {}),
	});

	// One Vercel deployment realizes the whole bindle. The Executor drives the port
	// once per resource, so memoize by deploymentId: the first resource's apply
	// creates the deployment; the rest reuse its outputs. Keeps `hobo up` to a
	// single real Vercel deployment per `deployment.Planned`.
	const byDeployment = new Map<string, IacOutputs>();

	return {
		id: `vercel-deploy:${projectName}`,
		async preview(_program: IacProgram): Promise<IacDiff> {
			const files = readVercelFileTree(templateDir);
			return {
				summary: `vercel deploy ${projectName} target=${target} (${files.length} files) [dry-run; live call cred-gated]`,
				changes: files.length,
			};
		},
		async apply(program: IacProgram): Promise<IacOutputs> {
			const cached = byDeployment.get(program.deploymentId);
			if (cached !== undefined) {
				return cached;
			}
			const files = readVercelFileTree(templateDir);
			const result = await client.createDeployment({
				name: projectName,
				files,
				target,
			});
			const outputs: IacOutputs = {
				url: result.url,
				deploymentId: result.id,
				provider: "vercel",
				target,
			};
			byDeployment.set(program.deploymentId, outputs);
			return outputs;
		},
		async destroy(program: IacProgram): Promise<void> {
			// Vercel deployments are immutable: a real teardown would DELETE the
			// deployment via the REST API (a follow-up when the delete path lands).
			// Best-effort for now — forget the local memo and no-op honestly rather
			// than claim a destroy we do not perform.
			byDeployment.delete(program.deploymentId);
		},
		async refresh(_program: IacProgram): Promise<IacDriftReport> {
			return { drift: false, observed: {} };
		},
	};
}
