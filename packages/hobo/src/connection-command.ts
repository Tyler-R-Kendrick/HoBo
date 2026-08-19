/**
 * `hobo connection` — durable first-class Connections on the Yard token broker.
 *
 * Subcommands: create | authorize | list | get | revoke | rotate
 * MCP tool `connection` dispatches the same handler with args parity (NFR-004).
 *
 * Pure ops delegated to `@hobo/management` (shared with control API + MCP).
 */
import type { CommandModule } from "@hobo/cli";
import type { ConnectionService } from "@hobo/identity";
import {
	connectionAuthorize,
	connectionCreate,
	connectionGet,
	connectionList,
	connectionRevoke,
	connectionRotate,
	createManagementContext,
} from "@hobo/management";

import { defaultHoboHome } from "./bare-metal-yard.js";
import { loadHoboProfile } from "./hobo-profile.js";

export interface ConnectionCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	/** Injectable service for tests — when set, management path is bypassed. */
	readonly service?: ConnectionService;
}

const SUBCOMMANDS = [
	"create",
	"authorize",
	"list",
	"get",
	"revoke",
	"rotate",
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function resolveStationId(
	hoboHome: string,
	flags: Record<string, unknown>,
	env: NodeJS.ProcessEnv,
): string | undefined {
	const stationFlag = flags.station;
	if (typeof stationFlag === "string" && stationFlag.length > 0) {
		return stationFlag;
	}
	if (typeof env.HOBO_STATION === "string" && env.HOBO_STATION.length > 0) {
		return env.HOBO_STATION;
	}
	return loadHoboProfile(hoboHome)?.defaultStation?.id;
}

export function createConnectionCommand(
	deps: ConnectionCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, args }) => {
			const f = flags as unknown as Record<string, unknown>;
			const env =
				deps.env ?? (context as { env?: NodeJS.ProcessEnv }).env ?? process.env;
			const hoboHome =
				deps.hoboHome ??
				(typeof f.home === "string" && f.home.length > 0
					? f.home
					: defaultHoboHome(env));

			const sub = (args[0] ?? "") as Subcommand | "";
			if (!SUBCOMMANDS.includes(sub as Subcommand)) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_CONNECTION_USAGE",
					message: `hobo connection: unknown subcommand '${sub || "(none)"}'`,
					remediation: [
						"Usage: hobo connection <create|authorize|list|get|revoke|rotate> …",
						"Examples:",
						"  hobo connection create asana --alias work --scopes tasks:read,tasks:write",
						"  hobo connection authorize work",
						"  hobo connection list --provider asana",
					],
					data: { command: "connection", subcommands: SUBCOMMANDS },
				};
			}

			// Injectable service path for unit tests that mock ConnectionService.
			if (deps.service) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_CONNECTION_INJECT_UNSUPPORTED",
					message:
						"connection command injectable service is reserved for legacy tests; use @hobo/management fixtures",
					data: { command: "connection", subcommand: sub },
				};
			}

			const ctx = createManagementContext({ hoboHome });
			const tenant =
				typeof f.tenant === "string" && f.tenant.length > 0
					? f.tenant
					: undefined;
			const stationId = resolveStationId(
				hoboHome,
				flags as unknown as Record<string, unknown>,
				env,
			);

			if (sub === "create") {
				const provider = args[1];
				if (!provider) {
					return {
						ok: false,
						status: "usage",
						code: "HOBO_CONNECTION_NO_PROVIDER",
						message: "hobo connection create <provider> [--alias] [--scopes]",
						data: { command: "connection", subcommand: "create" },
					};
				}
				const alias = typeof f.alias === "string" ? f.alias : undefined;
				const scopesRaw = typeof f.scopes === "string" ? f.scopes : "";
				const scopes = scopesRaw
					? scopesRaw
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean)
					: [];
				const flow = typeof f.flow === "string" ? f.flow : undefined;
				return connectionCreate(ctx, {
					provider,
					...(alias !== undefined ? { alias } : {}),
					scopes,
					...(flow !== undefined ? { flow } : {}),
					...(stationId !== undefined ? { stationId } : {}),
					...(tenant !== undefined ? { tenant } : {}),
				});
			}

			if (sub === "authorize") {
				const idOrAlias = args[1];
				if (!idOrAlias) {
					return {
						ok: false,
						status: "usage",
						code: "HOBO_CONNECTION_NO_ID",
						message: "hobo connection authorize <id-or-alias>",
						data: { command: "connection", subcommand: "authorize" },
					};
				}
				const scopesRaw = typeof f.scopes === "string" ? f.scopes : "";
				const grantedScopes = scopesRaw
					? scopesRaw
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean)
					: undefined;
				const installationId =
					typeof f.installationId === "string" ? f.installationId : undefined;
				return connectionAuthorize(ctx, {
					idOrAlias,
					...(tenant !== undefined ? { tenant } : {}),
					...(grantedScopes !== undefined ? { grantedScopes } : {}),
					...(installationId !== undefined ? { installationId } : {}),
				});
			}

			if (sub === "list") {
				const provider =
					typeof f.provider === "string" ? f.provider : undefined;
				const status = typeof f.status === "string" ? f.status : undefined;
				const subjectId = typeof f.subject === "string" ? f.subject : undefined;
				return connectionList(ctx, {
					...(tenant !== undefined ? { tenant } : {}),
					...(provider !== undefined ? { provider } : {}),
					...(status !== undefined ? { status } : {}),
					...(subjectId !== undefined ? { subjectId } : {}),
				});
			}

			if (sub === "get") {
				const idOrAlias = args[1];
				if (!idOrAlias) {
					return {
						ok: false,
						status: "usage",
						code: "HOBO_CONNECTION_NO_ID",
						message: "hobo connection get <id-or-alias>",
						data: { command: "connection", subcommand: "get" },
					};
				}
				return connectionGet(ctx, {
					idOrAlias,
					...(tenant !== undefined ? { tenant } : {}),
				});
			}

			if (sub === "revoke") {
				const idOrAlias = args[1];
				if (!idOrAlias) {
					return {
						ok: false,
						status: "usage",
						code: "HOBO_CONNECTION_NO_ID",
						message: "hobo connection revoke <id-or-alias>",
						data: { command: "connection", subcommand: "revoke" },
					};
				}
				const reason = typeof f.reason === "string" ? f.reason : "user-revoked";
				return connectionRevoke(ctx, {
					idOrAlias,
					reason,
					...(tenant !== undefined ? { tenant } : {}),
				});
			}

			// rotate
			const idOrAlias = args[1];
			if (!idOrAlias) {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_CONNECTION_NO_ID",
					message: "hobo connection rotate <id-or-alias>",
					data: { command: "connection", subcommand: "rotate" },
				};
			}
			return connectionRotate(ctx, {
				idOrAlias,
				...(tenant !== undefined ? { tenant } : {}),
			});
		},
	};
}
