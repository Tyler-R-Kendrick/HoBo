/**
 * YardScenePresenter — pure (state → declarative render model).
 * The Phaser scene reconciles this model into GameObjects; nothing here
 * imports Phaser, so render output is unit-testable headlessly.
 * Visual grammar mirrors the pre-Phaser canvas host (M0: no behavior change).
 */

import type { YardVisualState } from "../entity-state.js";
import { YARD_LAYOUT, type ZoneId } from "../layout.js";
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
	/** Highball goal state: clean board derived from reality only. */
	highball: boolean;
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

export function presentYard(input: PresenterInput): RenderModel {
	const items: RenderItem[] = [];
	const v = input.visual;

	// --- background ---
	items.push({
		kind: "line",
		id: "horizon",
		x1: 0,
		y1: 200,
		x2: YARD_LAYOUT.width,
		y2: 200,
		color: BORDER,
		lineWidth: 1,
		depth: D.background,
	});
	if (input.hasImage("bg-poles")) {
		items.push({
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
		items.push({
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
	items.push({
		kind: "rect",
		id: "ground-strip",
		x: 0,
		y: YARD_LAYOUT.groundY - 8,
		w: YARD_LAYOUT.width,
		h: YARD_LAYOUT.height - YARD_LAYOUT.groundY + 8,
		fill: PAPER,
		depth: D.background + 2,
	});
	items.push({
		kind: "line",
		id: "ground-line",
		x1: 0,
		y1: YARD_LAYOUT.groundY,
		x2: YARD_LAYOUT.width,
		y2: YARD_LAYOUT.groundY,
		color: INK,
		lineWidth: 2,
		depth: D.background + 2,
	});
	if (input.hasImage("bg-sky-cloud")) {
		items.push({
			kind: "image",
			id: "cloud-a",
			key: "bg-sky-cloud",
			x: 60,
			y: 24,
			w: 200,
			h: 80,
			depth: D.background,
		});
		items.push({
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

	// --- zone sticker cards ---
	for (const z of Object.values(YARD_LAYOUT.zones)) {
		const active = input.zone === z.id;
		const hot = input.selectedZone === z.id;
		items.push({
			kind: "rect",
			id: `zone-${z.id}-shadow`,
			x: z.x + 3,
			y: z.y + 3,
			w: z.width,
			h: z.height,
			fill: INK,
			fillAlpha: 0.12,
			depth: D.track,
		});
		items.push({
			kind: "rect",
			id: `zone-${z.id}`,
			x: z.x,
			y: z.y,
			w: z.width,
			h: z.height,
			fill: hot ? CREAM : PAPER,
			stroke: INK,
			lineWidth: active || hot ? 3 : 2,
			depth: D.track + 1,
		});
		if (active) {
			items.push({
				kind: "rect",
				id: `zone-${z.id}-rail`,
				x: z.x + 4,
				y: z.y + 4,
				w: z.width - 9,
				h: z.height - 9,
				stroke: INK,
				lineWidth: 1,
				depth: D.track + 1,
			});
		}
		items.push({
			kind: "text",
			id: `zone-${z.id}-label`,
			x: z.x + 10,
			y: z.y + 8,
			text: z.label,
			style: "label",
			color: INK,
			depth: D.track + 2,
		});
	}

	// --- rail track ---
	const track = YARD_LAYOUT.zones.activeRailTrack;
	const lit =
		Boolean(v?.traffic.active) ||
		(v?.occupyMode === "occupying" &&
			v.rails.some((r) => r.visual === "active"));
	items.push({
		kind: "rect",
		id: "track-bed",
		x: track.x,
		y: track.y + 20,
		w: track.width,
		h: 28,
		fill: lit ? INK : MUTE,
		depth: D.track + 2,
	});
	for (let x = track.x + 10, i = 0; x < track.x + track.width; x += 36, i++) {
		items.push({
			kind: "line",
			id: `track-tie-${i}`,
			x1: x,
			y1: track.y + 18,
			x2: x + 16,
			y2: track.y + 50,
			color: lit ? INK : FAINT,
			lineWidth: 2,
			depth: D.track + 2,
		});
	}
	if (lit) {
		for (
			let x = track.x + 8, i = 0;
			x < track.x + track.width - 8;
			x += 20, i++
		) {
			items.push({
				kind: "rect",
				id: `track-dash-${i}`,
				x,
				y: track.y + 33,
				w: 10,
				h: 2,
				fill: PAPER,
				depth: D.track + 3,
			});
		}
	}

	// --- rail plaques on policy board ---
	(v?.rails ?? []).slice(0, 5).forEach((r, i) => {
		const px = YARD_LAYOUT.zones.policyBoard.x + 16 + i * 60;
		const py = YARD_LAYOUT.zones.policyBoard.y + 40;
		const color =
			r.visual === "active"
				? GO
				: r.visual === "approved"
					? INK
					: r.visual === "draft"
						? MUTE
						: FAINT;
		items.push({
			kind: "rect",
			id: `rail-plaque-${i}`,
			x: px,
			y: py,
			w: 48,
			h: 28,
			fill: color,
			stroke: INK,
			lineWidth: 2,
			depth: D.track + 3,
		});
		items.push({
			kind: "text",
			id: `rail-plaque-${i}-label`,
			x: px + 4,
			y: py + 9,
			text: r.visual.slice(0, 6),
			style: "mono9",
			color: PAPER,
			depth: D.track + 4,
		});
	});

	// --- connection bays ---
	const bay = YARD_LAYOUT.zones.connectionBay;
	const conns = v?.connections ?? [];
	const slots = Math.max(3, conns.length);
	for (let i = 0; i < slots; i++) {
		const c = conns[i];
		const bx = bay.x + 24 + (i % 3) * 80;
		const by = bay.y + 40 + Math.floor(i / 3) * 70;
		const visual = c?.visual ?? "closed";
		const fill =
			visual === "authorized"
				? GO
				: visual === "pending"
					? INK
					: visual === "revoked"
						? SPARK
						: "#444444";
		items.push({
			kind: "rect",
			id: `bay-${i}`,
			x: bx,
			y: by,
			w: 56,
			h: 48,
			fill,
			stroke: "#111111",
			lineWidth: 2,
			depth: D.bay,
		});
		items.push({
			kind: "line",
			id: `bay-${i}-door`,
			x1: bx + 28,
			y1: by,
			x2: bx + 28,
			y2: by + 48,
			color: "#111111",
			lineWidth: 2,
			depth: D.bay + 1,
		});
		if (input.hasImage("connection-bay")) {
			items.push({
				kind: "image",
				id: `bay-${i}-icon`,
				key: "connection-bay",
				x: bx + 12,
				y: by + 8,
				w: 32,
				h: 32,
				depth: D.bay + 1,
			});
		}
		if (c) {
			items.push({
				kind: "text",
				id: `bay-${i}-label`,
				x: bx + 4,
				y: by + 36,
				text: (c.alias || c.provider || "?").slice(0, 7),
				style: "mono9",
				color: PAPER,
				depth: D.bay + 2,
			});
		}
	}

	// --- cost meter ---
	const m = YARD_LAYOUT.costMeter;
	const fill = v?.costMeter.fill ?? 0;
	const heat = v?.costMeter.heat ?? 0;
	items.push({
		kind: "rect",
		id: "cost-bg",
		x: m.x,
		y: m.y,
		w: m.width,
		h: m.height,
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: D.ui,
	});
	if (fill > 0) {
		items.push({
			kind: "rect",
			id: "cost-fill",
			x: m.x + 2,
			y: m.y + 2,
			w: Math.max(1, (m.width - 4) * fill),
			h: m.height - 4,
			fill: heat > 0.8 ? SPARK : GO,
			depth: D.ui + 1,
		});
	}
	items.push({
		kind: "text",
		id: "cost-label",
		x: m.x,
		y: m.y - 16,
		text: `fare ${(fill * 100).toFixed(0)}%`,
		style: "label",
		color: INK,
		depth: D.ui + 1,
	});

	// --- error bunker ---
	const bunker = YARD_LAYOUT.zones.errorBunker;
	if (v?.errorBunker.active) {
		items.push({
			kind: "rect",
			id: "bunker-heat",
			x: bunker.x,
			y: bunker.y,
			w: bunker.width,
			h: bunker.height,
			fill: "#781414",
			fillAlpha: 0.25,
			depth: D.track + 3,
		});
		v.errorBunker.hazards.slice(0, 3).forEach((h, i) => {
			items.push({
				kind: "text",
				id: `bunker-hazard-${i}`,
				x: bunker.x + 8,
				y: bunker.y + 30 + i * 14,
				text: h.slice(0, 22),
				style: "mono11",
				color: "#6b1d1d",
				depth: D.track + 4,
			});
		});
	}

	// --- bootstrap desk warning ---
	const desk = YARD_LAYOUT.zones.bootstrapDesk;
	if (v?.bootstrapDesk.active) {
		items.push({
			kind: "text",
			id: "bootstrap-warn",
			x: desk.x + 12,
			y: desk.y + 36,
			text: "⚠ bootstrap rail",
			style: "mono11",
			color: "#6a5a20",
			depth: D.track + 3,
		});
	}

	// --- waybill desk: paper stack + station bell (HIGHBALL grammar) ---
	// Up to 3 overlapping waybill cards; index 0 is the top of the stack.
	const stack = input.waybills.slice(0, 3);
	stack.forEach((w, i) => {
		const wx = desk.x + 12 + i * 9;
		const wy = desk.y + 48 + i * 7;
		// Top waybill (i=0) draws over lower cards.
		const base = D.track + 3 + (stack.length - 1 - i) * 3;
		items.push({
			kind: "rect",
			id: `waybill-${i}-shadow`,
			x: wx + 2,
			y: wy + 2,
			w: 122,
			h: 56,
			fill: INK,
			fillAlpha: 0.12,
			depth: base,
		});
		items.push({
			kind: "rect",
			id: `waybill-${i}`,
			x: wx,
			y: wy,
			w: 122,
			h: 56,
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: base + 1,
		});
		items.push({
			kind: "text",
			id: `waybill-${i}-title`,
			x: wx + 6,
			y: wy + 5,
			text: w.title.slice(0, 20),
			style: "mono9",
			color: INK,
			depth: base + 2,
		});
	});
	if (input.waybills.length > 3) {
		const cx = desk.x + desk.width - 40;
		const cy = desk.y + desk.height - 26;
		items.push({
			kind: "rect",
			id: "waybill-count-bg",
			x: cx,
			y: cy,
			w: 30,
			h: 18,
			fill: INK,
			depth: D.track + 12,
		});
		items.push({
			kind: "text",
			id: "waybill-count",
			x: cx + 6,
			y: cy + 3,
			text: `+${input.waybills.length - 3}`,
			style: "mono11",
			color: PAPER,
			depth: D.track + 13,
		});
	}
	// Station bell: the first-run call to the desk. Glow ring is static ink —
	// readable from a still frame (reduced-motion-safe).
	const bellX = desk.x + desk.width - 34;
	const bellY = desk.y + 26;
	if (input.waybills.some((w) => w.kind === "station.open")) {
		items.push({
			kind: "rect",
			id: "station-bell-glow",
			x: bellX - 8,
			y: bellY - 10,
			w: 36,
			h: 34,
			fill: CREAM,
			stroke: BORDER,
			lineWidth: 1,
			depth: D.track + 2,
		});
	}
	items.push({
		kind: "rect",
		id: "station-bell",
		x: bellX,
		y: bellY,
		w: 20,
		h: 12,
		fill: INK,
		depth: D.track + 3,
	});
	items.push({
		kind: "rect",
		id: "station-bell-knob",
		x: bellX + 8,
		y: bellY - 4,
		w: 4,
		h: 4,
		fill: INK,
		depth: D.track + 3,
	});
	items.push({
		kind: "line",
		id: "station-bell-base",
		x1: bellX - 2,
		y1: bellY + 13,
		x2: bellX + 22,
		y2: bellY + 13,
		color: INK,
		lineWidth: 2,
		depth: D.track + 3,
	});

	// --- semaphore: the Highball signal (goal state from reality only) ---
	const semX = 1210;
	const semTop = 300;
	const semBase = 418;
	const pivotX = semX + 3;
	const pivotY = semTop + 12;
	items.push({
		kind: "rect",
		id: "semaphore-post",
		x: semX,
		y: semTop,
		w: 6,
		h: semBase - semTop,
		fill: INK,
		depth: D.track + 2,
	});
	if (input.highball) {
		// Arm raised + go lamp: confirmed clean board only.
		items.push({
			kind: "line",
			id: "semaphore-arm",
			x1: pivotX,
			y1: pivotY,
			x2: pivotX + 26,
			y2: pivotY - 26,
			color: INK,
			lineWidth: 5,
			depth: D.track + 3,
		});
		items.push({
			kind: "rect",
			id: "semaphore-lamp",
			x: pivotX + 22,
			y: pivotY - 38,
			w: 12,
			h: 12,
			fill: GO,
			stroke: INK,
			lineWidth: 2,
			depth: D.track + 4,
		});
		items.push({
			kind: "text",
			id: "highball-label",
			x: semX - 58,
			y: semTop - 18,
			text: "HIGHBALL",
			style: "label",
			color: INK,
			depth: D.track + 4,
		});
	} else {
		items.push({
			kind: "line",
			id: "semaphore-arm",
			x1: pivotX,
			y1: pivotY,
			x2: pivotX + 24,
			y2: pivotY + 24,
			color: INK,
			lineWidth: 5,
			depth: D.track + 3,
		});
	}

	// --- camp rooms + bindlebug NPCs (world model, CAMP_GROUNDS only) ---
	if (input.world) {
		for (const camp of input.world.camps) {
			items.push({
				kind: "rect",
				id: `camp-${camp.id}-shadow`,
				x: camp.x + 3,
				y: camp.y + 3,
				w: camp.w,
				h: camp.h,
				fill: INK,
				fillAlpha: 0.12,
				depth: D.track,
			});
			items.push({
				kind: "rect",
				id: `camp-${camp.id}`,
				x: camp.x,
				y: camp.y,
				w: camp.w,
				h: camp.h,
				fill: PAPER,
				stroke: INK,
				lineWidth: 2,
				depth: D.track + 1,
			});
			items.push({
				kind: "text",
				id: `camp-${camp.id}-label`,
				x: camp.x + 6,
				y: camp.y + 4,
				text: camp.label.slice(0, 12),
				style: "label",
				color: INK,
				depth: D.track + 2,
			});
		}
		for (const ch of input.world.characters) {
			// DESIGN.md scale tiers: bindlebugs visibly smaller than Bo
			// (half-size sheets × 0.5 → roughly a quarter of Bo on screen).
			items.push({
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
				// spark is reserved for real failure states (DESIGN.md).
				items.push({
					kind: "text",
					id: `npc-${ch.id}-stuck`,
					x: ch.x - 3,
					y: headY - 14,
					text: "!",
					style: "mono12",
					color: SPARK,
					depth: D.characters + 2,
				});
			}
			if (ch.state === "reading") {
				// Ink-state book mark: readable from a still frame.
				items.push({
					kind: "rect",
					id: `npc-${ch.id}-book`,
					x: ch.x + 8,
					y: headY + 22,
					w: 12,
					h: 8,
					fill: PAPER,
					stroke: INK,
					lineWidth: 1,
					depth: D.characters + 2,
				});
			}
			if (ch.health < 1) {
				items.push({
					kind: "rect",
					id: `npc-${ch.id}-health-bg`,
					x: ch.x - 14,
					y: headY - 6,
					w: 28,
					h: 4,
					fill: PAPER,
					stroke: INK,
					lineWidth: 1,
					depth: D.characters + 2,
				});
				items.push({
					kind: "rect",
					id: `npc-${ch.id}-health`,
					x: ch.x - 13,
					y: headY - 5,
					w: Math.max(1, 26 * ch.health),
					h: 2,
					fill: ch.health < 0.4 ? SPARK : GO,
					depth: D.characters + 3,
				});
			}
			if (ch.bubble) {
				const text = ch.bubble.slice(0, 24);
				const bw = Math.min(160, text.length * 6 + 12);
				// Never occlude the Bootstrap Desk (DESIGN.md reserved regions).
				const desk = YARD_LAYOUT.zones.bootstrapDesk;
				const bx = Math.max(desk.x + desk.width + 8, ch.x - bw / 2);
				items.push({
					kind: "rect",
					id: `npc-${ch.id}-bubble`,
					x: bx,
					y: headY - 32,
					w: bw,
					h: 16,
					fill: "#fffdf7",
					stroke: "#111111",
					lineWidth: 1,
					depth: D.ui + 2,
				});
				items.push({
					kind: "text",
					id: `npc-${ch.id}-bubble-text`,
					x: bx + 6,
					y: headY - 29,
					text,
					style: "mono9",
					color: "#111111",
					depth: D.ui + 3,
				});
			}
		}
	}

	// --- traffic particles (never in test mode: stable screenshots) ---
	if (!input.testMode) {
		input.particles.forEach((p, i) => {
			if (!p.alive) return;
			items.push({
				kind: "rect",
				id: `particle-${i}`,
				x: p.x,
				y: p.y,
				w: 12,
				h: 10,
				fill: "#111111",
				stroke: PAPER,
				lineWidth: 2,
				depth: D.particles,
			});
		});
	}

	// --- guest agent near bay (only real authorized connections) ---
	if (conns.some((c) => c.visual === "authorized")) {
		items.push({
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
		items.push({
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
			items.push({
				kind: "rect",
				id: "speech-bubble",
				x: bx,
				y: by,
				w,
				h: 24,
				fill: "#fffdf7",
				stroke: "#111111",
				lineWidth: 1.5,
				depth: D.ui + 2,
			});
			items.push({
				kind: "text",
				id: "speech-text",
				x: bx + 8,
				y: by + 5,
				text: input.speech,
				style: "mono12",
				color: "#111111",
				depth: D.ui + 3,
			});
		}
	}

	// --- near-bank plate over Bo ---
	if (input.hasImage("bg-trail-front")) {
		items.push({
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
	items.push({
		kind: "rect",
		id: "hud-shadow",
		x: 19,
		y: 19,
		w: 300,
		h: 52,
		fill: INK,
		fillAlpha: 0.12,
		depth: D.ui,
	});
	items.push({
		kind: "rect",
		id: "hud-card",
		x: 16,
		y: 16,
		w: 300,
		h: 52,
		fill: PAPER,
		stroke: INK,
		lineWidth: 2,
		depth: D.ui + 1,
	});
	items.push({
		kind: "text",
		id: "hud-title",
		x: 26,
		y: 24,
		text: "HIGHBALL! · single Station",
		style: "label",
		color: INK,
		depth: D.ui + 2,
	});
	items.push({
		kind: "text",
		id: "hud-meta",
		x: 26,
		y: 42,
		text: `zone=${input.zone} anim=${input.boAnimationId}`,
		style: "mono11",
		color: MUTE,
		depth: D.ui + 2,
	});

	// --- SIMULATED film-leader tag (DESIGN.md signal provenance / TRU-1) ---
	// Shown whenever synthetic data drives the yard: demo world stream or
	// scenario snapshots. Ink-bordered, label-caps; never spark/go accents.
	if (input.world?.demo === true || input.scenarioMode) {
		const bw = 108;
		const bx = YARD_LAYOUT.width - bw - 14;
		items.push({
			kind: "rect",
			id: "simulated-badge",
			x: bx,
			y: 14,
			w: bw,
			h: 22,
			fill: PAPER,
			stroke: INK,
			lineWidth: 2,
			depth: D.ui + 3,
		});
		items.push({
			kind: "text",
			id: "simulated-badge-text",
			x: bx + 14,
			y: 19,
			text: "SIMULATED",
			style: "label",
			color: INK,
			depth: D.ui + 4,
		});
	}

	return Object.freeze({ items });
}
