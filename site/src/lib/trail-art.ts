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

const FAR_BASE = 214; // distant cloud bank sits on this line
const MID_BASE = 230; // poles, bushes and fence posts stand here
const HORIZON = 236; // far edge of the trail
const NEAR = 287; // near bank of the trail
export const BO_FEET = 272; // where Bo's feet land on the path

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

const circles = (
	ps: ReadonlyArray<{ cx: number; cy: number; r: number }>,
	attrs: string,
) =>
	ps
		.map((p) => `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}"${attrs}/>`)
		.join("");

/** Puffy cartoon cloud: stroke every circle, then erase the interior lines. */
function cloud(r: () => number, cx: number, cy: number, s: number, sw: number) {
	const shape = [
		[-36, 2, 20],
		[-11, -14, 24],
		[19, -4, 19],
		[40, 9, 14],
		[2, 8, 22],
	] as const;
	const ps = shape.map(([dx, dy, rad]) => ({
		cx: cx + dx * s,
		cy: cy + dy * s,
		r: rad * s * between(r, 0.88, 1.14),
	}));
	return (
		circles(ps, ` fill="${PAPER}" stroke="${INK}" stroke-width="${n(sw)}"`) +
		circles(ps, ` fill="${PAPER}"`)
	);
}

/** Same trick, flat-bottomed: a roadside bush. */
function bush(r: () => number, cx: number, base: number, s: number) {
	const shape = [
		[-20, -8, 13],
		[-4, -17, 16],
		[14, -9, 12],
		[24, -3, 8],
		[-26, -2, 8],
	] as const;
	const ps = shape.map(([dx, dy, rad]) => ({
		cx: cx + dx * s,
		cy: base + dy * s,
		r: rad * s * between(r, 0.85, 1.15),
	}));
	return (
		circles(ps, ` fill="${PAPER}" stroke="${INK}" stroke-width="2.2"`) +
		circles(ps, ` fill="${PAPER}"`)
	);
}

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

/** Outlined stone resting on a ridge. */
function rock(r: () => number, x: number, base: number, rad: number) {
	const rx = rad * between(r, 1.05, 1.45);
	const ry = rad * between(r, 0.62, 0.86);
	return (
		`<path d="M${n(x - rx)} ${n(base)}q${n(rx * 0.18)} ${n(-ry * 1.5)} ${n(rx)} ${n(-ry * 1.45)}` +
		`q${n(rx * 0.85)} 0 ${n(rx)} ${n(ry * 1.45)}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`
	);
}

/** Telephone pole: tapered post, tie-off knot, two insulators. */
function pole(x: number, topY: number, base: number, lean: number) {
	const tx = x + lean;
	return (
		`<path d="M${n(x - 3.9)} ${n(base)}L${n(x + 3.9)} ${n(base)}L${n(tx + 2.4)} ${n(topY)}L${n(tx - 2.4)} ${n(topY)}Z" fill="${INK}"/>` +
		`<circle cx="${n(tx - 5.2)}" cy="${n(topY + 1.5)}" r="2.8" fill="${INK}"/>` +
		`<circle cx="${n(tx + 5.2)}" cy="${n(topY + 1.5)}" r="2.8" fill="${INK}"/>` +
		`<path d="M${n(tx - 6.5)} ${n(topY - 2)}q${n(6.5)} ${n(-6)} ${n(13)} 0" fill="none" stroke="${INK}" stroke-width="2"/>`
	);
}

/** Sagging wire between two points. */
const wire = (x1: number, x2: number, y: number, sag: number, sw = 1.6) =>
	`<path d="M${n(x1)} ${n(y)}Q${n((x1 + x2) / 2)} ${n(y + sag)} ${n(x2)} ${n(y)}" fill="none" stroke="${INK}" stroke-width="${n(sw)}"/>`;

/** Fence post: a little tombstone. */
const fencePost = (x: number, base: number, h: number) =>
	`<path d="M${n(x - 3.4)} ${n(base)}L${n(x - 3.4)} ${n(base - h + 3.4)}` +
	`a3.4 3.4 0 0 1 6.8 0L${n(x + 3.4)} ${n(base)}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;

/** Signpost pointing up the road (mirrored by the caller to point back). */
function signpost(x: number, base: number, h: number, flip: boolean) {
	const y = base - h;
	const art =
		`<path d="M${n(x - 2.2)} ${n(base)}L${n(x - 2.2)} ${n(y - 5)}L${n(x + 2.2)} ${n(y - 5)}L${n(x + 2.2)} ${n(base)}Z" fill="${INK}"/>` +
		`<path d="M${n(x - 3)} ${n(y)}H${n(x + 24)}L${n(x + 31)} ${n(y + 6)}L${n(x + 24)} ${n(y + 12)}H${n(x - 3)}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
		`<path d="M${n(x + 2)} ${n(y + 6)}h14" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.7"/>` +
		`<circle cx="${n(x)}" cy="${n(y - 3.5)}" r="2.4" fill="${INK}"/>`;
	return flip ? `<g transform="translate(${n(2 * x)} 0) scale(-1 1)">${art}</g>` : art;
}

/** Bird: the two-stroke gull everyone draws. */
const bird = (x: number, y: number, s: number) =>
	`<path d="M${n(x - 5 * s)} ${n(y)}q${n(2.6 * s)} ${n(-3.4 * s)} ${n(5 * s)} 0q${n(2.4 * s)} ${n(-3.4 * s)} ${n(5 * s)} 0" fill="none" stroke="${INK}" stroke-width="${n(1.5 * s)}" stroke-linecap="round"/>`;

/** Curl of wind. */
const swirl = (x: number, y: number, s: number) =>
	`<path d="M${n(x - 26 * s)} ${n(y)}q${n(14 * s)} ${n(-9 * s)} ${n(26 * s)} ${n(-2 * s)}` +
	`q${n(9 * s)} ${n(5 * s)} ${n(2 * s)} ${n(8 * s)}q${n(-6 * s)} ${n(2 * s)} ${n(-5 * s)} ${n(-4 * s)}" ` +
	`fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`;

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

/** Furthest back: a cloud bank hugging the horizon, with a bridge on it. */
function layerFar(): string {
	const r = rng(0x5eed01);
	const span = [
		`<path d="${seamlessBand(
			(x) =>
				FAR_BASE +
				wave(x, [
					[1.6, 1, 0.1],
					[0.9, 3, 0.6],
				]),
			() => 2.2,
			60,
		)}" fill="${INK}"/>`,
	];
	const props: string[] = [];

	for (let i = 0; i < 30; i++) {
		const rad = between(r, 7, 22);
		props.push(
			`<circle cx="${n(between(r, 0, TW))}" cy="${n(FAR_BASE - rad * 0.42)}" r="${n(rad)}" fill="${INK}"/>`,
		);
	}
	for (let i = 0; i < 9; i++) {
		const x = between(r, 0, TW);
		const rad = between(r, 22, 58);
		props.push(
			`<path d="M${n(x - rad)} ${n(FAR_BASE)}a${n(rad)} ${n(rad * between(r, 0.55, 0.8))} 0 0 1 ${n(rad * 2)} 0Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`,
		);
	}
	// One tiny bridge, because the reference art has one.
	const bx = 690;
	props.push(
		`<path d="M${n(bx - 30)} ${n(FAR_BASE - 1)}q30 -19 60 0" fill="none" stroke="${INK}" stroke-width="2.4"/>` +
			[0, 1, 2, 3, 4]
				.map((i) => {
					const t = 0.16 + i * 0.17;
					const px = bx - 30 + 60 * t;
					const py = FAR_BASE - 1 - 38 * t * (1 - t);
					return `<path d="M${n(px)} ${n(py)}V${n(FAR_BASE - 1)}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
				})
				.join(""),
	);
	for (let i = 0; i < 3; i++) {
		props.push(
			cloud(r, between(r, 0, TW), FAR_BASE - between(r, 24, 42), 0.34, 2.2),
		);
	}
	return tile(span, props, []);
}

/** Sky traffic: clouds, birds, a curl of wind. */
function layerClouds(): string {
	const r = rng(0x5eed02);
	const props: string[] = [];
	for (const x of [70, 300, 520, 760, 1010]) {
		props.push(
			cloud(
				r,
				x + between(r, -30, 30),
				between(r, 42, 118),
				between(r, 0.62, 1),
				2.6,
			),
		);
	}
	for (let i = 0; i < 7; i++) {
		props.push(bird(between(r, 0, TW), between(r, 26, 108), between(r, 0.75, 1.25)));
	}
	for (let i = 0; i < 3; i++) {
		props.push(swirl(between(r, 0, TW), between(r, 50, 112), between(r, 0.7, 1.1)));
	}
	return tile([], props, []);
}

/** Midground: poles and wires, plus everything growing beside the trail. */
function layerPoles(): string {
	const r = rng(0x5eed03);
	const props: string[] = [];
	// Below the midground baseline is ground, so it is paper — which is also
	// what flattens the bottom of every bush standing on it.
	const after = [
		`<rect x="-4" y="${n(MID_BASE)}" width="${TW + 8}" height="${TH - MID_BASE}" fill="${PAPER}"/>`,
	];

	const poleXs = [110, 520, 900];
	const topY = 62;
	for (let i = 0; i < poleXs.length; i++) {
		const last = i === poleXs.length - 1;
		props.push(
			wire(poleXs[i], poleXs[(i + 1) % poleXs.length] + (last ? TW : 0), topY + 4, 30),
		);
	}
	for (const x of poleXs) props.push(pole(x, topY, MID_BASE + 2, between(r, -4, 4)));

	for (let i = 0; i < 7; i++) {
		props.push(bush(r, between(r, 0, TW), MID_BASE, between(r, 0.62, 1)));
	}
	for (const cluster of [140, 400, 660, 1040]) {
		const count = 2 + Math.floor(r() * 2);
		const gap = between(r, 34, 50);
		const hs = Array.from({ length: count }, () => between(r, 15, 22));
		for (let i = 0; i < count - 1; i++) {
			props.push(
				wire(
					cluster + i * gap,
					cluster + (i + 1) * gap,
					MID_BASE - Math.min(hs[i], hs[i + 1]) * 0.62,
					4,
					1.3,
				),
			);
		}
		for (let i = 0; i < count; i++) props.push(fencePost(cluster + i * gap, MID_BASE, hs[i]));
	}
	props.push(signpost(300, MID_BASE, 30, false));
	props.push(signpost(840, MID_BASE, 27, true));

	for (let i = 0; i < 14; i++) {
		props.push(tuft(r, between(r, 0, TW), MID_BASE, between(r, 7, 12), 1.5));
	}
	// Broken dashes of far ground, so nothing looks like it is floating.
	for (let i = 0; i < 22; i++) {
		after.push(
			`<path d="M${n(between(r, 0, TW))} ${n(MID_BASE + between(r, -1, 1.5))}h${n(between(r, 8, 24))}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" opacity="0.42"/>`,
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
			[2.4, 1, 0.2],
			[1.5, 3, 0.55],
			[0.8, 7, 0.1],
		]);
	const span = [
		`<path d="${seamlessBand(
			top,
			(x) =>
				3.4 +
				wave(x, [
					[1.5, 2, 0.3],
					[0.9, 5, 0.8],
				]),
			30,
		)}" fill="${INK}"/>`,
	];
	const props: string[] = [];
	for (let i = 0; i < 12; i++) {
		const x = between(r, 0, TW);
		props.push(rock(r, x, top(x) + 1, between(r, 4, 8)));
	}
	for (let i = 0; i < 16; i++) {
		const x = between(r, 0, TW);
		props.push(tuft(r, x, top(x) + 1, between(r, 6, 11), 1.6));
	}
	// Ruts and scuffs across the path surface.
	for (let i = 0; i < 28; i++) {
		const w = between(r, 5, 20) * (r() > 0.5 ? 1 : -1);
		props.push(
			`<path d="M${n(between(r, 0, TW))} ${n(between(r, HORIZON + 10, NEAR - 8))}q${n(w / 2)} ${n(between(r, -1.6, 1.6))} ${n(w)} 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>`,
		);
	}
	for (let i = 0; i < 14; i++) {
		props.push(
			`<circle cx="${n(between(r, 0, TW))}" cy="${n(between(r, HORIZON + 8, NEAR - 6))}" r="${n(between(r, 0.9, 1.9))}" fill="${INK}" opacity="0.5"/>`,
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
			[3, 1, 0.6],
			[1.8, 2, 0.15],
			[1, 5, 0.42],
		]);
	const span = [
		`<path d="${seamlessBand(
			top,
			(x) =>
				5.5 +
				wave(x, [
					[2, 3, 0.7],
					[1.2, 6, 0.2],
				]),
			30,
		)}" fill="${INK}"/>`,
	];
	const back: string[] = [];
	const front: string[] = [];

	for (let i = 0; i < 13; i++) {
		const x = between(r, 0, TW);
		back.push(rock(r, x, top(x) + 2, between(r, 6, 12)));
	}
	for (let i = 0; i < 16; i++) {
		const x = between(r, 0, TW);
		back.push(tuft(r, x, top(x) + 1, between(r, 9, 15), 1.9));
	}
	// The tall stuff, reaching up past Bo's feet.
	for (let i = 0; i < 9; i++) {
		const x = between(r, 0, TW);
		front.push(tuft(r, x, top(x) + 1, between(r, 20, 30), 2.1));
	}
	for (let i = 0; i < 4; i++) {
		const x = between(r, 0, TW);
		front.push(rock(r, x, top(x) + 2, between(r, 11, 16)));
	}
	// Puffball flowers, like the reference art.
	for (let i = 0; i < 5; i++) {
		const x = between(r, 0, TW);
		const y = top(x) - between(r, 18, 27);
		front.push(
			`<path d="M${n(x)} ${n(y + 11)}q${n(between(r, -3, 3))} -6 0 -10" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
				cloud(r, x, y, 0.13, 2),
		);
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
 * frame, so at the size the band draws him he covers ~45 tile units a second.
 * One tile is 1200 units. Run the trail any faster and he ice-skates; any
 * slower and he moonwalks.
 */
export const TRAIL_SECONDS = 26.5;

const fore = layerFore();

/** Back to front. `front` is the only one drawn on Bo's side of the sprite. */
export const TRAIL_LAYERS = [
	{ key: "far", speed: 0.12, svg: layerFar() },
	{ key: "clouds", speed: 0.28, svg: layerClouds() },
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
