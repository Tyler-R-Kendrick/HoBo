// ==========================================================================
// The drawing behind the parallax trail band (see ParallaxTrail.astro).
//
// Every layer is one 1200x300 tile. Layers all share that geometry, so once
// CSS pins the tile to the band height they can never drift out of vertical
// alignment; the only thing that differs is how fast one tile goes by.
//
// A tile has to repeat invisibly, so art is built one of two ways: shapes
// that span the width (ridges, the ground line) are periodic by construction,
// and everything else is a discrete prop, drawn again at -1200 and +1200 so a
// prop straddling an edge reappears on the other side.
//
// Ink and paper are left as placeholders here and substituted per theme when
// the tile is served, because the drawing needs two colours — the line, and
// the paper fill that lets a cloud hide what is behind it.
// ==========================================================================

const TW = 1200; // tile width, in tile units
export const TH = 300; // tile height, in tile units

const FAR_BASE = 202; // distant scrub, just beyond the fence line
const MID_BASE = 212; // poles, bushes and fence posts stand here
const HORIZON = 222; // far edge of the trail
const NEAR = 286; // near bank of the trail
export const BO_FEET = 264; // where Bo's feet land on the path

/** Deterministic PRNG — the scene must come out identical on every build. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const n = (v: number) => String(Math.round(v * 10) / 10);
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);

type Term = [amp: number, cycles: number, phase: number];

/** Periodic by construction: whole numbers of cycles across one tile. */
const wave = (x: number, terms: readonly Term[]) =>
	terms.reduce(
		(s, [a, f, p]) => s + a * Math.sin(2 * Math.PI * (f * (x / TW) + p)),
		0,
	);

/**
 * A smooth line through samples of `f`, built so the curve leaving x=1200 is
 * the exact continuation of the one entering x=0 — tangent included. It
 * oversamples a step past each edge and draws through midpoints, which puts
 * the seam in the middle of a curve segment instead of at a join.
 */
function seamlessLine(f: (x: number) => number, step: number): string {
	const pts: Array<[number, number]> = [];
	for (let x = -step; x <= TW + step; x += step) pts.push([x, f(x)]);
	return midpointPath(pts);
}

function midpointPath(pts: Array<[number, number]>): string {
	const mid = (i: number): [number, number] => [
		(pts[i][0] + pts[i + 1][0]) / 2,
		(pts[i][1] + pts[i + 1][1]) / 2,
	];
	const [sx, sy] = mid(0);
	let d = `M${n(sx)} ${n(sy)}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const [mx, my] = mid(i);
		d += `Q${n(pts[i][0])} ${n(pts[i][1])} ${n(mx)} ${n(my)}`;
	}
	return d;
}

/** The same idea closed into a filled brush stroke of varying thickness. */
function seamlessBand(
	top: (x: number) => number,
	thick: (x: number) => number,
	step: number,
): string {
	const under: Array<[number, number]> = [];
	for (let x = TW + step; x >= -step; x -= step) under.push([x, top(x) + thick(x)]);
	const back = midpointPath(under);
	return `${seamlessLine(top, step)}L${back.slice(1)}Z`;
}

// ---------- pieces of the drawing ----------

const INK = "__INK__";
const PAPER = "__PAPER__";

/** A few blades of grass fanned out from one spot. */
function tuft(r: () => number, x: number, base: number, h: number, sw: number) {
	let d = "";
	const blades = 3 + Math.floor(r() * 3);
	for (let i = 0; i < blades; i++) {
		const lean = between(r, -0.85, 0.85);
		const len = h * between(r, 0.6, 1.05);
		d +=
			`M${n(x + (i - blades / 2) * 1.7)} ${n(base)}` +
			`q${n(lean * len * 0.25)} ${n(-len * 0.6)} ${n(lean * len * 0.9)} ${n(-len)}`;
	}
	return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
}

/** Telephone pole: tapered post, tie-off knot, two insulators. */
function pole(x: number, topY: number, base: number, lean: number) {
	const tx = x + lean;
	return (
		`<path d="M${n(x - 5.5)} ${n(base)}L${n(x + 5.5)} ${n(base)}L${n(tx + 3.4)} ${n(topY)}L${n(tx - 3.4)} ${n(topY)}Z" fill="${INK}"/>` +
		`<circle cx="${n(tx - 5.4)}" cy="${n(topY + 2.5)}" r="3" fill="${INK}"/>` +
		`<circle cx="${n(tx + 5.4)}" cy="${n(topY + 2.5)}" r="3" fill="${INK}"/>` +
		`<path d="M${n(tx - 5)} ${n(topY - 1)}q5 -6 10 0" fill="none" stroke="${INK}" stroke-width="2.4"/>`
	);
}

/** Sagging wire between two points. */
const wire = (x1: number, x2: number, y: number, sag: number, sw = 1.6) =>
	`<path d="M${n(x1)} ${n(y)}Q${n((x1 + x2) / 2)} ${n(y + sag)} ${n(x2)} ${n(y)}" fill="none" stroke="${INK}" stroke-width="${n(sw)}"/>`;

/** Fence post: a little tombstone. */
const fencePost = (x: number, base: number, h: number) =>
	`<path d="M${n(x - 6)} ${n(base)}L${n(x - 6)} ${n(base - h + 6)}` +
	`a6 6 0 0 1 12 0L${n(x + 6)} ${n(base)}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.8"/>`;

/** Signpost pointing up the road (mirrored by the caller to point back). */
function signpost(x: number, base: number, h: number, flip: boolean) {
	const y = base - h;
	const art =
		`<path d="M${n(x - 3.6)} ${n(base)}L${n(x - 3.6)} ${n(y - 8)}L${n(x + 3.6)} ${n(y - 8)}L${n(x + 3.6)} ${n(base)}Z" fill="${INK}"/>` +
		`<path d="M${n(x - 5)} ${n(y)}H${n(x + 34)}L${n(x + 46)} ${n(y + 10)}L${n(x + 34)} ${n(y + 20)}H${n(x - 5)}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.8"/>` +
		`<path d="M${n(x + 3)} ${n(y + 10)}h22" fill="none" stroke="${INK}" stroke-width="2" opacity="0.7"/>` +
		`<circle cx="${n(x)}" cy="${n(y - 6)}" r="4" fill="${INK}"/>`;
	return flip ? `<g transform="translate(${n(2 * x)} 0) scale(-1 1)">${art}</g>` : art;
}

/**
 * Wrap one layer's art into a tile. `props` are drawn three times — at -1200,
 * 0 and +1200 — so anything straddling an edge reappears on the other side.
 * `span` and `after` are already periodic and only need drawing once.
 */
function tile(span: string[], props: string[], after: string[]): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
		`viewBox="0 0 ${TW} ${TH}" preserveAspectRatio="none">` +
		span.join("") +
		`<g id="t">${props.join("")}</g>` +
		`<use href="#t" xlink:href="#t" x="${-TW}"/><use href="#t" xlink:href="#t" x="${TW}"/>` +
		after.join("") +
		"</svg>"
	);
}

// ---------- the layers, back to front ----------

/** Midground: poles and wires, plus what grows beside the trail. */
function layerPoles(): string {
	const r = rng(0x5eed03);
	const props: string[] = [];
	const after = [
		`<rect x="-4" y="${n(MID_BASE)}" width="${TW + 8}" height="${TH - MID_BASE}" fill="${PAPER}"/>`,
	];

	// The plate's poles are stout and only about as tall as they are apart is
	// wide, with a little tied-off bow at the top.
	const poleXs = [130, 545, 930];
	const topY = 60;
	for (let i = 0; i < poleXs.length; i++) {
		const last = i === poleXs.length - 1;
		props.push(
			wire(poleXs[i], poleXs[(i + 1) % poleXs.length] + (last ? TW : 0), topY + 5, 40),
		);
	}
	for (const x of poleXs) props.push(pole(x, topY, MID_BASE + 2, between(r, -3.5, 3.5)));

	for (const cluster of [180, 470, 800]) {
		const count = 2 + Math.floor(r() * 2);
		const gap = between(r, 38, 54);
		const hs = Array.from({ length: count }, () => between(r, 30, 42));
		for (let i = 0; i < count - 1; i++) {
			props.push(
				wire(
					cluster + i * gap,
					cluster + (i + 1) * gap,
					MID_BASE - Math.min(hs[i], hs[i + 1]) * 0.66,
					3,
					1.3,
				),
			);
		}
		for (let i = 0; i < count; i++) props.push(fencePost(cluster + i * gap, MID_BASE, hs[i]));
	}
	props.push(signpost(310, MID_BASE, 56, false));
	props.push(signpost(1020, MID_BASE, 50, true));

	for (let i = 0; i < 7; i++) {
		props.push(tuft(r, between(r, 0, TW), MID_BASE, between(r, 12, 18), 1.8));
	}
	for (let i = 0; i < 12; i++) {
		after.push(
			`<path d="M${n(between(r, 0, TW))} ${n(MID_BASE + between(r, -1, 1))}h${n(between(r, 10, 26))}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>`,
		);
	}
	return tile([], props, after);
}

/** The trail itself — Bo walks on this plane, so it sets the pace. */
function layerTrail(): string {
	const r = rng(0x5eed04);
	const top = (x: number) =>
		HORIZON +
		wave(x, [
			[2.6, 1, 0.2],
			[1.6, 3, 0.55],
			[0.9, 7, 0.1],
		]);
	// The plates draw both edges of the path as a bold, ragged brush stroke.
	const span = [
		`<path d="${seamlessBand(
			top,
			(x) =>
				6.5 +
				wave(x, [
					[2.2, 2, 0.3],
					[1.4, 5, 0.8],
				]),
			24,
		)}" fill="${INK}"/>`,
	];
	const props: string[] = [];
	for (let i = 0; i < 7; i++) {
		const x = between(r, 0, TW);
		props.push(tuft(r, x, top(x) + 1, between(r, 13, 19), 2));
	}
	for (let i = 0; i < 16; i++) {
		const w = between(r, 6, 18) * (r() > 0.5 ? 1 : -1);
		props.push(
			`<path d="M${n(between(r, 0, TW))} ${n(between(r, HORIZON + 12, NEAR - 10))}q${n(w / 2)} ${n(between(r, -1.4, 1.4))} ${n(w)} 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>`,
		);
	}
	return tile(span, props, []);
}

/**
 * The nearest bank. It comes in two tiles that scroll as one: the bank itself,
 * which sits behind Bo, and the tallest grass and stones, which are drawn in
 * front of him so his feet pass behind them. Splitting by object rather than
 * by a horizontal cut means nothing ever gets sliced in half.
 */
function layerFore(): { back: string; front: string } {
	const r = rng(0x5eed05);
	const top = (x: number) =>
		NEAR +
		wave(x, [
			[3.2, 1, 0.6],
			[1.9, 2, 0.15],
			[1, 5, 0.42],
		]);
	const span = [
		`<path d="${seamlessBand(
			top,
			(x) =>
				10 +
				wave(x, [
					[2.6, 3, 0.7],
					[1.5, 6, 0.2],
				]),
			24,
		)}" fill="${INK}"/>`,
	];
	const back: string[] = [];
	const front: string[] = [];

	for (let i = 0; i < 7; i++) {
		const x = between(r, 0, TW);
		back.push(tuft(r, x, top(x) + 1, between(r, 16, 24), 2.3));
	}
	// The tall stuff, reaching up past Bo's feet.
	for (let i = 0; i < 5; i++) {
		const x = between(r, 0, TW);
		front.push(tuft(r, x, top(x) + 1, between(r, 28, 40), 2.5));
	}
	return { back: tile(span, back, []), front: tile([], front, []) };
}

export const THEMES = {
	light: { ink: "#101010", paper: "#ffffff" },
	dark: { ink: "#f2f1ec", paper: "#0a0a0a" },
} as const;

export type ThemeName = keyof typeof THEMES;

/**
 * Seconds for one tile of travel — set by Bo's gait, not by taste.
 *
 * Measured off the sprite sheet: his planted foot tracks backwards about
 * 11px of a 554px frame per frame, and the export's own timing is 50ms a
 * frame, so at the size the band draws him he covers ~42 tile units a second.
 * One tile is 1200 units. Run the trail any faster and he ice-skates; any
 * slower and he moonwalks.
 */
export const TRAIL_SECONDS = 28.4;

const fore = layerFore();

/** Back to front. `front` is the only one drawn on Bo's side of the sprite. */
export const TRAIL_LAYERS = [
	{ key: "poles", speed: 0.55, svg: layerPoles() },
	{ key: "trail", speed: 1, svg: layerTrail() },
	{ key: "fore", speed: 1.5, svg: fore.back },
	{ key: "fore-front", speed: 1.5, svg: fore.front },
] as const;

export type TrailLayerKey = (typeof TRAIL_LAYERS)[number]["key"];

/** Substitute one theme's two inks into a tile. */
export function paint(svg: string, theme: ThemeName): string {
	const { ink, paper } = THEMES[theme];
	return svg.split(INK).join(ink).split(PAPER).join(paper);
}
