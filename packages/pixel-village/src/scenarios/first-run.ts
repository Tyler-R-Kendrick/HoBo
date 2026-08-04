/**
 * first-run: empty closed station → station opens at tick 10 → bootstrap
 * rail appears at tick 20. Beats land on the bootstrap desk.
 */

import {
	baseSnapshot,
	beat,
	makeRail,
	type YardScenario,
	zoneRegion,
} from "./scenario.js";

const BOOTSTRAP_HASH =
	"sha256:6666666666666666666666666666666666666666666666666666666666666666";
const OPEN_TICK = 10;
const BOOTSTRAP_TICK = 20;

export const firstRun: YardScenario = Object.freeze({
	id: "first-run",
	seed: 1,
	description:
		"Empty closed station → opens at tick 10 → bootstrap rail at tick 20.",
	ticksPerSecond: 30,
	totalTicks: 40,
	snapshotAt: (tick) => {
		const open = tick >= OPEN_TICK;
		const bootstrap = tick >= BOOTSTRAP_TICK;
		const seq = bootstrap ? 2 : open ? 1 : 0;
		return baseSnapshot({
			occupancy: {
				status: open ? "open" : "closed",
				...(bootstrap ? { bootstrapRailHash: BOOTSTRAP_HASH } : {}),
				bootstrapActive: bootstrap,
				seq,
			},
			rails: bootstrap
				? [
						makeRail({
							id: "rail-bootstrap",
							name: "bootstrap",
							contentHash: BOOTSTRAP_HASH,
							activationStatus: "active",
							isBootstrap: true,
						}),
					]
				: [],
			doctor: { bootstrapActive: bootstrap },
			seq,
		});
	},
	expectedBeats: Object.freeze([
		beat({
			atTick: OPEN_TICK,
			label: "station-opens",
			region: zoneRegion("bootstrapDesk"),
			mustChange: true,
			seamPredicate: (state) =>
				(state.seq ?? -1) >= 1 && !state.bootstrapActive,
		}),
		beat({
			atTick: BOOTSTRAP_TICK,
			label: "bootstrap-rail",
			region: zoneRegion("bootstrapDesk"),
			mustChange: true,
			seamPredicate: (state) =>
				state.bootstrapActive && state.zone === "bootstrapDesk",
		}),
	]),
});
