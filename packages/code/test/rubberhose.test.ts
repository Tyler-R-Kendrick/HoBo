/**
 * Design-contract tests (site/DESIGN.md).
 *
 * The first version of this shell shipped a flicker-free *SaaS dashboard* —
 * hairline rules, dot-separated status, a permanent header eating half the
 * viewport — against a design contract that says "never flat SaaS chrome".
 * Nothing in the suite could tell the difference, so nothing objected.
 * These tests encode the identity so that failure mode is now loud.
 */
import { describe, expect, it } from "vitest";
import { HOBO_LOGO_TUI } from "../src/_generated/hobo-logo-tui.js";
import {
	createInitialShellState,
	renderShellFrame,
} from "../src/interactive-shell.js";
import {
	ACCENT,
	cellWidth,
	centreBlock,
	fitCells,
	INK,
	inkCard,
	statusStripe,
	titleCard,
} from "../src/rubberhose.js";

/** Visible text only — accents must never change geometry or content. */
const plain = (s: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR is the point
	s.replace(/\u001b\[[0-9;]*m/g, "");

describe("ink cards (thick outlines + hard sticker shadow)", () => {
	it("uses heavy ink, never hairline SaaS rules", () => {
		const card = inkCard(["body"], { width: 30 }).join("\n");
		expect(card).toContain(INK.topLeft);
		expect(card).toContain(INK.horizontal);
		expect(card).toContain(INK.vertical);
		// The old chrome's flat rule is exactly what the contract forbids.
		expect(card).not.toContain("───");
		expect(card).not.toContain("---");
	});

	it("drops a hard offset shadow rather than a soft elevation blur", () => {
		const lines = inkCard(["body"], { width: 30 });
		// Shadow column on the body/bottom rows and a shadow row underneath,
		// offset one cell right — the sticker look.
		expect(lines[1]).toContain(INK.shadow);
		expect(lines[lines.length - 1]!.trimEnd()).toMatch(
			new RegExp(`^ ${INK.shadow}+$`),
		);
	});

	it("keeps every line exactly the requested width, colour or not", () => {
		for (const width of [24, 40, 80, 100]) {
			for (const accent of ["none", "spark", "go"] as const) {
				const lines = inkCard(["short", "a".repeat(500)], { width, accent });
				for (const line of lines) expect(cellWidth(line)).toBe(width);
			}
		}
	});

	it("returns a stable line count regardless of content width", () => {
		const a = inkCard(["x"], { width: 40 }).length;
		const b = inkCard(["y".repeat(300)], { width: 40 }).length;
		expect(a).toBe(b);
	});

	it("flat cards omit the shadow for nesting", () => {
		expect(inkCard(["x"], { width: 30 }).length).toBe(
			inkCard(["x"], { width: 30, flat: true }).length + 1,
		);
	});
});

describe("strict black & white with rare accents", () => {
	it("is monochrome by default", () => {
		const card = inkCard(["body"], { width: 30 }).join("\n");
		expect(card).toBe(plain(card));
	});

	it("uses vermillion only when asked, and green only when asked", () => {
		const spark = inkCard(["body"], { width: 30, accent: "spark" }).join("\n");
		const go = inkCard(["body"], { width: 30, accent: "go" }).join("\n");
		expect(spark).toContain(ACCENT.spark);
		expect(spark).not.toContain(ACCENT.go);
		expect(go).toContain(ACCENT.go);
		expect(go).not.toContain(ACCENT.spark);
		// No rainbow chrome: those two plus reset are the whole palette.
		const used = spark.match(/\u001b\[[0-9;]*m/g) ?? [];
		expect(new Set(used)).toEqual(new Set([ACCENT.spark, ACCENT.reset]));
	});

	it("measures width past escapes so colour never shifts layout", () => {
		expect(cellWidth(`${ACCENT.spark}abc${ACCENT.reset}`)).toBe(3);
		expect(cellWidth("abc")).toBe(3);
	});
});

describe("title card (Chewy wordmark as a cartoon opening)", () => {
	it("frames the real logo sprite, not block-letter substitutes", () => {
		const card = titleCard(HOBO_LOGO_TUI, { width: 70 }).join("\n");
		// The sprite's half-block ink, framed.
		expect(card).toMatch(/[█▄▀]/);
		expect(card).toContain(INK.topLeft);
	});

	it("carries a subtitle and stays exactly the requested width", () => {
		const lines = titleCard(HOBO_LOGO_TUI, {
			width: 66,
			subtitle: "rides the rails",
		});
		expect(lines.join("\n")).toContain("rides the rails");
		for (const line of lines) expect(cellWidth(line)).toBe(66);
	});
});

describe("status stripe", () => {
	it("is one line, inverse video, exactly the width", () => {
		const stripe = statusStripe(["a", "b", "c"], 40);
		expect(stripe.split("\n")).toHaveLength(1);
		expect(cellWidth(stripe)).toBe(40);
	});

	it("drops empty segments instead of rendering lonely separators", () => {
		expect(plain(statusStripe(["a", "", "b"], 40))).not.toContain("··");
	});
});

describe("helpers", () => {
	it("fitCells pads and truncates with an ellipsis", () => {
		expect(fitCells("ab", 5)).toBe("ab   ");
		expect(fitCells("abcdef", 4)).toBe("abc…");
	});

	it("centreBlock centres art within the width", () => {
		const [line] = centreBlock(["xx"], 10);
		expect(cellWidth(line!)).toBe(10);
		expect(line).toBe("    xx    ");
	});
});

describe("the frame as a whole obeys the contract", () => {
	it("gives the transcript the screen instead of a permanent header", () => {
		const state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const lines = plain(renderShellFrame(state)).split("\n");
		expect(lines).toHaveLength(24);
		// Card overhead is 3 rows + prompt + stripe: the rest is content.
		// The pre-redesign chrome left roughly 8 content rows on this size.
		const contentRows = lines.filter((l) => l.startsWith(INK.vertical)).length;
		expect(contentRows).toBeGreaterThanOrEqual(17);
	});

	it("ends with a prompt line and a single status strap", () => {
		const state = createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		const lines = plain(renderShellFrame(state)).split("\n");
		expect(lines[lines.length - 2]).toMatch(/^❯ /);
		expect(lines[lines.length - 1]).toContain("hobo-code");
	});

	it("never emits the old dashboard furniture", () => {
		const state = createInitialShellState({
			width: 80,
			height: 24,
			reducedMotion: true,
		});
		const frame = plain(renderShellFrame(state));
		expect(frame).not.toContain("───");
		expect(frame).not.toMatch(/focus:chat/);
		expect(frame).not.toMatch(/agent:idle/);
	});
});
