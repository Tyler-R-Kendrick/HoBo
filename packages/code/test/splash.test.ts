import { describe, expect, it } from "vitest";
import {
	BO_CELL_HEIGHT,
	BO_CELL_WIDTH,
	BO_IDLE_BLINK,
	BO_IDLE_FRAME_COUNT,
	BO_IDLE_FRAMES,
	BO_IDLE_REST,
	BO_IDLE_SPRITE_SOURCE,
	BO_IDLE_TICK_MS,
	boIdleClipName,
	dumpLoadingAnimation,
	HOBO_LOGO_CONSOLE,
	HOBO_MARK_CONSOLE,
	iterateLoadingFrames,
	LOADING_CANVAS_HEIGHT,
	LOADING_CANVAS_WIDTH,
	measureLoadingSurface,
	padLine,
	paintCell,
	renderBoIdleFrame,
	renderDefaultLoadingScreen,
	selectBoIdleFrame,
} from "../src/splash.js";
import { buildMultiplexerStatus, renderStatusText } from "../src/tui.js";

describe("hobo-code default loading splash (logo + sprite Bo idle)", () => {
	it("ships console HoBo logo wordmark and sprite provenance", () => {
		expect(HOBO_LOGO_CONSOLE.split("\n").length).toBe(3);
		expect(HOBO_LOGO_CONSOLE).toMatch(/█/);
		expect(HOBO_MARK_CONSOLE).toContain("(••)");
		expect(BO_IDLE_SPRITE_SOURCE).toBe("assets/bo-idle.png");
	});

	it("Bo idle has 12 sprite-derived frames with fixed cell geometry", () => {
		expect(BO_IDLE_FRAMES).toHaveLength(BO_IDLE_FRAME_COUNT);
		expect(BO_IDLE_FRAME_COUNT).toBe(12);
		expect(boIdleClipName(BO_IDLE_REST)).toBe("rest");
		expect(boIdleClipName(BO_IDLE_BLINK)).toBe("blink");
		expect(boIdleClipName(3)).toBe("bounce");
		for (let i = 0; i < BO_IDLE_FRAME_COUNT; i += 1) {
			const cell = renderBoIdleFrame(i);
			const lines = cell.split("\n");
			expect(lines.length).toBe(BO_CELL_HEIGHT);
			expect(lines.every((l) => l.length === BO_CELL_WIDTH)).toBe(true);
			// half-block glyphs from converter
			expect(cell).toMatch(/[▀▄█]/);
		}
		// poses differ
		expect(renderBoIdleFrame(0)).not.toBe(renderBoIdleFrame(3));
		expect(renderBoIdleFrame(0)).not.toBe(renderBoIdleFrame(11));
	});

	it("selectBoIdleFrame freezes rest under reduced motion", () => {
		expect(selectBoIdleFrame({ reducedMotion: true, frame: 11 })).toBe(
			BO_IDLE_REST,
		);
		expect(selectBoIdleFrame({ reducedMotion: true, tickMs: 9999 })).toBe(
			BO_IDLE_REST,
		);
	});

	it("selectBoIdleFrame cycles rest → bounce → blink by tickMs", () => {
		expect(selectBoIdleFrame({ tickMs: 0 })).toBe(BO_IDLE_REST);
		const bounceTick = BO_IDLE_TICK_MS * 8;
		expect(boIdleClipName(selectBoIdleFrame({ tickMs: bounceTick }))).toBe(
			"bounce",
		);
		const blinkTick = BO_IDLE_TICK_MS * 19;
		expect(selectBoIdleFrame({ tickMs: blinkTick })).toBe(BO_IDLE_BLINK);
	});

	it("renderDefaultLoadingScreen paints fixed anti-flicker canvas", () => {
		const rest = renderDefaultLoadingScreen({ frame: BO_IDLE_REST });
		const bounce = renderDefaultLoadingScreen({ frame: 3 });
		const blink = renderDefaultLoadingScreen({ frame: BO_IDLE_BLINK });
		for (const text of [rest, bounce, blink]) {
			const m = measureLoadingSurface(text);
			expect(m.matchesCanvas).toBe(true);
			expect(m.lines).toBe(LOADING_CANVAS_HEIGHT);
			expect(m.maxWidth).toBe(LOADING_CANVAS_WIDTH);
			expect(m.fixedWidth).toBe(true);
		}
		expect(rest).not.toBe(bounce);
		expect(rest).not.toBe(blink);
		expect(rest).toMatch(/hobo-code·idle/);
		expect(rest).toContain("█");
		// sprite half-blocks present
		expect(rest).toMatch(/[▀▄]/);
	});

	it("full 12-frame strip keeps constant height and width", () => {
		const frames = [...iterateLoadingFrames(BO_IDLE_FRAME_COUNT)];
		expect(frames).toHaveLength(12);
		const first = measureLoadingSurface(frames[0]!.text);
		expect(first.matchesCanvas).toBe(true);
		for (const f of frames) {
			const m = measureLoadingSurface(f.text);
			expect(m.lines).toBe(first.lines);
			expect(m.maxWidth).toBe(first.maxWidth);
			expect(m.fixedWidth).toBe(true);
			expect(m.matchesCanvas).toBe(true);
		}
		expect(frames[0]!.clip).toBe("rest");
		expect(frames[11]!.clip).toBe("blink");
		expect(new Set(frames.map((f) => f.text)).size).toBeGreaterThanOrEqual(3);
	});

	it("reducedMotion freezes rest pose on full loading surface", () => {
		const still = renderDefaultLoadingScreen({
			reducedMotion: true,
			frame: BO_IDLE_BLINK,
		});
		const blink = renderDefaultLoadingScreen({ frame: BO_IDLE_BLINK });
		expect(still).toBe(
			renderDefaultLoadingScreen({
				reducedMotion: true,
				frame: BO_IDLE_REST,
			}),
		);
		expect(still).not.toBe(blink);
		expect(measureLoadingSurface(still).matchesCanvas).toBe(true);
		expect(still).not.toMatch(/hobo-code·idle·★/);
	});

	it("compact mode still fills full canvas (anti-flicker)", () => {
		const compact = renderDefaultLoadingScreen({
			frame: BO_IDLE_REST,
			compact: true,
		});
		expect(compact).toContain(HOBO_MARK_CONSOLE);
		expect(measureLoadingSurface(compact).matchesCanvas).toBe(true);
	});

	it("padLine and paintCell enforce fixed geometry helpers", () => {
		expect(padLine("ab", 5)).toBe("ab   ");
		expect(padLine("abcdef", 4)).toBe("abc…");
		const cell = paintCell("x\nyy", 4, 3);
		expect(cell).toEqual(["x   ", "yy  ", "    "]);
	});

	it("dumpLoadingAnimation emits fixed-geometry multi-frame dump", () => {
		const dump = dumpLoadingAnimation(3);
		expect(dump).toContain("--- frame 0 · rest ---");
		expect(dump).toContain("--- frame 1 · bounce ---");
		for (const f of iterateLoadingFrames(3)) {
			expect(measureLoadingSurface(f.text).matchesCanvas).toBe(true);
		}
	});

	it("empty multiplexer default state is logo+Bo loading screen", () => {
		const empty = buildMultiplexerStatus([], { remoteReady: true });
		const text = renderStatusText(empty);
		expect(text).toContain("█");
		expect(text).toContain("hobo-code·idle");
		expect(text).not.toContain("empty→★");
		expect(text).not.toMatch(/┌─+┐/);
		expect(measureLoadingSurface(text).matchesCanvas).toBe(true);
		const blink = renderStatusText(empty, {
			loading: { frame: BO_IDLE_BLINK },
		});
		expect(measureLoadingSurface(blink).matchesCanvas).toBe(true);
		expect(blink).not.toBe(text);
		const still = renderStatusText(empty, {
			loading: { reducedMotion: true, frame: BO_IDLE_BLINK },
		});
		expect(still).toBe(
			renderStatusText(empty, {
				loading: { reducedMotion: true, frame: BO_IDLE_REST },
			}),
		);
	});
});

describe("hobo-code title screen (Chewy logo + animated Bo)", () => {
	it("renders the Chewy wordmark at fixed canvas geometry", async () => {
		const {
			HOBO_LOGO_SPRITE_SOURCE,
			renderTitleScreen,
			TITLE_CANVAS_HEIGHT,
			TITLE_CANVAS_WIDTH,
		} = await import("../src/splash.js");
		expect(HOBO_LOGO_SPRITE_SOURCE).toBe("assets/hobo-logo.png");
		const text = renderTitleScreen({ frame: 0 });
		const lines = text.split("\n");
		expect(lines).toHaveLength(TITLE_CANVAS_HEIGHT);
		for (const l of lines) expect(l).toHaveLength(TITLE_CANVAS_WIDTH);
		// Logo block letters present (Chewy-derived half-blocks).
		expect(text).toMatch(/█{6,}/);
		expect(text).toMatch(/press key|\/config|\/agents|\/verbs/i);
	});

	it("animates: distinct Bo frames at fixed geometry", async () => {
		const { renderTitleScreen } = await import("../src/splash.js");
		const rest = renderTitleScreen({ frame: 0 });
		const bounce = renderTitleScreen({ frame: 3 });
		const blink = renderTitleScreen({ frame: 11 });
		expect(rest).not.toBe(bounce);
		expect(rest).not.toBe(blink);
		expect(rest.split("\n").length).toBe(blink.split("\n").length);
	});

	it("tickMs drives the rest→bounce→blink loop", async () => {
		const { BO_IDLE_TICK_MS, renderTitleScreen } = await import(
			"../src/splash.js"
		);
		const rest = renderTitleScreen({ tickMs: 0 });
		const blink = renderTitleScreen({ tickMs: 19 * BO_IDLE_TICK_MS + 1 });
		expect(rest).not.toBe(blink);
	});
});
