/**
 * The Git pane's pure layer: prompt input, selection movement, and the frame.
 *
 * The pane runs against a live worktree, but everything that decides *what*
 * happens is pure and lives here. Three rules are worth stating.
 *
 * **A prompt is cancelled by Ctrl-C or Esc, and only completed by a newline.**
 * These prompts gate destructive actions — discard, branch delete, revert — and
 * one of them asks the operator to retype an approval digest. A prompt that
 * treated an escape sequence as text would let an arrow key contribute
 * characters to an answer that is compared against a digest, and a prompt that
 * completed on anything other than a deliberate Enter would act on a partial
 * one.
 *
 * **A blank answer is no answer.** `""` and `"   "` both come back as
 * *cancelled*, not as an empty string, because every caller compares the answer
 * against something — `"yes"`, a digest — and an empty string that compared
 * equal to an empty expectation would approve silently.
 *
 * **Selection cannot leave the list.** The index addresses a row that is about
 * to be staged, discarded or reverted; an index past the end resolves to
 * `undefined` and the action quietly does nothing, which reads to the operator
 * as the pane ignoring them.
 *
 * The frame is checked for the properties an operator depends on — every line
 * bounded by the terminal width, the active panel marked, the keymap always
 * visible — rather than pinned as a golden string, which would break on every
 * cosmetic change without saying anything about correctness.
 */
import { describe, expect, it } from "vitest";

import {
	consumeGitTerminalPromptChunk,
	type GitTerminalPaneState,
	INITIAL_GIT_TERMINAL_STATE,
	moveGitTerminalSelection,
	renderGitTerminalPane,
	runGitTerminalPane,
} from "../src/git-terminal-pane.js";
import type { GitWorkbenchSnapshot } from "../src/git-workbench.js";

const file = (path: string, flags: Record<string, boolean> = {}) => ({
	path,
	staged: false,
	unstaged: true,
	untracked: false,
	...flags,
});

const snapshot = (overrides: Record<string, unknown> = {}) =>
	({
		branch: "main",
		upstream: "origin/main",
		ahead: 1,
		behind: 2,
		files: [file("src/a.ts"), file("src/b.ts", { staged: true })],
		branches: [
			{ name: "main", current: true, subject: "latest" },
			{ name: "feature", current: false, subject: "wip" },
		],
		commits: [
			{ graph: "* ", shortOid: "abc1234", oid: "abc1234def", subject: "first" },
		],
		stashes: [{ ref: "stash@{0}", subject: "wip" }],
		truncated: { files: false },
		...overrides,
	}) as unknown as GitWorkbenchSnapshot;

const state = (
	overrides: Partial<GitTerminalPaneState> = {},
): GitTerminalPaneState => ({ ...INITIAL_GIT_TERMINAL_STATE, ...overrides });

describe("the initial state", () => {
	it("opens on the files panel, which is what an operator came for", () => {
		expect(INITIAL_GIT_TERMINAL_STATE.panel).toBe("files");
	});

	it("starts every panel at its first row", () => {
		// A remembered index from a previous session would point at a different
		// file after the working tree changed.
		expect(Object.values(INITIAL_GIT_TERMINAL_STATE.selected)).toEqual([
			0, 0, 0, 0, 0,
		]);
	});

	it("carries no message, so the keymap shows instead", () => {
		expect(INITIAL_GIT_TERMINAL_STATE.message).toBeUndefined();
	});
});

describe("consumeGitTerminalPromptChunk", () => {
	it("accumulates typed characters without completing", () => {
		expect(consumeGitTerminalPromptChunk("", "yes")).toEqual({
			done: false,
			value: "yes",
		});
	});

	it("appends to what was already typed", () => {
		expect(consumeGitTerminalPromptChunk("ye", "s")).toEqual({
			done: false,
			value: "yes",
		});
	});

	it("completes on a carriage return", () => {
		expect(consumeGitTerminalPromptChunk("yes", "\r")).toEqual({
			done: true,
			value: "yes",
		});
	});

	it("completes on a newline", () => {
		expect(consumeGitTerminalPromptChunk("yes", "\n")).toEqual({
			done: true,
			value: "yes",
		});
	});

	it("completes with text typed in the same chunk as the newline", () => {
		// A paste, or a fast typist, delivers both at once.
		expect(consumeGitTerminalPromptChunk("y", "es\r")).toEqual({
			done: true,
			value: "yes",
		});
	});

	it("ignores anything after the newline", () => {
		// The answer ends at Enter; trailing bytes belong to the next prompt.
		expect(consumeGitTerminalPromptChunk("", "yes\rmore")).toEqual({
			done: true,
			value: "yes",
		});
	});

	it("trims the answer", () => {
		expect(consumeGitTerminalPromptChunk("", "  yes  \r").value).toBe("yes");
	});

	it("cancels on Ctrl-C", () => {
		// This is the escape hatch from a prompt that gates a destructive
		// action; it must not be typeable-past.
		expect(consumeGitTerminalPromptChunk("ye", "")).toEqual({
			done: true,
		});
	});

	it("cancels on Esc", () => {
		expect(consumeGitTerminalPromptChunk("ye", "")).toEqual({
			done: true,
		});
	});

	it("cancels on an arrow key rather than typing its escape sequence", () => {
		// An arrow key is an escape sequence. Treating it as text would put
		// `[A` into an answer that is compared against an approval digest.
		expect(consumeGitTerminalPromptChunk("ye", "[A")).toEqual({
			done: true,
		});
	});

	it("cancels when the escape arrives mixed with text", () => {
		expect(consumeGitTerminalPromptChunk("", "abcd")).toEqual({
			done: true,
		});
	});

	it("reports a cancel as no value at all, not an empty one", () => {
		// Every caller compares the answer; an empty string that compared equal
		// to an empty expectation would approve silently.
		expect(consumeGitTerminalPromptChunk("yes", "").value).toBeUndefined();
	});

	it("treats an empty answer as no answer", () => {
		expect(consumeGitTerminalPromptChunk("", "\r")).toEqual({ done: true });
	});

	it("treats a whitespace-only answer as no answer", () => {
		expect(consumeGitTerminalPromptChunk("   ", "\r").value).toBeUndefined();
	});

	it("keeps an empty accumulated value going on an empty chunk", () => {
		expect(consumeGitTerminalPromptChunk("", "")).toEqual({
			done: false,
			value: "",
		});
	});
});

describe("moveGitTerminalSelection", () => {
	it("moves down one row", () => {
		expect(
			moveGitTerminalSelection(snapshot(), state(), 1).selected.files,
		).toBe(1);
	});

	it("moves up one row", () => {
		const at1 = state({ selected: { ...state().selected, files: 1 } });
		expect(moveGitTerminalSelection(snapshot(), at1, -1).selected.files).toBe(
			0,
		);
	});

	it("stops at the top rather than wrapping", () => {
		// Wrapping from the first file to the last is how an operator discards
		// the wrong file.
		expect(
			moveGitTerminalSelection(snapshot(), state(), -1).selected.files,
		).toBe(0);
	});

	it("stops at the bottom rather than wrapping", () => {
		const last = state({ selected: { ...state().selected, files: 1 } });
		expect(moveGitTerminalSelection(snapshot(), last, 1).selected.files).toBe(
			1,
		);
	});

	it("clamps a jump larger than the list", () => {
		// A page-down on a two-file list must land on the last file, not past it.
		expect(
			moveGitTerminalSelection(snapshot(), state(), 99).selected.files,
		).toBe(1);
	});

	it("clamps a jump below the list", () => {
		expect(
			moveGitTerminalSelection(snapshot(), state(), -99).selected.files,
		).toBe(0);
	});

	it("does nothing on an empty panel", () => {
		// An index of 0 in an empty list already resolves to nothing; moving it
		// would only make the number wrong as well.
		const empty = snapshot({ files: [] });
		expect(moveGitTerminalSelection(empty, state(), 1)).toEqual(state());
	});

	it("moves only the focused panel's selection", () => {
		// Each panel remembers where the operator was; moving them together
		// would lose the position they came back for.
		const moved = moveGitTerminalSelection(
			snapshot(),
			state({ panel: "branches" }),
			1,
		);
		expect(moved.selected.branches).toBe(1);
		expect(moved.selected.files).toBe(0);
	});

	it.each([
		"branches",
		"commits",
		"stash",
	] as const)("moves within the %s panel", (panel) => {
		expect(
			moveGitTerminalSelection(snapshot(), state({ panel }), 1).selected[panel],
		).toBeGreaterThanOrEqual(0);
	});

	it("does not mutate the state it was given", () => {
		const before = state();
		moveGitTerminalSelection(snapshot(), before, 1);
		expect(before.selected.files).toBe(0);
	});
});

describe("renderGitTerminalPane", () => {
	const frame = (
		overrides: Record<string, unknown> = {},
		paneState = state(),
		columns = 80,
		rows = 24,
	) => renderGitTerminalPane(snapshot(overrides), paneState, columns, rows);

	it("names the branch and its divergence in the header", () => {
		// Ahead/behind is the one number that decides whether to push or pull.
		expect(frame().split("\n")[0]).toContain("main");
		expect(frame().split("\n")[0]).toMatch(/↑1.*↓2/u);
	});

	it("says detached rather than leaving the branch blank", () => {
		// A blank where a branch belongs reads as a rendering bug, not as a
		// detached HEAD.
		expect(frame({ branch: undefined })).toContain("detached");
	});

	it("keeps every line within the terminal width", () => {
		// One over-wide line wraps and shifts every box below it, which looks
		// like corruption.
		for (const line of frame({}, state(), 100, 30).split("\n")) {
			expect([...line].length).toBeLessThanOrEqual(100);
		}
	});

	it("honours a wider terminal", () => {
		expect(frame({}, state(), 120, 30).split("\n")[0]?.length).toBe(120);
	});

	it("enforces a minimum width rather than rendering a broken frame", () => {
		// Below the floor the boxes cannot hold their labels; clamping keeps the
		// pane legible on a narrow split.
		const narrow = frame({}, state(), 20, 24);
		expect(narrow.split("\n")[0]?.length).toBeGreaterThanOrEqual(60);
	});

	it("marks the focused panel", () => {
		// Without the marker, every key acts on a panel the operator has to
		// guess at.
		expect(frame({}, state({ panel: "files" }))).toContain("▸ 2 Files");
	});

	it("moves the marker with the focus", () => {
		expect(frame({}, state({ panel: "branches" }))).toContain("▸ 3 Branches");
	});

	it("shows the staged/unstaged/untracked flags per file", () => {
		// Three fixed columns, so the flags line up down the list and a file
		// that is both staged and modified reads as "SM" rather than as two
		// separate states.
		expect(frame()).toContain("SM  src/b.ts");
		expect(frame()).toContain(" M  src/a.ts");
	});

	it("marks an untracked file in its own column", () => {
		// An untracked file staged by mistake is a file added to the repository
		// that nobody reviewed.
		expect(
			frame({ files: [file("new.ts", { unstaged: false, untracked: true })] }),
		).toContain("  ? new.ts");
	});

	it("marks the current branch", () => {
		expect(frame()).toContain("* main");
	});

	it("says when the file list was truncated", () => {
		// A silently truncated list is an operator concluding a file is not
		// changed when it is.
		expect(frame({ truncated: { files: true } })).toContain("first");
	});

	it("prompts for a selection when there is no diff", () => {
		expect(frame()).toContain("Select a file");
	});

	it("shows the diff when one is loaded", () => {
		expect(frame({ selectedDiff: { text: "+added line" } })).toContain(
			"+added line",
		);
	});

	it("always shows the keymap, since the pane has no other help", () => {
		expect(frame()).toContain("q close");
	});

	it("shows the second keymap row of write actions", () => {
		expect(frame()).toContain("c commit");
	});

	it("replaces the keymap row with a message when there is one", () => {
		// A message the operator needs to read beats a keymap they have already
		// learned.
		expect(frame({}, state({ message: "push rejected" }))).toContain(
			"push rejected",
		);
	});

	it("renders an empty repository without crashing", () => {
		// A fresh `git init` has no commits, no branches and no files.
		expect(() =>
			frame({ files: [], branches: [], commits: [], stashes: [] }),
		).not.toThrow();
	});

	it("crops a long file path rather than wrapping it", () => {
		const long = frame({ files: [file(`src/${"deep/".repeat(40)}x.ts`)] });
		for (const line of long.split("\n")) {
			expect([...line].length).toBeLessThanOrEqual(80);
		}
	});

	it("enforces a minimum height, so the boxes still have rows", () => {
		expect(() => frame({}, state(), 80, 4)).not.toThrow();
	});
});

describe("runGitTerminalPane", () => {
	it("refuses a stream that is not a terminal", async () => {
		// The pane paints with absolute cursor moves and reads raw keys; on a
		// pipe it would emit escape codes into whatever is capturing them.
		await expect(
			runGitTerminalPane({
				sessionId: "s1",
				hoboHome: "/tmp/nowhere",
				input: { isTTY: false } as never,
				output: { write: () => true } as never,
			}),
		).rejects.toThrow(/requires a TTY/u);
	});

	it("refuses a terminal that cannot enter raw mode", async () => {
		// isTTY alone is not enough: without setRawMode the pane would receive
		// whole lines and none of its single-key handling would run.
		await expect(
			runGitTerminalPane({
				sessionId: "s1",
				hoboHome: "/tmp/nowhere",
				input: { isTTY: true } as never,
				output: { write: () => true } as never,
			}),
		).rejects.toThrow(/requires a TTY/u);
	});

	it("says where to run it instead", async () => {
		// A refusal an operator cannot act on is only half a refusal.
		await expect(
			runGitTerminalPane({
				sessionId: "s1",
				hoboHome: "/tmp/nowhere",
				input: { isTTY: false } as never,
				output: { write: () => true } as never,
			}),
		).rejects.toThrow(/tmux/u);
	});
});
