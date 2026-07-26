import { deploymentIdFor, loadProjectManifest } from "../cloud/manifest.js";
import { createFixtureSession, loadSession } from "../cloud/session.js";
import { stubResult } from "../cloud/stub.js";
import {
	createYardClient,
	type YardRuntime,
	type YardSession,
} from "../cloud/yard-client.js";
import type { CommandModule } from "../shell/registry.js";

export interface DownCommandDeps {
	readonly runtime?: YardRuntime;
	readonly session?: YardSession;
}

// `hobo down` — tear down what up realized. It reconstructs the DeploymentPlan
// DAG from the Bindle (deterministic Planner) and drives the @hobo/cloud
// compensation/destroy path: choreographed reverse-dependency Destroying ->
// Destroyed for every provisioned ResourceActor, against the shared injected
// runtime store. Reaches Destroyed; no real cloud calls.
export function createDownCommand(deps: DownCommandDeps = {}): CommandModule {
	return {
		implemented: Boolean(deps.runtime),
		run: async ({ context, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return stubResult("down");
			}

			const projectDir = context.projectDir ?? context.cwd;
			const bindle = await loadProjectManifest(projectDir);
			if (!bindle) {
				return stubResult("down");
			}

			// Fold any providers installed via `hobo add` from the durable registry
			// stream so the reconstructed plan matches what `up` realized.
			await runtime.registry.refresh?.();

			const session =
				deps.session ??
				(await loadSession(projectDir)) ??
				createFixtureSession();
			const deploymentId = deploymentIdFor(projectDir);
			const yard = createYardClient(runtime);
			const result = await yard.down(bindle, { deploymentId, session });

			for (const step of result.progress) {
				if (step.type.startsWith("resource.")) {
					emitProgress(
						step.resourceId
							? `${step.type} ${step.resourceId}: ${step.detail}`
							: `${step.type}: ${step.detail}`,
					);
				}
			}

			const destroyed = result.status === "destroyed";
			return {
				ok: destroyed,
				status: result.status,
				code: destroyed ? "HOBO_OK" : "HOBO_DOWN_INCOMPLETE",
				message: destroyed
					? `hobo down destroyed ${result.destroyed.length} resources (${result.destroyed.join(", ")})`
					: `hobo down needs attention (status ${result.status})`,
				data: {
					command: "down",
					deploymentId,
					destroyed: result.destroyed,
					progress: result.progress,
					identity: session.principal.id,
				},
			};
		},
	};
}
