/**
 * quiet-yard: active rail, one authorized connection, no hazards.
 * Snapshot content is stable across every tick — the baseline scenario.
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
	"sha256:1111111111111111111111111111111111111111111111111111111111111111";

export const quietYard: YardScenario = Object.freeze({
	id: "quiet-yard",
	seed: 42,
	description:
		"Active rail, one authorized connection, no hazards; stable across ticks.",
	ticksPerSecond: 30,
	totalTicks: 60,
	snapshotAt: () =>
		baseSnapshot({
			occupancy: {
				activeRailHash: RAIL_HASH,
				connectionCount: 1,
				seq: 3,
			},
			rails: [makeRail({ contentHash: RAIL_HASH })],
			connections: [makeConnection()],
			metering: { trafficRate: 0.4, quotaUsed: 120 },
			activity: [makeActivity()],
			seq: 3,
			occupyMode: "occupying",
		}),
	expectedBeats: Object.freeze([
		beat({
			atTick: 10,
			label: "steady-traffic",
			region: zoneRegion("activeRailTrack"),
			mustChange: false,
			seamPredicate: (state) =>
				state.connCount === 1 &&
				state.hazards.length === 0 &&
				state.occupyMode === "occupying" &&
				state.trafficRate > 0,
		}),
	]),
});
