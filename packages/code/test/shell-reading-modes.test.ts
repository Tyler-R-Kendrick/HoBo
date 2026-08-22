/**
 * The two shell modes that take keys away from the composer.
 *
 * **Transcript "less" mode (Ctrl+O) is a reading context, not an editing
 * one.** The rule that makes it usable is the last line of its block:
 * printable keys do not reach the composer. Someone reading back a long
 * transcript navigates with `j`/`k`/`g`/`G` out of `less` muscle memory; if
 * those also typed into the input line, leaving the mode would reveal a line
 * of accumulated navigation keys that then gets submitted. The bindings are
 * deliberately duplicated — `j`/Down, `g`/Home, `{`/PgUp — because the mode
 * is entered by people with either habit, and a key that silently does
 * nothing reads as a hung terminal.
 *
 * **Soft attach (`paneInteract`) forwards keys to a nested CLI — but not all
 * of them.** The exceptions are the ones that would otherwise become
 * unreachable. Detach has to be held back or there is no way out of the
 * attachment short of killing the shell. `[` and `]` keep cycling panes,
 * because a herdr layout with several leaves is exactly when someone
 * attaches. And the scroll keys move the *capture*, not the nested program:
 * PgUp inside an attached shell is almost always someone trying to read
 * output that has already scrolled past, and forwarding it hands a page-up to
 * a program that mostly ignores it. Everything else forwards verbatim, which
 * is what makes the attachment worth having.
 *
 * Both are pure reducer paths — `shell-key-reducer.test.ts` beside this file
 * covers the approval gate, bracketed paste and Esc unwinding.
 */
import { describe, expect, it } from "vitest";

import {
	createInitialShellState,
	type InteractiveShellState,
	reduceShellKey,
} from "../src/interactive-shell.js";

const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_O = "\u000f";
const CTRL_U = "\u0015";
const CTRL_D = "\u0004";
const CTRL_R = "\u0012";
const CTRL_RBRACKET = "\u001d";
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const PAGE_UP = `${ESC}[5~`;
const PAGE_DOWN = `${ESC}[6~`;
const HOME = `${ESC}[H`;
const END = `${ESC}[F`;

const base = (overrides: Partial<InteractiveShellState> = {}) =>
	// SAFETY: the fixture is the state shape the reducer is declared over.
	({
		...createInitialShellState({ width: 80, height: 24, welcome: false }),
		...overrides,
		// SAFETY: the fixture is the state shape the reducer is declared over.
	}) as InteractiveShellState;

// A transcript long enough that the offset is not clamped to zero. The
// reducer runs every scroll through `clampScrollState`, so on a short
// transcript every binding correctly collapses to offset 0 and proves
// nothing about the binding itself.
const LONG_TRANSCRIPT = Array.from({ length: 120 }, (_unused, index) => ({
	role: "assistant" as const,
	text: `line ${index}`,
	at: index,
}));

describe("transcript less-mode", () => {
	const reading = (offset = 20) =>
		base({ messages: LONG_TRANSCRIPT, transcriptMode: { offset } });

	const offsetAfter = (key: string, offset = 20) =>
		reduceShellKey(reading(offset), key).state.transcriptMode?.offset;

	it.each([CTRL_O, "q", "Q", ESC])("leaves the mode on a known exit", (key) => {
		// Four ways out, because the mode is entered from muscle memory and
		// being unable to leave is the worst failure a modal reading view has.
		expect(reduceShellKey(reading(), key).state.transcriptMode).toBeNull();
	});

	// The offset is start-origin: it counts *forward from the top* of the
	// transcript, unlike the live chat scroll this mode is entered from, which
	// counts back from the newest line. So `j` raises it and `k` lowers it.
	it("scrolls one line down the transcript on j", () => {
		expect(offsetAfter("j")).toBe(21);
	});

	it("scrolls one line back up on k", () => {
		expect(offsetAfter("k")).toBe(19);
	});

	it("scrolls on the Down arrow as well as j", () => {
		// Both habits reach the same place; a reader using arrows and getting
		// nothing would conclude the mode is broken.
		expect(offsetAfter(DOWN)).toBe(21);
	});

	it("scrolls on the Up arrow as well as k", () => {
		expect(offsetAfter(UP)).toBe(19);
	});

	it("does not scroll above the top of the transcript", () => {
		// A negative offset would index before the first line and render
		// blank.
		expect(offsetAfter("k", 0)).toBe(0);
	});

	it("jumps a page back up on the brace binding", () => {
		expect(offsetAfter("{")).toBeLessThan(20);
	});

	it("jumps a page down on the closing brace", () => {
		expect(offsetAfter("}")).toBeGreaterThan(20);
	});

	it("jumps a page on PgUp as well as the brace", () => {
		expect(offsetAfter(PAGE_UP)).toBeLessThan(20);
	});

	it("jumps a page on PgDn as well as the closing brace", () => {
		expect(offsetAfter(PAGE_DOWN)).toBeGreaterThan(20);
	});

	it("moves back up on Ctrl+U", () => {
		expect(offsetAfter(CTRL_U)).toBeLessThan(20);
	});

	it("moves down on Ctrl+D", () => {
		expect(offsetAfter(CTRL_D)).toBeGreaterThan(20);
	});

	it("moves Ctrl+U and PgUp by the same amount at an even viewport", () => {
		// Recorded as it behaves, because the names suggest otherwise.
		// `pageStep` is `floor(v/2)` and `halfPageStep` is `ceil(v/2)`: a
		// "page" is already half a viewport, and the "half page" is the
		// *larger* of the two, coinciding on even viewports and exceeding the
		// page step by one on odd ones. So Ctrl+U is not a smaller jump than
		// PgUp anywhere -- it is equal or bigger. Nothing here depends on the
		// difference; this pins the actual relationship so a future change to
		// either helper has to be deliberate.
		expect(offsetAfter(CTRL_U)).toBe(offsetAfter(PAGE_UP));
	});

	it("never moves Ctrl+U a shorter distance than PgUp", () => {
		const half = 20 - (offsetAfter(CTRL_U) ?? 0);
		const full = 20 - (offsetAfter(PAGE_UP) ?? 0);
		expect(half).toBeGreaterThanOrEqual(full);
	});

	it("goes to the end of the transcript on G", () => {
		expect(offsetAfter("G")).toBeGreaterThan(20);
	});

	it("goes to the end on End as well as G", () => {
		expect(offsetAfter(END)).toBeGreaterThan(20);
	});

	it("goes to the top of the transcript on g", () => {
		// Offset zero is the start of the transcript in this mode -- the view
		// is start-origin, unlike the live chat scroll it was entered from.
		expect(offsetAfter("g")).toBe(0);
	});

	it("goes to the top on Home as well as g", () => {
		expect(offsetAfter(HOME)).toBe(0);
	});

	it("stays in the mode after a scroll", () => {
		// Scrolling is not an exit. A binding that dropped out of the mode
		// would make reading back anything longer than a page impossible.
		expect(reduceShellKey(reading(), "j").state.transcriptMode).not.toBeNull();
	});

	it("does not type a printable key into the composer", () => {
		// The rule the whole mode rests on: keys pressed out of `less` habit
		// must not accumulate in the input line and get submitted on the way
		// out.
		expect(reduceShellKey(reading(), "z").state.input).toBe("");
	});

	it("does not type a navigation letter into the composer either", () => {
		expect(reduceShellKey(reading(), "j").state.input).toBe("");
	});

	it("reports no submit intent for Enter", () => {
		// Enter is a reading key here, not a send.
		expect(reduceShellKey(reading(), "\r").submit).toBeUndefined();
	});

	it("still quits the whole shell on Ctrl+C", () => {
		// Ctrl+C is checked before the mode, deliberately: a reading view must
		// never be able to trap the process.
		expect(reduceShellKey(reading(), CTRL_C).quit).toBe(true);
	});

	it("leaves an unhandled key's mode intact", () => {
		expect(reduceShellKey(reading(7), "z").state.transcriptMode?.offset).toBe(
			7,
		);
	});

	it("does not mutate the state it was given", () => {
		// Every caller holds the previous state to diff against for rendering.
		const state = reading(5);
		reduceShellKey(state, "j");
		expect(state.transcriptMode?.offset).toBe(5);
	});
});

describe("soft attach to a pane", () => {
	const attached = () => base({ paneInteract: true, focus: "agents" });

	it("forwards an ordinary printable key to the pane", () => {
		expect(reduceShellKey(attached(), "x").forwardPaneKey).toBe("x");
	});

	it("forwards a control key the nested program may want", () => {
		// Ctrl+R is reverse search in most shells; swallowing it would make the
		// attachment strictly worse than the real terminal.
		expect(reduceShellKey(attached(), CTRL_R).forwardPaneKey).toBe(CTRL_R);
	});

	it("forwards Enter rather than submitting to the shell's own composer", () => {
		const result = reduceShellKey(attached(), "\r");
		expect(result.forwardPaneKey).toBe("\r");
		expect(result.submit).toBeUndefined();
	});

	it("does not type a forwarded key into the composer", () => {
		expect(reduceShellKey(attached(), "x").state.input).toBe("");
	});

	it("keeps cycling panes forward rather than forwarding the bracket", () => {
		// A herdr layout with several leaves is exactly when someone attaches;
		// losing pane navigation would force a detach for every switch.
		expect(reduceShellKey(attached(), "]").forwardPaneKey).toBeUndefined();
	});

	it("keeps cycling panes backward rather than forwarding the bracket", () => {
		expect(reduceShellKey(attached(), "[").forwardPaneKey).toBeUndefined();
	});

	it("stays attached while cycling panes", () => {
		expect(reduceShellKey(attached(), "]").state.paneInteract).toBe(true);
	});

	it("scrolls the capture on PgUp instead of forwarding it", () => {
		// Someone pressing PgUp in an attached shell is trying to read output
		// that scrolled past; the nested program mostly ignores it.
		expect(reduceShellKey(attached(), PAGE_UP).forwardPaneKey).toBeUndefined();
	});

	it("scrolls the capture on PgDn instead of forwarding it", () => {
		expect(
			reduceShellKey(attached(), PAGE_DOWN).forwardPaneKey,
		).toBeUndefined();
	});

	it("jumps the capture to the top on Home", () => {
		expect(reduceShellKey(attached(), HOME).forwardPaneKey).toBeUndefined();
	});

	it("jumps the capture to live on End", () => {
		expect(reduceShellKey(attached(), END).forwardPaneKey).toBeUndefined();
	});

	it("stays attached after scrolling the capture", () => {
		expect(reduceShellKey(attached(), PAGE_UP).state.paneInteract).toBe(true);
	});

	it("detaches on Ctrl+]", () => {
		// Without a held-back detach key there is no way out of the attachment
		// short of killing the shell.
		expect(reduceShellKey(attached(), CTRL_RBRACKET).state.paneInteract).toBe(
			false,
		);
	});

	it("does not forward the detach key to the pane", () => {
		expect(
			reduceShellKey(attached(), CTRL_RBRACKET).forwardPaneKey,
		).toBeUndefined();
	});

	it("forwards nothing when the focus is not the attached pane", () => {
		// Attachment is scoped to the pane that has focus; forwarding from a
		// different scene would type into a program nobody is looking at.
		expect(
			reduceShellKey(base({ paneInteract: true, focus: "chat" }), "x")
				.forwardPaneKey,
		).toBeUndefined();
	});

	it("forwards nothing when not attached at all", () => {
		expect(
			reduceShellKey(base({ focus: "agents" }), "x").forwardPaneKey,
		).toBeUndefined();
	});

	it("does not mutate the state it was given", () => {
		const state = attached();
		reduceShellKey(state, CTRL_RBRACKET);
		expect(state.paneInteract).toBe(true);
	});
});
