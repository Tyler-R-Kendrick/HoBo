import type { CommandModule } from "@hobo/cli";

import {
	defaultHoboHome,
	initBareMetalYard,
	loadBareMetalYardConfig,
	yardConfigPath,
} from "./bare-metal-yard.js";

// `hobo yard` — install and inspect the default bare-metal Yard.
//   hobo yard init [--force] [--port <n>]
//     Write ~/.hobo/yard.json and create the durable dataDir.
//   hobo yard status
//     Show the installed yard config (or how to init).

export function createYardCommand(): CommandModule {
	return {
		implemented: true,
		run: async ({ args, flags, context }) => {
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
				try {
					const { config, configPath } = initBareMetalYard({
						hoboHome,
						force: flags.force === true,
						...(defaultPort !== undefined ? { defaultPort } : {}),
					});
					return {
						ok: true,
						status: "initialized",
						code: "HOBO_YARD_INIT",
						message: `hobo yard init: bare-metal yard '${config.name}' at ${configPath} (dataDir ${config.dataDir})`,
						data: {
							command: "yard",
							configPath,
							config,
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
						],
						data: { command: "yard" },
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
						message: `hobo yard status: no bare-metal yard at ${yardConfigPath(hoboHome)}`,
						remediation: ["Run `hobo yard init` to install the default bare-metal yard."],
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
					message: `hobo yard status: bare-metal yard '${config.name}' (provider ${config.providerId}, port ${config.defaultPort})`,
					data: {
						command: "yard",
						configPath: yardConfigPath(hoboHome),
						hoboHome,
						config,
					},
				};
			}

			return {
				ok: false,
				status: "unknown_subcommand",
				code: "HOBO_YARD_USAGE",
				message: `hobo yard: unknown subcommand '${subcommand}'`,
				remediation: [
					"Use `hobo yard init [--force] [--port <n>]` or `hobo yard status`.",
				],
				data: { command: "yard" },
			};
		},
	};
}
