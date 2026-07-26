import type { CommandModule, YardRuntime } from "@hobo/cli";
import { deploymentIdFor } from "@hobo/cli";
import { deploymentViewProjection } from "@hobo/cloud";

export interface InspectCommandDeps {
	// The shared Yard runtime whose durable event store `inspect` folds. The
	// composed CLI injects the SAME runtime `up`/`down` write to, so `inspect`
	// renders their real history. Un-injected, `inspect` reports that no runtime
	// is wired rather than fabricating a view.
	readonly runtime?: YardRuntime;
}

// `hobo inspect` — render the DeploymentView projection for the current project's
// deployment by folding the durable event log from zero (the log is
// authoritative; the view is derived). It answers "what is the current state of
// my deployment, and how did each resource get there?" straight from the event
// store — no cloud call, no credential. Rebuilding from zero is exactly the
// property the data-plane guarantees: drop the sink, replay the stream, get the
// same view.
export function createInspectCommand(
	deps: InspectCommandDeps = {},
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
						"hobo inspect has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "inspect" },
				};
			}

			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			const deploymentId = deploymentIdFor(projectDir);
			const snapshot = await deploymentViewProjection.rebuildFromZero(
				runtime.store,
				`deployment:${deploymentId}`,
			);
			const row = deploymentViewProjection.get(snapshot, deploymentId);

			if (!row) {
				return {
					ok: true,
					status: "no_history",
					code: "HOBO_OK",
					message: `hobo inspect: no deployment history for "${deploymentId}" — run \`hobo up\` first.`,
					data: { command: "inspect", deploymentId, found: false },
				};
			}

			for (const [resource, lifecycle] of Object.entries(row.resources).sort(
				([a], [b]) => a.localeCompare(b),
			)) {
				emitProgress(`${resource}: ${lifecycle}`);
			}

			return {
				ok: true,
				status: row.status,
				code: "HOBO_OK",
				message: `hobo inspect: deployment "${deploymentId}" is ${row.status} (${Object.keys(row.resources).length} resource(s))`,
				data: {
					command: "inspect",
					deploymentId,
					found: true,
					deploymentStatus: row.status,
					resources: row.resources,
					decisions: row.decisions,
					...(row.planHash !== undefined ? { planHash: row.planHash } : {}),
					...(row.bindleHash !== undefined
						? { bindleHash: row.bindleHash }
						: {}),
					...(row.rejection !== undefined ? { rejection: row.rejection } : {}),
					...(row.rollback !== undefined ? { rollback: row.rollback } : {}),
				},
			};
		},
	};
}
