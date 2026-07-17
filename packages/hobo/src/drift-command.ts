import type { CommandModule, YardRuntime } from "@hobo/cli";
import { deploymentIdFor } from "@hobo/cli";
import { deploymentViewProjection, type IacProgram } from "@hobo/cloud";
import {
	type CloudProvider,
	createCloudflareProvider,
} from "@hobo/provider-cloudflare";

import type { CloudflareFetch } from "./cloudflare-client.js";
import { selectIacProvider } from "./compose.js";
import { describeDeployTarget } from "./deploy-preflight.js";
import type { VercelFetch } from "./vercel-client.js";

export interface DriftCommandDeps {
	// The shared Yard runtime whose event log names the deployment and lists the
	// provisioned resources to refresh. The composed CLI injects the same runtime
	// `up`/`down` use.
	readonly runtime?: YardRuntime;
	// The realize()-capable CloudProviders the IaC bridge drives. Defaults to the
	// same @hobo/provider-cloudflare the default runtime registers.
	readonly providers?: readonly CloudProvider[];
	// Credential env consulted to pick the drift backend (same precedence as
	// `hobo up`). Defaults to `process.env`, so `drift` refreshes against whichever
	// live backend would actually deploy.
	readonly env?: Record<string, string | undefined>;
	readonly vercelFetch?: VercelFetch;
	readonly cloudflareFetch?: CloudflareFetch;
}

interface ResourceDrift {
	readonly resource: string;
	readonly drift: boolean;
}

// `hobo drift` — check the recorded deployment against its LIVE backend by
// driving the IaC port's `refresh()` per resource. Drift is a live-cloud
// concept: on the in-memory lane there is no live infrastructure that could have
// drifted, so `drift` says so and points at `hobo doctor` (there is nothing to
// reconcile). When a real backend is selected (a credential is present), it reads
// the provisioned resources from the authoritative DeploymentView and asks the
// SAME backend `hobo up` would use whether each still matches — folding one
// report with a governed remediation path.
export function createDriftCommand(deps: DriftCommandDeps = {}): CommandModule {
	return {
		run: async ({ context, flags, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo drift has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "drift" },
				};
			}

			const env = deps.env ?? process.env;
			const target = describeDeployTarget(env);
			if (!target.live) {
				return {
					ok: true,
					status: "no_live_backend",
					code: "HOBO_OK",
					message:
						"hobo drift: no live backend selected — the in-memory lane has no live infrastructure to drift. Run `hobo doctor` to go live.",
					data: {
						command: "drift",
						live: false,
						backend: target.backend,
						checked: 0,
					},
				};
			}

			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			const deploymentId = deploymentIdFor(projectDir);
			const snapshot = await deploymentViewProjection.rebuildFromZero(
				runtime.store,
				`deployment:${deploymentId}`,
			);
			const row = deploymentViewProjection.get(snapshot, deploymentId);

			if (!row || Object.keys(row.resources).length === 0) {
				return {
					ok: true,
					status: "no_deployment",
					code: "HOBO_OK",
					message: `hobo drift: nothing deployed for "${deploymentId}" — run \`hobo up\` first.`,
					data: { command: "drift", live: true, deploymentId, checked: 0 },
				};
			}

			const providers = deps.providers ?? [createCloudflareProvider()];
			const iac = selectIacProvider({
				store: runtime.store,
				providers,
				env,
				...(deps.vercelFetch !== undefined
					? { vercelFetch: deps.vercelFetch }
					: {}),
				...(deps.cloudflareFetch !== undefined
					? { cloudflareFetch: deps.cloudflareFetch }
					: {}),
			});

			// resourceId -> providerId, from the recorded match decisions.
			const providerFor = new Map<string, string>();
			for (const decision of row.decisions) {
				providerFor.set(decision.resource, decision.providerId);
			}

			const results: ResourceDrift[] = [];
			for (const resource of Object.keys(row.resources).sort()) {
				const providerId = providerFor.get(resource) ?? "";
				const program: IacProgram = {
					programId: `drift-${resource}`,
					deploymentId,
					resourceId: resource,
					provider: providerId,
					driver: providerId,
					// refresh() ignores `action`; use the read-only value.
					action: "preview",
					stackName: `${deploymentId}-${resource}`,
				};
				const report = await iac.refresh(program);
				results.push({ resource, drift: report.drift });
				emitProgress(`${resource}: ${report.drift ? "drifted" : "in-sync"}`);
			}

			const drifted = results.filter((r) => r.drift).map((r) => r.resource);
			const inSync = drifted.length === 0;
			return {
				ok: true,
				status: inSync ? "in-sync" : "drifted",
				code: "HOBO_OK",
				message: inSync
					? `hobo drift: all ${results.length} resource(s) in sync with ${target.backend}`
					: `hobo drift: ${drifted.length} of ${results.length} resource(s) drifted (${drifted.join(", ")})`,
				...(inSync
					? {}
					: {
							remediation: [
								`Run \`hobo up\` to reconcile the drifted resource(s): ${drifted.join(", ")}.`,
							],
						}),
				data: {
					command: "drift",
					live: true,
					backend: target.backend,
					deploymentId,
					checked: results.length,
					drifted,
					resources: results,
				},
			};
		},
	};
}
