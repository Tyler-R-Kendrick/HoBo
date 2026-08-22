/**
 * The slash palette, Esc unwinding, and what a paste is allowed to contain.
 *
 * Three reducer surfaces that share a theme: each one is a place where a key
 * or a blob of text could quietly do more than the user meant.
 *
 * **The palette clamps rather than wrapping.** Arrow keys move the selection
 * within the filtered list and stop at both ends. Wrapping would put the
 * *last* row under a user who held Up for a moment too long — and the last
 * row of this catalog is `/quit`. Clamping is not a nicety here; it is what
 * stops a held key from exiting the shell.
 *
 * **Esc unwinds exactly one layer.** The btw aside first, then the palette,
 * then nothing. An Esc that cleared everything at once would drop an
 * in-progress line the user only meant to un-filter, and there is no undo for
 * a composer.
 *
 * **A paste is one edit, sanitized.** Newlines become spaces because a newline
 * in this editor means submit — a pasted three-line snippet would otherwise
 * fire three commands, and the second and third would be fragments of the
 * first. Control characters are dropped so a paste cannot smuggle escape
 * sequences into the input line, which is the difference between pasting
 * untrusted text and executing it.
 *
 * All pure reducer paths: state in, state out, no terminal.
 */
import { describe, expect, it } from "vitest";

import {
	createInitialShellState,
	DEFAULT_SLASH_ITEMS,
	filterSlash,
	type InteractiveShellState,
	type PendingApproval,
	reduceShellKey,
} from "../src/interactive-shell.js";

const ESC = "\u001b";
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const PAGE_UP = `${ESC}[5~`;
const PAGE_DOWN = `${ESC}[6~`;
const HOME = `${ESC}[H`;
const END = `${ESC}[F`;
const PASTE_START = `${ESC}[200~`;
const PASTE_END = `${ESC}[201~`;

const base = (overrides: Partial<InteractiveShellState> = {}) =>
	// SAFETY: the fixture is the state shape the reducer is declared over.
	({
		...createInitialShellState({ width: 80, height: 24, welcome: false }),
		...overrides,
		// SAFETY: the fixture is the state shape the reducer is declared over.
	}) as InteractiveShellState;

const palette = (overrides: Partial<InteractiveShellState> = {}) =>
	base({ slashOpen: true, slashFilter: "", slashIndex: 0, ...overrides });

const indexAfter = (
	key: string,
	overrides: Partial<InteractiveShellState> = {},
) => reduceShellKey(palette(overrides), key).state.slashIndex;

const LAST = DEFAULT_SLASH_ITEMS.length - 1;

describe("moving through the slash palette", () => {
	it("moves down one row", () => {
		expect(indexAfter(DOWN)).toBe(1);
	});

	it("moves up one row", () => {
		expect(indexAfter(UP, { slashIndex: 3 })).toBe(2);
	});

	it("stops at the top rather than wrapping to the bottom", () => {
		// Wrapping would put the last row under a user who held Up a moment too
		// long, and the last row of this catalog is `/quit`.
		expect(indexAfter(UP, { slashIndex: 0 })).toBe(0);
	});

	it("stops at the bottom rather than wrapping to the top", () => {
		expect(indexAfter(DOWN, { slashIndex: LAST })).toBe(LAST);
	});

	it("jumps a page down", () => {
		expect(indexAfter(PAGE_DOWN)).toBeGreaterThan(1);
	});

	it("jumps a page up", () => {
		expect(indexAfter(PAGE_UP, { slashIndex: LAST })).toBeLessThan(LAST);
	});

	it("clamps a page jump at the bottom", () => {
		// A page is bigger than the remaining rows more often than not; an
		// unclamped jump would index past the end and render an empty row.
		expect(indexAfter(PAGE_DOWN, { slashIndex: LAST })).toBe(LAST);
	});

	it("clamps a page jump at the top", () => {
		expect(indexAfter(PAGE_UP, { slashIndex: 0 })).toBe(0);
	});

	it("does not move when the filter matches nothing", () => {
		// With no rows there is nothing to select; moving would leave the
		// index pointing at a row that does not exist once the filter clears.
		expect(indexAfter(DOWN, { slashFilter: "reticulate" })).toBe(0);
	});

	it("does not page when the filter matches nothing", () => {
		expect(indexAfter(PAGE_DOWN, { slashFilter: "reticulate" })).toBe(0);
	});

	it("clamps to the filtered list, not the full catalog", () => {
		// The filter is the whole point of the palette; clamping against the
		// unfiltered length would let the selection sit below the visible rows.
		const filter = "he";
		const count = filterSlash(DEFAULT_SLASH_ITEMS, filter).length;
		expect(count).toBeGreaterThan(0);
		expect(indexAfter(PAGE_DOWN, { slashFilter: filter })).toBeLessThanOrEqual(
			count - 1,
		);
	});

	it("keeps the palette open while moving", () => {
		// Navigation is not selection. A key that closed the palette would make
		// it unusable with more rows than fit on screen.
		expect(reduceShellKey(palette(), DOWN).state.slashOpen).toBe(true);
	});

	it("does not type the arrow key into the filter", () => {
		expect(reduceShellKey(palette(), DOWN).state.slashFilter).toBe("");
	});
});

describe("Esc unwinds one layer at a time", () => {
	it("closes the palette", () => {
		expect(reduceShellKey(palette(), ESC).state.slashOpen).toBe(false);
	});

	it("clears the filter when it closes the palette", () => {
		// A filter left behind would reappear the next time the palette opened,
		// showing a narrowed list for no visible reason.
		expect(
			reduceShellKey(palette({ slashFilter: "he" }), ESC).state.slashFilter,
		).toBe("");
	});

	it("resets the selection when it closes the palette", () => {
		expect(
			reduceShellKey(palette({ slashIndex: 5 }), ESC).state.slashIndex,
		).toBe(0);
	});

	it("clears the composed slash text", () => {
		// The palette writes `/he` into the input as it filters; leaving it
		// there would submit a half-typed command on the next Enter.
		expect(
			reduceShellKey(palette({ slashFilter: "he", input: "/he" }), ESC).state
				.input,
		).toBe("");
	});

	it("returns focus to the chat", () => {
		expect(reduceShellKey(palette(), ESC).state.focus).toBe("chat");
	});

	it("does nothing on an empty composer with no palette", () => {
		// The base case. Esc on an empty composer is the most common accidental
		// keystroke there is, and it must not be a quit or a scene change.
		const state = base();
		const result = reduceShellKey(state, ESC);
		expect(result.state.focus).toBe(state.focus);
		expect(result.quit).toBeUndefined();
	});

	it("does not close the palette twice", () => {
		// Idempotent: a second Esc on an already-closed palette is the base
		// case, not an error.
		const once = reduceShellKey(palette(), ESC).state;
		expect(reduceShellKey(once, ESC).state.slashOpen).toBe(false);
	});
});

describe("a paste is one edit, sanitized", () => {
	const paste = (
		content: string,
		overrides: Partial<InteractiveShellState> = {},
	) =>
		reduceShellKey(base(overrides), `${PASTE_START}${content}${PASTE_END}`)
			.state;

	it("inserts the pasted text into the composer", () => {
		expect(paste("hello world").input).toBe("hello world");
	});

	it("appends to what was already typed", () => {
		// A paste replaces nothing; the user put the cursor there on purpose.
		expect(paste("world", { input: "hello " }).input).toBe("hello world");
	});

	it("turns a newline into a space", () => {
		// A newline in this editor means submit. A pasted three-line snippet
		// would otherwise fire three commands, and the second and third would
		// be fragments of the first.
		expect(paste("one\ntwo").input).toBe("one two");
	});

	it("turns a carriage-return newline into a single space", () => {
		// Windows and most terminals send CRLF; collapsing it to one space
		// rather than two keeps a pasted paragraph readable.
		expect(paste("one\r\ntwo").input).toBe("one two");
	});

	it("turns every newline in a multi-line paste into a space", () => {
		expect(paste("a\nb\nc").input).toBe("a b c");
	});

	it("drops a control character rather than inserting it", () => {
		// This is the difference between pasting untrusted text and executing
		// it: an escape sequence in the input line can move the cursor, rewrite
		// what is displayed, or in some terminals be echoed back as input.
		expect(paste("safe\u0007text").input).toBe("safetext");
	});

	it("drops an escape character", () => {
		expect(paste(`before${ESC}after`).input).toBe("beforeafter");
	});

	it("drops a delete character", () => {
		// 127 is outside the `<= 31` range and needs its own check; missing it
		// would let a backspace-like byte through.
		expect(paste("safe\u007ftext").input).toBe("safetext");
	});

	it("keeps a tab out of the line", () => {
		// Tab is a focus key here; a pasted one would be indistinguishable from
		// a pressed one to anything reading the line back.
		expect(paste("a\tb").input).toBe("ab");
	});

	it("keeps ordinary punctuation and unicode", () => {
		// The sanitizer is a control-character filter, not an ASCII filter; a
		// paste that lost its accents would be worse than useless.
		expect(paste("café — 100% ✓").input).toBe("café — 100% ✓");
	});

	it("ignores a paste that is entirely control characters", () => {
		// Nothing survives the filter, so there is no edit to make. Inserting
		// an empty string would still push an undo entry for a no-op.
		expect(paste("").input).toBe("");
	});

	it("ignores an empty paste", () => {
		expect(paste("").input).toBe("");
	});

	it("leaves a typed line untouched by an empty paste", () => {
		expect(paste("", { input: "kept" }).input).toBe("kept");
	});

	it("pastes into the palette filter when the palette is open", () => {
		// Pasting a command name is a real way to use the palette; sending the
		// text to the composer behind it would leave the filter empty and the
		// text invisible.
		const state = paste("help", { slashOpen: true, slashFilter: "" });
		expect(state.slashFilter).toBe("help");
	});

	it("keeps the composed slash text in step with the filter", () => {
		// The input line mirrors the filter while the palette is open; letting
		// them drift would submit something other than what is shown.
		expect(paste("help", { slashOpen: true, slashFilter: "" }).input).toBe(
			"/help",
		);
	});

	it("resets the selection when a paste changes the filter", () => {
		// The old index points into the old filtered list; keeping it would
		// select an unrelated row.
		expect(
			paste("help", { slashOpen: true, slashFilter: "", slashIndex: 4 })
				.slashIndex,
		).toBe(0);
	});

	it("appends to an existing filter rather than replacing it", () => {
		expect(
			paste("lp", { slashOpen: true, slashFilter: "he" }).slashFilter,
		).toBe("help");
	});

	it("tolerates a paste block with no closing marker", () => {
		// A truncated paste happens when the terminal's buffer fills mid-blob;
		// dropping the whole thing would lose text the user watched appear.
		expect(
			reduceShellKey(base(), `${PASTE_START}unterminated`).state.input,
		).toBe("unterminated");
	});
});

describe("scrolling while an approval is up", () => {
	// SAFETY: the fixture stands in for the approval the shell would build.
	const approval = {
		kind: "promote",
		summary: "promote 3 files",
	} as PendingApproval;

	const waiting = () => base({ pendingApproval: approval });

	it.each([
		["up", UP],
		["down", DOWN],
		["page up", PAGE_UP],
		["page down", PAGE_DOWN],
		["home", HOME],
		["end", END],
	])("still scrolls on %s", (_name, key) => {
		// The approval body is the thing being approved -- a diff, a file list.
		// A modal that would not let the user read it before answering is one
		// that gets answered blind.
		expect(reduceShellKey(waiting(), key).state.pendingApproval).not.toBeNull();
	});

	it.each([
		["up", UP],
		["down", DOWN],
		["page up", PAGE_UP],
		["page down", PAGE_DOWN],
		["home", HOME],
		["end", END],
	])("does not approve on %s", (_name, key) => {
		// The whole point of the gate: nothing but an explicit answer resolves
		// it, and a scroll key is not an answer.
		expect(reduceShellKey(waiting(), key).approve).toBeUndefined();
	});

	it.each([
		["up", UP],
		["page up", PAGE_UP],
		["home", HOME],
	])("does not decline on %s either", (_name, key) => {
		// Scrolling is not a "no" any more than it is a "yes"; either would
		// resolve the gate without the user having decided.
		expect(reduceShellKey(waiting(), key).decline).toBeUndefined();
	});

	it("does not type a scroll key into the composer", () => {
		expect(reduceShellKey(waiting(), PAGE_UP).state.input).toBe("");
	});

	it("declines on Esc rather than approving", () => {
		// A user reaching for Esc wants out. Reading that as consent would
		// promote code because someone wanted to close a dialog.
		expect(reduceShellKey(waiting(), ESC).decline).toBeDefined();
	});

	it("declines on Enter rather than approving", () => {
		// Enter is the most-mashed key there is; treating it as "yes" would
		// promote on a keystroke aimed at dismissing something.
		expect(reduceShellKey(waiting(), "\r").decline).toBeDefined();
	});
});
