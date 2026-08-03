/**
 * YardScenePresenter — pure (state → declarative render model).
 * The Phaser scene reconciles this model into GameObjects; nothing here
 * imports Phaser, so render output is unit-testable headlessly.
 *
 * The yard is DIEGETIC: every zone is a piece of railroad property drawn as
 * 1930s ink line-art from stacked rects + lines — never a labelled white card.
 * Each prop carries a compact enamel sign (`sign-<zone>`) so the zone is still
 * nameable at a glance, and hovering a zone raises the lantern truth card
 * (`lantern-card`) which reads the real projection fields back verbatim.
 */

import type { YardVisualState } from "../entity-state.js";
import { YARD_LAYOUT, type ZoneId } from "../layout.js";
import type { TrainView } from "../trains.js";
import type { Waybill } from "../waybills.js";
import type { WorldView } from "../world-view.js";

export type TextStyleId = "label" | "caption" | "mono9" | "mono11" | "mono12";

export type RenderItem =
	| {
			kind: "rect";
			id: string;
			x: number;
			y: number;
			w: number;
			h: number;
			fill?: string;
			fillAlpha?: number;
			stroke?: string;
			lineWidth?: number;
			depth: number;
	  }
	| {
			kind: "line";
			id: string;
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			color: string;
			lineWidth: number;
			alpha?: number;
			depth: number;
	  }
	| {
			kind: "text";
			id: string;
			x: number;
			y: number;
			text: string;
			style: TextStyleId;
			color: string;
			depth: number;
	  }
	| {
			kind: "image";
			id: string;
			key: string;
			x: number;
			y: number;
			w: number;
			h: number;
			alpha?: number;
			depth: number;
	  }
	| {
			kind: "sprite";
			id: string;
			x: number;
			y: number;
			animationId: string;
			scale: number;
			/** 0..1 sprite alpha (idle NPCs dim to 0.6); default 1. */
			alpha?: number;
			depth: number;
			/** Frozen frame index for deterministic test mode; null = play clip. */
			testFrame: number | null;
	  };

export type RenderModel = Readonly<{ items: readonly RenderItem[] }>;

export type PresenterInput = Readonly<{
	visual: YardVisualState | null;
	boPos: { x: number; y: number };
	/** Resolved clip incl. transit walking (resolveBoTransitAnim). */
	boAnimationId: string;
	zone: ZoneId;
	selectedZone: ZoneId | null;
	/** Zone under the pointer — raises the lantern truth card (free read verb). */
	hoveredZone?: ZoneId | null;
	speech: string | null;
	particles: readonly { x: number; y: number; alive: boolean }[];
	testMode: boolean;
	ready: boolean;
	/** Image keys actually loaded (optional plates may be absent). */
	hasImage: (key: string) => boolean;
	/** World model view (camps + bindlebug NPCs); null before first snapshot. */
	world: WorldView | null;
	/** True when scenario snapshots drive the yard (synthetic data → badge). */
	scenarioMode: boolean;
	/** Waybills on the desk, priority-ordered (top of stack first). */
	waybills: readonly Waybill[];
	/** Deployment sagas as rolling stock; empty when no durable store exists. */
	trains?: readonly TrainView[];
	/** Highball goal state: clean board derived from reality only. */
	highball: boolean;
	/**
	 * Transient feedback in flight. Motion is accent only: under
	 * `reducedMotion` the same beat still lands, as a static ink state.
	 */
	fx?: { kind: "stamp" | "derail"; elapsedMs: number } | null;
	reducedMotion?: boolean;
}>;

// DESIGN.md tokens (ink on paper; spark/go accents only).
const INK = "#101010";
const PAPER = "#ffffff";
const MUTE = "#4a4a46";
const FAINT = "#6e6d68";
const BORDER = "#e3e2de";
const CREAM = "#f2f1ec";
const SPARK = "#c5301c";
const GO = "#14672c";

const D = YARD_LAYOUT.depths;
/** Base depth for static yard property (below Bo, below the foreground bank). */
const PROP = D.track + 2;
/** Rolling stock / bay furniture. */
const CAR = D.bay;
/** Enamel signs sit above the foreground bank plate — labels never occlude. */
const SIGN_D = D.characters + 8;
/** Lantern truth card floats over everything but the DOM sheet. */
const LANTERN_D = D.ui + 6;

/** Enamel sign copy: short label-caps, one per zone. */
const SIGN_TEXT: Record<ZoneId, string> = {
	platformRest: "PLATFORM",
	bootstrapDesk: "WAYBILL DESK",
	activeRailTrack: "ACTIVE RAIL",
	connectionBay: "CONNECTIONS",
	policyBoard: "POLICY BOARD",
	costBooth: "COST BOOTH",
	errorBunker: "ERROR BUNKER",
};

/** Sign plate origins (top-left), hand-placed clear of Bo and of each prop. */
const SIGN_AT: Record<ZoneId, { x: number; y: number }> = {
	// Mounted on the platform lamp post, east of Bo's silhouette (ink 141..228).
	platformRest: { x: 232, y: 522 },
	bootstrapDesk: { x: 342, y: 424 },
	activeRailTrack: { x: 612, y: 274 },
	connectionBay: { x: 904, y: 598 },
	policyBoard: { x: 576, y: 118 },
	costBooth: { x: 1004, y: 108 },
	errorBunker: { x: 44, y: 104 },
};

/** While in transit Bo plays walk E/W; on arrival the projection clip. */
export function resolveBoTransitAnim(
	boPos: { x: number; y: number },
	target: { x: number; y: number },
	projectionAnimationId: string,
): string {
	const dx = target.x - boPos.x;
	const dy = target.y - boPos.y;
	if (Math.hypot(dx, dy) < 1) return projectionAnimationId;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0 ? "bo.walk.east" : "bo.walk.west";
	}
	return projectionAnimationId;
}

const STAMP_SQUASH_MS = 160;
const STAMP_SQUASH_PCT = 0.2;
const DERAIL_HIT_STOP_MS = 120;

/** 0..STAMP_SQUASH_PCT — a slam that springs back, never a held deformation. */
export function stampSquash(input: PresenterInput): number {
	if (input.reducedMotion) return 0;
	const fx = input.fx;
	if (!fx || fx.kind !== "stamp") return 0;
	const t = fx.elapsedMs / STAMP_SQUASH_MS;
	if (t < 0 || t > 1) return 0;
	// Down fast, back up slower: squash peaks early then eases out.
	return STAMP_SQUASH_PCT * Math.sin(Math.PI * t) ** 2;
}

/** True while a derail hit-stop is in flight (the loudest beat on screen). */
export function derailHitStop(input: PresenterInput): boolean {
	if (input.reducedMotion) return false;
	const fx = input.fx;
	return (
		fx !== null &&
		fx !== undefined &&
		fx.kind === "derail" &&
		fx.elapsedMs >= 0 &&
		fx.elapsedMs <= DERAIL_HIT_STOP_MS
	);
}

type Push = (item: RenderItem) => void;

function rect(
	push: Push,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	opts: {
		fill?: string;
		fillAlpha?: number;
		stroke?: string;
		lineWidth?: number;
		depth: number;
	},
): void {
	push({ kind: "rect", id, x, y, w, h, ...opts });
}

function line(
	push: Push,
	id: string,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	color: string,
	lineWidth: number,
	depth: number,
): void {
	push({ kind: "line", id, x1, y1, x2, y2, color, lineWidth, depth });
}

function text(
	push: Push,
	id: string,
	x: number,
	y: number,
	body: string,
	style: TextStyleId,
	color: string,
	depth: number,
): void {
	push({ kind: "text", id, x, y, text: body, style, color, depth });
}

/** Hard 4px sticker offset shadow — never a soft blur (DESIGN.md). */
function sticker(
	push: Push,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	depth: number,
): void {
	rect(push, id, x + 4, y + 4, w, h, {
		fill: INK,
		fillAlpha: 0.16,
		depth,
	});
}

const SIGN_H = 20;

/** Bold 11px label-caps run ~8px/char — plates must never clip their word. */
function signWidth(body: string): number {
	return Math.round(body.length * 8 + 24);
}

/** Compact ink-bordered enamel plate: the zone's name survives the redraw. */
function enamelSign(push: Push, zone: ZoneId): void {
	const body = SIGN_TEXT[zone];
	const { x, y } = SIGN_AT[zone];
	const w = signWidth(body);
	// Hanger brackets: the plate reads as mounted signage, never a floating chip.
	line(
		push,
		`sign-${zone}-rail`,
		x + 4,
		y - 9,
		x + w - 4,
		y - 9,
		INK,
		2,
		SIGN_D - 2,
	);
	rect(push, `sign-${zone}-hook-a`, x + 8, y - 9, 3, 9, {
		fill: INK,
		depth: SIGN_D - 2,
	});
	rect(push, `sign-${zone}-hook-b`, x + w - 11, y - 9, 3, 9, {
		fill: INK,
		depth: SIGN_D - 2,
	});
	sticker(push, `sign-${zone}-shadow`, x, y, w, SIGN_H, SIGN_D - 1);
	rect(push, `sign-${zone}`, x, y, w, SIGN_H, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: SIGN_D,
	});
	rect(push, `sign-${zone}-rim`, x + 3, y + 3, w - 6, SIGN_H - 6, {
		stroke: INK,
		lineWidth: 1,
		depth: SIGN_D + 1,
	});
	text(
		push,
		`sign-${zone}-text`,
		x + 10,
		y + 5,
		body,
		"label",
		INK,
		SIGN_D + 2,
	);
}

/** Ink smoke/steam puff: paper-filled, ink-outlined, stepped like line-art. */
function puff(
	push: Push,
	id: string,
	cx: number,
	cy: number,
	size: number,
	depth: number,
): void {
	rect(push, id, cx - size, cy - size / 2, size * 2, size, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth,
	});
	rect(push, `${id}-cap`, cx - size / 2, cy - size, size, size / 2, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth,
	});
}

export function presentYard(input: PresenterInput): RenderModel {
	const items: RenderItem[] = [];
	const push: Push = (item) => {
		items.push(item);
	};
	const v = input.visual;

	// --- background ---
	line(
		push,
		"horizon",
		0,
		200,
		YARD_LAYOUT.width,
		200,
		BORDER,
		1,
		D.background,
	);
	if (input.hasImage("bg-poles")) {
		push({
			kind: "image",
			id: "poles",
			key: "bg-poles",
			x: 0,
			y: 80,
			w: YARD_LAYOUT.width,
			h: 320,
			alpha: 0.55,
			depth: D.background,
		});
	}
	if (input.hasImage("bg-trail")) {
		push({
			kind: "image",
			id: "trail",
			key: "bg-trail",
			x: 0,
			y: YARD_LAYOUT.groundY - 280,
			w: YARD_LAYOUT.width,
			h: 320,
			depth: D.background + 1,
		});
	}
	rect(
		push,
		"ground-strip",
		0,
		YARD_LAYOUT.groundY - 8,
		YARD_LAYOUT.width,
		YARD_LAYOUT.height - YARD_LAYOUT.groundY + 8,
		{ fill: PAPER, depth: D.background + 2 },
	);
	line(
		push,
		"ground-line",
		0,
		YARD_LAYOUT.groundY,
		YARD_LAYOUT.width,
		YARD_LAYOUT.groundY,
		INK,
		2,
		D.background + 2,
	);
	if (input.hasImage("bg-sky-cloud")) {
		push({
			kind: "image",
			id: "cloud-a",
			key: "bg-sky-cloud",
			x: 60,
			y: 24,
			w: 200,
			h: 80,
			depth: D.background,
		});
		push({
			kind: "image",
			id: "cloud-b",
			key: "bg-sky-cloud",
			x: 920,
			y: 40,
			w: 240,
			h: 90,
			depth: D.background,
		});
	}

	const railsActive =
		Boolean(v?.traffic.active) ||
		(v?.occupyMode === "occupying" &&
			v.rails.some((r) => r.visual === "active"));

	drawRailTrack(push, railsActive);
	drawPolicyBoard(push, v);
	drawCostBooth(push, v);
	drawErrorBunker(push, v);
	drawPlatform(push);
	drawWaybillDesk(push, input);
	drawConnectionBay(push, v);
	drawSemaphore(push, input.highball);

	for (const zone of Object.keys(SIGN_TEXT) as ZoneId[]) {
		enamelSign(push, zone);
	}

	// --- camp rooms + bindlebug NPCs (world model, CAMP_GROUNDS only) ---
	if (input.world) drawWorld(push, input);

	// --- traffic particles (never in test mode: stable screenshots) ---
	if (!input.testMode) {
		input.particles.forEach((p, i) => {
			if (!p.alive) return;
			rect(push, `particle-${i}`, p.x, p.y, 12, 10, {
				fill: INK,
				stroke: PAPER,
				lineWidth: 2,
				depth: D.particles,
			});
		});
	}

	// --- guest agent near bay (only real authorized connections) ---
	const bay = YARD_LAYOUT.zones.connectionBay;
	if ((v?.connections ?? []).some((c) => c.visual === "authorized")) {
		push({
			kind: "sprite",
			id: "guest-swe-claude",
			x: bay.x + 54,
			y: bay.anchorY,
			animationId: "guest.swe-claude.work",
			scale: 0.75,
			depth: D.characters,
			testFrame: input.testMode ? 4 : null,
		});
	}

	// --- Bo ---
	if (input.ready) {
		push({
			kind: "sprite",
			id: "bo",
			x: input.boPos.x,
			y: input.boPos.y,
			animationId: input.boAnimationId,
			scale: input.boAnimationId.includes("walk") ? 0.7 : 0.55,
			depth: D.characters + 1,
			testFrame: input.testMode ? 0 : null,
		});
		if (input.speech) {
			const w = Math.min(220, input.speech.length * 7 + 16);
			const bx = input.boPos.x - w / 2;
			const by =
				input.boPos.y - (input.boAnimationId.includes("walk") ? 130 : 150);
			rect(push, "speech-bubble", bx, by, w, 24, {
				fill: "#fffdf7",
				stroke: INK,
				lineWidth: 1.5,
				depth: D.ui + 2,
			});
			text(
				push,
				"speech-text",
				bx + 8,
				by + 5,
				input.speech,
				"mono12",
				INK,
				D.ui + 3,
			);
		}
	}

	// --- near-bank plate over Bo ---
	if (input.hasImage("bg-trail-front")) {
		push({
			kind: "image",
			id: "trail-front",
			key: "bg-trail-front",
			x: 0,
			y: YARD_LAYOUT.groundY - 100,
			w: YARD_LAYOUT.width,
			h: 140,
			alpha: 0.95,
			depth: D.characters + 5,
		});
	}

	// --- HUD caption card ---
	sticker(push, "hud-shadow", 16, 16, 300, 52, D.ui);
	rect(push, "hud-card", 16, 16, 300, 52, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: D.ui + 1,
	});
	text(
		push,
		"hud-title",
		26,
		24,
		"HIGHBALL! · single Station",
		"label",
		INK,
		D.ui + 2,
	);
	text(
		push,
		"hud-meta",
		26,
		42,
		`zone=${input.zone} anim=${input.boAnimationId}`,
		"mono11",
		MUTE,
		D.ui + 2,
	);

	// --- SIMULATED film-leader tag (DESIGN.md signal provenance / TRU-1) ---
	if (input.world?.demo === true || input.scenarioMode) {
		const bw = 108;
		const bx = YARD_LAYOUT.width - bw - 14;
		rect(push, "simulated-badge", bx, 14, bw, 22, {
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: D.ui + 3,
		});
		text(
			push,
			"simulated-badge-text",
			bx + 14,
			19,
			"SIMULATED",
			"label",
			INK,
			D.ui + 4,
		);
	}

	// --- lantern inspect: the free read verb (instant, no animation gating) ---
	if (input.hoveredZone) drawLantern(push, input, input.hoveredZone);

	// Derail hit-stop: a single spark band across the rail. Static ink smoke
	// already marks the derail, so reduced motion loses only the flash.
	if (derailHitStop(input)) {
		const t = YARD_LAYOUT.zones.activeRailTrack;
		items.push({
			kind: "rect",
			id: "derail-flash",
			x: t.x,
			y: t.y,
			w: t.width,
			h: t.height,
			fill: SPARK,
			fillAlpha: 0.22,
			depth: D.particles + 1,
		});
	}

	// --- train traffic: the deployment saga as rolling stock ---
	// Nothing is drawn when the deployments projection is unavailable — an
	// honest empty rail beats fabricated traffic (design pillar: reality is
	// the level designer).
	for (const train of input.trains ?? []) {
		const derailed = train.phase === "derailed";
		// Locomotive: boiler + cab + stack, ink on paper.
		items.push({
			kind: "rect",
			id: `${train.id}-loco`,
			x: train.locomotiveX,
			y: train.y - 30,
			w: 52,
			h: 30,
			fill: PAPER,
			stroke: derailed ? SPARK : INK,
			lineWidth: 3,
			depth: D.track + 5,
		});
		items.push({
			kind: "rect",
			id: `${train.id}-stack`,
			x: train.locomotiveX + 6,
			y: train.y - 42,
			w: 10,
			h: 12,
			fill: INK,
			depth: D.track + 5,
		});
		items.push({
			kind: "text",
			id: `${train.id}-label`,
			x: train.locomotiveX,
			y: train.y - 56,
			text: train.deploymentId.slice(0, 14),
			style: "mono9",
			color: derailed ? SPARK : MUTE,
			depth: D.track + 6,
		});
		if (derailed && train.reason) {
			// A derail is the loudest thing on screen and states the real reason.
			items.push({
				kind: "text",
				id: `${train.id}-reason`,
				x: train.locomotiveX - 40,
				y: train.y - 70,
				text: train.reason.slice(0, 28),
				style: "mono9",
				color: SPARK,
				depth: D.track + 6,
			});
		}
		for (const car of train.cars) {
			const failed = car.visual === "failed";
			items.push({
				kind: "rect",
				id: car.id,
				x: car.x,
				y: car.y - car.h,
				w: car.w,
				h: car.h,
				// solid = provisioned, outline = provisioning, ghost = destroyed.
				...(car.visual === "solid" ? { fill: INK } : {}),
				...(car.visual === "ghost" ? { fill: PAPER, fillAlpha: 0.4 } : {}),
				stroke: failed ? SPARK : INK,
				lineWidth: failed ? 3 : 2,
				depth: D.track + 4,
			});
			if (car.visual === "hatched") {
				items.push({
					kind: "line",
					id: `${car.id}-hatch`,
					x1: car.x,
					y1: car.y,
					x2: car.x + car.w,
					y2: car.y - car.h,
					color: INK,
					lineWidth: 2,
					depth: D.track + 5,
				});
			}
		}
	}

	return Object.freeze({ items });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Active Rail Track: ballast bed, ties, motion dashes + a switch stand. */
function drawRailTrack(push: Push, lit: boolean): void {
	const track = YARD_LAYOUT.zones.activeRailTrack;
	rect(push, "track-bed", track.x, track.y + 20, track.width, 28, {
		fill: lit ? INK : MUTE,
		depth: PROP,
	});
	for (let x = track.x + 10, i = 0; x < track.x + track.width; x += 36, i++) {
		line(
			push,
			`track-tie-${i}`,
			x,
			track.y + 18,
			x + 16,
			track.y + 50,
			lit ? INK : FAINT,
			2,
			PROP,
		);
	}
	if (lit) {
		for (
			let x = track.x + 8, i = 0;
			x < track.x + track.width - 8;
			x += 20, i++
		) {
			rect(push, `track-dash-${i}`, x, track.y + 33, 10, 2, {
				fill: PAPER,
				depth: PROP + 1,
			});
		}
	}

	// Switch stand at the west end, hugging the ballast so it reads as part of
	// the track (not of the Error Bunker spur that sits above it). The target
	// plate reads "thrown" (ink-filled) when a rail is carrying traffic.
	const sx = track.x + 60;
	rect(push, "switch-base", sx - 8, track.y + 14, 28, 8, {
		fill: INK,
		depth: PROP + 4,
	});
	rect(push, "switch-post", sx, track.y - 22, 8, 38, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 4,
	});
	line(
		push,
		"switch-lever",
		sx + 8,
		track.y - 8,
		sx + 34,
		lit ? track.y - 18 : track.y + 4,
		INK,
		4,
		PROP + 5,
	);
	// Round target plate approximated as a stepped disc on the stand head.
	const tx = sx + 4;
	const ty = track.y - 36;
	rect(push, "switch-target", tx - 14, ty - 9, 28, 18, {
		fill: lit ? INK : PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 5,
	});
	rect(push, "switch-target-cap", tx - 9, ty - 14, 18, 6, {
		fill: lit ? INK : PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 5,
	});
	rect(push, "switch-target-foot", tx - 9, ty + 8, 18, 6, {
		fill: lit ? INK : PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 5,
	});
}

const RAIL_PLAQUE_COLOR: Record<string, string> = {
	active: GO,
	approved: INK,
	draft: MUTE,
};

/** Policy Board: two posts, a shingled notice board, rails nailed to it. */
function drawPolicyBoard(push: Push, v: YardVisualState | null): void {
	const z = YARD_LAYOUT.zones.policyBoard;
	const boardX = z.x + 12;
	const boardY = z.y + 30;
	const boardW = z.width - 24;
	const boardH = 92;
	rect(push, "board-post-left", boardX + 12, boardY + 20, 12, 110, {
		fill: INK,
		depth: PROP,
	});
	rect(push, "board-post-right", boardX + boardW - 24, boardY + 20, 12, 110, {
		fill: INK,
		depth: PROP,
	});
	sticker(push, "board-slab-shadow", boardX, boardY, boardW, boardH, PROP + 1);
	rect(push, "board-slab", boardX, boardY, boardW, boardH, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 2,
	});
	// Shingled top edge: overlapping ink-outlined tiles.
	const shingles = Math.floor(boardW / 32);
	for (let i = 0; i < shingles; i++) {
		rect(push, `board-shingle-${i}`, boardX + i * 32, boardY - 10, 34, 12, {
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: PROP + 3,
		});
	}

	// Nailed rail cards — the plaque logic, restyled as paper cards.
	(v?.rails ?? []).slice(0, 5).forEach((r, i) => {
		const px = boardX + 10 + i * 56;
		const py = boardY + 22;
		const color = RAIL_PLAQUE_COLOR[r.visual] ?? FAINT;
		rect(push, `rail-plaque-${i}`, px, py, 50, 42, {
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: PROP + 4,
		});
		rect(push, `rail-plaque-${i}-chip`, px + 5, py + 6, 40, 9, {
			fill: color,
			depth: PROP + 5,
		});
		text(
			push,
			`rail-plaque-${i}-label`,
			px + 5,
			py + 20,
			r.visual.slice(0, 6),
			"mono9",
			color,
			PROP + 5,
		);
		text(
			push,
			`rail-plaque-${i}-hash`,
			px + 5,
			py + 30,
			r.contentHash.replace(/^sha256:/, "").slice(0, 6),
			"mono9",
			FAINT,
			PROP + 5,
		);
		// Two nail dots — a card posted, not a floating chip.
		rect(push, `rail-plaque-${i}-nail-a`, px + 6, py + 2, 3, 3, {
			fill: INK,
			depth: PROP + 6,
		});
		rect(push, `rail-plaque-${i}-nail-b`, px + 41, py + 2, 3, 3, {
			fill: INK,
			depth: PROP + 6,
		});
	});
}

/** Cost Booth: coal tender (quota fill) + pressure governor gauge (heat). */
function drawCostBooth(push: Push, v: YardVisualState | null): void {
	const fill = v?.costMeter.fill ?? 0;
	const heat = v?.costMeter.heat ?? 0;

	// --- coal tender: one flared hopper silhouette, paper body + ink edges ---
	// Bands fill WITHOUT strokes so the stack reads as a single vessel; the
	// outline is then drawn as explicit ink edges (line-art, not a wireframe).
	const hopperTop = 148;
	const hopperBottom = 196;
	const bands = [
		{ x: 1006, y: 148, w: 100, h: 16 },
		{ x: 1012, y: 164, w: 88, h: 16 },
		{ x: 1018, y: 180, w: 76, h: 16 },
	];
	const coalTop = hopperBottom - (hopperBottom - hopperTop) * fill;
	bands.forEach((b, i) => {
		rect(push, `tender-band-${i}`, b.x, b.y, b.w, b.h, {
			fill: PAPER,
			depth: PROP + 1,
		});
		const y0 = Math.max(b.y, coalTop);
		const y1 = b.y + b.h;
		if (y1 > y0) {
			rect(push, `tender-coal-${i}`, b.x + 4, y0, b.w - 8, y1 - y0, {
				fill: INK,
				depth: PROP + 2,
			});
		}
		line(
			push,
			`tender-edge-l-${i}`,
			b.x,
			b.y,
			b.x,
			b.y + b.h,
			INK,
			3,
			PROP + 3,
		);
		line(
			push,
			`tender-edge-r-${i}`,
			b.x + b.w,
			b.y,
			b.x + b.w,
			b.y + b.h,
			INK,
			3,
			PROP + 3,
		);
		if (i > 0) {
			const prev = bands[i - 1] as (typeof bands)[number];
			line(push, `tender-step-l-${i}`, prev.x, b.y, b.x, b.y, INK, 3, PROP + 3);
			line(
				push,
				`tender-step-r-${i}`,
				prev.x + prev.w,
				b.y,
				b.x + b.w,
				b.y,
				INK,
				3,
				PROP + 3,
			);
		}
	});
	// Coping rail along the open top, then the frame and wheels beneath.
	line(
		push,
		"tender-coping",
		1000,
		hopperTop,
		1112,
		hopperTop,
		INK,
		4,
		PROP + 4,
	);
	line(
		push,
		"tender-floor",
		1018,
		hopperBottom,
		1094,
		hopperBottom,
		INK,
		3,
		PROP + 3,
	);
	rect(push, "tender-frame", 1006, 196, 100, 7, { fill: INK, depth: PROP + 3 });
	for (const [id, wx] of [
		["a", 1016],
		["b", 1076],
	] as const) {
		rect(push, `tender-wheel-${id}`, wx, 203, 16, 10, {
			fill: INK,
			depth: PROP + 3,
		});
		rect(push, `tender-wheel-${id}-tread`, wx + 4, 213, 8, 3, {
			fill: INK,
			depth: PROP + 3,
		});
	}

	// --- pressure governor: stepped ink bezel + paper face + needle ---
	const cx = 1152;
	const cy = 176;
	const R = 32;
	const bezel: [number, number, number, number][] = [
		[cx - R + 10, cy - R, 2 * R - 20, 2 * R],
		[cx - R, cy - R + 10, 2 * R, 2 * R - 20],
		[cx - R + 4, cy - R + 4, 2 * R - 8, 2 * R - 8],
	];
	bezel.forEach((b, i) => {
		rect(push, `gauge-bezel-${i}`, b[0], b[1], b[2], b[3], {
			fill: INK,
			depth: PROP + 1,
		});
	});
	const r = R - 5;
	const face: [number, number, number, number][] = [
		[cx - r + 9, cy - r, 2 * r - 18, 2 * r],
		[cx - r, cy - r + 9, 2 * r, 2 * r - 18],
		[cx - r + 4, cy - r + 4, 2 * r - 8, 2 * r - 8],
	];
	face.forEach((b, i) => {
		rect(push, `gauge-face-${i}`, b[0], b[1], b[2], b[3], {
			fill: PAPER,
			depth: PROP + 2,
		});
	});
	// Tick marks across the 220° sweep. All ink: spark is reserved for a REAL
	// over-budget reading, so the needle — not the dial — carries the alarm.
	for (let t = 0; t <= 5; t++) {
		const rad = ((200 - (t / 5) * 220) * Math.PI) / 180;
		const c = Math.cos(rad);
		const s = Math.sin(rad);
		line(
			push,
			`gauge-tick-${t}`,
			cx + c * (r - 9),
			cy - s * (r - 9),
			cx + c * (r - 2),
			cy - s * (r - 2),
			INK,
			t === 5 ? 3 : 2,
			PROP + 3,
		);
	}
	const hot = heat > 0.8;
	const needleRad =
		((200 - Math.min(1, Math.max(0, heat)) * 220) * Math.PI) / 180;
	line(
		push,
		"gauge-needle",
		cx,
		cy,
		cx + Math.cos(needleRad) * (r - 6),
		cy - Math.sin(needleRad) * (r - 6),
		hot ? SPARK : INK,
		4,
		PROP + 4,
	);
	rect(push, "gauge-hub", cx - 5, cy - 5, 10, 10, {
		fill: INK,
		depth: PROP + 5,
	});
	// Stem down onto the tender frame — one machine, not two ornaments.
	rect(push, "gauge-stem", cx - 4, cy + R, 8, 196 - (cy + R), {
		fill: INK,
		depth: PROP,
	});
	rect(push, "gauge-foot", cx - 17, 196, 34, 7, { fill: INK, depth: PROP + 3 });

	// Fare readout BENEATH the gauge — never over the Cost Booth enamel sign.
	text(
		push,
		"cost-label",
		cx - 32,
		cy + R + 12,
		`fare ${(fill * 100).toFixed(0)}%`,
		"mono11",
		hot ? SPARK : INK,
		PROP + 5,
	);
}

/** Error Bunker: a quiet stub spur; smoking + spark-red only on real hazards. */
function drawErrorBunker(push: Push, v: YardVisualState | null): void {
	const z = YARD_LAYOUT.zones.errorBunker;
	const railY = z.y + 96;
	// Ballast shoulder so the stub reads as track, not as a fence.
	rect(push, "spur-ballast", z.x + 8, railY + 6, 180, 5, {
		fill: PAPER,
		stroke: MUTE,
		lineWidth: 1,
		depth: PROP - 1,
	});
	for (let i = 0; i < 6; i++) {
		const tx = z.x + 18 + i * 28;
		// The fourth tie is derailed — a broken spur, always, quietly.
		if (i === 3) {
			line(
				push,
				"spur-tie-broken",
				tx,
				railY - 6,
				tx + 20,
				railY + 22,
				INK,
				3,
				PROP,
			);
			continue;
		}
		line(push, `spur-tie-${i}`, tx, railY - 4, tx, railY + 14, MUTE, 4, PROP);
	}
	rect(push, "spur-rail", z.x + 12, railY, 170, 6, {
		fill: INK,
		depth: PROP + 1,
	});
	// The cripple: a derailed wheelset lying off the rail head.
	rect(push, "spur-cripple", z.x + 60, railY + 12, 26, 12, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 2,
	});
	rect(push, "spur-cripple-wheel", z.x + 72, railY + 24, 8, 8, {
		fill: INK,
		depth: PROP + 2,
	});
	// Bumper block at the dead end.
	rect(push, "spur-bumper", z.x + 174, railY - 20, 14, 26, {
		fill: INK,
		depth: PROP + 2,
	});

	const hazards = v?.errorBunker.hazards ?? [];
	if (hazards.length === 0) return;

	// Smoking switch: ink puffs rising from the derailed tie.
	for (let i = 0; i < 3; i++) {
		puff(
			push,
			`bunker-smoke-${i}`,
			z.x + 106 + i * 6,
			railY - 20 - i * 18,
			8 + i * 3,
			PROP + 3,
		);
	}
	// Spark-red warning triangle — the only red on a healthy board.
	const tri = { x: z.x + 136, y: z.y + 8, w: 52, h: 48 };
	const apex = { x: tri.x + tri.w / 2, y: tri.y };
	line(
		push,
		"bunker-warning-a",
		apex.x,
		apex.y,
		tri.x + tri.w,
		tri.y + tri.h,
		SPARK,
		3,
		PROP + 4,
	);
	line(
		push,
		"bunker-warning-b",
		tri.x + tri.w,
		tri.y + tri.h,
		tri.x,
		tri.y + tri.h,
		SPARK,
		3,
		PROP + 4,
	);
	line(
		push,
		"bunker-warning-c",
		tri.x,
		tri.y + tri.h,
		apex.x,
		apex.y,
		SPARK,
		3,
		PROP + 4,
	);
	text(
		push,
		"bunker-warning-mark",
		apex.x - 3,
		tri.y + 16,
		"!",
		"mono12",
		SPARK,
		PROP + 5,
	);

	hazards.slice(0, 3).forEach((h, i) => {
		text(
			push,
			`bunker-hazard-${i}`,
			z.x + 4,
			railY + 48 + i * 13,
			h.slice(0, 22),
			"mono9",
			SPARK,
			PROP + 4,
		);
	});
}

/** Platform Rest: plank deck on posts with a lamp post. Bo stands on it. */
function drawPlatform(push: Push): void {
	const deckX = 84;
	const deckW = 212;
	const deckTop = 596;
	// The deck surface stays BELOW Bo (he stands on it); the face, posts and
	// lamp sit ABOVE the foreground bank plate so the structure still reads.
	const FRONT = D.characters + 6;
	rect(push, "platform-plank-0", deckX, deckTop, deckW, 9, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: PROP,
	});
	rect(push, "platform-plank-1", deckX, deckTop + 9, deckW, 10, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: FRONT,
	});
	rect(push, "platform-post-a", deckX + 20, deckTop + 19, 11, 8, {
		fill: INK,
		depth: FRONT,
	});
	rect(push, "platform-post-b", deckX + deckW - 31, deckTop + 19, 11, 8, {
		fill: INK,
		depth: FRONT,
	});
	// Lamp post at the east end (clear of Bo's silhouette, ink x 141..228).
	const lx = 266;
	rect(push, "lamp-post", lx, 490, 7, deckTop - 490, {
		fill: INK,
		depth: FRONT,
	});
	rect(push, "lamp-cap", lx - 11, 476, 29, 7, { fill: INK, depth: FRONT + 1 });
	rect(push, "lamp-glass", lx - 8, 483, 23, 18, {
		fill: CREAM,
		stroke: INK,
		lineWidth: 3,
		depth: FRONT + 1,
	});
	rect(push, "lamp-foot", lx - 5, 501, 17, 6, { fill: INK, depth: FRONT + 1 });
}

/** Bootstrap Desk: furniture (slab + legs), the waybill stack, the bell. */
function drawWaybillDesk(push: Push, input: PresenterInput): void {
	const desk = YARD_LAYOUT.zones.bootstrapDesk;
	const slabX = desk.x - 6;
	const slabW = desk.width + 12;
	const slabY = 520;
	sticker(push, "desk-slab-shadow", slabX, slabY, slabW, 13, PROP);
	rect(push, "desk-slab", slabX, slabY, slabW, 13, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 1,
	});
	rect(push, "desk-leg-left", desk.x + 4, slabY + 13, 11, 28, {
		fill: INK,
		depth: PROP,
	});
	rect(push, "desk-leg-right", desk.x + desk.width - 15, slabY + 13, 11, 28, {
		fill: INK,
		depth: PROP,
	});
	rect(push, "desk-apron", desk.x + 22, slabY + 13, desk.width - 44, 14, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: PROP,
	});

	// Waybill stack: up to 3 overlapping cards; index 0 is the top of the stack.
	const stack = input.waybills.slice(0, 3);
	// Stamp slam: the top card squashes ~20% then springs back inside the
	// feel budget (docs/validation/feel-budgets.json). Reduced motion keeps the
	// card still — the stamped state is already legible without the squash.
	const squash = stampSquash(input);
	stack.forEach((w, i) => {
		const wx = desk.x + 4 + i * 8;
		const wy = 452 + i * 6;
		const base = PROP + 2 + (stack.length - 1 - i) * 3;
		const sq = i === 0 ? squash : 0;
		const h = Math.round(56 * (1 - sq));
		const dy = 56 - h;
		rect(push, `waybill-${i}-shadow`, wx + 2, wy + 2 + dy, 122, h, {
			fill: INK,
			fillAlpha: 0.12,
			depth: base,
		});
		rect(push, `waybill-${i}`, wx, wy + dy, 122, h, {
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: base + 1,
		});
		text(
			push,
			`waybill-${i}-title`,
			wx + 6,
			wy + 5,
			w.title.slice(0, 20),
			"mono9",
			INK,
			base + 2,
		);
		line(
			push,
			`waybill-${i}-rule`,
			wx + 6,
			wy + 22,
			wx + 116,
			wy + 22,
			FAINT,
			1,
			base + 2,
		);
	});
	if (input.waybills.length > 3) {
		const cx = desk.x + 4;
		const cy = 500;
		rect(push, "waybill-count-bg", cx, cy, 30, 18, {
			fill: INK,
			depth: PROP + 12,
		});
		text(
			push,
			"waybill-count",
			cx + 6,
			cy + 3,
			`+${input.waybills.length - 3}`,
			"mono11",
			PAPER,
			PROP + 13,
		);
	}

	// Station bell: the first-run call to the desk. A proper bell — trapezoid
	// body narrowing upward on a base plate. The glow ring is static ink
	// (reduced-motion-safe): readable from a still frame.
	const bellX = desk.x + desk.width - 36;
	if (input.waybills.some((w) => w.kind === "station.open")) {
		rect(push, "station-bell-glow", bellX - 12, 474, 58, 50, {
			fill: CREAM,
			stroke: BORDER,
			lineWidth: 1,
			depth: PROP + 1,
		});
	}
	rect(push, "station-bell-base", bellX - 5, 512, 44, 8, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: PROP + 14,
	});
	rect(push, "station-bell", bellX - 2, 498, 38, 15, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: PROP + 14,
	});
	rect(push, "station-bell-mid", bellX + 3, 489, 28, 10, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: PROP + 14,
	});
	rect(push, "station-bell-crown", bellX + 8, 482, 18, 8, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: PROP + 14,
	});
	rect(push, "station-bell-knob", bellX + 13, 476, 8, 7, {
		fill: INK,
		depth: PROP + 15,
	});
}

type CarLook = { door: string; steaming: boolean; mark: string | null };

/** Raw lifecycle status → rolling-stock door treatment. */
function carLook(status: string): CarLook {
	switch (status) {
		case "active":
			return { door: GO, steaming: false, mark: null };
		case "pending":
			return { door: INK, steaming: false, mark: "?" };
		case "needs-reauth":
		case "revoked":
		case "expired":
			return { door: SPARK, steaming: true, mark: null };
		default:
			return { door: MUTE, steaming: false, mark: null };
	}
}

const CARS_PER_ROW = 3;
const CAR_W = 84;
const CAR_PITCH = 90;
const CAR_BODY_H = 50;

/** Connection Bay: freight cars on a siding — one car per REAL connection. */
function drawConnectionBay(push: Push, v: YardVisualState | null): void {
	const bay = YARD_LAYOUT.zones.connectionBay;
	const conns = v?.connections ?? [];
	const shown = conns.slice(0, CARS_PER_ROW * 2);
	const rows = Math.max(1, Math.ceil(shown.length / CARS_PER_ROW));

	// Siding rails: always drawn — an empty siding is a real, readable state.
	for (let row = 0; row < rows; row++) {
		const railY = 520 + row * 76;
		rect(push, `siding-rail-${row}`, bay.x + 4, railY, bay.width - 8, 5, {
			fill: INK,
			depth: PROP,
		});
		for (let i = 0; i < 9; i++) {
			const tx = bay.x + 12 + i * 30;
			line(
				push,
				`siding-tie-${row}-${i}`,
				tx,
				railY + 5,
				tx,
				railY + 13,
				MUTE,
				3,
				PROP,
			);
		}
	}

	shown.forEach((c, i) => {
		const col = i % CARS_PER_ROW;
		const row = Math.floor(i / CARS_PER_ROW);
		const cx = bay.x + 6 + col * CAR_PITCH;
		const railY = 520 + row * 76;
		const bodyY = railY - 8 - CAR_BODY_H;
		const look = carLook(c.status);

		rect(push, `car-${i}`, cx, bodyY, CAR_W, CAR_BODY_H, {
			fill: PAPER,
			stroke: INK,
			lineWidth: 3,
			depth: CAR,
		});
		line(
			push,
			`car-${i}-roof`,
			cx - 4,
			bodyY,
			cx + CAR_W + 4,
			bodyY,
			INK,
			4,
			CAR + 1,
		);
		rect(push, `car-${i}-door`, cx + 28, bodyY + 10, 28, 30, {
			fill: look.door,
			stroke: INK,
			lineWidth: 2,
			depth: CAR + 1,
		});
		if (look.mark) {
			text(
				push,
				`car-${i}-mark`,
				cx + 38,
				bodyY + 18,
				look.mark,
				"mono12",
				PAPER,
				CAR + 2,
			);
		}
		// Wheels: stepped ink discs on the rail head.
		for (const [w, wx] of [
			["a", cx + 12],
			["b", cx + CAR_W - 26],
		] as const) {
			rect(push, `car-${i}-wheel-${w}`, wx, railY - 10, 14, 10, {
				fill: INK,
				depth: CAR + 1,
			});
			rect(push, `car-${i}-wheel-${w}-tread`, wx + 3, railY - 13, 8, 3, {
				fill: INK,
				depth: CAR + 1,
			});
		}
		// Coupling to the next car in the same row.
		if (
			col < CARS_PER_ROW - 1 &&
			shown[i + 1] &&
			row === Math.floor((i + 1) / CARS_PER_ROW)
		) {
			line(
				push,
				`car-${i}-coupling`,
				cx + CAR_W,
				railY - 18,
				cx + CAR_PITCH,
				railY - 18,
				INK,
				4,
				CAR,
			);
		}
		text(
			push,
			`car-${i}-label`,
			cx + 5,
			bodyY + CAR_BODY_H - 15,
			(c.alias || c.provider || c.id).slice(0, 5),
			"mono9",
			INK,
			CAR + 2,
		);
		if (look.steaming) {
			for (let s = 0; s < 3; s++) {
				puff(
					push,
					`car-${i}-steam-${s}`,
					cx + 20 + s * 5,
					bodyY - 14 - s * 20,
					8 + s * 2,
					CAR + 3,
				);
			}
		}
	});

	if (conns.length > shown.length) {
		const bx = bay.x + bay.width - 34;
		rect(push, "car-overflow-bg", bx, 596, 30, 18, {
			fill: INK,
			depth: CAR + 4,
		});
		text(
			push,
			"car-overflow",
			bx + 5,
			599,
			`+${conns.length - shown.length}`,
			"mono11",
			PAPER,
			CAR + 5,
		);
	}
}

/**
 * The Highball signal. Planted in the clear mid-left band (x≈300) — the old
 * x≈1210 mast sat under the DOM sheet gutter (right:32px, width≤360).
 */
function drawSemaphore(push: Push, highball: boolean): void {
	const semX = 296;
	const semTop = 240;
	const semBase = 380;
	const pivotX = semX + 4;
	const pivotY = semTop + 12;
	rect(push, "semaphore-plinth", semX - 10, semBase - 8, 28, 10, {
		fill: INK,
		depth: PROP + 7,
	});
	rect(push, "semaphore-post", semX, semTop, 8, semBase - semTop, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 3,
		depth: PROP + 8,
	});
	if (highball) {
		line(
			push,
			"semaphore-arm",
			pivotX,
			pivotY,
			pivotX + 28,
			pivotY - 28,
			INK,
			5,
			PROP + 9,
		);
		rect(push, "semaphore-lamp", pivotX + 24, pivotY - 40, 13, 13, {
			fill: GO,
			stroke: INK,
			lineWidth: 2,
			depth: PROP + 10,
		});
		text(
			push,
			"highball-label",
			pivotX + 44,
			pivotY - 42,
			"HIGHBALL",
			"label",
			INK,
			PROP + 10,
		);
	} else {
		line(
			push,
			"semaphore-arm",
			pivotX,
			pivotY,
			pivotX + 26,
			pivotY + 26,
			INK,
			5,
			PROP + 9,
		);
	}
}

function drawWorld(push: Push, input: PresenterInput): void {
	const world = input.world;
	if (!world) return;
	for (const camp of world.camps) {
		sticker(
			push,
			`camp-${camp.id}-shadow`,
			camp.x,
			camp.y,
			camp.w,
			camp.h,
			PROP - 1,
		);
		rect(push, `camp-${camp.id}`, camp.x, camp.y, camp.w, camp.h, {
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: PROP,
		});
		text(
			push,
			`camp-${camp.id}-label`,
			camp.x + 6,
			camp.y + 4,
			camp.label.slice(0, 12),
			"label",
			INK,
			PROP + 1,
		);
	}
	for (const ch of world.characters) {
		push({
			kind: "sprite",
			id: `npc-${ch.id}`,
			x: ch.x,
			y: ch.y,
			animationId: ch.animationId,
			scale: 0.5,
			...(ch.state === "idle" ? { alpha: 0.6 } : {}),
			depth: D.characters,
			testFrame: input.testMode ? 0 : null,
		});
		const headY = ch.y - 62;
		if (ch.state === "stuck") {
			text(
				push,
				`npc-${ch.id}-stuck`,
				ch.x - 3,
				headY - 14,
				"!",
				"mono12",
				SPARK,
				D.characters + 2,
			);
		}
		if (ch.state === "reading") {
			rect(push, `npc-${ch.id}-book`, ch.x + 8, headY + 22, 12, 8, {
				fill: PAPER,
				stroke: INK,
				lineWidth: 1,
				depth: D.characters + 2,
			});
		}
		if (ch.health < 1) {
			rect(push, `npc-${ch.id}-health-bg`, ch.x - 14, headY - 6, 28, 4, {
				fill: PAPER,
				stroke: INK,
				lineWidth: 1,
				depth: D.characters + 2,
			});
			rect(
				push,
				`npc-${ch.id}-health`,
				ch.x - 13,
				headY - 5,
				Math.max(1, 26 * ch.health),
				2,
				{
					fill: ch.health < 0.4 ? SPARK : GO,
					depth: D.characters + 3,
				},
			);
		}
		if (ch.bubble) {
			const body = ch.bubble.slice(0, 24);
			const bw = Math.min(160, body.length * 6 + 12);
			// Never occlude the Bootstrap Desk (DESIGN.md reserved regions).
			const desk = YARD_LAYOUT.zones.bootstrapDesk;
			const bx = Math.max(desk.x + desk.width + 8, ch.x - bw / 2);
			rect(push, `npc-${ch.id}-bubble`, bx, headY - 32, bw, 16, {
				fill: "#fffdf7",
				stroke: INK,
				lineWidth: 1,
				depth: D.ui + 2,
			});
			text(
				push,
				`npc-${ch.id}-bubble-text`,
				bx + 6,
				headY - 29,
				body,
				"mono9",
				INK,
				D.ui + 3,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Lantern inspect — the free read verb
// ---------------------------------------------------------------------------

export type LanternLine = Readonly<{
	label: string;
	value: string;
	/** Synthetic values must always be badged (DESIGN.md signal provenance). */
	simulated?: boolean;
}>;

const LANTERN_MAX_LINES = 6;
const LANTERN_VALUE_MAX = 28;

function money(n: number): string {
	return `$${n.toFixed(2)}`;
}

/**
 * Real projection fields for a zone — nothing invented. Any value that is not
 * measured carries `simulated`, which renders a `(SIMULATED)` suffix.
 */
export function lanternLines(
	zone: ZoneId,
	visual: YardVisualState | null,
	waybills: readonly Waybill[],
): readonly LanternLine[] {
	const v = visual;
	if (!v) return [{ label: "projection", value: "(awaiting snapshot)" }];
	switch (zone) {
		case "platformRest":
			return [
				{ label: "station", value: v.station.id },
				{ label: "status", value: v.station.status },
				{ label: "seq", value: String(v.seq) },
			];
		case "bootstrapDesk":
			return [
				{
					label: "bootstrap",
					value: v.bootstrapDesk.active ? "active" : "idle",
				},
				{ label: "waybills", value: String(waybills.length) },
				...(waybills[0]
					? [{ label: "top", value: waybills[0].title } as LanternLine]
					: []),
			];
		case "activeRailTrack":
			return [
				{
					label: "activeRail",
					value: v.station.activeRailHash
						? v.station.activeRailHash.replace(/^sha256:/, "").slice(0, 18)
						: "(none)",
				},
				{ label: "occupyMode", value: v.occupyMode },
				{
					label: "trafficRate",
					value: v.traffic.rate.toFixed(2),
					simulated: v.traffic.source !== "otlp",
				},
			];
		case "connectionBay":
			return v.connections.length === 0
				? [{ label: "connections", value: "(none)" }]
				: v.connections.slice(0, LANTERN_MAX_LINES).map((c) => ({
						label: c.alias || c.id,
						value: `${c.provider} · ${c.status}`,
					}));
		case "policyBoard":
			return v.rails.length === 0
				? [{ label: "rails", value: "(none)" }]
				: v.rails.slice(0, LANTERN_MAX_LINES).map((r) => ({
						label: r.contentHash.replace(/^sha256:/, "").slice(0, 18),
						value: r.visual,
					}));
		case "costBooth":
			return [
				{
					label: "quota",
					value: `${v.costMeter.quotaUsed} / ${v.costMeter.quotaLimit}`,
				},
				{ label: "budgetUsd", value: money(v.costMeter.budgetUsd) },
				{ label: "spendCapUsd", value: money(v.costMeter.spendCapUsd) },
				{
					label: "trafficRate",
					value: v.traffic.rate.toFixed(2),
					simulated: v.traffic.source !== "otlp",
				},
			];
		case "errorBunker":
			return v.errorBunker.hazards.length === 0
				? [
						{ label: "hazards", value: "(none)" },
						{ label: "hint", value: v.errorBunker.hint ?? "(no hint)" },
					]
				: [
						...v.errorBunker.hazards
							.slice(0, LANTERN_MAX_LINES - 1)
							.map((h, i) => ({ label: `hazard${i}`, value: h })),
						{ label: "hint", value: v.errorBunker.hint ?? "(no hint)" },
					];
	}
}

function truncate(value: string): string {
	return value.length > LANTERN_VALUE_MAX
		? `${value.slice(0, LANTERN_VALUE_MAX - 1)}…`
		: value;
}

/** Format one card row; synthetic values always keep their provenance badge. */
export function lanternRowText(line: LanternLine): string {
	const value = truncate(line.value);
	return `${line.label}: ${value}${line.simulated ? " (SIMULATED)" : ""}`;
}

function drawLantern(push: Push, input: PresenterInput, zone: ZoneId): void {
	const rows = lanternLines(zone, input.visual, input.waybills).slice(
		0,
		LANTERN_MAX_LINES,
	);
	const texts = rows.map(lanternRowText);
	const widest = texts.reduce((m, t) => Math.max(m, t.length), 0);
	const w = Math.min(320, Math.max(150, widest * 5.6 + 22));
	const h = 26 + rows.length * 13 + 8;

	const z = YARD_LAYOUT.zones[zone];
	const x = clamp(z.x + 8, 8, YARD_LAYOUT.width - w - 8);
	const y = clamp(z.y + z.height + 10, 8, YARD_LAYOUT.height - h - 8);

	sticker(push, "lantern-card-shadow", x, y, w, h, LANTERN_D - 1);
	rect(push, "lantern-card", x, y, w, h, {
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: LANTERN_D,
	});
	text(
		push,
		"lantern-card-title",
		x + 8,
		y + 6,
		SIGN_TEXT[zone],
		"label",
		INK,
		LANTERN_D + 1,
	);
	line(
		push,
		"lantern-card-rule",
		x + 8,
		y + 22,
		x + w - 8,
		y + 22,
		BORDER,
		1,
		LANTERN_D + 1,
	);
	texts.forEach((body, i) => {
		text(
			push,
			`lantern-line-${i}`,
			x + 8,
			y + 26 + i * 13,
			body,
			"mono9",
			rows[i]?.simulated ? MUTE : INK,
			LANTERN_D + 1,
		);
	});
}

function clamp(value: number, lo: number, hi: number): number {
	return Math.min(Math.max(value, lo), Math.max(lo, hi));
}
