import { deploymentIdFor, loadProjectManifest } from "../cloud/manifest.js";
import { stubResult } from "../cloud/stub.js";
import {
	bootLocalCamp,
	DEV_COLD_BUDGET_MS,
	type DevRuntime,
} from "../dev/local-camp.js";
import type { CommandModule } from "../shell/registry.js";

export interface DevServeResult {
	readonly primaryUrl: string;
	readonly bindleName: string;
	readonly campId: string;
	readonly yardName: string;
	readonly providerId: string;
	readonly endpoints: readonly {
		readonly resourceName: string;
		readonly kind: string;
		readonly url: string;
		readonly serviceDiscoveryKey: string;
	}[];
	readonly serviceDiscovery: Readonly<Record<string, string>>;
	readonly bindleEnv?: Readonly<Record<string, string>>;
	readonly probe: { readonly status: number; readonly body: string };
	readonly close: () => Promise<void>;
	readonly waitUntilStopped: () => Promise<void>;
}

export interface DevCommandDeps {
	// Injected runtime-local Camp (tests / dev wiring): the component host +
	// Streamer the local loop boots on. Wins over `resolveRuntime`.
	readonly runtime?: DevRuntime;
	// Project-aware resolver (composition roots): boot the runtime from the
	// invoked project's own bindle source (see cloud/loader.ts). Un-injected
	// with no `runtime` either, `hobo dev` stays a shell stub.
	readonly resolveRuntime?: (projectDir: string) => Promise<DevRuntime | null>;
	// Preferred path: serve the project bindle through a real bare-metal Yard
	// (camp routing + Aspire services__* injection + long-lived HTTP).
	readonly serveProject?: (input: {
		readonly projectDir: string;
		readonly port?: number;
		readonly once: boolean;
		readonly emitProgress: (message: string) => void;
	}) => Promise<DevServeResult>;
}

// `hobo dev` (S1-19) — prefer the composed bare-metal Yard serve path when
// injected; otherwise boot a one-shot runtime-local Camp probe. Fully offline
// (no cloud account): NFR-002's ≤ 60 s cold budget applies to the probe.
// Flags: `--once` probe-and-exit (tests/CI); default keeps listening until SIGINT.
export function createDevCommand(deps: DevCommandDeps = {}): CommandModule {
	return {
		implemented: Boolean(
			deps.serveProject ?? deps.runtime ?? deps.resolveRuntime,
		),
		run: async ({ context, flags, emitProgress }) => {
			const projectDir = context.projectDir ?? context.cwd;
			// Long-running only for interactive terminals without --json/--once.
			// Machine-readable and CI runs probe-and-exit so they don't hang.
			const once =
				flags.once === true ||
				flags.json === true ||
				!process.stdin.isTTY ||
				!process.stdout.isTTY;
			const portRaw = flags.port;
			const port =
				typeof portRaw === "string" || typeof portRaw === "number"
					? Number(portRaw)
					: undefined;

			if (deps.serveProject) {
				const startedAt = Date.now();
				try {
					const serve = await deps.serveProject({
						projectDir,
						...(port !== undefined && Number.isInteger(port)
							? { port }
							: {}),
						once,
						emitProgress,
					});
					const bootMs = Date.now() - startedAt;
					const ok =
						serve.probe.status === 200 && bootMs <= DEV_COLD_BUDGET_MS;
					if (!once) {
						emitProgress(
							`hobo dev: listening on ${serve.primaryUrl} (Ctrl-C to stop)`,
						);
						await serve.waitUntilStopped();
					} else {
						await serve.close();
					}
					return {
						ok,
						status: ok ? "serving" : "degraded",
						code: ok ? "HOBO_OK" : "HOBO_DEV_DEGRADED",
						message: ok
							? `hobo dev serving ${serve.primaryUrl} on bare-metal yard '${serve.yardName}' camp ${serve.campId} (bindle ${serve.bindleName}, booted in ${bootMs}ms)`
							: `hobo dev booted but did not serve cleanly (status ${serve.probe.status}, ${bootMs}ms)`,
						data: {
							command: "dev",
							mode: "bare-metal-yard",
							deploymentId: deploymentIdFor(projectDir),
							localUrl: serve.primaryUrl,
							runtime: "runtime-local",
							yard: serve.yardName,
							campId: serve.campId,
							providerId: serve.providerId,
							bindleName: serve.bindleName,
							endpoints: serve.endpoints,
							serviceDiscovery: serve.serviceDiscovery,
							...(serve.bindleEnv !== undefined
								? { bindleEnv: serve.bindleEnv }
								: {}),
							offline: true,
							bootMs,
							withinColdBudget: bootMs <= DEV_COLD_BUDGET_MS,
							coldBudgetMs: DEV_COLD_BUDGET_MS,
							served: serve.probe,
							once,
						},
					};
				} catch (error) {
					// No project bindle (or other serve failure): fall through to the
					// one-shot runtime-local probe so composed `dev` never hard-fails
					// projects that only have hobo.bindle.json / the default guest.
					emitProgress(
						`hobo dev: bare-metal serve unavailable (${error instanceof Error ? error.message : String(error)}); falling back to runtime-local probe`,
					);
				}
			}

			const runtime =
				deps.runtime ?? (await deps.resolveRuntime?.(projectDir)) ?? null;
			if (!runtime) {
				return stubResult("dev");
			}

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
					mode: "runtime-local-probe",
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
