import type { CommandModule } from "@hobo/cli";

import {
	COMPONENT_HOST_KINDS,
	type ComponentHostKind,
	defaultHoboHome,
	initBareMetalYard,
	loadBareMetalYardConfig,
	yardConfigPath,
} from "./bare-metal-yard.js";
import { ensureEmbeddedBroker } from "./broker-runtime.js";
import { probeWasmHostInstall } from "./wasm-host.js";
import { ensureIsolatedWasmToolchain } from "./wasm-sandbox.js";

// `hobo yard` — install/inspect a **Yard** (glossary: provider-specific control
// plane). Camps are placement targets the Yard creates when serving Bindles.
//   hobo yard init [--force] [--port <n>] [--host local|isolated-wasm]
//     --host selects the Camp *component host* backend (not the Yard itself).
//     --host isolated-wasm also ensures wasmtime + jco under HOBO_HOME.
//   hobo yard ensure  — install isolated-wasm toolchain (wasmtime, jco check)
//   hobo yard status | doctor

function parseComponentHostFlag(raw: unknown): ComponentHostKind | undefined {
	if (raw === undefined || raw === null) return undefined;
	const value = String(raw);
	if (value === "bare-metal" || value === "runtime-local") return "local";
	if ((COMPONENT_HOST_KINDS as readonly string[]).includes(value)) {
		return value as ComponentHostKind;
	}
	return undefined;
}

export function createYardCommand(): CommandModule {
	return {
		implemented: true,
		run: async ({ args, flags, context, emitProgress }) => {
			const subcommand = args[0] ?? "status";
			const env = (context as { env?: NodeJS.ProcessEnv }).env ?? process.env;
			const hoboHome =
				typeof flags.home === "string" ? flags.home : defaultHoboHome(env);

			if (subcommand === "init") {
				const portRaw = flags.port;
				const defaultPort =
					typeof portRaw === "string" || typeof portRaw === "number"
						? Number(portRaw)
						: undefined;
				if (
					defaultPort !== undefined &&
					(!Number.isInteger(defaultPort) || defaultPort <= 0)
				) {
					return {
						ok: false,
						status: "invalid_port",
						code: "HOBO_YARD_USAGE",
						message: "hobo yard init: --port must be a positive integer",
						remediation: ["Example: hobo yard init --port 4000"],
						data: { command: "yard" },
					};
				}
				const hostFlag = flags.host;
				const componentHost = parseComponentHostFlag(hostFlag);
				if (
					hostFlag !== undefined &&
					hostFlag !== null &&
					componentHost === undefined
				) {
					return {
						ok: false,
						status: "invalid_host",
						code: "HOBO_YARD_USAGE",
						message: `hobo yard init: --host (Camp component host) must be one of ${COMPONENT_HOST_KINDS.join("|")}`,
						remediation: [
							"Example: hobo yard init --host local",
							"Example: hobo yard init --host isolated-wasm",
							"Yard = control plane; --host selects the Camp component host backend.",
						],
						data: { command: "yard" },
					};
				}
				try {
					// Installed runtime always includes an embedded broker.
					const embedded = await ensureEmbeddedBroker({
						hoboHome,
						emitProgress,
					});
					const preferredHost =
						componentHost ?? embedded.state.preferredComponentHost;
					const { config, configPath } = initBareMetalYard({
						hoboHome,
						force: flags.force === true,
						...(defaultPort !== undefined ? { defaultPort } : {}),
						componentHost: preferredHost,
					});
					let toolchain: Awaited<
						ReturnType<typeof ensureIsolatedWasmToolchain>
					> | null = null;
					if (config.componentHost === "isolated-wasm") {
						emitProgress?.(
							"hobo yard init: ensuring isolated-wasm toolchain (wasmtime + jco)",
						);
						toolchain = await ensureIsolatedWasmToolchain({
							hoboHome,
							env,
							emitProgress,
						});
					}
					const wasm = probeWasmHostInstall({
						env: {
							...env,
							...(toolchain
								? { HOBO_WASMTIME_BIN: toolchain.wasmtime.binPath }
								: {}),
						},
					});
					return {
						ok: true,
						status: "initialized",
						code: "HOBO_YARD_INIT",
						message:
							`hobo yard init: Yard '${config.name}' componentHost=${config.componentHost} at ${configPath}; broker ${embedded.state.brokerId}` +
							(toolchain
								? `; toolchain wasmtime ${toolchain.wasmtime.version}`
								: ""),
						data: {
							command: "yard",
							configPath,
							config,
							wasm,
							broker: embedded.state,
							...(toolchain !== null ? { toolchain } : {}),
						},
					};
				} catch (error) {
					return {
						ok: false,
						status: "init_failed",
						code: "HOBO_YARD_INIT_FAILED",
						message: `hobo yard init: ${error instanceof Error ? error.message : String(error)}`,
						remediation: [
							"Pass --force to overwrite an existing yard.json.",
							"Set HOBO_HOME to choose an alternate install root.",
							"Use --host isolated-wasm for Wasmtime process sandboxes (private components).",
							"Run `hobo yard ensure` to install the isolated-wasm toolchain.",
						],
						data: { command: "yard" },
					};
				}
			}

			if (subcommand === "ensure") {
				try {
					const toolchain = await ensureIsolatedWasmToolchain({
						hoboHome,
						env,
						emitProgress,
					});
					return {
						ok: true,
						status: "ready",
						code: "HOBO_YARD_ENSURE",
						message: `hobo yard ensure: isolated-wasm toolchain ready (wasmtime ${toolchain.wasmtime.version}, jco ${toolchain.jco.version}) under ${hoboHome}`,
						data: {
							command: "yard",
							subcommand: "ensure",
							hoboHome,
							toolchain,
						},
					};
				} catch (error) {
					return {
						ok: false,
						status: "ensure_failed",
						code: "HOBO_YARD_ENSURE_FAILED",
						message: `hobo yard ensure: ${error instanceof Error ? error.message : String(error)}`,
						remediation: [
							"Ensure network access to download wasmtime, or set HOBO_WASMTIME_BIN.",
							"Reinstall @hobo/hobo so @bytecodealliance/jco is available.",
							"Set HOBO_HOME if the Yard tools dir should not be ~/.hobo.",
						],
						data: { command: "yard", subcommand: "ensure", hoboHome },
					};
				}
			}

			if (subcommand === "status") {
				const config = loadBareMetalYardConfig(hoboHome);
				if (config === null) {
					return {
						ok: false,
						status: "not_installed",
						code: "HOBO_YARD_MISSING",
						message: `hobo yard status: no local Yard at ${yardConfigPath(hoboHome)}`,
						remediation: [
							"Run `hobo yard init` (optionally `--host isolated-wasm`).",
						],
						data: {
							command: "yard",
							configPath: yardConfigPath(hoboHome),
							hoboHome,
						},
					};
				}
				return {
					ok: true,
					status: "installed",
					code: "HOBO_YARD_STATUS",
					message: `hobo yard status: Yard '${config.name}' componentHost=${config.componentHost} (provider ${config.providerId}, port ${config.defaultPort})`,
					data: {
						command: "yard",
						configPath: yardConfigPath(hoboHome),
						hoboHome,
						config,
					},
				};
			}

			if (subcommand === "doctor") {
				const config = loadBareMetalYardConfig(hoboHome);
				const componentHost = config?.componentHost ?? "local";
				let toolchain: Awaited<
					ReturnType<typeof ensureIsolatedWasmToolchain>
				> | null = null;
				let toolchainError: string | null = null;
				if (componentHost === "isolated-wasm") {
					try {
						// Doctor repairs missing toolchain for isolated-wasm Yards.
						toolchain = await ensureIsolatedWasmToolchain({
							hoboHome,
							env,
							emitProgress,
						});
					} catch (error) {
						toolchainError =
							error instanceof Error ? error.message : String(error);
					}
				}
				const wasm = probeWasmHostInstall({
					env: {
						...env,
						...(toolchain
							? { HOBO_WASMTIME_BIN: toolchain.wasmtime.binPath }
							: {}),
					},
				});
				const ok =
					config !== null &&
					(componentHost !== "isolated-wasm" || toolchain !== null);
				return {
					ok,
					status: ok
						? "healthy"
						: config === null
							? "missing_config"
							: "toolchain_missing",
					code: ok
						? "HOBO_YARD_DOCTOR"
						: config === null
							? "HOBO_YARD_MISSING"
							: "HOBO_YARD_TOOLCHAIN_MISSING",
					message: ok
						? `hobo yard doctor: Yard componentHost=${componentHost}; engine=${wasm.engineSource} ${wasm.engineVersion}` +
							(componentHost === "isolated-wasm"
								? `; private components use wasmtime OS-process sandboxes (mesh injects bindle env)`
								: "; private mesh is process-local")
						: config === null
							? `hobo yard doctor: no Yard config — run hobo yard init`
							: `hobo yard doctor: isolated-wasm toolchain missing — ${toolchainError ?? "run hobo yard ensure"}`,
					...(ok
						? {}
						: {
								remediation: [
									config === null
										? "Run `hobo yard init [--host isolated-wasm]`."
										: "Run `hobo yard ensure` to install wasmtime + verify jco.",
								],
							}),
					data: {
						command: "yard",
						hoboHome,
						config,
						wasm,
						...(toolchain !== null ? { toolchain } : {}),
						...(toolchainError !== null ? { toolchainError } : {}),
						scopes: {
							yard: "provider-specific control plane (this config)",
							camp: "placement target created when serving a Bindle (e.g. dev-local)",
							componentHost:
								"Camp capability that executes components (local | isolated-wasm)",
							bindle: "app topology placed into a Camp",
							meshEnv:
								'bindle .with({option:"env"}) values injected on private hops as x-hobo-env-*',
						},
						componentHosts: wasm.componentHosts,
					},
				};
			}

			return {
				ok: false,
				status: "unknown_subcommand",
				code: "HOBO_YARD_USAGE",
				message: `hobo yard: unknown subcommand '${subcommand}'`,
				remediation: [
					"Use `hobo yard init [--force] [--port <n>] [--host local|isolated-wasm]`.",
					"Use `hobo yard ensure` to install the isolated-wasm toolchain.",
					"Use `hobo yard status` or `hobo yard doctor`.",
					"Yard = control plane; Camp = placement; component host = Camp execution capability.",
				],
				data: { command: "yard" },
			};
		},
	};
}
