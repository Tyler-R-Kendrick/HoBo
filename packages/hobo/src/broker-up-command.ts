/**
 * `hobo up` composition: deploy through the embedded broker-runtime.
 *
 * Flow:
 *   1. Load project Bindle
 *   2. Ensure Yard + embedded broker exist (broker resolves yards/camps)
 *   3. Broker places the Bindle (prefer wasm-sandbox when available)
 *   4. Auto-create Camp when none exists
 *   5. Realize on the local Yard component host chosen by the broker
 *
 * Explicit `.with({ provider })` pins hard-fail when that provider is absent
 * from the broker junction catalog.
 */
import { createServer } from "node:net";

import { loadBindleDefinition } from "@hobo/cli";
import type { CommandModule } from "@hobo/cli";

import {
	defaultHoboHome,
	initBareMetalYard,
	loadBareMetalYardConfig,
} from "./bare-metal-yard.js";
import {
	ensureEmbeddedBroker,
	resolveBindlePlacement,
} from "./broker-runtime.js";
import { serveProjectOnLocalYard } from "./wasm-host.js";

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr === null || typeof addr === "string") {
				server.close();
				reject(new Error("failed to allocate port"));
				return;
			}
			const port = addr.port;
			server.close((error) => (error ? reject(error) : resolve(port)));
		});
		server.once("error", reject);
	});
}

export function createBrokerAwareUpCommand(): CommandModule {
	return {
		implemented: true,
		run: async ({ context, flags, emitProgress }) => {
			const projectDir =
				(context as { projectDir?: string }).projectDir ??
				(typeof flags.cwd === "string" ? flags.cwd : context.cwd);
			const hoboHome =
				typeof flags.home === "string" && flags.home.length > 0
					? flags.home
					: defaultHoboHome(
							(context as { env?: NodeJS.ProcessEnv }).env ?? process.env,
						);

			try {
				const definition = await loadBindleDefinition(projectDir);
				if (definition === null) {
					return {
						ok: false,
						status: "no_bindle",
						code: "HOBO_UP_NO_BINDLE",
						message: `hobo up: no loadable bindle in ${projectDir}`,
						remediation: [
							"Add src/bindle.ts (or dist/bindle.js) exporting a default bindle.",
							"See examples/hello-bindle for the minimal shape.",
						],
						data: { command: "up", projectDir },
					};
				}

				// Installed runtime always has a broker.
				if (loadBareMetalYardConfig(hoboHome) === null) {
					emitProgress("hobo up: no Yard yet — installing local Yard + broker");
					initBareMetalYard({ hoboHome });
				}
				await ensureEmbeddedBroker({ hoboHome, emitProgress });

				const placement = await resolveBindlePlacement({
					definition,
					hoboHome,
					emitProgress,
				});
				if (placement.outcome === "rejected") {
					return {
						ok: false,
						status: "broker_rejected",
						code: "HOBO_UP_BROKER_REJECTED",
						message: `hobo up: ${placement.message}`,
						...(placement.remediation
							? { remediation: [...placement.remediation] }
							: {}),
						data: {
							command: "up",
							projectDir,
							brokerId: placement.brokerId,
							explicitProviders: placement.explicitProviders,
							rejection: placement.resolution.rejection,
						},
					};
				}

				emitProgress(`hobo up: ${placement.message}`);

				// Realize on the broker-chosen component host (local | isolated-wasm).
				// Ephemeral port avoids collisions with a long-running `hobo dev`.
				const port = await freePort();
				const serve = await serveProjectOnLocalYard({
					projectDir,
					hoboHome,
					componentHost: placement.componentHost,
					port,
					emitProgress,
				});
				const primaryUrl = serve.primaryUrl;
				const exposedEndpoints = serve.exposedEndpoints;
				const serviceDiscovery = serve.serviceDiscovery;
				const probe = serve.probe;
				await serve.close();

				return {
					ok: true,
					status: "deployed",
					code: "HOBO_OK",
					message: `hobo up: placed ${definition.name} via broker on ${placement.providerId} (camp ${placement.campId}, host ${placement.componentHost})`,
					data: {
						command: "up",
						projectDir,
						bindleName: definition.name,
						brokerId: placement.brokerId,
						campId: placement.campId,
						yardName: placement.yardName,
						providerId: placement.providerId,
						componentHost: placement.componentHost,
						placements: placement.resolution.receipt?.placements ?? [],
						primaryUrl,
						exposedEndpoints,
						serviceDiscovery,
						probe,
					},
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					ok: false,
					status: "error",
					code: "HOBO_UP_FAILED",
					message: `hobo up: ${message}`,
					remediation: [
						"Run `hobo yard ensure` if isolated-wasm tooling is missing.",
						"Use `hobo dev` for a long-lived serve on a free port.",
						"Re-run with --verbose for progress lines.",
					],
					data: { command: "up", projectDir, hoboHome, error: message },
				};
			}
		},
	};
}
