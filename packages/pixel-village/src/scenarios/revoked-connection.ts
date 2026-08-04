/**
 * revoked-connection: one authorized connection turns revoked at tick 30.
 */

import {
	baseSnapshot,
	beat,
	makeActivity,
	makeConnection,
	makeRail,
	type YardScenario,
	zoneRegion,
} from "./scenario.js";

const RAIL_HASH =
	"sha256:4444444444444444444444444444444444444444444444444444444444444444";
const REVOKE_TICK = 30;

export const revokedConnection: YardScenario = Object.freeze({
	id: "revoked-connection",
	seed: 99,
	description: "Authorized connection turns revoked at tick 30; bay sparks.",
	ticksPerSecond: 30,
	totalTicks: 60,
	snapshotAt: (tick) => {
		const revoked = tick >= REVOKE_TICK;
		return baseSnapshot({
			occupancy: {
				activeRailHash: RAIL_HASH,
				connectionCount: 1,
				seq: revoked ? 3 : 2,
			},
			rails: [makeRail({ contentHash: RAIL_HASH })],
			connections: [makeConnection({ status: revoked ? "revoked" : "active" })],
			metering: { trafficRate: revoked ? 0 : 0.3, quotaUsed: 90 },
			activity: [makeActivity({ status: revoked ? "error" : "working" })],
			doctor: {
				hazards: Object.freeze(
					revoked ? ["connection-revoked:conn-1"] : [],
				) as readonly string[],
			},
			seq: revoked ? 3 : 2,
			occupyMode: "occupying",
		});
	},
	expectedBeats: Object.freeze([
		beat({
			atTick: 10,
			label: "bay-authorized",
			region: zoneRegion("connectionBay"),
			mustChange: false,
			seamPredicate: (state) =>
				state.connCount === 1 && state.hazards.length === 0,
		}),
		beat({
			atTick: REVOKE_TICK,
			label: "bay-revoked",
			region: zoneRegion("connectionBay"),
			mustChange: true,
			seamPredicate: (state) =>
				state.hazards.some((h) => h.startsWith("connection-revoked")),
		}),
	]),
});
