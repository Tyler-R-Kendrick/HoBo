/**
 * Deterministic world fixture for scenario/test mode: no control-api contact.
 * Pure function of (seed, tick) → WorldState — same inputs, deep-equal output.
 * 2 camps × up to 3 bindlebug characters cycling idle/working/stuck as ticks
 * advance, so seam tests and screenshots see a stable, SIMULATED world.
 */

import type { AgentState, Character, WorldState } from "@hobo/yard-world";

const STATION_ID = "station:scenario";
const YARD_ID = "yard:scenario";

const CAMPS: readonly { id: string; name: string }[] = Object.freeze([
	{ id: "camp-gateway", name: "gateway" },
	{ id: "camp-orders", name: "orders" },
]);

const CHARACTERS: readonly {
	id: string;
	name: string;
	campId: string;
}[] = Object.freeze([
	{ id: "bindle-ada", name: "ada", campId: "camp-gateway" },
	{ id: "bindle-brk", name: "brakeman", campId: "camp-gateway" },
	{ id: "bindle-cab", name: "caboose", campId: "camp-orders" },
	{ id: "bindle-dot", name: "dot", campId: "camp-orders" },
	{ id: "bindle-eng", name: "engineer", campId: "camp-orders" },
]);

const STATE_CYCLE: readonly AgentState[] = Object.freeze([
	"idle",
	"working",
	"working",
	"reading",
	"working",
	"stuck",
]);

/** Deterministic per-character state at a tick (seed offsets the cycle). */
export function fixtureCharacterState(
	seed: number,
	tick: number,
	index: number,
): AgentState {
	const phase = (tick + index * 2 + (seed % STATE_CYCLE.length)) >>> 0;
	// SAFETY: `return STATE_CYCLE[phase % STATE_CYCLE.length] as AgentState;` is required at this I/O or test boundary.
	return STATE_CYCLE[phase % STATE_CYCLE.length] as AgentState;
}

/** Pure deterministic WorldState for scenario/test mode. */
export function scenarioWorld(seed: number, tick: number): WorldState {
	const characters: Record<string, Character> = {};
	CHARACTERS.forEach((def, index) => {
		const state = fixtureCharacterState(seed, tick, index);
		const stuck = state === "stuck";
		characters[def.id] = {
			id: def.id,
			name: def.name,
			kind: "bindle",
			stationId: STATION_ID,
			campId: def.campId,
			desk: { x: index, y: 0 },
			position: { x: index, y: 0 },
			state,
			stateSince: tick,
			// One character carries degraded health so pips render in fixtures.
			health: index === 1 ? 0.3 : 1,
			bubble: stuck ? `stuck on span ${def.name}` : undefined,
			bubbleSince: stuck ? tick : 0,
			path: [],
			activeSpans: {},
		};
	});
	return {
		tick,
		stations: { [STATION_ID]: { id: STATION_ID, name: "scenario" } },
		layouts: {},
		yards: {
			[YARD_ID]: { id: YARD_ID, stationId: STATION_ID, name: "scenario" },
		},
		camps: Object.fromEntries(
			CAMPS.map((c, i) => [
				c.id,
				{
					id: c.id,
					yardId: YARD_ID,
					name: c.name,
					rect: { x: 2 + i * 14, y: 2, w: 12, h: 9 },
				},
			]),
		),
		junctions: {},
		characters,
		packets: {},
	};
}
