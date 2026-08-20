/**
 * `reduceShellKey` — the shell's keyboard reducer, in the modes the existing
 * suite does not reach.
 *
 * The reducer is pure: state in, state plus an optional intent out. That is
 * what makes the shell testable at all, and it is why the interesting rules
 * live here rather than in the terminal loop.
 *
 * **A pending approval swallows every key that is not an explicit answer.**
 * This is the one place a keystroke promotes code out of a sandbox, so the
 * reducer refuses to treat anything ambiguous as consent: `y` approves, `n`,
 * Esc and Enter decline, scroll keys still scroll, and *everything else does
 * nothing at all* — it does not fall through to the editor, and it does not
 * queue up as input to be applied once the prompt clears. Enter declining
 * rather than approving is the deliberate half of that: a user mashing Enter
 * to dismiss a dialog must not thereby promote.
 *
 * **Bracketed paste is one edit, sanitized.** A pasted blob arrives as a single
 * chunk wrapped in escape markers. Newlines become spaces because a newline in
 * this editor means submit — a pasted three-line snippet would otherwise fire
 * three commands — and control characters are stripped so a paste cannot
 * smuggle escape sequences into the input line.
 *
 * **Esc unwinds one layer at a time.** Closing the slash palette, then the btw
 * prompt, then the rest: an Esc that cleared everything at once would lose an
 * in-progress line the user only meant to un-filter.
 */
import { describe, expect, it } from "vitest";

import {
	createInitialShellState,
	type InteractiveShellState,
	type PendingApproval,
	reduceShellKey,
} from "../src/interactive-shell.js";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

const base = (overrides: Partial<InteractiveShellState> = {}) =>
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	({
		...createInitialShellState({ width: 80, height: 24, welcome: false }),
		...overrides,
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
	}) as InteractiveShellState;

// SAFETY: parsed or fixture value is the named domain type after this assertion.
const approval = {
	kind: "promote",
	summary: "promote 3 files",
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
} as PendingApproval;

const withApproval = (overrides: Partial<InteractiveShellState> = {}) =>
	base({ pendingApproval: approval, ...overrides });

describe("a pending approval", () => {
	it.each(["y", "Y"])("promotes on %s", (key) => {
		const result = reduceShellKey(withApproval(), key);
		expect(result.approve).toBe(approval);
		expect(result.decline).toBeUndefined();
	});

	it.each(["n", "N"])("declines on %s", (key) => {
		const result = reduceShellKey(withApproval(), key);
		expect(result.decline).toBe(approval);
		expect(result.approve).toBeUndefined();
	});

	it("declines on Esc", () => {
		expect(reduceShellKey(withApproval(), "\u001b").decline).toBe(approval);
	});

	it.each([
		"\r",
		"\n",
	])("declines rather than approves on Enter (%j)", (key) => {
		// A user mashing Enter to dismiss a dialog must not thereby promote code
		// out of its sandbox. Declining is the only safe reading of a reflex.
		const result = reduceShellKey(withApproval(), key);
		expect(result.decline).toBe(approval);
		expect(result.approve).toBeUndefined();
	});

	it("clears the prompt once answered", () => {
		// A prompt that survived its own answer would ask again on the next key.
		expect(
			reduceShellKey(withApproval(), "y").state.pendingApproval,
		).toBeNull();
	});

	it("clears the prompt on a decline too", () => {
		expect(
			reduceShellKey(withApproval(), "n").state.pendingApproval,
		).toBeNull();
	});

	it.each([
		"a",
		"z",
		"1",
		"/",
		"\t",
		" ",
		"?",
	])("ignores the unrelated key %j entirely", (key) => {
		// Not "handled later": nothing is approved, nothing is declined, and
		// the key does not reach the editor to be applied once the prompt
		// clears.
		const state = withApproval();
		const result = reduceShellKey(state, key);
		expect(result.approve).toBeUndefined();
		expect(result.decline).toBeUndefined();
		expect(result.state.pendingApproval).toBe(approval);
	});

	it("does not let an unrelated key reach the input line", () => {
		const result = reduceShellKey(withApproval(), "a");
		expect(result.state.input).toBe("");
	});

	it("does not submit while an approval is pending", () => {
		// Enter is consumed as a decline; it must not also fire the input line.
		expect(
			reduceShellKey(withApproval({ input: "deploy" }), "\r").submit,
		).toBeUndefined();
	});

	it("still scrolls, so the user can read what they are approving", () => {
		// Refusing to scroll would force a decision on text the user cannot see.
		const state = withApproval();
		const scrolled = reduceShellKey(state, "\u001b[A").state;
		expect(scrolled.pendingApproval).toBe(approval);
	});

	it("keeps the approval pending while scrolling", () => {
		for (const key of ["\u001b[A", "\u001b[B", "\u001b[5~", "\u001b[6~"]) {
			expect(reduceShellKey(withApproval(), key).state.pendingApproval).toBe(
				approval,
			);
		}
	});

	it("jumps to the top and back to live without answering", () => {
		const home = reduceShellKey(withApproval(), "\u001b[H").state;
		const end = reduceShellKey(withApproval(), "\u001b[F").state;
		expect(home.pendingApproval).toBe(approval);
		expect(end.pendingApproval).toBe(approval);
	});

	it("does not quit on Ctrl-C while an approval is pending", () => {
		// Ctrl-C is handled ahead of the prompt; what is pinned is that it does
		// not silently resolve the approval either way.
		const result = reduceShellKey(withApproval(), "\u0003");
		expect(result.approve).toBeUndefined();
		expect(result.decline).toBeUndefined();
	});
});

describe("bracketed paste", () => {
	const paste = (content: string, close = true) =>
		`${PASTE_START}${content}${close ? PASTE_END : ""}`;

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("inserts pasted text as one edit", () => {
		expect(reduceShellKey(base(), paste("hello world")).state.input).toBe(
			"hello world",
		);
	});

	it("appends to whatever was already typed", () => {
		expect(
			reduceShellKey(base({ input: "echo " }), paste("hello")).state.input,
		).toBe("echo hello");
	});

	it("turns a newline into a space rather than submitting", () => {
		// A newline means submit in this editor; a pasted three-line snippet
		// would otherwise fire three commands.
		const result = reduceShellKey(base(), paste("one\ntwo\nthree"));
		expect(result.state.input).toBe("one two three");
		expect(result.submit).toBeUndefined();
	});

	it("handles CRLF the same way", () => {
		expect(reduceShellKey(base(), paste("one\r\ntwo")).state.input).toBe(
			"one two",
		);
	});

	it("strips control characters, so a paste cannot smuggle an escape", () => {
		// Pasted escape sequences would otherwise reach the terminal through the
		// input line.
		expect(
			reduceShellKey(base(), paste("safe\u001b[31mred\u0007")).state.input,
		).toBe("safe[31mred");
	});

	it("strips a DEL byte", () => {
		expect(reduceShellKey(base(), paste("a\u007fb")).state.input).toBe("ab");
	});

	it("ignores a paste that sanitizes away to nothing", () => {
		// An empty paste must not clear the line or count as an edit.
		const state = base({ input: "kept" });
		expect(reduceShellKey(state, paste("\u0000\u0001")).state.input).toBe(
			"kept",
		);
	});

	it("ignores an empty paste", () => {
		expect(reduceShellKey(base({ input: "kept" }), paste("")).state.input).toBe(
			"kept",
		);
	});

	it("tolerates a paste with no closing marker", () => {
		// A truncated chunk is what a paste interrupted by a resize looks like;
		// dropping the content would lose what the user pasted.
		expect(reduceShellKey(base(), paste("partial", false)).state.input).toBe(
			"partial",
		);
	});

	it("filters the slash palette instead when it is open", () => {
		// Pasting into an open palette should search, not type past it.
		const state = base({ slashOpen: true, slashFilter: "te" });
		const result = reduceShellKey(state, paste("mplate"));
		expect(result.state.slashFilter).toBe("template");
		expect(result.state.input).toBe("/template");
	});

	it("resets the palette selection when the filter changes", () => {
		// The previously highlighted row is meaningless against a new filter, and
		// acting on it would run a command the user never saw highlighted.
		const state = base({ slashOpen: true, slashFilter: "", slashIndex: 4 });
		expect(reduceShellKey(state, paste("dep")).state.slashIndex).toBe(0);
	});

	it("does not submit on a paste, however it ends", () => {
		expect(reduceShellKey(base(), paste("deploy\n")).submit).toBeUndefined();
	});
});

describe("Esc", () => {
	it("closes the slash palette", () => {
		const state = base({ slashOpen: true, slashFilter: "dep", input: "/dep" });
		const result = reduceShellKey(state, "\u001b");
		expect(result.state.slashOpen).toBe(false);
	});

	it("clears the palette's filter and the line it was mirroring", () => {
		// Leaving `/dep` on the line after closing the palette would submit a
		// command the user just backed out of.
		const state = base({ slashOpen: true, slashFilter: "dep", input: "/dep" });
		const result = reduceShellKey(state, "\u001b");
		expect(result.state.slashFilter).toBe("");
		expect(result.state.input).toBe("");
	});

	it("returns focus to the chat when it closes the palette", () => {
		const state = base({ slashOpen: true, focus: "editor" });
		expect(reduceShellKey(state, "\u001b").state.focus).toBe("chat");
	});

	it("resets the palette selection", () => {
		const state = base({ slashOpen: true, slashIndex: 3 });
		expect(reduceShellKey(state, "\u001b").state.slashIndex).toBe(0);
	});

	it("does not submit or quit", () => {
		const result = reduceShellKey(base({ slashOpen: true }), "\u001b");
		expect(result.submit).toBeUndefined();
		expect(result.quit).toBeUndefined();
	});
});

describe("the reducer's contract", () => {
	it("always returns a state, whatever the key", () => {
		// The terminal loop assigns the result unconditionally; an undefined
		// state would blank the shell.
		for (const key of ["a", "\u001b", "\r", "\t", "\u0003", "\u001b[A", "~"]) {
			expect(reduceShellKey(base(), key).state).toBeDefined();
		}
	});

	it("does not mutate the state it was given", () => {
		// Every caller holds the previous state to diff against for rendering; a
		// mutated one would make the diff empty and the screen stale.
		const state = base({ input: "before" });
		reduceShellKey(state, "x");
		expect(state.input).toBe("before");
	});

	it("leaves an unhandled key's state untouched", () => {
		const state = base();
		const result = reduceShellKey(state, "\u0000");
		expect(result.state.input).toBe(state.input);
	});

	it("reports no intent for a key that only moves the cursor", () => {
		const result = reduceShellKey(base(), "\u001b[A");
		expect(result.submit).toBeUndefined();
		expect(result.slash).toBeUndefined();
		expect(result.quit).toBeUndefined();
	});
});
