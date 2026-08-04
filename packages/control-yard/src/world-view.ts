/**
 * WorldView — minimal serializable projection of @hobo/yard-world WorldState
 * for the presenter: camp rooms laid out inside the CAMP_GROUNDS reserved
 * region, bindlebug characters gridded by desk index inside their room.
 * Pure module: no I/O, no Phaser, deterministic for a given WorldState.
 */

import type { WorldState } from "@hobo/yard-world";
import { CAMP_GROUNDS, type PropRegion, YARD_LAYOUT } from "./layout.js";

export type BindlebugVariant = "a" | "b" | "c";

export type WorldCampView = Readonly<{
	id: string;
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export type WorldCharacterView = Readonly<{
	id: string;
	campId: string;
	variant: BindlebugVariant;
	/** Stable clip id (bindlebug.a/b/c.idle) chosen from the id hash. */
	animationId: string;
	/** Feet position inside the camp room (sprite origin 0.5,1). */
	x: number;
	y: number;
	state: "idle" | "working" | "reading" | "stuck";
	health: number;
	bubble: string | null;
}>;

export type WorldView = Readonly<{
	camps: readonly WorldCampView[];
	characters: readonly WorldCharacterView[];
	demo: boolean;
}>;

/** Max camp rooms rendered inside CAMP_GROUNDS. */
export const MAX_CAMP_ROOMS = 4;
/** Max characters gridded per camp room. */
const MAX_CHARS_PER_ROOM = 3;
const ROOM_INSET = 6;
const ROOM_COLS = 2;
const ROOM_ROWS = 2;

/** FNV-1a 32-bit — deterministic variant assignment from character id. */
export function hashCharacterId(id: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export function bindlebugVariant(id: string): BindlebugVariant {
	const variants: readonly BindlebugVariant[] = ["a", "b", "c"];
	return variants[hashCharacterId(id) % 3] as BindlebugVariant;
}

/**
 * Camp-room slots: a 2×2 grid inside CAMP_GROUNDS, inset east of the
 * Bootstrap Desk so dynamic content never occludes the instrument panel
 * (DESIGN.md "Reserved regions").
 */
export function campRoomSlots(
	region: PropRegion = CAMP_GROUNDS,
): readonly { x: number; y: number; w: number; h: number }[] {
	const desk = YARD_LAYOUT.zones.bootstrapDesk;
	const deskRight = desk.x + desk.width;
	const left = Math.max(region.x, deskRight + 16);
	const width = region.x + region.width - left;
	const cellW = width / ROOM_COLS;
	const cellH = region.height / ROOM_ROWS;
	const slots: { x: number; y: number; w: number; h: number }[] = [];
	for (let i = 0; i < MAX_CAMP_ROOMS; i++) {
		const col = i % ROOM_COLS;
		const row = Math.floor(i / ROOM_COLS);
		slots.push({
			x: Math.round(left + col * cellW + ROOM_INSET),
			y: Math.round(region.y + row * cellH + ROOM_INSET),
			w: Math.round(cellW - ROOM_INSET * 2),
			h: Math.round(cellH - ROOM_INSET * 2),
		});
	}
	return slots;
}

/** Map a WorldState (or null) to the presenter's WorldView. */
export function toWorldView(
	world: WorldState | null,
	demo: boolean,
): WorldView | null {
	if (world === null) return null;
	const slots = campRoomSlots();
	// One room = one real, inhabited Camp. OTLP logs/metrics that carry no
	// `hobo.camp` attribute auto-materialize a placeholder camp upstream; if we
	// rendered those we would draw an empty room (decorative scenery, which the
	// design forbids) and — worse — an alphabetically earlier placeholder could
	// take a slot from a Camp that actually has Bindles in it.
	const populated = new Set(
		Object.values(world.characters).map((ch) => ch.campId),
	);
	const camps = Object.values(world.camps)
		.filter((camp) => populated.has(camp.id))
		.sort((a, b) => a.id.localeCompare(b.id))
		.slice(0, MAX_CAMP_ROOMS)
		.map((camp, i) => {
			const slot = slots[i] as (typeof slots)[number];
			return Object.freeze({
				id: camp.id,
				label: camp.name || camp.id,
				...slot,
			});
		});
	const characters: WorldCharacterView[] = [];
	for (const room of camps) {
		const members = Object.values(world.characters)
			.filter((ch) => ch.campId === room.id)
			.sort((a, b) => a.id.localeCompare(b.id))
			.slice(0, MAX_CHARS_PER_ROOM);
		members.forEach((ch, deskIndex) => {
			const variant = bindlebugVariant(ch.id);
			const col = deskIndex % MAX_CHARS_PER_ROOM;
			characters.push(
				Object.freeze({
					id: ch.id,
					campId: ch.campId,
					variant,
					animationId: `bindlebug.${variant}.idle`,
					x: Math.round(room.x + 30 + col * ((room.w - 60) / 2)),
					y: room.y + room.h - 8,
					state: ch.state,
					health: Math.max(0, Math.min(1, ch.health)),
					bubble: ch.bubble !== undefined ? ch.bubble.slice(0, 24) : null,
				}),
			);
		});
	}
	// Characters whose camp fell outside the 4 rendered rooms stay unrendered.
	return Object.freeze({
		camps: Object.freeze(camps),
		characters: Object.freeze(characters),
		demo,
	});
}
