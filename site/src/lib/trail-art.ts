// ==========================================================================
// What the trail band draws for itself (see ParallaxTrail.astro).
//
// Almost nothing, on purpose. The scenery — clouds, the horizon, the poles,
// the ground Bo walks on — is supplied artwork, cropped from the reference
// plates and looped as given (see ./trail-plates.ts). The only thing left to
// draw is the telephone wire, because a wire is not an object you can crop:
// it has to span whatever gap the poles happen to leave and close cleanly
// across the tile seam. So it is generated here, as the simple stroked curve
// it actually is, and nothing else is.
//
// The tile is 1200x300, the same geometry every other layer uses, so once CSS
// pins it to the band height the wires cannot drift away from the poles they
// hang between.
// ==========================================================================

const TW = 1200; // tile width, in tile units
export const TH = 300; // tile height, in tile units

/** Where Bo's feet land — on the near edge of the path in the ground plate. */
export const BO_FEET = 268;

const INK = "__INK__";
const PAPER = "__PAPER__";

const n = (v: number) => String(Math.round(v * 10) / 10);

// Pole centres, in tile units, as `plates/poles.png` places them: that plate
// is 2400px wide for a 1200-unit tile, so a plate x is half a tile x. Recompose
// the plate and these three numbers move with it, or the wires miss the poles.
const POLE_XS = [138, 555.5, 914.5];
const WIRE_Y = 120; // the crossarm, a tenth of the way down a 100-unit pole

/**
 * A sagging wire between two poles. The dip grows with the span the way a real
 * catenary does, which is the whole reason this is drawn rather than cropped.
 */
function wire(x1: number, x2: number, sw: number): string {
	const sag = Math.min(26, Math.max(8, (x2 - x1) * 0.045));
	return (
		`<path d="M${n(x1)} ${n(WIRE_Y)}` +
		`C${n(x1 + (x2 - x1) * 0.31)} ${n(WIRE_Y + sag)} ` +
		`${n(x1 + (x2 - x1) * 0.69)} ${n(WIRE_Y + sag)} ` +
		`${n(x2)} ${n(WIRE_Y)}" ` +
		`fill="none" stroke="${INK}" stroke-width="${n(sw)}" stroke-linecap="round"/>`
	);
}

/**
 * The wires, as one tile. The run continues past both edges — the last pole in
 * the tile is wired to the first pole of the next copy, and the first to the
 * last of the previous — so the line never stops at the seam.
 */
function layerWires(): string {
	const xs = [POLE_XS[POLE_XS.length - 1] - TW, ...POLE_XS, POLE_XS[0] + TW];
	const spans: string[] = [];
	for (let i = 0; i < xs.length - 1; i++) spans.push(wire(xs[i], xs[i + 1], 2.6));
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW} ${TH}" ` +
		`preserveAspectRatio="none">${spans.join("")}</svg>`
	);
}

export const THEMES = {
	light: { ink: "#101010", paper: "#ffffff" },
	dark: { ink: "#f2f1ec", paper: "#0a0a0a" },
} as const;

export type ThemeName = keyof typeof THEMES;

/**
 * Seconds for one 1200-unit tile of travel — set by Bo's gait, not by taste.
 *
 * Measured off the sprite sheet: his planted foot tracks backwards about
 * 11px of a 554px frame per frame, and the export's own timing is 50ms a
 * frame, so at the size the band draws him he covers ~52 tile units a second.
 * Run the trail any faster and he ice-skates; any slower and he moonwalks.
 *
 * Every layer's duration is derived from this and its own tile width, so a
 * plate with a different aspect ratio still travels at the speed it claims.
 */
export const TRAIL_SECONDS = 23.1;

/** Drawn layers, with the depth order they share with the plates. */
export const TRAIL_LAYERS = [
	{ key: "wires", speed: 0.55, order: 50, tone: 0.74, svg: layerWires() },
] as const;

export type TrailLayerKey = (typeof TRAIL_LAYERS)[number]["key"];

/** Substitute one theme's two inks into a tile. */
export function paint(svg: string, theme: ThemeName): string {
	const { ink, paper } = THEMES[theme];
	return svg.split(INK).join(ink).split(PAPER).join(paper);
}
