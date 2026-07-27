/**
 * `hobo connection` — durable first-class Connections on the Yard token broker.
 *
 * Subcommands: create | authorize | list | get | revoke | rotate
 * MCP tool `connection` dispatches the same handler with args parity (NFR-004).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { CommandModule } from "@hobo/cli";
import {
	ConnectionService,
	createInMemoryVault,
	type ConnectionPrincipalRef,
	type ConnectionFlow,
	type ConnectionView,
} from "@hobo/identity";

import { defaultHoboHome } from "./bare-metal-yard.js";
import { loadHoboProfile } from "./hobo-profile.js";

export interface ConnectionCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	/** Injectable service for tests. */
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

function connectionStorePath(hoboHome: string): string {
	return join(hoboHome, "connections", "events.jsonl");
}

function loadService(hoboHome: string, tenant: string): ConnectionService {
	const vault = createInMemoryVault({
		reference: `vaultref://yard/${tenant}/root`,
		// Fixture-only root for local yard; production injects KMS-backed vault.
		rootSecret: `hobo-local-connection-root-${tenant}`,
	});
	const path = connectionStorePath(hoboHome);
	if (!existsSync(path)) {
		return new ConnectionService({ tenant, vault });
	}
	const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
	const events = lines.map((line) => JSON.parse(line));
	return ConnectionService.fromEvents(events, { tenant, vault });
}

function persistService(hoboHome: string, service: ConnectionService): void {
	const dir = join(hoboHome, "connections");
	mkdirSync(dir, { recursive: true });
	const path = connectionStorePath(hoboHome);
	writeFileSync(
		path,
		`${service.events.map((e) => JSON.stringify(e)).join("\n")}\n`,
		"utf8",
	);
}

function publicView(c: ConnectionView): Record<string, unknown> {
	// Never expose raw secrets — credentialRef is already opaque.
	return {
		id: c.id,
		...(c.alias !== undefined ? { alias: c.alias } : {}),
		provider: c.provider,
		flow: c.flow,
		status: c.status,
		subject: c.subject,
		...(c.installationId !== undefined
			? { installationId: c.installationId }
			: {}),
		grantedScopes: c.grantedScopes,
		requestedScopes: c.requestedScopes,
		...(c.credentialRef !== undefined
			? { credentialRef: c.credentialRef }
			: {}),
		stationId: c.stationId,
		tenant: c.tenant,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt,
		metadata: c.metadata,
	};
}

function resolveStationId(
	hoboHome: string,
	flags: Record<string, unknown>,
	env: NodeJS.ProcessEnv,
): string | undefined {
	const stationFlag = flags["station"];
	if (typeof stationFlag === "string" && stationFlag.length > 0) {
		return stationFlag;
	}
	if (typeof env.HOBO_STATION === "string" && env.HOBO_STATION.length > 0) {
		return env.HOBO_STATION;
	}
	return loadHoboProfile(hoboHome)?.defaultStation?.id;
}

function resolveActor(
	hoboHome: string,
): ConnectionPrincipalRef & { tenant: string } {
	const profile = loadHoboProfile(hoboHome);
	if (profile?.session?.principal) {
		return {
			kind: profile.session.principal.kind as ConnectionPrincipalRef["kind"],
			id: profile.session.principal.id,
			tenant: profile.session.tenant ?? "local",
		};
	}
	return { kind: "user", id: "user:local", tenant: "local" };
}

export function createConnectionCommand(
	deps: ConnectionCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, args }) => {
			const f = flags as unknown as Record<string, unknown>;
			const env =
				deps.env ??
				(context as { env?: NodeJS.ProcessEnv }).env ??
				process.env;
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

			const actor = resolveActor(hoboHome);
			const tenant =
				typeof f.tenant === "string" && f.tenant.length > 0
					? f.tenant
					: actor.tenant;
			const service =
				deps.service ?? loadService(hoboHome, tenant);

			try {
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
					const alias =
						typeof f.alias === "string" ? f.alias : undefined;
					const scopesRaw =
						typeof f.scopes === "string" ? f.scopes : "";
					const scopes = scopesRaw
						? scopesRaw.split(",").map((s) => s.trim()).filter(Boolean)
						: [];
					const flow =
						typeof f.flow === "string"
							? (f.flow as ConnectionFlow)
							: "oauth2-obo";
					const stationId = resolveStationId(
						hoboHome,
						flags as unknown as Record<string, unknown>,
						env,
					);
					if (!stationId) {
						return {
							ok: false,
							status: "usage",
							code: "HOBO_CONNECTION_STATION_REQUIRED",
							message:
								"hobo connection create requires Station context (--station / HOBO_STATION / profile.defaultStation)",
							remediation: ["hobo station init"],
							data: { command: "connection", subcommand: "create" },
						};
					}
					const { connection } = service.create({
						provider,
						flow,
						...(alias !== undefined ? { alias } : {}),
						subject: { kind: actor.kind, id: actor.id },
						createdBy: { kind: actor.kind, id: actor.id },
						scopes,
						stationId,
					});
					if (!deps.service) persistService(hoboHome, service);
					return {
						ok: true,
						status: "created",
						code: "HOBO_OK",
						message: `connection ${connection.alias ?? connection.id} created (pending authorize)`,
						data: {
							command: "connection",
							subcommand: "create",
							connection: publicView(connection),
						},
					};
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
					const scopesRaw =
						typeof f.scopes === "string" ? f.scopes : "";
					const grantedScopes = scopesRaw
						? scopesRaw.split(",").map((s) => s.trim()).filter(Boolean)
						: undefined;
					const installationId =
						typeof f.installationId === "string"
							? f.installationId
							: undefined;
					const { connection } = service.authorize({
						idOrAlias,
						actor: { kind: actor.kind, id: actor.id },
						...(grantedScopes !== undefined ? { grantedScopes } : {}),
						...(installationId !== undefined ? { installationId } : {}),
					});
					if (!deps.service) persistService(hoboHome, service);
					return {
						ok: true,
						status: "authorized",
						code: "HOBO_OK",
						message: `connection ${connection.alias ?? connection.id} authorized (status=${connection.status})`,
						data: {
							command: "connection",
							subcommand: "authorize",
							connection: publicView(connection),
						},
					};
				}

				if (sub === "list") {
					const provider =
						typeof f.provider === "string" ? f.provider : undefined;
					const status =
						typeof f.status === "string"
							? (f.status as ConnectionView["status"])
							: undefined;
					const subjectId =
						typeof f.subject === "string" ? f.subject : undefined;
					const rows = service.list({
						...(provider !== undefined ? { provider } : {}),
						...(status !== undefined ? { status } : {}),
						...(subjectId !== undefined ? { subjectId } : {}),
					});
					return {
						ok: true,
						status: "ok",
						code: "HOBO_OK",
						message: `${rows.length} connection(s)`,
						data: {
							command: "connection",
							subcommand: "list",
							connections: rows.map(publicView),
							count: rows.length,
						},
					};
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
					const connection = service.get(idOrAlias);
					if (!connection) {
						return {
							ok: false,
							status: "not_found",
							code: "HOBO_CONNECTION_NOT_FOUND",
							message: `connection not found: ${idOrAlias}`,
							remediation: ["hobo connection list"],
							data: { command: "connection", subcommand: "get" },
						};
					}
					return {
						ok: true,
						status: "ok",
						code: "HOBO_OK",
						message: `connection ${connection.alias ?? connection.id}`,
						data: {
							command: "connection",
							subcommand: "get",
							connection: publicView(connection),
						},
					};
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
					const reason =
						typeof f.reason === "string" ? f.reason : "user-revoked";
					const { connection } = service.revoke({
						idOrAlias,
						actor: { kind: actor.kind, id: actor.id },
						reason,
					});
					if (!deps.service) persistService(hoboHome, service);
					return {
						ok: true,
						status: "revoked",
						code: "HOBO_OK",
						message: `connection ${connection.alias ?? connection.id} revoked`,
						data: {
							command: "connection",
							subcommand: "revoke",
							connection: publicView(connection),
						},
					};
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
				const { connection } = service.rotate({
					idOrAlias,
					actor: { kind: actor.kind, id: actor.id },
				});
				if (!deps.service) persistService(hoboHome, service);
				return {
					ok: true,
					status: "rotated",
					code: "HOBO_OK",
					message: `connection ${connection.alias ?? connection.id} credential rotated`,
					data: {
						command: "connection",
						subcommand: "rotate",
						connection: publicView(connection),
					},
				};
			} catch (error) {
				const code =
					error && typeof error === "object" && "code" in error
						? String((error as { code: string }).code)
						: "HOBO_CONNECTION_ERROR";
				const message =
					error instanceof Error ? error.message : String(error);
				const remediation =
					code === "connection-needs-reauth"
						? [
								`hobo connection authorize <id-or-alias>`,
								"Complete the provider consent flow, then retry token request.",
							]
						: code === "connection-not-found"
							? ["hobo connection list", "hobo connection create <provider>"]
							: undefined;
				return {
					ok: false,
					status: "error",
					code,
					message: `hobo connection: ${message}`,
					...(remediation !== undefined ? { remediation } : {}),
					data: { command: "connection", subcommand: sub },
				};
			}
		},
	};
}
