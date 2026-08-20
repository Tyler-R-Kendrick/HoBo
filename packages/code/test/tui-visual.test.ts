import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { stripSgr as plain } from "../src/ansi.js";
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

/**
 * Set `HOBO_UPDATE_VISUAL=1` to rewrite the committed frames after a
 * deliberate chrome change; otherwise they are compared, not regenerated.
 *
 * The distinction matters more than it looks. This file used to write the
 * fixture unconditionally on every run, which meant the "golden" frame could
 * never disagree with the code and so could never catch anything — and, worse,
 * it recorded whatever the shell's ambient state happened to be, so the file
 * changed depending on which tests ran before it and showed up as a spurious
 * diff in `git status`.
 */
const UPDATE = process.env.HOBO_UPDATE_VISUAL === "1";

const temps: string[] = [];

afterEach(() => {
	for (const dir of temps.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/**
 * An empty HoBo home and an empty environment.
 *
 * The chrome strip renders the signed-in Station, so a frame rendered against
 * the ambient home is a frame that depends on whether anything signed in
 * earlier in the run. Isolating it is what makes the committed frame a
 * function of the code rather than of test order — and it keeps a real
 * developer's account name out of a file in the repository.
 */
function isolated(): {
	readonly hoboHome: string;
	readonly env: NodeJS.ProcessEnv;
} {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-visual-home-"));
	temps.push(hoboHome);
	return { hoboHome, env: {} };
}

/** Compare against the committed frame, or rewrite it when asked to. */
function expectFrame(frame: string, path: string): void {
	if (UPDATE) {
		writeFileSync(path, `${frame}\n`, "utf8");
		return;
	}
	expect(frame).toBe(readFileSync(path, "utf8").replace(/\n$/u, ""));
}

describe("hobo-code TUI visual contract", () => {
	it("paints rubberhose chrome: ink outline, sticker shadow, inverse strap", () => {
		const state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: true,
			reducedMotion: true,
			...isolated(),
		});
		const frame = plain(renderShellFrame(state));
		expectFrame(frame, fixturePath);

		expect(frame).toContain("█");
		expect(frame).toContain("▄");
		expect(frame).toContain(INK.shadow);
		expect(frame).not.toContain("───");
		expect(frame).toContain("hobo-code");
		expect(frame).toContain("/templates");
		expect(frame).toContain("/dev");
		expect(frame).toContain("[ /templates ]");
		expect(frame).not.toMatch(/\[ \/[^\]]+…/);
		expect(frame).toContain("chat first");
		expect(frame).not.toMatch(/sta…/);
		expect(frame).toMatch(/talk\s+Type\+Enter stays in chat/);
		expect(frame).toMatch(/chat first/);
		expect(frame.split("\n").every((line) => line.length === 72)).toBe(true);
	});

	it("paints an open slash palette as the same ink card, uncut", () => {
		let state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: false,
			reducedMotion: true,
			...isolated(),
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
			...isolated(),
		});
		state = reduceShellKey(state, "\t").state;
		state = reduceShellKey(state, "\t").state;
		expect(state.focus).toBe("resources");
		const frame = plain(renderShellFrame(state));
		expect(frame).toContain("█");
		expect(frame).toContain("▄");
		expect(frame).toContain(INK.shadow);
		expect(frame).not.toContain("───");
		expect(frame).toMatch(/resources/);
		// Isolated home, so the strip is deterministically signed out rather
		// than showing whichever account a neighbouring test happened to create.
		expect(frame).toMatch(/auth:out/);
		expect(frame.split("\n").every((line) => line.length === 72)).toBe(true);
	});
});
