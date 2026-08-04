/**
 * quota-exhaustion: metering.quotaUsed climbs 0→quotaLimit over 60 ticks.
 * Content changes every tick, so seq increases every tick.
 */

import {
	baseSnapshot,
	beat,
	costMeterRegion,
	makeActivity,
	makeConnection,
	makeRail,
	type YardScenario,
} from "./scenario.js";

const RAIL_HASH =
	"sha256:3333333333333333333333333333333333333333333333333333333333333333";
const QUOTA_LIMIT = 600;
const TOTAL_TICKS = 60;

export const quotaExhaustion: YardScenario = Object.freeze({
	id: "quota-exhaustion",
	seed: 7,
	description: "quotaUsed climbs 0→quotaLimit over 60 ticks; cost meter fills.",
	ticksPerSecond: 30,
	totalTicks: TOTAL_TICKS,
	snapshotAt: (tick) => {
		const quotaUsed = Math.min(
			QUOTA_LIMIT,
			Math.round((tick / TOTAL_TICKS) * QUOTA_LIMIT),
		);
		return baseSnapshot({
			occupancy: {
				activeRailHash: RAIL_HASH,
				connectionCount: 1,
				seq: 3 + tick,
			},
			rails: [
				makeRail({
					contentHash: RAIL_HASH,
					quotaUsed,
					quotaLimit: QUOTA_LIMIT,
				}),
			],
			connections: [makeConnection()],
			metering: {
				trafficRate: 0.5,
				quotaUsed,
				quotaLimit: QUOTA_LIMIT,
				budgetUsd: quotaUsed / 10,
			},
			activity: [makeActivity()],
			seq: 3 + tick,
			occupyMode: "occupying",
		});
	},
	expectedBeats: Object.freeze([
		beat({
			atTick: 55,
			label: "meter-nearly-full",
			region: costMeterRegion(),
			mustChange: true,
			seamPredicate: (state) =>
				state.trafficRate > 0 &&
				(state.seq ?? 0) >= 3 + 50 &&
				state.occupyMode === "occupying",
		}),
	]),
});
