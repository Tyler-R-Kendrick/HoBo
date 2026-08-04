/**
 * The Station village — tile vocabulary and layout (ADR-0141).
 *
 * This module is the single place that knows *which tile* means *what*. The
 * presenter places these; it never invents shapes. Art is sourced from the
 * vendored Kenney CC0 packs, so a prop is always a real tile index, never a
 * stack of rectangles drawn in code.
 *
 * Coordinates here are TILE coordinates. The stage is 1280x720 logical at
 * TILE_PX * SCALE = 48px per tile, giving a 26x15 playfield.
 */

import type { ZoneId } from "./layout.js";

export const TILE_PX = 16;
/** Integer scale only (DESIGN.md): 16px art at x3. */
export const TILE_SCALE = 3;
export const TILE = TILE_PX * TILE_SCALE;
export const GRID_COLS = 27;
export const GRID_ROWS = 15;

/** Sheet ids as declared in assets_index.json. */
export type SheetId = "town" | "dungeon" | "urban" | "rogue" | "chars" | "ui";

/**
 * Tiny Town tile vocabulary. Indices verified against the sheet; see
 * `scripts/` tile-index tooling and assets/CREDITS.md for provenance.
 */
export const T = Object.freeze({
	grass: [0, 0, 0, 1, 2] as const,
	grassPlain: 0,
	// 3x3 dirt-in-grass patch: the road uses the top/middle/bottom edges so the
	// transition to grass is drawn by the art rather than faked with a hard line.
	dirtTop: 13,
	dirtMid: 25,
	dirtBottom: 37,
	dirtPlain: 40,
	// 4 is deliberately absent: its canopy is the same green as the grass tile,
	// so over the meadow it renders as a hollow outline (verified on screen).
	treeGreen: [5, 16, 28] as const,
	treeAutumn: [3, 15, 27] as const,
	// A fence run must be CONTINUOUS: 81 is the plain rail and 45 is the rail
	// with a post beneath it. Alternating 44/46 (rail-then-post, post-then-rail)
	// butts two posts together and leaves a gap every other tile.
	fence: 81,
	fenceAlt: 45,
	// A barred gate is the fence run closing over its own gap — the same rail
	// panel, unbroken. (84 is a grey stone door: foreign material nailed into a
	// wooden fence, and tiny-town ships no swinging gate at this scale.)
	gate: 45,
	signpost: 83,
	coinSmall: 93,
	coinLarge: 94,
	target: 95,
	bomb: 105,
	barrel: 106,
	pot: 107,
	chest: 130,
	chestOpen: 131,
	ladder: 103,
	// House parts: roof top row, roof lower row, wall row, doors.
	roofRedTop: [52, 53, 54] as const,
	roofRedBottom: [64, 65, 66] as const,
	roofGreyTop: [48, 49, 50] as const,
	roofGreyBottom: [60, 61, 62] as const,
	// Wall run: left corner, plain, right corner. 74 is a black archway and read
	// as a hole punched through every house.
	wall: [72, 73, 75] as const,
	doorRed: 85,
	doorGrey: 87,
});

/**
 * Banner tiles live on the ROGUE sheet — tiny-town ships no flag. Verified by
 * rendering `kenney/roguelike-rpg/roguelikeSheet_transparent.png` on its 57x31
 * grid (1px spacing): index 50 is the emblazoned head of the hanging orange
 * banner and 163 is its pointed tail, so 50 over 163 is one two-tile banner.
 */
export const BANNER = Object.freeze({
	sheet: "rogue" as const,
	top: 50,
	tail: 163,
});

/** A Camp house is three tiles wide (roof/wall rows are 3-tile runs). */
export const HOUSE_TILES_W = 3;
/** …and three tall: roof top, roof bottom, wall + door. */
export const HOUSE_TILES_H = 3;

/**
 * Complete villager sprites (columns 0-1 of the character sheet). Verified by
 * rendering the 54x12 grid: rows 0-3 are undressed base bodies, so the pool
 * starts at row 5. 270 is deliberately absent — it is the Operator's own body.
 */
export const VILLAGERS = Object.freeze([
	271, 324, 325, 378, 379, 432, 433, 486, 487, 540, 541, 594, 595,
]);

/** The Operator's own sprite — distinct from any Bindle villager. */
export const OPERATOR_SPRITE = 216 + 54; // row 5, col 0 — the orange-coat figure.

export type TilePlacement = Readonly<{
	sheet: SheetId;
	index: number;
	tx: number;
	ty: number;
}>;

/** A Camp house: 3 tiles wide, 3 tall, with the door centred. */
export type HousePlot = Readonly<{
	tx: number;
	ty: number;
	red: boolean;
	/** Where this camp's villagers stand (tile coords, left to right). */
	standing: readonly { tx: number; ty: number }[];
}>;

/** Road (the active rail) occupies three tile rows: edge, middle, edge. */
export const ROAD_TY = 8;

/** Four camp plots along the north side of the road. */
export const HOUSE_PLOTS: readonly HousePlot[] = Object.freeze([
	Object.freeze({
		tx: 2,
		ty: 2,
		red: true,
		standing: [
			{ tx: 2, ty: 6 },
			{ tx: 3, ty: 6 },
			{ tx: 4, ty: 6 },
		],
	}),
	Object.freeze({
		tx: 8,
		ty: 2,
		red: false,
		standing: [
			{ tx: 8, ty: 6 },
			{ tx: 9, ty: 6 },
			{ tx: 10, ty: 6 },
		],
	}),
	Object.freeze({
		tx: 15,
		ty: 2,
		red: true,
		standing: [
			{ tx: 15, ty: 6 },
			{ tx: 16, ty: 6 },
			{ tx: 17, ty: 6 },
		],
	}),
	Object.freeze({
		tx: 21,
		ty: 2,
		red: false,
		standing: [
			{ tx: 21, ty: 6 },
			{ tx: 22, ty: 6 },
			{ tx: 23, ty: 6 },
		],
	}),
]);

/** Fixed landmark positions, in tile coordinates. */
export const LANDMARK = Object.freeze({
	noticeBoard: { tx: 12, ty: 11 },
	operator: { tx: 11, ty: 11 },
	treasury: { tx: 20, ty: 11 },
	stores: { tx: 5, ty: 11 },
	hazardSpur: { tx: 24, ty: 11 },
	gate: { tx: 13, ty: 13 },
	banner: { tx: 14, ty: 10 },
});

/**
 * Clickable zone → the tile rect the operator actually aims at. Zone ids stay
 * the projection vocabulary; the village is how they are drawn.
 */
export const ZONE_TILE_RECT: Readonly<
	Record<ZoneId, { tx: number; ty: number; w: number; h: number }>
> = Object.freeze({
	// Each rect must actually contain the prop it names: a zone whose region
	// holds nothing is both an unclickable target and a dead region under the
	// liveness gate.
	// Anchored on the stores so it does not overlap the notice board — equal
	// sized overlapping rects make "smallest wins" ambiguous.
	platformRest: { tx: 4, ty: 10, w: 3, h: 2 },
	bootstrapDesk: { tx: 11, ty: 10, w: 3, h: 2 },
	activeRailTrack: { tx: 0, ty: ROAD_TY - 1, w: GRID_COLS, h: 3 },
	connectionBay: { tx: 12, ty: 12, w: 4, h: 2 },
	// Civic furniture on the green, not squatting on a Camp's plot: rails need
	// their own visible, clickable posts clear of the house band.
	policyBoard: { tx: 7, ty: 10, w: 3, h: 2 },
	costBooth: { tx: 19, ty: 10, w: 3, h: 2 },
	errorBunker: { tx: 23, ty: 10, w: 3, h: 2 },
});

/** Deterministic ground fill: same seed → same meadow, so shots are stable. */
export function groundTiles(seed: number): readonly TilePlacement[] {
	const out: TilePlacement[] = [];
	let s = seed >>> 0;
	const rnd = () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
	for (let ty = 0; ty < GRID_ROWS; ty++) {
		for (let tx = 0; tx < GRID_COLS; tx++) {
			// Flowers are punctuation, not wallpaper.
			const r = rnd();
			const index = r < 0.84 ? T.grassPlain : r < 0.95 ? 1 : 2;
			out.push({ sheet: "town", index, tx, ty });
		}
	}
	return out;
}

/** The road that renders the active rail, with art-drawn grass transitions. */
export function roadTiles(): readonly TilePlacement[] {
	const out: TilePlacement[] = [];
	for (let tx = 0; tx < GRID_COLS; tx++) {
		out.push({ sheet: "town", index: T.dirtTop, tx, ty: ROAD_TY - 1 });
		out.push({ sheet: "town", index: T.dirtMid, tx, ty: ROAD_TY });
		out.push({ sheet: "town", index: T.dirtBottom, tx, ty: ROAD_TY + 1 });
	}
	return out;
}

/** A Camp rendered as a house. */
export function houseTiles(plot: HousePlot): readonly TilePlacement[] {
	const top = plot.red ? T.roofRedTop : T.roofGreyTop;
	const bottom = plot.red ? T.roofRedBottom : T.roofGreyBottom;
	const door = plot.red ? T.doorRed : T.doorGrey;
	const out: TilePlacement[] = [];
	// Three rows: roof, lower roof, and the wall the door is cut into. The door
	// REPLACES the middle wall tile rather than covering it, so nothing is ever
	// drawn twice on the same 48px square.
	const rows = [top, bottom, T.wall] as const;
	rows.forEach((row, rowIndex) => {
		row.forEach((index, i) => {
			out.push({
				sheet: "town",
				index: rowIndex === 2 && i === 1 ? door : index,
				tx: plot.tx + i,
				ty: plot.ty + rowIndex,
			});
		});
	});
	return out;
}

/** Boundary fence with a gap where the Connection gate sits. */
export function fenceTiles(gateOpen: boolean): readonly TilePlacement[] {
	const out: TilePlacement[] = [];
	const g = LANDMARK.gate;
	for (let tx = 2; tx < GRID_COLS - 2; tx++) {
		if (tx === g.tx || tx === g.tx + 1) continue;
		out.push({
			sheet: "town",
			index: tx % 2 ? T.fence : T.fenceAlt,
			tx,
			ty: 13,
		});
	}
	// An authorized Connection stands its gate open; otherwise it is barred.
	if (!gateOpen) {
		out.push({ sheet: "town", index: T.gate, tx: g.tx, ty: 13 });
		out.push({ sheet: "town", index: T.gate, tx: g.tx + 1, ty: 13 });
	}
	return out;
}

/** Scenery: trees placed off the working areas, deterministic per seed. */
export function sceneryTiles(seed: number): readonly TilePlacement[] {
	// Spots avoid column 26 (the 27th column overhangs the 1280px canvas, so a
	// tree there would be sliced in half), the banner column, and every
	// landmark/label footprint.
	const spots: readonly [number, number][] = [
		[0, 1],
		[6, 1],
		[7, 1],
		[17, 1],
		[19, 1],
		[25, 1],
		[1, 11],
		[3, 12],
		[8, 12],
		[9, 11],
		[17, 12],
		[18, 11],
		[22, 12],
		[25, 12],
	];
	let s = (seed ^ 0x9e37) >>> 0;
	const rnd = () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
	return spots.map(([tx, ty]) => {
		const pool = rnd() < 0.75 ? T.treeGreen : T.treeAutumn;
		const index = pool[Math.floor(rnd() * pool.length)] ?? pool[0];
		return { sheet: "town" as const, index: index as number, tx, ty };
	});
}

/** Stable villager sprite for a Bindle id — same Bindle always looks the same. */
export function villagerFor(id: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return (VILLAGERS[h % VILLAGERS.length] ?? VILLAGERS[0]) as number;
}

/** Tile coords → pixel coords (top-left of the tile). */
export function tilePx(tx: number, ty: number): { x: number; y: number } {
	return { x: tx * TILE, y: ty * TILE };
}
