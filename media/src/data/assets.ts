/**
 * The art manifest.
 *
 * One record per asset, and the geometry that makes it playable — a sprite
 * sheet is useless as a flat image, so the catalogue animates from these
 * numbers rather than from a screenshot of the animation.
 *
 * The numbers are not decoration: they are copied from the consumers
 * (`site/src/components/BoIdle.astro`, `site/src/components/ParallaxTrail.astro`)
 * and if they drift, the preview here stops matching what the site plays.
 */

export type Sheet = {
	key: string;
	title: string;
	file: string;
	/** Frame box in the sheet's own pixels. */
	frame: { w: number; h: number };
	/** Grid: columns x rows. A strip is `rows: 1`. */
	grid: { cols: number; rows: number };
	frames: number;
	/** Seconds per frame, as exported. */
	tick: number;
	note: string;
};

export const SPRITES: Sheet[] = [
	{
		key: "bo-walk",
		title: "Walk, east",
		file: "sprites/bo-walk.png",
		frame: { w: 160, h: 157 },
		grid: { cols: 6, rows: 6 },
		frames: 36,
		tick: 0.05,
		note: "Nine frames to a step, eighteen to a stride. The parallax band derives Bo's ground speed from this cadence, so it is not a free parameter.",
	},
	{
		key: "bo-walk-left",
		title: "Walk, west",
		file: "sprites/bo-walk-left.png",
		frame: { w: 160, h: 157 },
		grid: { cols: 6, rows: 6 },
		frames: 36,
		tick: 0.05,
		note: "A separate drawing, never a mirror of the east sheet. Bo is asymmetric: the bindle hangs from one specific arm, and flipping hands it to the other.",
	},
	{
		key: "bo-idle",
		title: "Idle — rest, hop, blink",
		file: "sprites/bo-idle.png",
		frame: { w: 207, h: 230 },
		grid: { cols: 12, rows: 1 },
		frames: 12,
		tick: 0.095,
		note: "Frame 0 rest, 1–10 a hop that lands back on rest, 11 blink. The three states are independent, so a clip can start or stop without a pop.",
	},
	{
		key: "bo-stand",
		title: "Stand — rest, breath, blink",
		file: "sprites/bo-stand.png",
		frame: { w: 207, h: 230 },
		grid: { cols: 12, rows: 1 },
		frames: 12,
		tick: 0.095,
		note: "Same contract as idle, different register: the cycle is a breath anchored at the feet, so he never leaves the ground. Rest and blink share identical alpha — 0 differing pixels.",
	},
];

export type Plate = {
	key: string;
	title: string;
	file: string;
	speed: number;
	note: string;
};

/** Scenery, back to front. Speed is relative to the ground. */
export const PLATES: Plate[] = [
	{ key: "sky", title: "Sky", file: "plates/sky.png", speed: 0.12, note: "Furthest back. Clouds over a faint ridge, and mostly empty paper — the emptiness is the point." },
	{ key: "hills", title: "Hills", file: "plates/hills.png", speed: 0.4, note: "Distant horizon. Its flat base sits at scene unit 199, one unit above where the ground plane starts, so it reads as the horizon rather than floating." },
	{ key: "poles", title: "Telephone poles", file: "plates/poles.png", speed: 0.55, note: "Kept dark at night and given a rim instead of inverting — a creosote post is dark at noon and at midnight." },
	{ key: "trail", title: "Trail", file: "plates/trail.png", speed: 1, note: "The ground behind Bo." },
	{ key: "trail-front", title: "Trail, near bank", file: "plates/trail-front.png", speed: 1, note: "Passes in front of his feet." },
];

export type Reference = {
	key: string;
	title: string;
	file: string;
	note: string;
	wide?: boolean;
};

export const TURNAROUND: Reference[] = [
	{ key: "front", title: "Front", file: "reference/turnaround-front.webp", note: "Bindle over one shoulder." },
	{ key: "quarter", title: "Three-quarter", file: "reference/turnaround-quarter.webp", note: "45° toward screen-right." },
	{ key: "side", title: "Side", file: "reference/turnaround-side.webp", note: "Profile, facing screen-right." },
	{ key: "back", title: "Back", file: "reference/turnaround-back.webp", note: "No eyes — silhouette only." },
];

export const SHEETS: Reference[] = [
	{
		key: "expressions",
		title: "Expressions",
		file: "reference/expressions.webp",
		wide: true,
		note: "Sixteen faces on one identical body. Bo has no mouth and no nose, so the eyes and brow carry every reading — which is why this sheet exists at all.",
	},
	{
		key: "poses",
		title: "Poses",
		file: "reference/poses.webp",
		wide: true,
		note: "Twelve whole-body poses at one scale. Reference for new sprite work: match the silhouette here before drawing frames.",
	},
	{
		key: "props",
		title: "Props",
		file: "reference/props.webp",
		wide: true,
		note: "The kit. Drawn as outline rather than solid fill, the same treatment the bindle bundle gets in the sprite sheets — props are objects, not soot.",
	},
];
