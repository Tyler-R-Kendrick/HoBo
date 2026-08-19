import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	BO_IDLE_TUI_COLS,
	BO_IDLE_TUI_FRAMES,
	BO_IDLE_TUI_ROWS,
} from "../src/_generated-art/bo-idle-tui-frames.js";
import {
	decodeGrayAlphaPng,
	extractSpriteFrame,
	measureTuiSprite,
	renderHalfBlocks,
	sampleInkBitmap,
	spriteFrameToTui,
	spriteStripMeta,
	spriteStripToTuiFrames,
} from "../src/sprite-tui.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pngPath = join(pkgRoot, "assets", "bo-idle.png");

describe("sprite→TUI conversion (bo-idle.png)", () => {
	it("decodes the shipped gray+alpha sprite strip", () => {
		const img = decodeGrayAlphaPng(readFileSync(pngPath));
		expect(img.width).toBe(2484);
		expect(img.height).toBe(230);
		expect(img.data.length).toBe(2484 * 230 * 2);
		const meta = spriteStripMeta(img.width, img.height, 12);
		expect(meta.frameWidth).toBe(207);
		expect(meta.frameHeight).toBe(230);
		expect(meta.frameCount).toBe(12);
	});

	it("converts strip to fixed-geometry half-block frames deterministically", () => {
		const img = decodeGrayAlphaPng(readFileSync(pngPath));
		const a = spriteStripToTuiFrames(img, 12, {
			cols: BO_IDLE_TUI_COLS,
			rows: BO_IDLE_TUI_ROWS,
			mode: "half-block",
		});
		const b = spriteStripToTuiFrames(img, 12, {
			cols: BO_IDLE_TUI_COLS,
			rows: BO_IDLE_TUI_ROWS,
			mode: "half-block",
		});
		expect(a).toHaveLength(12);
		// byte-identical re-run
		expect(a).toEqual(b);
		for (const f of a) {
			const m = measureTuiSprite(f);
			expect(m.fixed).toBe(true);
			expect(m.lines).toBe(BO_IDLE_TUI_ROWS);
			expect(m.width).toBe(BO_IDLE_TUI_COLS);
		}
		// poses differ across rest / bounce / blink
		expect(a[0]).not.toBe(a[3]);
		expect(a[0]).not.toBe(a[11]);
		expect(new Set(a).size).toBeGreaterThanOrEqual(3);
	});

	it("committed generated frames match live conversion of the PNG", () => {
		const img = decodeGrayAlphaPng(readFileSync(pngPath));
		const live = spriteStripToTuiFrames(img, 12, {
			cols: BO_IDLE_TUI_COLS,
			rows: BO_IDLE_TUI_ROWS,
			mode: "half-block",
		});
		expect(BO_IDLE_TUI_FRAMES).toHaveLength(12);
		expect([...BO_IDLE_TUI_FRAMES]).toEqual([...live]);
	});

	it("extracts individual frames and paints half-blocks", () => {
		const img = decodeGrayAlphaPng(readFileSync(pngPath));
		const meta = spriteStripMeta(img.width, img.height, 12);
		const frame = extractSpriteFrame(img, meta, 0);
		expect(frame.width).toBe(207);
		expect(frame.height).toBe(230);
		const bitmap = sampleInkBitmap(frame, 24, 28);
		expect(bitmap.ink.length).toBe(24 * 28);
		// some ink present (Bo is not empty)
		expect(bitmap.ink.some((v) => v === 1)).toBe(true);
		const hb = renderHalfBlocks(bitmap);
		expect(hb.split("\n").length).toBe(14);
		const tui = spriteFrameToTui(frame, { cols: 24, rows: 14 });
		expect(measureTuiSprite(tui).fixed).toBe(true);
	});
});
