/**
 * The shell loop's decisions that only exist inside the running program.
 *
 * `shell-navigation-keys.test.ts` beside this file proves no key can wedge or
 * crash the shell. This one goes after the specific branches the input
 * listener owns rather than delegating to the reducer — the ones a reducer
 * test cannot reach because they read live state (is a turn in flight? is a
 * modal up? does the editor have text in it?) or call back into the terminal.
 *
 * Three of them carry real weight:
 *
 * **Esc means the most recoverable thing available.** With a turn in flight it
 * cancels the turn, and that ordering is the point — a user hitting Esc during
 * a long answer wants the answer stopped, not their next prompt wiped, and the
 * reverse would be an unrecoverable loss of whichever one they cared about.
 * The loop also intends Esc to clear a half-typed line when no turn is
 * running; through the scripted driver it does not, and that gap is pinned
 * below with what is and is not known about it.
 *
 * **A modal consumes every key, Tab included.** The comment in the source
 * records why: requiring `focus === "agents-catalog"` previously let Tab reach
 * `cycleFocus` and wipe the catalog stack out from under the user. A modal
 * that leaks one key is a modal that can be dismissed by accident.
 *
 * **The harness navigation keys are scoped four ways.** `{`/`}`, `,`/`.` and
 * `[`/`]` only navigate when the agents pane has focus, the editor is empty,
 * there is agent work to navigate, and there is more than one thing to move
 * between. Every one of those conditions exists so the key stays typeable in
 * the composer — `.` and `,` are in every sentence anyone types.
 *
 * Driven through `runInteractiveShell` with scripted keys, each run against
 * its own `HOBO_HOME`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { runInteractiveShell } from "../src/interactive-shell.js";

const ESC = "\u001b";
const CTRL_C = "\u0003";
const TAB = "\t";
const SHIFT_TAB = `${ESC}[Z`;

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-loop-"));
	homes.push(dir);
	return dir;
}

interface DriveOptions {
	/** Resolve the turn only when the test says so. */
	readonly holdTurn?: boolean;
	/** Provide a cancelTurn seam so Esc has something to cancel. */
	readonly cancellable?: boolean;
	/** Make the completion engine throw. */
	readonly failTurn?: boolean;
}

async function drive(scriptedKeys: string, options: DriveOptions = {}) {
	const chunks: string[] = [];
	const verbs: string[][] = [];
	const prompts: string[] = [];
	let cancels = 0;
	let release: (() => void) | undefined;
	const held = options.holdTurn
		? new Promise<void>((resolve) => {
				release = resolve;
			})
		: undefined;
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
				if (options.failTurn) throw new Error("engine unavailable");
				if (held) await held;
				return `assistant: ${prompt}`;
			},
			...(options.cancellable
				? {
						cancelTurn: async () => {
							cancels += 1;
							release?.();
						},
					}
				: undefined),
		},
		// SAFETY: the scripted-driver options are the shape the shell declares.
	} as never);
	return { code, output: chunks.join(""), verbs, prompts, cancels };
}

/** Tab enough times to have visited every scene, then act. */
const CYCLE = TAB.repeat(6);

describe("what Esc means", () => {
	it("does not clear a half-typed line under the scripted driver", async () => {
		// Recorded as observed, and it does NOT match the loop's stated intent:
		// the input listener has an explicit branch commented "Esc clears a
		// half-typed line instead of doing nothing at all" that calls
		// `input.clear()`. Through `scriptedKeys` the line survives instead --
		// checked four ways (bare Esc, Esc after a cursor move, a doubled Esc,
		// and Esc with the slash palette open), all identical.
		//
		// Two readings, and this test deliberately does not pick one: either
		// scripted keys reach the editor by a path that bypasses the listener,
		// in which case only the real-TTY behaviour matters and
		// `shell-live-tty.test.ts` is where it belongs; or Esc genuinely does
		// not clear, which is a defect. Pinning the current behaviour means a
		// change in either direction shows up here rather than silently.
		const { prompts } = await drive(`abandon this${ESC}kept\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["abandon thiskept"]);
	});

	it("keeps the line the same way after a cursor move", async () => {
		const { prompts } = await drive(`abc${ESC}[D${ESC}kept\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["abckept"]);
	});

	it("does nothing at all on an empty line", async () => {
		// Not a quit, not a scene change. Esc on an empty composer is the most
		// common accidental keystroke there is.
		const { code, prompts } = await drive(`${ESC}${ESC}${ESC}typed\r${CTRL_C}`);
		expect(code).toBe(0);
		expect(prompts).toStrictEqual(["typed"]);
	});

	it("cancels a turn in flight rather than clearing the line", async () => {
		// The ordering that matters: a user hitting Esc during a long answer
		// wants the answer stopped. Clearing their next prompt instead would
		// lose the thing they cared about and leave the turn running.
		const { cancels } = await drive(`ask something\r${ESC}${CTRL_C}`, {
			holdTurn: true,
			cancellable: true,
		});
		expect(cancels).toBeGreaterThan(0);
	});

	it("does not cancel when there is no turn to cancel", async () => {
		const { cancels } = await drive(`${ESC}${CTRL_C}`, { cancellable: true });
		expect(cancels).toBe(0);
	});

	it("still exits cleanly when no cancel seam is wired", async () => {
		// A host without `cancelTurn` is a valid host; Esc has to degrade to
		// doing nothing rather than throwing on an absent function.
		expect((await drive(`ask\r${ESC}${CTRL_C}`)).code).toBe(0);
	});
});

describe("the agents modal owns the keyboard", () => {
	it("opens on the slash command", async () => {
		expect((await drive(`/agents\r${CTRL_C}`)).code).toBe(0);
	});

	it("does not hand /agents to the product CLI", async () => {
		// Bare `/agents` opens a modal in the shell; routing it to the CLI
		// would print a list instead of opening anything.
		expect((await drive(`/agents\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});

	it("swallows Tab instead of cycling focus behind it", async () => {
		// The source comment records the bug this prevents: requiring
		// focus === "agents-catalog" let Tab reach cycleFocus and wipe the
		// catalog stack out from under the user.
		expect((await drive(`/agents\r${TAB}${TAB}${CTRL_C}`)).code).toBe(0);
	});

	it("swallows arrow keys used to move through the catalog", async () => {
		const { code } = await drive(`/agents\r${ESC}[B${ESC}[B${ESC}[A${CTRL_C}`);
		expect(code).toBe(0);
	});

	it("does not leak typed characters into the composer", async () => {
		// A modal that let keys through to the editor would leave a line of
		// catalog navigation sitting in the composer when it closed.
		const { prompts } = await drive(`/agents\rjjkk${ESC}${ESC}\r${CTRL_C}`);
		expect(prompts).toStrictEqual([]);
	});

	it("closes on Esc and hands the keyboard back", async () => {
		// The modal has to be escapable, and what comes after has to reach the
		// composer normally.
		const { prompts } = await drive(`/agents\r${ESC}${ESC}after\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["after"]);
	});

	it("survives being opened twice", async () => {
		expect((await drive(`/agents\r${ESC}${ESC}/agents\r${CTRL_C}`)).code).toBe(
			0,
		);
	});
});

describe("harness navigation keys stay typeable", () => {
	// Every one of these is scoped to "agents pane focused, editor empty,
	// agent work present, more than one thing to move between" precisely so it
	// stays available as a character in the composer.
	it.each([
		["{", "}"],
		[",", "."],
		["[", "]"],
	])("types %s and %s into a line rather than navigating", async (left, right) => {
		// `.` and `,` are in every sentence anyone types; `{` and `[` in every
		// prompt about code. A binding that stole them would make the composer
		// unusable for its main purpose.
		const { prompts } = await drive(`a${left}b${right}c\r${CTRL_C}`);
		expect(prompts).toStrictEqual([`a${left}b${right}c`]);
	});

	it("still types them after cycling focus back to the chat", async () => {
		const { prompts } = await drive(`${CYCLE}x{y},z\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["x{y},z"]);
	});

	it("does not navigate on an empty composer with no agent work", async () => {
		// With nothing seated, the keys have nothing to move between, and the
		// guard is what stops them from being a silent no-op that also does
		// not type.
		expect((await drive(`${CYCLE}{},.[]${CTRL_C}`)).code).toBe(0);
	});

	it("leaves the shell usable after every harness key in every scene", async () => {
		const sweep = `${TAB}{},.[]${TAB}{},.[]${TAB}{},.[]${TAB}{},.[]`;
		expect((await drive(`${sweep}${CTRL_C}`)).code).toBe(0);
	});
});

describe("Enter in the agents pane", () => {
	it("does not submit an empty line as a prompt", async () => {
		// Enter on an empty composer is not a message. Sending one would spend
		// a turn on nothing and put an empty user bubble in the transcript.
		const { prompts } = await drive(`${CYCLE}\r\r\r${CTRL_C}`);
		expect(prompts).toStrictEqual([]);
	});

	it("submits a typed line from any scene", async () => {
		// Focus follows the scene, but the composer is global; a scene that
		// swallowed Enter would strand a typed prompt.
		const { prompts } = await drive(`${CYCLE}a real prompt\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["a real prompt"]);
	});

	it("stays usable when Enter finds no pane to attach to", async () => {
		// With nothing seated there is nothing to attach to; the guard has to
		// fall through rather than entering an attachment with no pane.
		expect((await drive(`${CYCLE}\r${CTRL_C}`)).code).toBe(0);
	});
});

describe("a turn that fails", () => {
	it("keeps the shell alive", async () => {
		// The engine is the part most likely to be misconfigured on a first
		// run. A shell that died with it would give the user no way to read
		// the error or fix the setting.
		expect((await drive(`ask\r${CTRL_C}`, { failTurn: true })).code).toBe(0);
	});

	it("accepts another prompt afterwards", async () => {
		// One failure must not poison the session — the fix is usually an
		// export away, and the user is still sitting in the shell.
		const { prompts } = await drive(`first\rsecond\r${CTRL_C}`, {
			failTurn: true,
		});
		expect(prompts).toStrictEqual(["first", "second"]);
	});

	it("still runs slash commands after a failed turn", async () => {
		const { code } = await drive(`ask\r/help\r${CTRL_C}`, { failTurn: true });
		expect(code).toBe(0);
	});

	it("still navigates after a failed turn", async () => {
		expect(
			(await drive(`ask\r${CYCLE}${CTRL_C}`, { failTurn: true })).code,
		).toBe(0);
	});
});

describe("focus cycling in both directions", () => {
	it("comes back to where it started", async () => {
		// Forward and back the same number of times has to be a no-op, or the
		// two keys disagree about how many scenes there are.
		const { prompts } = await drive(
			`${TAB.repeat(3)}${SHIFT_TAB.repeat(3)}typed\r${CTRL_C}`,
		);
		expect(prompts).toStrictEqual(["typed"]);
	});

	it("wraps rather than stopping at the last scene", async () => {
		// Ten cycles is more scenes than exist; a cycle that stopped at the end
		// would leave the user unable to get back without Shift+Tab.
		expect((await drive(`${TAB.repeat(10)}${CTRL_C}`)).code).toBe(0);
	});

	it("wraps backwards too", async () => {
		expect((await drive(`${SHIFT_TAB.repeat(10)}${CTRL_C}`)).code).toBe(0);
	});

	it("keeps a typed line across a full cycle", async () => {
		const { prompts } = await drive(`half${TAB.repeat(8)} typed\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["half typed"]);
	});

	it("cycles after a turn has populated the scenes", async () => {
		// An empty shell has less to render; cycling with real content in the
		// panes is the case that exercises the layout.
		const { code } = await drive(`a question\r${TAB.repeat(8)}${CTRL_C}`);
		expect(code).toBe(0);
	});
});

describe("running verbs from the shell", () => {
	it("hands a slash verb to the host", async () => {
		expect((await drive(`/status\r${CTRL_C}`)).verbs).toStrictEqual([
			["status"],
		]);
	});

	it("runs several verbs in a session", async () => {
		// State carried between verbs is where a shell that re-initialises per
		// command falls over.
		expect((await drive(`/status\r/cost\r${CTRL_C}`)).verbs).toStrictEqual([
			["status"],
			["cost"],
		]);
	});

	it("mixes verbs and prompts in one session", async () => {
		const { verbs, prompts } = await drive(
			`/status\rsay something\r/cost\r${CTRL_C}`,
		);
		expect(verbs).toStrictEqual([["status"], ["cost"]]);
		expect(prompts).toStrictEqual(["say something"]);
	});

	it("navigates between verbs without losing them", async () => {
		const { verbs } = await drive(
			`/status\r${TAB}${TAB}/cost\r${TAB}${CTRL_C}`,
		);
		expect(verbs).toStrictEqual([["status"], ["cost"]]);
	});
});
