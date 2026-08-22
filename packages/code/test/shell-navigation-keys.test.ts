/**
 * The shell's global keys, driven through the real terminal loop.
 *
 * `shell-key-reducer.test.ts` and `shell-reading-modes.test.ts` exercise the
 * reducer in isolation. This file drives the same keys through
 * `runInteractiveShell` — the input listener, the renderer and the reducer
 * together — because the loop is where a key can be swallowed before it ever
 * reaches the reducer, and that failure is invisible to a reducer test.
 *
 * The property under test is the same one for every key here, and it is worth
 * stating plainly because it sounds too weak to bother with: **no key leaves
 * the shell unable to exit, and no key crashes it.** A TUI in the alternate
 * screen with raw mode on is not a program a user can simply Ctrl-C out of and
 * walk away from — a crash mid-frame leaves the terminal without an echo, and
 * a hang leaves it in the alternate screen. Both take a `reset` to repair, and
 * a user who has just met this tool will not know that. So every navigation
 * key is driven, and every run ends by proving the shell still quit cleanly.
 * (The terminal-restore sequences themselves belong to `shell-live-tty.test.ts`,
 * which drives a real TTY — the scripted driver writes to a plain stream and
 * so never enters the alternate screen at all.)
 *
 * Beyond that, two behaviours are pinned because they are what the keys are
 * *for*:
 *
 * **Focus keys change focus without touching the input line.** Tab cycling and
 * the pane brackets are pressed while a half-typed prompt is sitting there;
 * one that cleared it would lose work with no undo.
 *
 * **Scroll keys never submit.** PgUp in a chat is someone reading back, and a
 * scroll binding that fell through to the composer would send a message they
 * were only trying to look at.
 *
 * Each run gets its own `HOBO_HOME` and a scripted key sequence, so nothing
 * depends on a real terminal.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { runInteractiveShell } from "../src/interactive-shell.js";

const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_O = "\u000f";
const CTRL_L = "\u000c";
const TAB = "\t";
const SHIFT_TAB = `${ESC}[Z`;
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const LEFT = `${ESC}[D`;
const RIGHT = `${ESC}[C`;
const PAGE_UP = `${ESC}[5~`;
const PAGE_DOWN = `${ESC}[6~`;
const HOME = `${ESC}[H`;
const END = `${ESC}[F`;

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-nav-"));
	homes.push(dir);
	return dir;
}

/** Drive a scripted key sequence and collect everything the shell wrote. */
async function drive(scriptedKeys: string) {
	const chunks: string[] = [];
	const verbs: string[][] = [];
	const prompts: string[] = [];
	const code = await runInteractiveShell({
		stdin: new PassThrough(),
		stdout: new Writable({
			write(chunk, _encoding, done) {
				chunks.push(String(chunk));
				done();
			},
		}),
		hoboHome: home(),
		sidecars: false,
		reducedMotion: true,
		scriptedKeys,
		host: {
			runVerb: async (argv: readonly string[]) => {
				verbs.push([...argv]);
				return `ran ${argv.join(" ")}`;
			},
			complete: async (prompt: string) => {
				prompts.push(prompt);
				return `assistant: ${prompt}`;
			},
		},
		// SAFETY: the scripted-driver options are the shape the shell declares.
	} as never);
	return { code, output: chunks.join(""), verbs, prompts };
}

/** Press a key, then quit. */
const press = (keys: string) => drive(`${keys}${CTRL_C}`);

const NAVIGATION_KEYS: ReadonlyArray<readonly [string, string]> = [
	["Tab", TAB],
	["Shift+Tab", SHIFT_TAB],
	["Up", UP],
	["Down", DOWN],
	["Left", LEFT],
	["Right", RIGHT],
	["PgUp", PAGE_UP],
	["PgDn", PAGE_DOWN],
	["Home", HOME],
	["End", END],
	["open bracket", "["],
	["close bracket", "]"],
	["Ctrl+L", CTRL_L],
	["Esc", ESC],
];

describe("every navigation key leaves a usable terminal", () => {
	it.each(
		NAVIGATION_KEYS,
	)("%s does not stop the shell quitting", async (_name, key) => {
		// A TUI in the alternate screen with raw mode on is not something a
		// user can Ctrl-C out of and walk away from; a hang leaves the terminal
		// in the alternate screen and takes a `reset` to repair.
		expect((await press(key)).code).toBe(0);
	});

	it.each(
		NAVIGATION_KEYS,
	)("%s does not send anything to the model", async (_name, key) => {
		// Navigation is not a message. A key that fell through to the composer
		// and submitted would spend tokens on a keystroke.
		expect((await press(key)).prompts).toStrictEqual([]);
	});

	it.each(NAVIGATION_KEYS)("%s does not run a CLI verb", async (_name, key) => {
		expect((await press(key)).verbs).toStrictEqual([]);
	});

	it.each(NAVIGATION_KEYS)("%s still paints a frame", async (_name, key) => {
		// A key that left the renderer with nothing to draw would blank the
		// screen — indistinguishable from a crash.
		expect((await press(key)).output.length).toBeGreaterThan(0);
	});
});

describe("focus keys do not disturb a half-typed line", () => {
	// Only Tab and Shift+Tab. The brackets cycle panes *while attached* -- in
	// the composer they are ordinary printable characters, which is the right
	// call: `[` appears in almost every prompt about code, and stealing it
	// would make the editor unable to type an array literal.
	const FOCUS_KEYS = [TAB, SHIFT_TAB];

	it.each(
		FOCUS_KEYS,
	)("keeps the typed text across a focus change", async (key) => {
		// These are pressed while a half-typed prompt is sitting there; one
		// that cleared it would lose work with no undo. Typing, cycling focus
		// and submitting has to send what was typed.
		const { prompts } = await drive(`hello${key}\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["hello"]);
	});

	it.each(
		FOCUS_KEYS,
	)("submits the whole line after a focus change", async (key) => {
		const { prompts } = await drive(`before${key}after\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["beforeafter"]);
	});
});

describe("the pane brackets in the composer", () => {
	it("types an open bracket rather than cycling panes", async () => {
		// `[` appears in almost every prompt about code. Stealing it for pane
		// navigation would make the editor unable to type an array literal --
		// the brackets only cycle panes while attached to a pane.
		expect((await drive(`const a = [1]\r${CTRL_C}`)).prompts).toStrictEqual([
			"const a = [1]",
		]);
	});

	it("keeps both brackets in a typed line", async () => {
		expect((await drive(`a[b]c\r${CTRL_C}`)).prompts).toStrictEqual(["a[b]c"]);
	});
});

describe("scrolling never submits", () => {
	const SCROLL_KEYS = [PAGE_UP, PAGE_DOWN, HOME, END];

	it.each(SCROLL_KEYS)("does not send the typed line", async (key) => {
		// PgUp in a chat is someone reading back; a scroll binding that fell
		// through to the composer would send a message they were only trying
		// to look at.
		expect(
			(await drive(`half a thought${key}${CTRL_C}`)).prompts,
		).toStrictEqual([]);
	});

	it.each(
		SCROLL_KEYS,
	)("keeps the line for when the reader comes back", async (key) => {
		expect(
			(await drive(`half a thought${key}\r${CTRL_C}`)).prompts,
		).toStrictEqual(["half a thought"]);
	});

	it("scrolls a transcript that has something in it", async () => {
		// Scrolling an empty chat exercises nothing; this run has a real turn
		// behind it, so the scroll has content to move over.
		const { code } = await drive(
			`say something\r${PAGE_UP}${PAGE_DOWN}${HOME}${END}${CTRL_C}`,
		);
		expect(code).toBe(0);
	});
});

describe("transcript reading mode through the loop", () => {
	it("opens and closes on Ctrl+O", async () => {
		// The reducer test covers the bindings; this covers that the key
		// reaches the reducer at all through the input listener.
		expect((await drive(`${CTRL_O}${CTRL_O}${CTRL_C}`)).code).toBe(0);
	});

	it("does not submit a line while reading", async () => {
		expect((await drive(`typed${CTRL_O}\r${CTRL_C}`)).prompts).toStrictEqual(
			[],
		);
	});

	it("keeps the typed line for after the reader leaves", async () => {
		// Leaving the mode has to hand the composer back exactly as it was.
		expect(
			(await drive(`typed${CTRL_O}${CTRL_O}\r${CTRL_C}`)).prompts,
		).toStrictEqual(["typed"]);
	});

	it("exits cleanly from inside the mode", async () => {
		// Quitting while a modal reading view is up is the case most likely to
		// leave the loop waiting on a key that never comes.
		expect((await drive(`${CTRL_O}${CTRL_C}`)).code).toBe(0);
	});

	it("reads back over a transcript with real content", async () => {
		const { code } = await drive(
			`first\rsecond\r${CTRL_O}jjkk${CTRL_O}${CTRL_C}`,
		);
		expect(code).toBe(0);
	});
});

describe("a long key sequence", () => {
	it("survives every navigation key pressed in a row", async () => {
		// Individually each key is fine; the combination is where a focus
		// change into a scene with no rows, or a scroll past the end of an
		// empty pane, would throw.
		const everything = NAVIGATION_KEYS.map(([, key]) => key).join("");
		expect((await press(everything)).code).toBe(0);
	});

	it("still paints a frame after every navigation key", async () => {
		const everything = NAVIGATION_KEYS.map(([, key]) => key).join("");
		expect((await press(everything)).output.length).toBeGreaterThan(0);
	});

	it("still works after a turn has happened", async () => {
		// Scenes are populated differently once there is a transcript and a
		// verb result; navigating an empty shell proves less than it looks.
		const everything = NAVIGATION_KEYS.map(([, key]) => key).join("");
		const { code } = await drive(`a question\r${everything}${CTRL_C}`);
		expect(code).toBe(0);
	});

	it("still submits after all that navigation", async () => {
		// The end state has to be a usable composer, not merely a live
		// process. The brackets in the sequence land in the line as ordinary
		// characters, which is what they are outside an attached pane.
		const everything = NAVIGATION_KEYS.map(([, key]) => key).join("");
		const { prompts } = await drive(`${everything}after it all\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["[]after it all"]);
	});
});
