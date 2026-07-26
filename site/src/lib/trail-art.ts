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

type Puff = { cx: number; cy: number; r: number };

/**
 * The real outline of a run of overlapping circles, closed along a flat base:
 * one continuous path of true arcs, so the silhouette is clean and there are
 * no interior lines needing a second pass to erase. The first and last circle
 * must be centred on the base line — that is what lets the curve meet the
 * base squarely and close with a straight bottom, the way a drawn cloud does.
 */
function puffOutline(puffs: Puff[]): string {
	// Angles run 180deg (leftmost) to 360deg (rightmost) over the top.
	const over = (p: Puff, x: number, y: number) => {
		const t = Math.atan2(y - p.cy, x - p.cx);
		return t <= 0 ? t + Math.PI * 2 : t;
	};
	// Upper crossing of two consecutive circles.
	const meet = (p: Puff, q: Puff): [number, number] => {
		const dx = q.cx - p.cx;
		const dy = q.cy - p.cy;
		const d = Math.hypot(dx, dy);
		const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d);
		const h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
		return [p.cx + (a * dx) / d + (h * dy) / d, p.cy + (a * dy) / d - (h * dx) / d];
	};

	const first = puffs[0];
	const last = puffs[puffs.length - 1];
	let from: [number, number] = [first.cx - first.r, first.cy];
	let d = `M${n(from[0])} ${n(from[1])}`;
	for (let i = 0; i < puffs.length; i++) {
		const p = puffs[i];
		const to: [number, number] =
			i === puffs.length - 1 ? [last.cx + last.r, last.cy] : meet(p, puffs[i + 1]);
		const swept = over(p, to[0], to[1]) - over(p, from[0], from[1]);
		d += `A${n(p.r)} ${n(p.r)} 0 ${swept > Math.PI ? 1 : 0} 1 ${n(to[0])} ${n(to[1])}`;
		from = to;
	}
	// Z draws the flat bottom, both ends being on the base line.
	return `${d}Z`;
}

/** Silhouettes as [dx, dy, r] from the left end. Ends sit on the base line. */
const CLOUD_SHAPES = [
	[[0, 0, 15], [26, -14, 22], [58, -20, 26], [90, -8, 20], [116, 0, 14]],
	[[0, 0, 12], [22, -10, 18], [48, -16, 22], [72, -6, 16], [94, 0, 12]],
	[[0, 0, 10], [20, -12, 17], [42, -4, 14], [60, 0, 9]],
] as const;

const BUSH_SHAPES = [
	[[0, 0, 9], [16, -9, 14], [36, -5, 12], [52, 0, 8]],
	[[0, 0, 8], [14, -11, 15], [34, -3, 11], [48, 0, 7]],
	[[0, 0, 7], [13, -7, 11], [28, 0, 8]],
] as const;

const BANK_SHAPES = [
	[[0, 0, 14], [24, -10, 20], [54, -14, 24], [86, -6, 19], [110, 0, 13]],
	[[0, 0, 11], [20, -13, 19], [46, -7, 15], [66, 0, 10]],
] as const;

type Shape = ReadonlyArray<readonly [number, number, number] | readonly number[]>;

function laid(shape: Shape, x: number, base: number, s: number): Puff[] {
	return shape.map((c) => ({ cx: x + c[0] * s, cy: base + c[1] * s, r: c[2] * s }));
}

/** Mirror half of them, so a repeated silhouette does not read as repeated. */
function maybeFlip(r: () => number, art: string, x: number, width: number) {
	return r() > 0.5 ? `<g transform="translate(${n(2 * x + width)} 0) scale(-1 1)">${art}</g>` : art;
}

/** Puffy cartoon cloud: one path, flat bottom, rounded humps. */
function cloud(r: () => number, x: number, base: number, s: number, sw: number) {
	const shape = CLOUD_SHAPES[Math.floor(r() * CLOUD_SHAPES.length)];
	const puffs = laid(shape, x, base, s);
	const w = shape[shape.length - 1][0] * s;
	// The plate draws a shallow arc inside the base — the cloud's underside.
	const smile =
		w > 30
			? `<path d="M${n(x + w * 0.3)} ${n(base - 3 * s)}q${n(w * 0.13)} ${n(4 * s)} ${n(w * 0.26)} 0" fill="none" stroke="${INK}" stroke-width="${n(sw * 0.85)}" stroke-linecap="round"/>`
			: "";
	const art = `<path d="${puffOutline(puffs)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(sw)}" stroke-linejoin="round"/>${smile}`;
	return maybeFlip(r, art, x, w);
}

/** The same shape language, lower and thicker-lined: a roadside bush. */
function bush(r: () => number, x: number, base: number, s: number) {
	const shape = BUSH_SHAPES[Math.floor(r() * BUSH_SHAPES.length)];
	const puffs = laid(shape, x, base, s);
	const art = `<path d="${puffOutline(puffs)}" fill="${PAPER}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`;
	return maybeFlip(r, art, x, shape[shape.length - 1][0] * s);
}

/** A mass on the far horizon — solid when near the line, outlined above it. */
function bank(r: () => number, x: number, base: number, s: number, solid: boolean) {
	const shape = BANK_SHAPES[Math.floor(r() * BANK_SHAPES.length)];
	const d = puffOutline(laid(shape, x, base, s));
	const art = solid
		? `<path d="${d}" fill="${INK}"/>`
		: `<path d="${d}" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
	return maybeFlip(r, art, x, shape[shape.length - 1][0] * s);
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
		`q${n(rx * 0.85)} 0 ${n(rx)} ${n(ry * 1.45)}Z" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>`
	);
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

/** Furthest back: solid scrub hugging the horizon under thin outlined humps. */
function layerFar(): string {
	const r = rng(0x5eed01);
	const span = [
		`<path d="${seamlessBand(
			(x) =>
				FAR_BASE +
				wave(x, [
					[1.4, 1, 0.1],
					[0.8, 3, 0.6],
				]),
			() => 1.8,
			60,
		)}" fill="${INK}"/>`,
	];
	const props: string[] = [];
	// Big pale humps behind, then the solid dark masses sitting on the line.
	for (let i = 0; i < 3; i++) {
		props.push(bank(r, between(r, 0, TW), FAR_BASE, between(r, 1.1, 1.6), false));
	}
	for (let i = 0; i < 6; i++) {
		props.push(bank(r, between(r, 0, TW), FAR_BASE, between(r, 0.35, 0.6), true));
	}
	// One small arched bridge, because the reference plate has one.
	const bx = 690;
	props.push(
		`<path d="M${n(bx - 26)} ${n(FAR_BASE - 1)}q26 -17 52 0" fill="none" stroke="${INK}" stroke-width="2.4"/>` +
			[0, 1, 2, 3, 4]
				.map((i) => {
					const t = 0.16 + i * 0.17;
					return `<path d="M${n(bx - 26 + 52 * t)} ${n(FAR_BASE - 1 - 34 * t * (1 - t))}V${n(FAR_BASE - 1)}" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
				})
				.join(""),
	);
	// A couple of small clouds floating clear of the bank, each with a dot.
	for (let i = 0; i < 2; i++) {
		const x = between(r, 0, TW);
		const y = FAR_BASE - between(r, 26, 44);
		props.push(cloud(r, x, y, 0.3, 2));
		props.push(`<circle cx="${n(x + 44)}" cy="${n(y - 3)}" r="2.4" fill="none" stroke="${INK}" stroke-width="1.8"/>`);
	}
	return tile(span, props, []);
}

/** Sky traffic: clouds with a thin line, birds in twos, a curl of wind. */
function layerClouds(): string {
	const r = rng(0x5eed02);
	const props: string[] = [];
	for (const x of [40, 330, 620, 930]) {
		props.push(
			cloud(r, x + between(r, -25, 25), between(r, 68, 118), between(r, 0.7, 1.05), 2.2),
		);
	}
	// Birds travel in small flocks, not evenly scattered.
	for (let i = 0; i < 3; i++) {
		const x = between(r, 0, TW);
		const y = between(r, 34, 92);
		const count = 2 + Math.floor(r() * 2);
		for (let j = 0; j < count; j++) {
			props.push(
				bird(x + j * between(r, 14, 26), y + between(r, -9, 9), between(r, 0.8, 1.2)),
			);
		}
	}
	for (let i = 0; i < 2; i++) {
		props.push(swirl(between(r, 0, TW), between(r, 58, 116), between(r, 0.8, 1.1)));
	}
	return tile([], props, []);
}

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

	for (let i = 0; i < 5; i++) {
		props.push(bush(r, between(r, 0, TW), MID_BASE, between(r, 0.95, 1.35)));
	}
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
	// Stones come in twos and threes, not evenly spaced.
	for (const at of [90, 415, 760, 1060]) {
		const x = at + between(r, -40, 40);
		const count = 1 + Math.floor(r() * 3);
		for (let i = 0; i < count; i++) {
			const px = x + i * between(r, 16, 26);
			props.push(rock(r, px, top(px) + 1, between(r, 8, 13)));
		}
	}
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
	for (let i = 0; i < 12; i++) {
		props.push(
			`<circle cx="${n(between(r, 0, TW))}" cy="${n(between(r, HORIZON + 10, NEAR - 8))}" r="${n(between(r, 0.9, 1.6))}" fill="${INK}" opacity="0.5"/>`,
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

	for (const at of [60, 330, 640, 950]) {
		const x = at + between(r, -40, 40);
		const count = 1 + Math.floor(r() * 3);
		for (let i = 0; i < count; i++) {
			const px = x + i * between(r, 20, 32);
			back.push(rock(r, px, top(px) + 2, between(r, 11, 18)));
		}
	}
	for (let i = 0; i < 7; i++) {
		const x = between(r, 0, TW);
		back.push(tuft(r, x, top(x) + 1, between(r, 16, 24), 2.3));
	}
	// The tall stuff, reaching up past Bo's feet.
	for (let i = 0; i < 5; i++) {
		const x = between(r, 0, TW);
		front.push(tuft(r, x, top(x) + 1, between(r, 28, 40), 2.5));
	}
	for (let i = 0; i < 2; i++) {
		const x = between(r, 0, TW);
		front.push(rock(r, x, top(x) + 2, between(r, 16, 22)));
	}
	// Puffball flowers on thin stems, like the reference plate.
	for (let i = 0; i < 3; i++) {
		const x = between(r, 0, TW);
		const head = top(x) - between(r, 26, 36);
		front.push(
			`<path d="M${n(x + 12)} ${n(head + 16)}q${n(between(r, -4, 4))} -9 0 -16" fill="none" stroke="${INK}" stroke-width="2"/>` +
				cloud(r, x, head, 0.34, 2.2),
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
 * frame, so at the size the band draws him he covers ~42 tile units a second.
 * One tile is 1200 units. Run the trail any faster and he ice-skates; any
 * slower and he moonwalks.
 */
export const TRAIL_SECONDS = 28.4;

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
