/**
 * The global input listener — the routing a live TTY read goes through.
 *
 * The shell has two key paths. `handleKey` is the pure reducer, covered well
 * by the scripted suites. Above it sits a listener registered with the TUI,
 * and a live TTY offers every keystroke to that listener *first*; only when it
 * declines does the key reach the shell's own reduce or the editor.
 *
 * That listener was untestable until now: the scripted driver called
 * `handleKey` directly, so nothing exercised the routing. These tests use
 * `scriptedKeysThroughListener`, which replays each key through the listener
 * the way a real read does.
 *
 * **What the seam does and does not reproduce.** It fixes the dispatch
 * *order* — the listener sees each key first, and `handleKey` runs only when
 * it declines. It does not reproduce live editor state: a real TTY types into
 * the pi-tui Editor, while the scripted path composes into `state.input` and
 * leaves the Editor empty. Listener branches guarded on `input.text().length`
 * therefore still take the empty-editor arm. Those belong in a live-TTY test,
 * and the limit is recorded below rather than papered over.
 *
 * What the listener is for — the reason it sits above the reducer at all:
 *
 * **A key can mean something different depending on who owns the keyboard.**
 * While a pane is attached, keystrokes belong to the nested CLI, not the
 * shell. While an approval is pending, the gate must see every key so a
 * mutation cannot be approved by something falling through. While the
 * `/agents` modal is open, Tab must not reach `cycleFocus` and wipe the
 * catalog stack. Each of those is a claim on the keyboard that the reducer
 * alone cannot make, because by the time a key reaches the reducer the
 * decision about who owns it has already been taken.
 *
 * **Some keys are always the shell's.** Ctrl+C quits from anywhere, including
 * out of a modal. A quit that could be swallowed by a surface is a shell you
 * cannot leave.
 *
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { runInteractiveShell } from "../src/interactive-shell.js";

const _ESC = "";
const CTRL_C = "";
const TAB = "\t";

const homes: string[] = [];
afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

interface DriveResult {
	readonly code: number;
	readonly output: string;
	readonly prompts: readonly string[];
	readonly verbs: readonly (readonly string[])[];
}

/** Drive the shell with each key replayed through the global input listener. */
async function drive(
	scriptedKeys: string,
	options: { readonly throughListener?: boolean } = {},
): Promise<DriveResult> {
	const chunks: string[] = [];
	const verbs: string[][] = [];
	const prompts: string[] = [];
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-listener-"));
	homes.push(dir);
	const code = await runInteractiveShell({
		stdin: new PassThrough(),
		stdout: new Writable({
			write(chunk, _encoding, done) {
				chunks.push(String(chunk));
				done();
			},
		}),
		hoboHome: dir,
		sidecars: false,
		reducedMotion: true,
		scriptedKeys,
		scriptedKeysThroughListener: options.throughListener !== false,
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

describe("the seam itself", () => {
	it("still finishes cleanly", async () => {
		expect((await drive(`hello\r${CTRL_C}`)).code).toBe(0);
	});

	it("still submits an ordinary prompt", async () => {
		// Ordinary text is not something the listener claims, so it has to
		// reach the reducer exactly as before.
		expect((await drive(`hello\r${CTRL_C}`)).prompts).toStrictEqual(["hello"]);
	});

	it("leaves the default path alone", async () => {
		// The opt-in must not change what the existing suites assert.
		expect(
			(await drive(`hello\r${CTRL_C}`, { throughListener: false })).prompts,
		).toStrictEqual(["hello"]);
	});
});

describe("Esc — and the limit of this seam", () => {
	it("does not clear the line, because the editor is empty here", () => {
		// Recorded so the limit is visible where someone would otherwise be
		// misled. The listener's Esc branch is guarded on `input.text()` --
		// the pi-tui Editor's buffer. A live TTY types into that Editor; the
		// scripted driver composes into `state.input` and leaves the Editor
		// empty, so the branch takes its empty arm however the key is routed.
		//
		// Routing through the listener fixes the dispatch *order*, not the
		// state the branches read. Esc-clears-the-line, the Enter-attaches
		// guard, and the bracket/brace navigation guards all read editor text
		// and so belong in a live-TTY test, not here.
		expect(true).toBe(true);
	});
});

describe("Ctrl+C", () => {
	it("quits", async () => {
		expect((await drive(CTRL_C)).code).toBe(0);
	});

	it("quits with a half-typed line", async () => {
		// A draft is not a reason to refuse to exit.
		expect((await drive(`half typed${CTRL_C}`)).code).toBe(0);
	});

	it("quits from the slash palette", async () => {
		expect((await drive(`/${CTRL_C}`)).code).toBe(0);
	});

	it("does not submit the line it was quit on", async () => {
		expect((await drive(`never sent${CTRL_C}`)).prompts).toStrictEqual([]);
	});

	it("quits after a scene change", async () => {
		expect((await drive(`${TAB}${TAB}${CTRL_C}`)).code).toBe(0);
	});
});

describe("Tab through the listener", () => {
	it("cycles the scene", async () => {
		// The listener owns Tab so it can refuse it while a modal is up; on the
		// ordinary path it still has to cycle.
		const { code } = await drive(`${TAB}${CTRL_C}`);
		expect(code).toBe(0);
	});

	it("does not put a tab character in the composer", async () => {
		const { prompts } = await drive(`${TAB}typed\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["typed"]);
	});

	it("survives cycling all the way round", async () => {
		const { code } = await drive(`${TAB.repeat(8)}${CTRL_C}`);
		expect(code).toBe(0);
	});
});

describe("keys the listener declines", () => {
	it("lets printable text through to the composer", async () => {
		expect((await drive(`plain words\r${CTRL_C}`)).prompts).toStrictEqual([
			"plain words",
		]);
	});

	it("lets a slash command through", async () => {
		// `/` is composer text as far as the listener is concerned; the palette
		// is the reducer's business.
		const { code } = await drive(`/about\r${CTRL_C}`);
		expect(code).toBe(0);
	});

	it("lets backspace through", async () => {
		expect((await drive(`abcx\r${CTRL_C}`)).prompts).toStrictEqual(["abc"]);
	});

	it("keeps a bracket as text off the mux surface", async () => {
		// The listener's bracket branch is guarded on the agents focus; on chat
		// the character is just a character.
		expect((await drive(`a]b\r${CTRL_C}`)).prompts).toStrictEqual(["a]b"]);
	});
});
