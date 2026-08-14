import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	createInitialShellState,
	reduceShellKey,
	renderShellFrame,
} from "../src/interactive-shell.js";
import { INK } from "../src/rubberhose.js";

const fixturePath = join(
	dirname(fileURLToPath(import.meta.url)),
	"visual",
	"shell-chat.tui.txt",
);

function plain(frame: string): string {
	return frame.replace(
		new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
		"",
	);
}

describe("hobo-code TUI visual contract", () => {
	it("paints rubberhose chrome: ink outline, sticker shadow, inverse strap", () => {
		const state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: true,
			reducedMotion: true,
		});
		const frame = plain(renderShellFrame(state));
		mkdirSync(dirname(fixturePath), { recursive: true });
		writeFileSync(fixturePath, `${frame}\n`, "utf8");

		expect(frame).toContain("█");
		expect(frame).toContain("▄");
		expect(frame).toContain(INK.shadow);
		expect(frame).not.toContain("───");
		expect(frame).toContain("hobo-code");
		expect(frame).toContain("/templates");
		expect(frame).toContain("/dev");
		expect(frame).toContain("[ /templates ]");
		expect(frame).not.toMatch(/\[ \/[^\]]+…/);
		expect(frame).toContain("status");
		expect(frame).not.toMatch(/sta…/);
		expect(frame).toMatch(/talk\s+Type\+Enter · seated Codex\/Claude writes app/);
		expect(frame).toMatch(/resources/);
		expect(frame.split("\n").every((line) => line.length === 72)).toBe(true);
	});

	it("paints an open slash palette as the same ink card, uncut", () => {
		let state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "/").state;
		const frame = plain(renderShellFrame(state));
		expect(state.slashOpen).toBe(true);
		expect(frame).toContain("█");
		expect(frame).toContain("▀");
		expect(frame).toContain(INK.shadow);
		expect(frame).not.toContain("───");
		expect(frame).toContain("hobo-code");
		expect(frame).toMatch(/commands/);
		expect(frame).toContain("/template");
		expect(frame.split("\n").every((line) => line.length === 72)).toBe(true);
	});

	it("paints the resources board as the same ink card", () => {
		let state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: false,
			reducedMotion: true,
		});
		state = reduceShellKey(state, "\t").state;
		state = reduceShellKey(state, "\t").state;
		state = reduceShellKey(state, "\t").state;
		state = reduceShellKey(state, "\t").state;
		expect(state.focus).toBe("resources");
		const frame = plain(renderShellFrame(state));
		expect(frame).toContain("█");
		expect(frame).toContain("▄");
		expect(frame).toContain(INK.shadow);
		expect(frame).not.toContain("───");
		expect(frame).toMatch(/resources/);
		expect(frame).toMatch(/auth:out|station:|local@/);
		expect(frame.split("\n").every((line) => line.length === 72)).toBe(true);
	});
});
