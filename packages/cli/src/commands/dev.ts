import { deploymentIdFor, loadProjectManifest } from "../cloud/manifest.js";
import { stubResult } from "../cloud/stub.js";
import {
	bootLocalCamp,
	DEV_COLD_BUDGET_MS,
	type DevRuntime,
} from "../dev/local-camp.js";
import type { CommandModule } from "../shell/registry.js";

export interface DevCommandDeps {
	// Injected runtime-local Camp (tests / dev wiring): the component host +
	// Streamer the local loop boots on. Adapter-free `src/` leaves it undefined,
	// so `hobo dev` stays a shell stub until the runtime-local seam is wired.
	readonly runtime?: DevRuntime;
}

// `hobo dev` (S1-19) — boot a runtime-local Camp, collect + link the project
// Bindle, serve it locally, and live-tail the component-host events through the
// Streamer. Fully offline (no cloud account, no network): NFR-002's ≤ 60 s cold
// budget is asserted against the in-process boot time. Un-injected, it falls
// back to the shell stub.
export function createDevCommand(deps: DevCommandDeps = {}): CommandModule {
	return {
		run: async ({ context, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return stubResult("dev");
			}

			const projectDir = context.projectDir ?? context.cwd;
			const bindle = await loadProjectManifest(projectDir);
			if (!bindle) {
				return stubResult("dev");
			}

			const deploymentId = deploymentIdFor(projectDir);
			const boot = await bootLocalCamp(runtime, { deploymentId, emitProgress });
			const ok = boot.served.status === 200 && boot.withinColdBudget;

			return {
				ok,
				status: ok ? "serving" : "degraded",
				code: ok ? "HOBO_OK" : "HOBO_DEV_DEGRADED",
				message: ok
					? `hobo dev serving ${boot.localUrl} on ${boot.runtime} (offline, booted in ${boot.bootMs}ms)`
					: `hobo dev booted but did not serve cleanly (status ${boot.served.status}, ${boot.bootMs}ms)`,
				data: {
					command: "dev",
					deploymentId,
					localUrl: boot.localUrl,
					runtime: boot.runtime,
					offline: boot.offline,
					bootMs: boot.bootMs,
					withinColdBudget: boot.withinColdBudget,
					coldBudgetMs: DEV_COLD_BUDGET_MS,
					served: boot.served,
					linkedComponents: boot.linkedComponents,
					events: boot.events.map((event) => event.type),
					streamedFrames: boot.streamedFrames,
				},
			};
		},
	};
}
