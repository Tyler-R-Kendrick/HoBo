/**
 * Yard layout — single source of truth for zone coordinates and depths.
 * Star-Office-UI `layout.js` pattern: no magic numbers in scene logic.
 *
 * Since ADR-0148 the yard is a tiled village, so the clickable zone rects are
 * DERIVED from `ZONE_TILE_RECT` × `TILE` rather than hand-placed: a click on a
 * house, the notice board or the gate selects the zone that thing represents.
 * `village.ts` only imports `ZoneId` as a type, so this runtime import is not a
 * cycle.
 */

import {
	HOUSE_PLOTS,
	HOUSE_TILES_W,
	LANDMARK,
	ROAD_TY,
	TILE,
	ZONE_TILE_RECT,
} from "./village.js";

export const YARD_WIDTH = 1280;
export const YARD_HEIGHT = 720;

export type ZoneId =
	| "platformRest"
	| "bootstrapDesk"
	| "activeRailTrack"
	| "connectionBay"
	| "policyBoard"
	| "costBooth"
	| "errorBunker";

export type ZoneLayout = Readonly<{
	id: ZoneId;
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	depth: number;
	/** Anchor the operator's attention lands on: bottom-centre of the tile rect. */
	anchorX: number;
	anchorY: number;
}>;

/** Reserved region for dynamic world content (DESIGN.md "Reserved regions"). */
export type PropRegion = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export type Layout = Readonly<{
	width: number;
	height: number;
	groundY: number;
	zones: Readonly<Record<ZoneId, ZoneLayout>>;
	/**
	 * Camp rooms + bindlebug NPCs render only inside this band (the
	 * activeRailTrack-to-ground open area). Fixed zones are never moved and the
	 * instrument panel (Bootstrap Desk, Connection Bay) is never occluded.
	 */
	campGrounds: PropRegion;
	depths: Readonly<{
		background: number;
		track: number;
		bay: number;
		characters: number;
		particles: number;
		ui: number;
		overlay: number;
	}>;
	speechBubble: Readonly<{ offsetY: number; maxWidth: number }>;
	costMeter: Readonly<{ x: number; y: number; width: number; height: number }>;
	trafficEmitter: Readonly<{ x: number; y: number; width: number }>;
}>;

export interface PixelPoint {
	readonly x: number;
	readonly y: number;
}

export interface PixelSize {
	readonly width: number;
	readonly height: number;
}

interface ZoneCopy {
	platformRest: string;
	bootstrapDesk: string;
	activeRailTrack: string;
	connectionBay: string;
	policyBoard: string;
	costBooth: string;
	errorBunker: string;
}

interface ZoneDepth {
	platformRest: number;
	bootstrapDesk: number;
	activeRailTrack: number;
	connectionBay: number;
	policyBoard: number;
	costBooth: number;
	errorBunker: number;
}

interface ZoneMap {
	platformRest: ZoneLayout;
	bootstrapDesk: ZoneLayout;
	activeRailTrack: ZoneLayout;
	connectionBay: ZoneLayout;
	policyBoard: ZoneLayout;
	costBooth: ZoneLayout;
	errorBunker: ZoneLayout;
}

const ZONE_LABEL: ZoneCopy = {
	platformRest: "Platform Rest",
	bootstrapDesk: "Bootstrap Desk",
	activeRailTrack: "Active Rail Track",
	connectionBay: "Connection Bay",
	policyBoard: "Policy Board",
	costBooth: "Cost Booth",
	errorBunker: "Error Bunker",
};

/** Draw order hint only; hit-testing resolves overlaps by area, not by depth. */
const ZONE_DEPTH: ZoneDepth = {
	platformRest: 10,
	bootstrapDesk: 11,
	activeRailTrack: 5,
	connectionBay: 12,
	policyBoard: 8,
	costBooth: 9,
	errorBunker: 9,
};

/**
 * Zone rects are the village grid, not free-floating boxes: a rect is exactly
 * the tiles that draw the thing. The grid is 27 columns wide (1296px) so the
 * road runs past the right edge — rects are clamped to the canvas so a click
 * can never resolve outside it.
 */
function zoneFromTiles(id: ZoneId): ZoneLayout {
	const r = ZONE_TILE_RECT[id];
	const x = r.tx * TILE;
	const y = r.ty * TILE;
	const width = Math.min(r.w * TILE, YARD_WIDTH - x);
	const height = Math.min(r.h * TILE, YARD_HEIGHT - y);
	return Object.freeze({
		id,
		label: ZONE_LABEL[id],
		x,
		y,
		width,
		height,
		depth: ZONE_DEPTH[id],
		anchorX: Math.round(x + width / 2),
		anchorY: y + height,
	});
}

const ZONES: ZoneMap = {
	platformRest: zoneFromTiles("platformRest"),
	bootstrapDesk: zoneFromTiles("bootstrapDesk"),
	activeRailTrack: zoneFromTiles("activeRailTrack"),
	connectionBay: zoneFromTiles("connectionBay"),
	policyBoard: zoneFromTiles("policyBoard"),
	costBooth: zoneFromTiles("costBooth"),
	errorBunker: zoneFromTiles("errorBunker"),
};

/**
 * DESIGN.md reserved region: the band the Camp houses and their Bindles own.
 *
 * Since ADR-0148 this is derived from `HOUSE_PLOTS` — the north side of the
 * road, from the first plot's west edge to the last plot's east edge, down to
 * the row the villagers stand on. Nothing else may be drawn inside it, so a
 * house is never occluded by yard furniture.
 */
export const CAMP_GROUNDS: PropRegion = Object.freeze(houseBand());

function houseBand(): PropRegion {
	const left = Math.min(...HOUSE_PLOTS.map((p) => p.tx));
	const right = Math.max(...HOUSE_PLOTS.map((p) => p.tx + HOUSE_TILES_W));
	const top = Math.min(...HOUSE_PLOTS.map((p) => p.ty));
	const bottom = Math.max(
		...HOUSE_PLOTS.flatMap((p) => p.standing.map((s) => s.ty + 1)),
	);
	return {
		x: left * TILE,
		y: top * TILE,
		width: (right - left) * TILE,
		height: (bottom - top) * TILE,
	};
}

export const YARD_LAYOUT: Layout = Object.freeze({
	width: YARD_WIDTH,
	height: YARD_HEIGHT,
	groundY: 620,
	zones: Object.freeze({ ...ZONES }),
	campGrounds: CAMP_GROUNDS,
	depths: Object.freeze({
		background: 0,
		track: 5,
		bay: 12,
		characters: 20,
		particles: 25,
		ui: 40,
		overlay: 50,
	}),
	speechBubble: Object.freeze({ offsetY: -90, maxWidth: 220 }),
	/** Footprint of the treasury (quota + spend), in village pixels. */
	costMeter: Object.freeze({
		x: LANDMARK.treasury.tx * TILE,
		y: LANDMARK.treasury.ty * TILE,
		width: 2 * TILE,
		height: TILE,
	}),
	/** Traffic rides the road, west to east, down its middle row. */
	trafficEmitter: Object.freeze({
		x: 0,
		y: ROAD_TY * TILE + TILE / 2,
		width: YARD_WIDTH,
	}),
});

/**
 * Zone under a pixel. Village rects nest (the notice board sits on the platform
 * green), so the SMALLEST containing rect wins — otherwise the big rail band
 * would swallow every click that lands on it.
 */
export function zoneAt(x: number, y: number): ZoneId | null {
	let hit: ZoneLayout | null = null;
	for (const zone of Object.values(YARD_LAYOUT.zones)) {
		if (
			x >= zone.x &&
			x <= zone.x + zone.width &&
			y >= zone.y &&
			y <= zone.y + zone.height
		) {
			const area = zone.width * zone.height;
			if (!hit || area < hit.width * hit.height) hit = zone;
		}
	}
	return hit?.id ?? null;
}

export function zoneAnchor(id: ZoneId): PixelPoint {
	const z = YARD_LAYOUT.zones[id];
	return { x: z.anchorX, y: z.anchorY };
}
