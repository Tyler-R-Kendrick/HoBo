/**
 * YardScenePresenter — pure (state → declarative render model).
 * The Phaser scene reconciles this model into GameObjects; nothing here
 * imports Phaser, so render output is unit-testable headlessly.
 *
 * The yard is the STATION VILLAGE (ADR-0146): a top-down pixel-RPG town built
 * entirely from vendored Kenney CC0 tiles. Camps are houses, Bindles are the
 * villagers standing outside them, the active rail is the road, the approval
 * gate is a notice board, quota and spend are the treasury, and a doctor hazard
 * is a marker planted on the thing it affects. Props are never assembled out of
 * rectangles — `village.ts` owns the tile vocabulary and this module only
 * places it. Rects and text remain for CHROME (cards, badges, labels) only.
 */

import type { YardVisualState } from "../entity-state.js";
import { YARD_LAYOUT, type ZoneId } from "../layout.js";
import type { TrainView } from "../trains.js";
import {
	BANNER,
	fenceTiles,
	groundTiles,
	HOUSE_PLOTS,
	HOUSE_TILES_H,
	houseTiles,
	LANDMARK,
	OPERATOR_SPRITE,
	roadTiles,
	type SheetId,
	sceneryTiles,
	T,
	TILE,
	TILE_SCALE,
	type TilePlacement,
	tilePx,
	villagerFor,
	ZONE_TILE_RECT,
} from "../village.js";
import type { Waybill } from "../waybills.js";
import type { WorldCharacterView, WorldView } from "../world-view.js";

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
			kind: "tile";
			id: string;
			/** Sheet id from assets_index.json (town/chars/rogue/ui/...). */
			sheet: string;
			/** Frame index within that sheet. */
			index: number;
			x: number;
			y: number;
			/** Integer scale only (DESIGN.md). */
			scale: number;
			alpha?: number;
			/** Multiply tint — the night pass darkens the art with it. */
			tint?: string;
			depth: number;
	  };

export type RenderModel = Readonly<{ items: readonly RenderItem[] }>;

/** Day = noon village; night = the same village under a cold moon. */
export type YardTheme = "day" | "night";

export type PresenterInput = Readonly<{
	visual: YardVisualState | null;
	zone: ZoneId;
	selectedZone: ZoneId | null;
	/** Zone under the pointer — raises the lantern truth card (free read verb). */
	hoveredZone?: ZoneId | null;
	speech: string | null;
	particles: readonly { x: number; y: number; alive: boolean }[];
	testMode: boolean;
	ready: boolean;
	/** World model view (camps + Bindles); null before the first snapshot. */
	world: WorldView | null;
	/** True when scenario snapshots drive the yard (synthetic data → badge). */
	scenarioMode: boolean;
	/** Waybills pinned to the notice board, priority-ordered (top first). */
	waybills: readonly Waybill[];
	/** Deployment sagas as rolling stock; empty when no durable store exists. */
	trains?: readonly TrainView[];
	/** Highball goal state: clean board derived from reality only. */
	highball: boolean;
	/**
	 * Transient feedback in flight. Motion is accent only: under
	 * `reducedMotion` the same beat still lands, as a static state.
	 */
	fx?: { kind: "stamp" | "derail"; elapsedMs: number } | null;
	/** Wall-clock ms, drives ambient life (the idle village must not be a still). */
	timeMs?: number;
	reducedMotion?: boolean;
}>;

// DESIGN.md tokens. Colour is expected here — this is not a monochrome system.
const OUTLINE = "#3f2631";
const DEEP = "#262b44";
const STONE = "#c0cbdc";
const SLATE = "#52607c";
const GRASS = "#84c669";
const PATH = "#eaa56c";
const WOOD = "#a35422";
const ACCENT = "#37aaa5";
const DANGER = "#c34b35";
const PARCHMENT = "#f4f1e8";

const D = YARD_LAYOUT.depths;
/** The meadow, then the road laid over it. */
const GROUND_D = D.background;
const ROAD_D = D.background + 1;
/** Buildings and boundary. */
const HOUSE_D = D.track;
const FENCE_D = D.track + 1;
const SCENERY_D = D.track + 2;
/** Yard furniture: notice board, treasury, stores, hazard. */
const PROP_D = D.bay;
/** Rolling stock rides the road, above it but under the villagers. */
const TRAIN_D = D.bay + 4;
const CHAR_D = D.characters;
/** State markers ride directly over the villager they belong to. */
const MARK_D = D.characters + 2;
const LABEL_D = D.ui - 2;
const UI_D = D.ui;
/** Lantern truth card floats over everything but the DOM sheet. */
const LANTERN_D = D.ui + 6;

/**
 * The meadow and the treeline are deterministic: the same seed always grows the
 * same village, so a screenshot diff only ever reports a real change.
 */
const VILLAGE_SEED = 0x484f_424f;

/** Markers are countable, not infinite: six rows of escalation is plenty. */
const MAX_HAZARD_MARKS = 6;

/** Zone display copy — the lantern card's title and the a11y announcement. */
const ZONE_TEXT: Record<ZoneId, string> = {
	platformRest: "PLATFORM",
	bootstrapDesk: "NOTICE BOARD",
	activeRailTrack: "THE ROAD",
	connectionBay: "THE GATE",
	policyBoard: "POLICY BOARD",
	costBooth: "TREASURY",
	errorBunker: "HAZARD",
};

const STAMP_SQUASH_MS = 160;
const STAMP_SQUASH_PCT = 0.2;
const DERAIL_HIT_STOP_MS = 120;

/** 0..STAMP_SQUASH_PCT — a slam that springs back, never a held deformation. */
export function stampSquash(input: PresenterInput): number {
	if (input.reducedMotion) return 0;
	const fx = input.fx;
	if (fx?.kind !== "stamp") return 0;
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

/**
 * Frame to pin an animated sprite to, or null to let a clip play.
 *
 * Reduced motion means *still*, not silent: the village holds a representative
 * frame while every state around it (markers, papers, banner, hazard) still
 * carries the information. Test mode pins frames for determinism.
 */
export function pinnedFrame(
	input: PresenterInput,
	restFrame: number,
): number | null {
	if (input.testMode) return restFrame;
	if (input.reducedMotion) return restFrame;
	return null;
}

/**
 * Night is the same village under a cold moon: chrome grounds invert and the
 * tiled art is tinted down. Functional colour (danger, accent, grass, path)
 * keeps its hue in both themes — a hazard must read as a hazard at night.
 */
const NIGHT_SWAP: Record<string, string> = {
	[PARCHMENT]: DEEP,
	[STONE]: "#1a1420",
	[OUTLINE]: PARCHMENT,
	[DEEP]: STONE,
	[SLATE]: STONE,
	[WOOD]: "#763b36",
};

/** Moonlight multiply tint for every tile at night. */
const NIGHT_TINT = "#7480b4";

export function applyTheme(model: RenderModel, theme: YardTheme): RenderModel {
	if (theme === "day") return model;
	const swap = (c: string | undefined) =>
		c === undefined ? undefined : (NIGHT_SWAP[c] ?? c);
	return Object.freeze({
		items: model.items.map((item) => {
			switch (item.kind) {
				case "rect":
					return Object.freeze({
						...item,
						...(item.fill ? { fill: swap(item.fill) as string } : {}),
						...(item.stroke ? { stroke: swap(item.stroke) as string } : {}),
					});
				case "line":
					return Object.freeze({ ...item, color: swap(item.color) as string });
				case "text":
					return Object.freeze({ ...item, color: swap(item.color) as string });
				case "tile":
					return Object.freeze({ ...item, tint: NIGHT_TINT });
				default:
					return item;
			}
		}),
	});
}

/**
 * Idle bob for a villager, in whole display pixels.
 *
 * A village of static tiles is a diagram — the liveness gate catches exactly
 * that. Each Bindle bobs on its own phase so the town reads inhabited, in
 * two-frame steps so pixels stay whole. Reduced motion holds everyone still;
 * the villager, its health pip and its marker all remain legible.
 */
export function villagerBob(input: PresenterInput, id: string): number {
	if (input.reducedMotion || input.testMode) return 0;
	const t = input.timeMs ?? 0;
	let h = 2166136261 >>> 0;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	const phase = ((h % 1000) / 1000) * Math.PI * 2;
	return Math.sin(t / 520 + phase) > 0 ? -TILE_SCALE : 0;
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

/** Hard 4px sticker offset — never a soft blur (DESIGN.md). */
function sticker(
	push: Push,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	depth: number,
): void {
	rect(push, id, x + 4, y + 4, w, h, { fill: OUTLINE, fillAlpha: 0.35, depth });
}

/** Place one measured tile from a vendored sheet at a tile coordinate. */
function tileAt(
	push: Push,
	id: string,
	sheet: SheetId,
	index: number,
	tx: number,
	ty: number,
	depth: number,
	alpha?: number,
): void {
	const { x, y } = tilePx(tx, ty);
	push({
		kind: "tile",
		id,
		sheet,
		index,
		x,
		y,
		scale: TILE_SCALE,
		...(alpha === undefined ? {} : { alpha }),
		depth,
	});
}

function placement(push: Push, id: string, t: TilePlacement, depth: number) {
	tileAt(push, id, t.sheet, t.index, t.tx, t.ty, depth);
}

/** A square chrome panel: parchment ground, hard outline, zero radius. */
function panel(
	push: Push,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	depth: number,
): void {
	sticker(push, `${id}-shadow`, x, y, w, h, depth - 1);
	rect(push, id, x, y, w, h, {
		fill: PARCHMENT,
		stroke: OUTLINE,
		lineWidth: 3,
		depth,
	});
}

// ---------------------------------------------------------------------------
// Villager placement — the one place that says where a Bindle stands
// ---------------------------------------------------------------------------

export type VillagerPlacement = Readonly<{
	id: string;
	campId: string;
	/** Frame index on the `chars` sheet — stable per Bindle id. */
	sprite: number;
	x: number;
	y: number;
	tx: number;
	ty: number;
	state: WorldCharacterView["state"];
	health: number;
	bubble: string | null;
}>;

/**
 * One villager per real Bindle, standing on its Camp's doorstep slot.
 *
 * Exported so the test seam reports the SAME position the scene draws — a
 * seam that reports coordinates nothing stands at is worse than no seam.
 */
export function villagePlacements(
	world: WorldView | null,
): readonly VillagerPlacement[] {
	if (!world) return [];
	const out: VillagerPlacement[] = [];
	world.camps.slice(0, HOUSE_PLOTS.length).forEach((camp, campIndex) => {
		const plot = HOUSE_PLOTS[campIndex];
		if (!plot) return;
		const members = world.characters.filter((c) => c.campId === camp.id);
		members.slice(0, plot.standing.length).forEach((ch, i) => {
			const slot = plot.standing[i];
			if (!slot) return;
			const { x, y } = tilePx(slot.tx, slot.ty);
			out.push(
				Object.freeze({
					id: ch.id,
					campId: ch.campId,
					sprite: villagerFor(ch.id),
					x,
					y,
					tx: slot.tx,
					ty: slot.ty,
					state: ch.state,
					health: ch.health,
					bubble: ch.bubble,
				}),
			);
		});
	});
	return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// The village
// ---------------------------------------------------------------------------

export function presentYard(input: PresenterInput): RenderModel {
	const items: RenderItem[] = [];
	const push: Push = (item) => {
		items.push(item);
	};
	const v = input.visual;

	drawGround(push);
	drawHouses(push, input);
	drawFence(push, v);
	drawScenery(push);
	drawTrains(push, input);
	drawVillagers(push, input);
	drawLandmarks(push, input);
	drawWaybills(push, input);
	drawOperator(push, input);
	drawRails(push, input);
	drawStationState(push, input);
	drawBanner(push, input);
	drawParticles(push, input);
	drawHud(push, input);

	if (input.hoveredZone) drawLantern(push, input, input.hoveredZone);

	// Derail hit-stop: one danger band across the road. The derailed train's
	// reason text already states the failure, so reduced motion loses only the
	// flash, never the fact.
	if (derailHitStop(input)) {
		const t = YARD_LAYOUT.zones.activeRailTrack;
		rect(push, "derail-flash", t.x, t.y, t.width, t.height, {
			fill: DANGER,
			fillAlpha: 0.28,
			depth: D.particles + 1,
		});
	}

	return Object.freeze({ items });
}

/** The meadow, then the road that renders the active rail. */
function drawGround(push: Push): void {
	for (const t of groundTiles(VILLAGE_SEED)) {
		placement(push, `ground-${t.tx}-${t.ty}`, t, GROUND_D);
	}
	for (const t of roadTiles()) {
		placement(push, `road-${t.tx}-${t.ty}`, t, ROAD_D);
	}
}

/** One house per REAL Camp — never a decorative building. */
function drawHouses(push: Push, input: PresenterInput): void {
	const camps = (input.world?.camps ?? []).slice(0, HOUSE_PLOTS.length);
	camps.forEach((camp, i) => {
		const plot = HOUSE_PLOTS[i];
		if (!plot) return;
		houseTiles(plot).forEach((t, j) => {
			placement(push, `house-${camp.id}-${j}`, t, HOUSE_D);
		});
		// The Camp names itself over its own roof. Below the door is where its
		// Bindles stand, so a label there would sit on their heads.
		text(
			push,
			`camp-${camp.id}-label`,
			plot.tx * TILE,
			plot.ty * TILE - 16,
			camp.label.slice(0, 14),
			"label",
			OUTLINE,
			LABEL_D,
		);
	});
}

/** Boundary fence; an authorized Connection stands its gate open. */
function drawFence(push: Push, v: YardVisualState | null): void {
	const gateOpen = (v?.connections ?? []).some(
		(c) => c.visual === "authorized",
	);
	for (const t of fenceTiles(gateOpen)) {
		placement(push, `fence-${t.tx}-${t.ty}`, t, FENCE_D);
	}
}

function drawScenery(push: Push): void {
	for (const t of sceneryTiles(VILLAGE_SEED)) {
		placement(push, `tree-${t.tx}-${t.ty}`, t, SCENERY_D);
	}
}

/** Villagers = Bindles. State is carried by alpha plus a planted marker. */
function drawVillagers(push: Push, input: PresenterInput): void {
	for (const p of villagePlacements(input.world)) {
		// Idle dims; working (and anything else the projection reports) is solid.
		const alpha = p.state === "idle" ? 0.65 : 1;
		// The whole villager — body, pip and marker — rides the same bob so the
		// group never comes apart.
		const bob = villagerBob(input, p.id);
		push({
			kind: "tile",
			id: `npc-${p.id}`,
			sheet: "chars",
			index: p.sprite,
			x: p.x,
			y: p.y + bob,
			scale: TILE_SCALE,
			alpha,
			depth: CHAR_D,
		});

		// A hazard marker is planted on the thing it affects (DESIGN.md).
		if (p.state === "stuck" || p.health < 0.4) {
			push({
				kind: "tile",
				id: `npc-${p.id}-danger`,
				sheet: "town",
				index: T.target,
				x: p.tx * TILE,
				y: (p.ty - 1) * TILE + bob,
				scale: TILE_SCALE,
				depth: MARK_D,
			});
		}

		// Health below full is real information, so it stays legible as chrome.
		if (p.health < 1) {
			const barY = p.y - 8 + bob;
			rect(push, `npc-${p.id}-health-bg`, p.x + 8, barY, 32, 6, {
				fill: PARCHMENT,
				stroke: OUTLINE,
				lineWidth: 1,
				depth: MARK_D,
			});
			rect(
				push,
				`npc-${p.id}-health`,
				p.x + 9,
				barY + 1,
				Math.max(1, Math.round(30 * p.health)),
				4,
				{ fill: p.health < 0.4 ? DANGER : GRASS, depth: MARK_D + 1 },
			);
		}

		if (p.bubble) {
			speechBubble(
				push,
				`npc-${p.id}-bubble`,
				p.x - 20,
				p.y - 44 + bob,
				p.bubble,
				24,
			);
		}
	}
}

/** The Operator: the one villager the reader is. Replaces Bo. */
function drawOperator(push: Push, input: PresenterInput): void {
	if (!input.ready) return;
	const at = LANDMARK.operator;
	tileAt(push, "operator", "chars", OPERATOR_SPRITE, at.tx, at.ty, CHAR_D);
	if (input.speech) {
		const { x, y } = tilePx(at.tx, at.ty);
		speechBubble(push, "speech", x - 40, y - 44, input.speech, 28);
	}
}

/** Square parchment bubble + its text. Chrome, so rects are allowed. */
function speechBubble(
	push: Push,
	id: string,
	x: number,
	y: number,
	body: string,
	max: number,
): void {
	const copy = body.slice(0, max);
	const w = Math.min(240, copy.length * 7 + 18);
	const bx = clamp(x, 4, YARD_LAYOUT.width - w - 4);
	const by = clamp(y, 4, YARD_LAYOUT.height - 26);
	rect(push, id, bx, by, w, 22, {
		fill: PARCHMENT,
		stroke: OUTLINE,
		lineWidth: 2,
		depth: D.ui + 2,
	});
	text(push, `${id}-text`, bx + 8, by + 5, copy, "mono11", OUTLINE, D.ui + 3);
}

/**
 * Fixed village landmarks. Every one is a projection: the notice board is the
 * waybill desk, the treasury is quota and spend, the stores are the platform,
 * and the hazard only ever appears when the doctor reports one.
 */
function drawLandmarks(push: Push, input: PresenterInput): void {
	const v = input.visual;

	// --- notice board (the approval gate) ---
	const nb = LANDMARK.noticeBoard;
	tileAt(push, "notice-board-0", "town", T.signpost, nb.tx, nb.ty, PROP_D);
	tileAt(push, "notice-board-1", "town", T.signpost, nb.tx + 1, nb.ty, PROP_D);

	// --- stores (the platform: what the Station keeps on hand) ---
	const st = LANDMARK.stores;
	tileAt(push, "stores-barrel", "town", T.barrel, st.tx, st.ty, PROP_D);
	tileAt(push, "stores-chest", "town", T.chest, st.tx + 1, st.ty, PROP_D);

	// --- treasury (quota + spend) ---
	// The pile has to *grow*: two fixed coins encode nothing, so a projection
	// that moves leaves the picture unchanged (a dead region under the
	// liveness gate).
	const tr = LANDMARK.treasury;
	const quota = Math.max(0, Math.min(1, v?.costMeter.fill ?? 0));
	// The hoard tile itself steps through tiers, so the level is encoded at the
	// base of the pile rather than only in its height — a pile that only grows
	// upward leaves the tile you are actually looking at unchanged.
	const hoard =
		quota >= 0.9
			? T.chestOpen
			: quota >= 0.66
				? T.chest
				: quota >= 0.33
					? T.coinLarge
					: T.coinSmall;
	tileAt(push, "treasury-coin-large", "town", hoard, tr.tx, tr.ty, PROP_D);
	tileAt(
		push,
		"treasury-coin-small",
		"town",
		quota >= 0.5 ? T.coinLarge : T.coinSmall,
		tr.tx + 1,
		tr.ty,
		PROP_D,
	);
	// …and the pile still grows, so scale reads at a glance too.
	const extra = Math.max(0, Math.ceil(quota * 4) - 1);
	for (let i = 0; i < extra; i++) {
		tileAt(
			push,
			`treasury-coin-${i + 2}`,
			"town",
			i % 2 === 0 ? T.coinSmall : T.coinLarge,
			tr.tx + (i % 3),
			tr.ty - 1 - Math.floor(i / 3),
			PROP_D,
		);
	}
	// Over the spend cap is a real failure: mark it where the money is.
	if ((v?.costMeter.heat ?? 0) > 0.8) {
		tileAt(
			push,
			"treasury-over-cap",
			"town",
			T.target,
			tr.tx + 2,
			tr.ty - 1,
			MARK_D,
		);
	}
	const fill = v?.costMeter.fill ?? 0;
	const heat = v?.costMeter.heat ?? 0;
	text(
		push,
		"treasury-label",
		tr.tx * TILE - 8,
		(tr.ty + 1) * TILE + 2,
		`quota ${(fill * 100).toFixed(0)}%`,
		"mono11",
		heat > 0.8 ? DANGER : OUTLINE,
		PROP_D + 2,
	);

	// --- hazards ---
	const hazards = v?.errorBunker.hazards ?? [];
	if (!v?.errorBunker.active) return;
	const hz = LANDMARK.hazardSpur;
	tileAt(push, "hazard-bomb", "town", T.bomb, hz.tx, hz.ty, PROP_D);
	// ONE marker per hazard: a binary "on fire / not" hides the difference
	// between one nuisance and a Station coming apart (HYX GLA-2). Markers wrap
	// three to a row above the hazard so the count stays countable.
	hazards.slice(0, MAX_HAZARD_MARKS).forEach((_, i) => {
		const col = i % 3;
		const row = Math.floor(i / 3);
		tileAt(
			push,
			`hazard-mark-${i}`,
			"town",
			T.target,
			hz.tx - 1 + col,
			hz.ty - 1 - row,
			PROP_D + 1,
		);
	});
	// The reasons go on a plaque, not loose on the grass: danger text over a
	// green meadow is the one place this palette has no contrast to spare, and
	// the plaque also keeps a tree from growing through the last word.
	const shown = hazards.slice(0, 3);
	const plaqueW = 240;
	const plaqueX = YARD_LAYOUT.width - plaqueW - 10;
	const plaqueY = (hz.ty + 1) * TILE - 2;
	rect(
		push,
		"hazard-plaque",
		plaqueX,
		plaqueY,
		plaqueW,
		12 + shown.length * 12,
		{
			fill: PARCHMENT,
			stroke: DANGER,
			lineWidth: 2,
			depth: PROP_D + 2,
		},
	);
	shown.forEach((h, i) => {
		text(
			push,
			`hazard-text-${i}`,
			plaqueX + 6,
			plaqueY + 6 + i * 12,
			h.slice(0, 34),
			"mono9",
			DANGER,
			PROP_D + 3,
		);
	});
}

/** Highball: the town banner raised over the road. */

/**
 * Rail lifecycle on the policy board.
 *
 * A rail moving draft -> approved -> active is a real projection change, so it
 * must change the picture. Each rail is a signpost; an approved one gains a
 * chest (sealed), an active one flies the banner. Without this the policy
 * board is a dead region.
 */
function drawRails(push: Push, input: PresenterInput): void {
	const rails = input.visual?.rails ?? [];
	const plot = ZONE_TILE_RECT.policyBoard;
	rails.slice(0, 3).forEach((rail, i) => {
		const tx = plot.tx + i;
		const ty = plot.ty + plot.h - 1;
		// posts stand on the green; state markers sit on the post above them
		tileAt(push, `rail-${i}-post`, "town", T.signpost, tx, ty, PROP_D);
		if (rail.visual === "approved") {
			tileAt(push, `rail-${i}-approved`, "town", T.chest, tx, ty - 1, PROP_D);
		}
		if (rail.visual === "active") {
			tileAt(
				push,
				`rail-${i}-active`,
				BANNER.sheet,
				BANNER.top,
				tx,
				ty - 1,
				PROP_D,
			);
		}
	});
}

/**
 * A closed Station is a shuttered town: the whole village dims and the notice
 * board carries a marker. Opening it is the first-run beat, so it has to be
 * unmistakable rather than a text change somewhere off-region.
 */
function drawStationState(push: Push, input: PresenterInput): void {
	const v = input.visual;
	if (!v) return;
	const closed = v.bo.state === "asleep";
	if (!closed) return;
	const nb = LANDMARK.noticeBoard;
	tileAt(
		push,
		"station-closed-mark",
		"town",
		T.target,
		nb.tx,
		nb.ty - 1,
		MARK_D,
	);
	// A shutter over each camp door reads instantly as "nobody is home".
	for (const plot of HOUSE_PLOTS) {
		tileAt(
			push,
			`station-shutter-${plot.tx}`,
			"town",
			T.wall[1] as number,
			plot.tx + 1,
			plot.ty + HOUSE_TILES_H - 1,
			PROP_D + 1,
		);
	}
}

function drawBanner(push: Push, input: PresenterInput): void {
	if (!input.highball) return;
	const at = LANDMARK.banner;
	tileAt(push, "banner-top", BANNER.sheet, BANNER.top, at.tx, at.ty, PROP_D);
	tileAt(
		push,
		"banner-tail",
		BANNER.sheet,
		BANNER.tail,
		at.tx,
		at.ty + 1,
		PROP_D,
	);
	text(
		push,
		"highball-label",
		at.tx * TILE - 22,
		(at.ty + 2) * TILE + 4,
		"HIGHBALL",
		"label",
		OUTLINE,
		PROP_D + 1,
	);
}

/**
 * Waybills pinned under the notice board. Chrome, not props: they are paper the
 * operator reads, and paper is exactly what a square parchment card is.
 */
function drawWaybills(push: Push, input: PresenterInput): void {
	// Pinned beside the board rather than under it: the fence row is only two
	// tiles below the board and a card hanging over the boundary reads as litter.
	const nb = LANDMARK.noticeBoard;
	const baseX = (nb.tx + 2) * TILE + 8;
	const baseY = nb.ty * TILE + 4;
	const stack = input.waybills.slice(0, 3);
	// Stamp slam: the top card squashes ~20% then springs back inside the feel
	// budget (docs/validation/feel-budgets.json). Reduced motion keeps the card
	// still — the stamped state is already legible without the squash.
	const squash = stampSquash(input);
	stack.forEach((w, i) => {
		const wx = baseX + i * 8;
		const wy = baseY + i * 6;
		const base = PROP_D + 4 + (stack.length - 1 - i) * 3;
		const sq = i === 0 ? squash : 0;
		const h = Math.round(50 * (1 - sq));
		const dy = 50 - h;
		rect(push, `waybill-${i}-shadow`, wx + 3, wy + 3 + dy, 112, h, {
			fill: OUTLINE,
			fillAlpha: 0.3,
			depth: base,
		});
		rect(push, `waybill-${i}`, wx, wy + dy, 112, h, {
			fill: PARCHMENT,
			stroke: OUTLINE,
			lineWidth: 2,
			depth: base + 1,
		});
		text(
			push,
			`waybill-${i}-title`,
			wx + 6,
			wy + dy + 6,
			w.title.slice(0, 18),
			"mono9",
			OUTLINE,
			base + 2,
		);
		line(
			push,
			`waybill-${i}-rule`,
			wx + 6,
			wy + dy + 22,
			wx + 106,
			wy + dy + 22,
			SLATE,
			1,
			base + 2,
		);
	});
	if (input.waybills.length > 3) {
		const cx = baseX;
		const cy = baseY + 66;
		rect(push, "waybill-count-bg", cx, cy, 32, 18, {
			fill: OUTLINE,
			depth: PROP_D + 14,
		});
		text(
			push,
			"waybill-count",
			cx + 7,
			cy + 3,
			`+${input.waybills.length - 3}`,
			"mono11",
			PARCHMENT,
			PROP_D + 15,
		);
	}
}

/**
 * Train traffic: the deployment saga as rolling stock on the road.
 *
 * The vendored packs ship no rail cars at this scale, so rolling stock stays
 * hard-outlined chrome rectangles rather than a wrong-looking prop borrowed
 * from another pack. Nothing is drawn when the deployments projection is
 * unavailable — an honest empty road beats fabricated traffic.
 */
function drawTrains(push: Push, input: PresenterInput): void {
	for (const train of input.trains ?? []) {
		const derailed = train.phase === "derailed";
		const edge = derailed ? DANGER : OUTLINE;
		rect(push, `${train.id}-loco`, train.locomotiveX, train.y - 30, 52, 30, {
			fill: WOOD,
			stroke: edge,
			lineWidth: 3,
			depth: TRAIN_D + 1,
		});
		rect(
			push,
			`${train.id}-stack`,
			train.locomotiveX + 6,
			train.y - 42,
			10,
			12,
			{
				fill: OUTLINE,
				depth: TRAIN_D + 1,
			},
		);
		text(
			push,
			`${train.id}-label`,
			train.locomotiveX,
			train.y - 58,
			train.deploymentId.slice(0, 14),
			"mono9",
			derailed ? DANGER : DEEP,
			TRAIN_D + 2,
		);
		if (derailed && train.reason) {
			// A derail is the loudest thing on screen and states the real reason.
			text(
				push,
				`${train.id}-reason`,
				train.locomotiveX - 40,
				train.y - 72,
				train.reason.slice(0, 28),
				"mono9",
				DANGER,
				TRAIN_D + 2,
			);
		}
		for (const car of train.cars) {
			const failed = car.visual === "failed";
			rect(push, car.id, car.x, car.y - car.h, car.w, car.h, {
				// solid = provisioned, outline = provisioning, ghost = destroyed.
				...(car.visual === "solid" ? { fill: STONE } : {}),
				...(car.visual === "ghost" ? { fill: STONE, fillAlpha: 0.35 } : {}),
				stroke: failed ? DANGER : OUTLINE,
				lineWidth: failed ? 3 : 2,
				depth: TRAIN_D,
			});
			if (car.visual === "hatched") {
				line(
					push,
					`${car.id}-hatch`,
					car.x,
					car.y,
					car.x + car.w,
					car.y - car.h,
					OUTLINE,
					2,
					TRAIN_D + 1,
				);
			}
		}
	}
}

/** Cargo moving down the road — never in test mode: stable screenshots. */
function drawParticles(push: Push, input: PresenterInput): void {
	if (input.testMode || input.reducedMotion) return;
	input.particles.forEach((p, i) => {
		if (!p.alive) return;
		rect(push, `particle-${i}`, p.x, p.y, 10, 8, {
			fill: WOOD,
			stroke: OUTLINE,
			lineWidth: 2,
			depth: D.particles,
		});
	});
}

/** HUD caption + the SIMULATED film-leader tag. */
function drawHud(push: Push, input: PresenterInput): void {
	panel(push, "hud-card", 16, 16, 292, 52, UI_D + 1);
	text(
		push,
		"hud-title",
		26,
		24,
		"HIGHBALL! · single Station",
		"label",
		OUTLINE,
		UI_D + 2,
	);
	text(
		push,
		"hud-meta",
		26,
		42,
		`zone=${input.zone}`,
		"mono11",
		SLATE,
		UI_D + 2,
	);

	// TRU-1: synthetic data always badges itself.
	if (input.world?.demo === true || input.scenarioMode) {
		const bw = 108;
		const bx = YARD_LAYOUT.width - bw - 14;
		rect(push, "simulated-badge", bx, 14, bw, 22, {
			fill: PARCHMENT,
			stroke: OUTLINE,
			lineWidth: 2,
			depth: UI_D + 3,
		});
		text(
			push,
			"simulated-badge-text",
			bx + 14,
			19,
			"SIMULATED",
			"label",
			OUTLINE,
			UI_D + 4,
		);
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
		fill: PARCHMENT,
		stroke: OUTLINE,
		lineWidth: 2,
		depth: LANTERN_D,
	});
	text(
		push,
		"lantern-card-title",
		x + 8,
		y + 6,
		ZONE_TEXT[zone],
		"label",
		OUTLINE,
		LANTERN_D + 1,
	);
	line(
		push,
		"lantern-card-rule",
		x + 8,
		y + 22,
		x + w - 8,
		y + 22,
		SLATE,
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
			rows[i]?.simulated ? SLATE : OUTLINE,
			LANTERN_D + 1,
		);
	});
}

function clamp(value: number, lo: number, hi: number): number {
	return Math.min(Math.max(value, lo), Math.max(lo, hi));
}

/** Village palette, exported so chrome elsewhere can stay on-system. */
export const VILLAGE_PALETTE = Object.freeze({
	outline: OUTLINE,
	deep: DEEP,
	stone: STONE,
	slate: SLATE,
	grass: GRASS,
	path: PATH,
	wood: WOOD,
	accent: ACCENT,
	danger: DANGER,
	parchment: PARCHMENT,
});
