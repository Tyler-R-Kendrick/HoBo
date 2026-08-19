/**
 * Default-state TUI loading screen: console HoBo logo + Bo idle animation.
 *
 * Bo idle frames are a **deterministic conversion** of the 2D sprite strip
 * `assets/bo-idle.png` (same art as site `public/parallax/bo-idle.png`) via
 * `sprite-tui.ts` (half-block Unicode paint — Grok/TUI-style fixed cell grid).
 * Generated frames live in `_generated-art/bo-idle-tui-frames.ts` (re-run
 * `scripts/gen-bo-idle-tui.mts` after sprite changes).
 *
 * Anti-flicker: every paint is a **fixed canvas** — changing only frame/tickMs
 * never changes height or per-line width.
 */

import { must } from "@hobo/core/total-access";
import {
	BO_IDLE_TUI_COLS,
	BO_IDLE_TUI_FRAMES,
	BO_IDLE_TUI_ROWS,
	BO_IDLE_TUI_SOURCE,
} from "./_generated-art/bo-idle-tui-frames.js";
import {
	HOBO_LOGO_TUI,
	HOBO_LOGO_TUI_COLS,
	HOBO_LOGO_TUI_ROWS,
	HOBO_LOGO_TUI_SOURCE,
} from "./_generated-art/hobo-logo-tui.js";

/** Cadence from bo-idle export (~95ms/frame on site BoIdle.astro). */
export const BO_IDLE_TICK_MS = 95;
export const BO_IDLE_FRAME_COUNT = 12;
/** rest = 0, bounce = 1..10, blink = 11 — same clips as BoIdle.astro. */
export const BO_IDLE_REST = 0;
export const BO_IDLE_BLINK = 11;

/** Sprite-derived Bo cell geometry (from generator). */
export const BO_CELL_WIDTH = BO_IDLE_TUI_COLS;
export const BO_CELL_HEIGHT = BO_IDLE_TUI_ROWS;

/**
 * Fixed paint geometry — anti-flicker contract.
 * Logo 3 + Bo cell (sprite rows) + cue 1.
 */
export const LOADING_CANVAS_WIDTH = BO_IDLE_TUI_COLS;
export const LOADING_CANVAS_HEIGHT = 3 + BO_IDLE_TUI_ROWS + 1;

/** Provenance for docs/tests. */
export const BO_IDLE_SPRITE_SOURCE = BO_IDLE_TUI_SOURCE;

/**
 * Compact HoBo console wordmark (block letters).
 * Product brand for loading / splash only — not panel verb titles.
 */
export const HOBO_LOGO_CONSOLE = [
	"█  █ ▄▀▀▄ ▄▀▀▄ ▄▀▀▄",
	"█▀▀█ █  █ █▀▀▄ █  █",
	"█  █ ▀▄▄▀ ▀▄▄▀ ▀▄▄▀",
].join("\n");

/**
 * Tiny mark — pairs with wordmark on narrow cols / chips.
 */
export const HOBO_MARK_CONSOLE = "(••)/@";

/** Pad / truncate a single line to exactly `width` (space-fill). */
export function padLine(s: string, width: number): string {
	const w = Math.max(0, Math.trunc(width));
	if (s.length === w) return s;
	if (s.length > w) {
		if (w <= 1) return s.slice(0, w);
		return `${s.slice(0, Math.max(0, w - 1))}…`;
	}
	return s + " ".repeat(w - s.length);
}

/** Normalize multiline art to fixed height × width cell. */
export function paintCell(
	art: string,
	width: number,
	height: number,
): string[] {
	const raw = art.split("\n");
	const lines: string[] = [];
	for (let i = 0; i < height; i += 1) {
		lines.push(padLine(raw[i] ?? "", width));
	}
	return lines;
}

function centerIn(line: string, width: number): string {
	const t = line.trimEnd();
	if (t.length >= width) return padLine(t, width);
	const left = Math.floor((width - t.length) / 2);
	return padLine(`${" ".repeat(left)}${t}`, width);
}

/**
 * Sprite-converted Bo idle frames (half-block TUI).
 * Index aligns with site strip: 0 rest, 1–10 bounce, 11 blink.
 */
export const BO_IDLE_FRAMES: readonly string[] = BO_IDLE_TUI_FRAMES;

export type BoIdleClip = "rest" | "bounce" | "blink";

export interface LoadingScreenOptions {
	/** Absolute frame index (mod 12). */
	readonly frame?: number;
	/** Wall clock ms — selects clip like site scheduler when frame omitted. */
	readonly tickMs?: number;
	/** Freeze on rest (prefers-reduced-motion). */
	readonly reducedMotion?: boolean;
	/** Optional one-line cue under Bo (default: idle wait). */
	readonly cue?: string;
	/** Omit wordmark; mark + Bo only — still full canvas width. */
	readonly compact?: boolean;
}

/**
 * Pick idle frame. Reduced motion always rest.
 * Without explicit frame, tickMs drives a rest→bounce→blink loop.
 */
export function selectBoIdleFrame(
	options: Pick<
		LoadingScreenOptions,
		"frame" | "tickMs" | "reducedMotion"
	> = {},
): number {
	if (options.reducedMotion === true) return BO_IDLE_REST;
	if (typeof options.frame === "number" && Number.isFinite(options.frame)) {
		const n = Math.trunc(options.frame);
		return (
			((n % BO_IDLE_FRAME_COUNT) + BO_IDLE_FRAME_COUNT) % BO_IDLE_FRAME_COUNT
		);
	}
	const t = Math.max(0, Math.trunc(options.tickMs ?? 0));
	const cycle = BO_IDLE_TICK_MS * 26;
	const phase = t % cycle;
	const tick = Math.floor(phase / BO_IDLE_TICK_MS);
	// 0–5 rest, 6–15 bounce (frames 1–10), 16–18 rest, 19–20 blink, 21–25 rest
	if (tick < 6) return BO_IDLE_REST;
	if (tick < 16) return tick - 5;
	if (tick < 19) return BO_IDLE_REST;
	if (tick < 21) return BO_IDLE_BLINK;
	return BO_IDLE_REST;
}

export function renderBoIdleFrame(frame = BO_IDLE_REST): string {
	const i =
		((Math.trunc(frame) % BO_IDLE_FRAME_COUNT) + BO_IDLE_FRAME_COUNT) %
		BO_IDLE_FRAME_COUNT;
	return BO_IDLE_FRAMES[i] ?? must(BO_IDLE_FRAMES[BO_IDLE_REST]);
}

export function boIdleClipName(frame: number): BoIdleClip {
	const i =
		((Math.trunc(frame) % BO_IDLE_FRAME_COUNT) + BO_IDLE_FRAME_COUNT) %
		BO_IDLE_FRAME_COUNT;
	if (i === BO_IDLE_BLINK) return "blink";
	if (i === BO_IDLE_REST) return "rest";
	return "bounce";
}

/**
 * Measure painted surface: line count + max line width + per-line widths.
 */
export function measureLoadingSurface(text: string): {
	readonly lines: number;
	readonly maxWidth: number;
	readonly lineWidths: readonly number[];
	readonly fixedWidth: boolean;
	readonly matchesCanvas: boolean;
} {
	const rows = text.length === 0 ? [] : text.split("\n");
	const lineWidths = rows.map((l) => l.length);
	const maxWidth = lineWidths.length > 0 ? Math.max(...lineWidths) : 0;
	const fixedWidth =
		lineWidths.length > 0 && lineWidths.every((w) => w === maxWidth);
	return {
		lines: rows.length,
		maxWidth,
		lineWidths,
		fixedWidth,
		matchesCanvas:
			rows.length === LOADING_CANVAS_HEIGHT &&
			fixedWidth &&
			maxWidth === LOADING_CANVAS_WIDTH,
	};
}

/**
 * Default-state loading screen: HoBo logo + sprite-derived Bo idle.
 * Pure string — callers animate by advancing frame/tickMs.
 * Every returned line is exactly LOADING_CANVAS_WIDTH; height is constant.
 */
export function renderDefaultLoadingScreen(
	options: LoadingScreenOptions = {},
): string {
	const frame = selectBoIdleFrame(options);
	const bo = renderBoIdleFrame(frame);
	const cueRaw =
		options.cue ??
		(options.reducedMotion === true ? "hobo-code·idle" : "hobo-code·idle·★");
	const logoArt =
		options.compact === true ? HOBO_MARK_CONSOLE : HOBO_LOGO_CONSOLE;

	const logoLines = paintCell(logoArt, LOADING_CANVAS_WIDTH, 3).map((l) =>
		centerIn(l.trimEnd(), LOADING_CANVAS_WIDTH),
	);

	// Sprite frames already fixed COLS×ROWS; re-pad for safety.
	const boLines = paintCell(bo, LOADING_CANVAS_WIDTH, BO_CELL_HEIGHT);

	const cueLine = centerIn(cueRaw, LOADING_CANVAS_WIDTH);

	const rows = [...logoLines, ...boLines, cueLine];
	const canvas = paintCell(
		rows.join("\n"),
		LOADING_CANVAS_WIDTH,
		LOADING_CANVAS_HEIGHT,
	);
	return canvas.join("\n");
}

/**
 * Yield loading-screen frames for a pure animation loop (tests / TUI).
 */
export function* iterateLoadingFrames(
	count: number,
	options: Omit<LoadingScreenOptions, "frame" | "tickMs"> = {},
): Generator<{ frame: number; clip: BoIdleClip; text: string }> {
	const n = Math.max(0, Math.trunc(count));
	for (let i = 0; i < n; i += 1) {
		const frame = selectBoIdleFrame({
			...options,
			frame: options.reducedMotion === true ? BO_IDLE_REST : i,
		});
		yield {
			frame,
			clip: boIdleClipName(frame),
			text: renderDefaultLoadingScreen({ ...options, frame }),
		};
	}
}

/**
 * Pure multi-frame dump for tests / capture.
 */
export function dumpLoadingAnimation(
	frameCount = BO_IDLE_FRAME_COUNT,
	options: Omit<LoadingScreenOptions, "frame" | "tickMs"> = {},
): string {
	const parts: string[] = [];
	for (const f of iterateLoadingFrames(frameCount, options)) {
		parts.push(`--- frame ${f.frame} · ${f.clip} ---`);
		parts.push(f.text);
	}
	return parts.join("\n");
}

// ── Title screen (interactive TUI entry) ─────────────────────────────────

/** Chewy wordmark provenance for docs/tests. */
export const HOBO_LOGO_SPRITE_SOURCE = HOBO_LOGO_TUI_SOURCE;

/** Title canvas: Chewy logo + Bo cell + cue — fixed geometry, anti-flicker. */
export const TITLE_CANVAS_WIDTH = HOBO_LOGO_TUI_COLS;
export const TITLE_CANVAS_HEIGHT = HOBO_LOGO_TUI_ROWS + BO_CELL_HEIGHT + 2;

export interface TitleScreenOptions {
	/** Absolute Bo frame index (mod 12). */
	readonly frame?: number;
	/** Wall clock ms — drives rest→bounce→blink loop when frame omitted. */
	readonly tickMs?: number;
	/** One-line cue under Bo. */
	readonly cue?: string;
}

/**
 * Full title screen: large Chewy "HoBo" logo (site display font) + animated
 * sprite-derived Bo idle + cue. Pure string — the bin repaints on a tick.
 * Every line is exactly TITLE_CANVAS_WIDTH; height is constant.
 */
export function renderTitleScreen(options: TitleScreenOptions = {}): string {
	const frame = selectBoIdleFrame(options);
	const logoLines = paintCell(
		HOBO_LOGO_TUI,
		TITLE_CANVAS_WIDTH,
		HOBO_LOGO_TUI_ROWS,
	);
	const boLines = paintCell(
		renderBoIdleFrame(frame),
		TITLE_CANVAS_WIDTH,
		BO_CELL_HEIGHT,
	).map((l) => centerIn(l.trimEnd(), TITLE_CANVAS_WIDTH));
	const cue = centerIn(
		options.cue ?? "hobo-code · press key · then /config /agents /verbs",
		TITLE_CANVAS_WIDTH,
	);
	const rows = [
		...logoLines,
		...boLines,
		cue,
		centerIn("", TITLE_CANVAS_WIDTH),
	];
	return paintCell(
		rows.join("\n"),
		TITLE_CANVAS_WIDTH,
		TITLE_CANVAS_HEIGHT,
	).join("\n");
}
