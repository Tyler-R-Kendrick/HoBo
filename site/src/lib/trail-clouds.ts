import fs from "node:fs";

// ==========================================================================
// The clouds. Unlike the other scenery these are not one composed plate but
// individual sprites, because each one has to squash and bob on its own —
// a single background image can only move as a whole.
//
// Drop crops into public/parallax/clouds/ and place them here. The layer is
// a track of identical segments, each one tile wide, scrolling by exactly one
// segment; every segment holds the same set of clouds, so the loop lands on
// identical pixels the same way a tiled plate does.
//
// Clouds keep their own ink at night. Everything else in the band inverts,
// but a cloud that inverts turns into a hole in the sky.
// ==========================================================================

const DIR = new URL("../../public/parallax/clouds/", import.meta.url);

/** One tile of sky: the same 1200x300 scene the rest of the band uses. */
export const CLOUD_SPEED = 0.28;
export const CLOUD_TILE = 1200;

/**
 * Night brightness. Clouds keep their own ink rather than inverting, but kept
 * at full strength they read as cut-outs pasted on the sky — far too present
 * for the furthest thing in the band. Held back, they sit behind the night.
 */
export const CLOUD_TONE = 0.6;

/**
 * Where each crop sits in the tile, in tile units — `x` from the left edge,
 * `y` from the top, `w` its drawn width. Nothing may cross an edge: a cloud
 * is a discrete prop, and the track repeats rather than wrapping it.
 */
const PLACED = [
	{ file: "cloud-1.png", x: 62, y: 30, w: 177 },
	{ file: "cloud-2.png", x: 388, y: 66, w: 112 },
	{ file: "cloud-3.png", x: 632, y: 18, w: 107 },
	{ file: "cloud-4.png", x: 842, y: 74, w: 212 },
] as const;

export type Cloud = {
	file: string;
	x: number;
	y: number;
	w: number;
	/** Drawn height, from the crop's own aspect so it is never squashed. */
	h: number;
};

/** Intrinsic size out of the PNG header — no decoding needed. */
function pngSize(file: URL): { w: number; h: number } | null {
	const bytes = fs.readFileSync(file);
	if (bytes.length < 24) return null;
	return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

/** Every placed cloud whose crop is actually present. */
export function clouds(): Cloud[] {
	if (!fs.existsSync(DIR)) return [];
	const found: Cloud[] = [];
	for (const spot of PLACED) {
		const file = new URL(spot.file, DIR);
		if (!fs.existsSync(file)) continue;
		const size = pngSize(file);
		const h = size && size.w > 0 ? (spot.w * size.h) / size.w : spot.w / 2;
		if (spot.x < 0 || spot.x + spot.w > CLOUD_TILE) {
			throw new Error(`${spot.file} crosses the tile edge; the track repeats, it does not wrap`);
		}
		found.push({ ...spot, h: Math.round(h * 100) / 100 });
	}
	return found;
}
