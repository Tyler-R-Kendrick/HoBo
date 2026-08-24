/**
 * deploy-saga: rail draft(t0)→approved(t20)→active(t40) from a bootstrap
 * start. Policy board is where the lifecycle beats land.
 */

import {
	baseSnapshot,
	beat,
	makeConnection,
	makeRail,
	type YardScenario,
	zoneRegion,
} from "./scenario.js";

const RAIL_HASH =
	"sha256:5555555555555555555555555555555555555555555555555555555555555555";
const BOOTSTRAP_HASH =
	"sha256:5555555555555555555555555555555555555555555555555555555555550000";
const APPROVE_TICK = 20;
const ACTIVATE_TICK = 40;

export const deploySaga: YardScenario = Object.freeze({
	id: "deploy-saga",
	seed: 5,
	description:
		"Rail draft→approved(t20)→active(t40) from a bootstrapActive start.",
	ticksPerSecond: 30,
	totalTicks: 60,
	snapshotAt: (tick) => {
		const phase = tick >= ACTIVATE_TICK ? 2 : tick >= APPROVE_TICK ? 1 : 0;
		const activationStatus =
			phase === 2 ? "active" : phase === 1 ? "approved" : "draft";
		const bootstrapActive = phase === 0;
		return baseSnapshot({
			occupancy: {
				...(phase === 2 ? { activeRailHash: RAIL_HASH } : undefined),
				bootstrapRailHash: BOOTSTRAP_HASH,
				bootstrapActive,
				connectionCount: 1,
				seq: 1 + phase,
			},
			rails: [
				makeRail({ contentHash: RAIL_HASH, activationStatus }),
				makeRail({
					id: "rail-bootstrap",
					name: "bootstrap",
					contentHash: BOOTSTRAP_HASH,
					activationStatus: bootstrapActive ? "active" : "retired",
					isBootstrap: true,
				}),
			],
			connections: [makeConnection()],
			metering: { trafficRate: phase === 2 ? 0.3 : 0, quotaUsed: 40 },
			doctor: { bootstrapActive },
			seq: 1 + phase,
			occupyMode: phase === 2 ? "occupying" : "idle",
		});
	},
	expectedBeats: Object.freeze([
		beat({
			atTick: 5,
			label: "draft-posted",
			region: zoneRegion("policyBoard"),
			mustChange: false,
			seamPredicate: (state) =>
				state.bootstrapActive && state.occupyMode === "idle",
		}),
		beat({
			atTick: APPROVE_TICK,
			label: "rail-approved",
			region: zoneRegion("policyBoard"),
			mustChange: true,
			seamPredicate: (state) =>
				!state.bootstrapActive && state.occupyMode === "idle",
		}),
		beat({
			atTick: ACTIVATE_TICK,
			label: "rail-active",
			region: zoneRegion("policyBoard"),
			mustChange: true,
			seamPredicate: (state) =>
				state.occupyMode === "occupying" && state.trafficRate > 0,
		}),
	]),
});
