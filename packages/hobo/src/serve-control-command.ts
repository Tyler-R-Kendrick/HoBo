/**
 * `hobo serve control` — local control-plane HTTP+SSE for the Yard game UI.
 * Same management surface as CLI/MCP (ADR-0135 / ADR-0111 spirit).
 */
import type { CommandModule } from "@hobo/cli";
import { createControlApiServer } from "@hobo/control-api";

import { defaultHoboHome } from "./bare-metal-yard.js";

export interface ServeControlCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	readonly port?: number;
	readonly host?: string;
	/** When true, return immediately after bind (tests). */
	readonly once?: boolean;
	/** Demo mode: feed the world read model from the yard-world simulator (env: HOBO_CONTROL_DEMO=1). */
	readonly demo?: boolean;
	readonly log?: (line: string) => void;
}

export function createServeControlCommand(
	deps: ServeControlCommandDeps = {},
): CommandModule {
	return {
		implemented: true,
		async run({ args, flags }) {
			const f = flags as Record<string, unknown>;
			const env = deps.env ?? process.env;
			const target = args[0] ?? "control";
			if (target !== "control") {
				return {
					ok: false,
					message: `hobo serve: unknown target '${target}' (supported: control)`,
					data: { usage: "hobo serve control [--port 8790]" },
				};
			}
			const hoboHome =
				deps.hoboHome ??
				(typeof f.home === "string" && f.home.length > 0
					? f.home
					: defaultHoboHome(env));
			const port =
				deps.port ??
				(typeof f.port === "number"
					? f.port
					: typeof f.port === "string"
						? Number(f.port)
						: Number(env.HOBO_CONTROL_PORT ?? 8790));
			const host =
				deps.host ??
				(typeof f.host === "string" ? f.host : "127.0.0.1");
			const log = deps.log ?? ((line: string) => console.error(line));
			// The cli shell's flag whitelist has no --demo; demo mode comes from
			// deps (tests) or HOBO_CONTROL_DEMO=1 / HOBO_CONTROL_DEMO_SEED env.
			const demo = deps.demo ?? env.HOBO_CONTROL_DEMO === "1";

			const server = await createControlApiServer({
				hoboHome,
				host,
				port: Number.isFinite(port) ? port : 8790,
				demo,
			});
			log(
				`hobo serve control: ${server.url} (HOBO_HOME=${hoboHome}) yard=/v1/yard/snapshot stream=/v1/yard/stream world=/v1/world/snapshot otlp=/v1/otlp${demo ? ` demo=on seed=${server.demoSeed}` : ""}`,
			);

			if (deps.once) {
				await server.close();
				return {
					ok: true,
					message: `hobo serve control: bound ${server.url}`,
					data: { url: server.url, port: server.port, hoboHome },
				};
			}

			// Hold process open until signal (local serve path).
			await new Promise<void>((resolve) => {
				const stop = () => {
					void server.close().finally(resolve);
				};
				process.once("SIGINT", stop);
				process.once("SIGTERM", stop);
			});
			return {
				ok: true,
				message: `hobo serve control: stopped`,
				data: { url: server.url },
			};
		},
	};
}
