import { canonicalManifestHash } from "@hobo/bindles";
import type { CommandModule, YardRuntime } from "@hobo/cli";
import {
	DEFAULT_TENANT,
	deploymentIdFor,
	loadProjectManifest,
} from "@hobo/cli";
import { deploymentImported, deploymentViewProjection } from "@hobo/cloud";
import type { PrincipalRef } from "@hobo/core";

export interface ImportCommandDeps {
	// The shared Yard runtime whose durable log records the adoption.
	readonly runtime?: YardRuntime;
}

const IMPORT_ACTOR: PrincipalRef = { kind: "user", id: "user:importer" };

// `hobo import` — adopt an existing estate in place. It reads the project's
// Bindle (which describes resources that ALREADY exist) and records them under
// HoBo management by appending a single `deployment.Imported` fact — no
// provisioning runs. The DeploymentView then reflects the adopted deployment as
// deployed (with `imported: true`), so `inspect`/`drift` operate on it like any
// other. Reads/writes only the local event store; no cloud call, no credential.
// HONEST SCOPE: adopts the DECLARED bindle; live-cloud estate discovery is a
// follow-up.
export function createImportCommand(
	deps: ImportCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo import has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "import" },
				};
			}

			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			const manifest = await loadProjectManifest(projectDir);
			if (!manifest) {
				return {
					ok: false,
					status: "no_bindle",
					code: "HOBO_NO_BINDLE",
					message:
						"hobo import found no readable hobo.bindle.json — run from a Bindle project describing the estate to adopt.",
					remediation: [
						"Run `hobo import` from a directory containing a valid hobo.bindle.json.",
					],
					data: { command: "import" },
				};
			}

			const deploymentId = deploymentIdFor(projectDir);
			const stream = `deployment:${deploymentId}`;
			const snapshot = await deploymentViewProjection.rebuildFromZero(
				runtime.store,
				stream,
			);
			const existing = deploymentViewProjection.get(snapshot, deploymentId);
			if (existing && Object.keys(existing.resources).length > 0) {
				return {
					ok: true,
					status: "already_managed",
					code: "HOBO_OK",
					message: `hobo import: "${deploymentId}" is already managed by HoBo (${existing.status}).`,
					data: {
						command: "import",
						deploymentId,
						deploymentStatus: existing.status,
					},
				};
			}

			const resources = Object.keys(manifest.value.resources).sort();
			const bindleHash = String(canonicalManifestHash(manifest));

			await runtime.store.append(
				stream,
				[deploymentImported({ deploymentId, bindleHash, resources })],
				{
					expectedSeq: snapshot.seq,
					actor: IMPORT_ACTOR,
					tenant: DEFAULT_TENANT,
				},
			);
			for (const resource of resources) {
				emitProgress(`adopted ${resource}`);
			}

			const view = deploymentViewProjection.get(
				await deploymentViewProjection.rebuildFromZero(runtime.store, stream),
				deploymentId,
			);

			return {
				ok: true,
				status: "imported",
				code: "HOBO_OK",
				message: `hobo import: adopted ${resources.length} resource(s) into "${deploymentId}" (no provisioning ran).`,
				data: {
					command: "import",
					deploymentId,
					bindleHash,
					imported: view?.imported ?? true,
					deploymentStatus: view?.status ?? "deployed",
					resources: view?.resources ?? {},
				},
			};
		},
	};
}
