/**
 * `hobo station` — ops/setup family for Station occupancy (NOT a lifecycle verb).
 * up/down remain the only lifecycle verbs for app graphs.
 *
 * Subcommands: init | up | down | status | rails list|publish|approve|activate|status
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { CommandModule } from "@hobo/cli";
import {
	createStationClient,
	initStation,
	persistStationEvents,
	StationService,
	type StationClient,
} from "@hobo/stations";

import { defaultHoboHome } from "./bare-metal-yard.js";
import { loadHoboProfile, setDefaultStation } from "./hobo-profile.js";

export interface StationCommandDeps {
	readonly env?: NodeJS.ProcessEnv;
	readonly hoboHome?: string;
	readonly log?: (line: string) => void;
}

function flagString(
	flags: Record<string, unknown>,
	...names: string[]
): string | undefined {
	for (const n of names) {
		const v = flags[n];
		if (typeof v === "string" && v.length > 0) return v;
	}
	return undefined;
}

function resolveHome(deps: StationCommandDeps): string {
	return (
		deps.hoboHome ??
		deps.env?.HOBO_HOME ??
		process.env.HOBO_HOME ??
		defaultHoboHome()
	);
}

function resolveStationId(
	deps: StationCommandDeps,
	flags: Record<string, unknown>,
	home: string,
): string {
	const fromFlag = flagString(flags, "station", "id");
	if (fromFlag) return fromFlag;
	const fromEnv = deps.env?.HOBO_STATION ?? process.env.HOBO_STATION;
	if (fromEnv) return fromEnv;
	const profile = loadHoboProfile(home);
	if (profile?.defaultStation?.id) return profile.defaultStation.id;
	return "station:local";
}

export function createStationCommand(deps: StationCommandDeps = {}): CommandModule {
	return {
		implemented: true,
		async run({ args, flags }) {
			const flagBag = flags as Record<string, unknown>;
			const home = resolveHome(deps);
			const log = deps.log ?? ((line: string) => console.error(line));
			const sub = args[0] ?? "status";

			if (sub === "init") {
				const name = flagString(flagBag, "name") ?? "local";
				const id = flagString(flagBag, "id") ?? `station:${name}`;
				const tenant = flagString(flagBag, "tenant") ?? name;
				const brokerConfig = join(home, "hobo.broker.json");
				const result = initStation({
					hoboHome: home,
					id,
					name,
					tenant,
					...(existsSync(brokerConfig)
						? { importBrokerConfigPath: brokerConfig }
						: {}),
				});
				setDefaultStation(
					home,
					{ id: result.stationId, dataDir: result.dataDir },
					result.occupancy.activeRailHash,
				);
				return {
					ok: true,
					message: result.created
						? `hobo station init: created ${result.stationId}`
						: `hobo station init: already exists ${result.stationId}`,
					data: {
						stationId: result.stationId,
						dataDir: result.dataDir,
						created: result.created,
						bootstrapRailHash: result.bootstrap.contentHash,
						bootstrapActive: result.occupancy.bootstrapActive,
						importedBrokerConfig: result.importedBrokerConfig,
						remediation: result.created
							? "hobo station status"
							: undefined,
					},
				};
			}

			if (sub === "status" || sub === "up" || sub === "down") {
				const stationId = resolveStationId(deps, flagBag, home);
				let client: StationClient;
				try {
					client = createStationClient({ hoboHome: home, stationId });
					if (!client.load()) {
						return {
							ok: false,
							message: `station ${stationId} not found`,
							data: {
								code: "station-missing",
								remediation: "hobo station init",
							},
						};
					}
				} catch (err) {
					return {
						ok: false,
						message: err instanceof Error ? err.message : String(err),
						data: { code: "station-missing", remediation: "hobo station init" },
					};
				}
				const occ = client.occupancy()!;
				const rail = client.activeRail();
				if (sub === "up") {
					log(
						`hobo station up: occupancy ready ${stationId} rail=${occ.activeRailHash ?? "none"}`,
					);
					return {
						ok: true,
						message: `hobo station up: ${stationId}`,
						data: {
							stationId,
							status: "occupying",
							activeRailHash: occ.activeRailHash,
							bootstrapActive: occ.bootstrapActive,
							pins: client.pins(),
						},
					};
				}
				if (sub === "down") {
					log(
						`hobo station down: stopped occupancy for ${stationId} (data retained)`,
					);
					return {
						ok: true,
						message: `hobo station down: ${stationId}`,
						data: {
							stationId,
							status: "idle",
							dataRetained: true,
						},
					};
				}
				return {
					ok: true,
					message: `hobo station status: ${stationId}`,
					data: {
						stationId,
						isolation: occ.isolation,
						status: occ.status,
						activeRailHash: occ.activeRailHash,
						bootstrapRailHash: occ.bootstrapRailHash,
						bootstrapActive: occ.bootstrapActive,
						connectionCount: occ.connectionCount,
						activeRail: rail
							? {
									id: rail.id,
									name: rail.name,
									contentHash: rail.contentHash,
									isBootstrap: rail.isBootstrap,
								}
							: null,
						doctor: {
							bootstrapActive: occ.bootstrapActive,
							hint: occ.bootstrapActive
								? "bootstrap Rail active — activate a non-bootstrap Rail for production posture"
								: undefined,
						},
					},
				};
			}

			if (sub === "rails") {
				const railSub = args[1] ?? "list";
				const stationId = resolveStationId(deps, flagBag, home);
				const client = createStationClient({ hoboHome: home, stationId });
				const state = client.load();
				if (!state) {
					return {
						ok: false,
						message: `station ${stationId} not found`,
						data: { remediation: "hobo station init" },
					};
				}
				const svc = StationService.fromEvents(state.events, { stationId });

				if (railSub === "list" || railSub === "status") {
					const rails = Object.values(state.rails).map((r) => ({
						id: r.id,
						name: r.name,
						contentHash: r.contentHash,
						activationStatus: r.activationStatus,
						isBootstrap: r.isBootstrap,
					}));
					return {
						ok: true,
						message: `hobo station rails ${railSub}: ${rails.length} rail(s)`,
						data: {
							stationId,
							activeRailHash: state.occupancy.activeRailHash,
							rails,
						},
					};
				}

				if (railSub === "publish") {
					const docPath = args[2];
					if (!docPath) {
						return {
							ok: false,
							message: "usage: hobo station rails publish <rail-doc.json>",
						};
					}
					const raw = JSON.parse(readFileSync(docPath, "utf8")) as Record<
						string,
						unknown
					>;
					const rail = svc.publishRail({
						id: String(raw.id ?? `rail-${Date.now()}`),
						name: String(raw.name ?? "rail"),
						version: String(raw.version ?? "1.0.0"),
						stationId,
						activationStatus: "draft",
					});
					persistStationEvents(home, stationId, svc.events);
					return {
						ok: true,
						message: `hobo station rails publish: ${rail.contentHash}`,
						data: { railId: rail.id, contentHash: rail.contentHash },
					};
				}

				if (railSub === "approve" || railSub === "activate") {
					const hash = args[2];
					if (!hash) {
						return {
							ok: false,
							message: `usage: hobo station rails ${railSub} <railId|hash>`,
						};
					}
					const resolved =
						state.rails[hash] ??
						Object.values(state.rails).find((r) => r.id === hash);
					if (!resolved) {
						return { ok: false, message: `rail not found: ${hash}` };
					}
					if (railSub === "approve") svc.approveRail(resolved.contentHash);
					else svc.activateRail(resolved.contentHash);
					persistStationEvents(home, stationId, svc.events);
					const pins = createStationClient({
						hoboHome: home,
						stationId,
					}).pins();
					if (railSub === "activate") {
						setDefaultStation(
							home,
							{ id: stationId, dataDir: client.dataDir },
							pins.railHash,
						);
					}
					return {
						ok: true,
						message: `hobo station rails ${railSub}: ${resolved.contentHash}`,
						data: { contentHash: resolved.contentHash, pins },
					};
				}

				return {
					ok: false,
					message: `unknown rails subcommand: ${railSub}`,
				};
			}

			return {
				ok: false,
				message: `unknown station subcommand: ${sub}`,
				data: {
					usage:
						"hobo station init|up|down|status|rails list|publish|approve|activate|status",
				},
			};
		},
	};
}
