/**
 * incident-storm: hazards escalate 0→3 over ~90 ticks and a connection is
 * revoked mid-way. Bo ends up in the error bunker once hazards pile past 2.
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
	"sha256:2222222222222222222222222222222222222222222222222222222222222222";

const HAZARD_TICKS: readonly { atTick: number; hazard: string }[] =
	Object.freeze([
		Object.freeze({ atTick: 30, hazard: "station-closed" }),
		Object.freeze({ atTick: 50, hazard: "connection-revoked:conn-1" }),
		Object.freeze({ atTick: 70, hazard: "bootstrap-rail-active" }),
	]);

export const incidentStorm: YardScenario = Object.freeze({
	id: "incident-storm",
	seed: 1337,
	description:
		"Hazards escalate 0→3 over 90 ticks; connection revoked mid-way; bunker heats.",
	ticksPerSecond: 30,
	totalTicks: 90,
	snapshotAt: (tick) => {
		const hazards = HAZARD_TICKS.filter((h) => tick >= h.atTick).map(
			(h) => h.hazard,
		);
		const revoked = tick >= 50;
		return baseSnapshot({
			occupancy: {
				activeRailHash: RAIL_HASH,
				connectionCount: 1,
				seq: 3 + hazards.length,
			},
			rails: [makeRail({ contentHash: RAIL_HASH })],
			connections: [makeConnection({ status: revoked ? "revoked" : "active" })],
			metering: { trafficRate: revoked ? 0 : 0.4, quotaUsed: 200 },
			activity: [
				makeActivity({ status: hazards.length > 0 ? "error" : "working" }),
			],
			doctor: { hazards: Object.freeze(hazards) },
			seq: 3 + hazards.length,
			occupyMode: "occupying",
		});
	},
	expectedBeats: Object.freeze([
		beat({
			atTick: 50,
			label: "bay-spark",
			region: zoneRegion("connectionBay"),
			mustChange: true,
			seamPredicate: (state) =>
				state.hazards.some((h) => h.startsWith("connection-revoked")),
		}),
		beat({
			atTick: 70,
			label: "bunker-heat",
			region: zoneRegion("errorBunker"),
			mustChange: true,
			seamPredicate: (state) =>
				state.hazards.length >= 3 && state.zone === "errorBunker",
		}),
	]),
});
