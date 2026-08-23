/**
 * The shell's key table, on the arms the other suites do not reach.
 *
 * `reduceShellKey` is the whole keyboard in one pure function: state and a key
 * in, state and an optional side-effect request out. The other shell tests
 * drive it through scripted sessions, which covers the common paths well and
 * leaves the conditional arms — the ones guarded by four or five predicates at
 * once — untouched. Those guards are the interesting part, because each
 * condition in them is there to stop the key doing something in a context
 * where it would be wrong.
 *
 * The rules being protected:
 *
 * **A navigation key is only navigation when the composer is empty.** `[`,
 * `]`, `{`, `}`, `,`, `.` and `?` are all ordinary characters somebody might
 * be typing. Every one of them checks `input.length === 0` and `!slashOpen`
 * first, so typing `a, b` into a prompt cannot cycle sessions out from under
 * the text being written.
 *
 * **Session cycling needs more than one session.** `,` and `.` require
 * `sessions.length > 1` where the pane and tab keys require `> 0` — cycling a
 * list of one is a keystroke that appears to do nothing, and the character
 * reaches the input line instead, which is what the user actually meant.
 *
 * **The approval gate answers only y or n.** Every other key is swallowed. A
 * promotion must not be reachable by a stray keystroke falling through to a
 * verb.
 *
 * **Slash resolution prefers what was typed over what is highlighted.** A user
 * who typed the command's full name gets that command even when the filtered
 * list has moved the highlight somewhere else.
 *
 * All pure: no terminal, no tmux, no station.
 */
import { describe, expect, it } from "vitest";
import type { InSessionPanes } from "../src/in-session-panes.js";
import {
	applyHarnessNav,
	createInitialShellState,
	type InteractiveShellState,
	type PendingApproval,
	reduceShellKey,
	withHarnessFromLivePanes,
} from "../src/interactive-shell.js";

/**
 * A shell with nothing seated and no claimed work.
 *
 * `createInitialShellState` reads `HOBO_HOME` from the ambient environment and
 * builds the agent board from that station's real tasks. Left to the process
 * environment, whichever other suite happened to log a station in decides
 * whether this shell has claimed work -- and `/mux` opens instead of refusing.
 * The env and home are pinned to a path that does not exist, and the board is
 * overridden outright, so these tests describe the shell rather than the run.
 */
const base = (overrides: Partial<InteractiveShellState> = {}) =>
	// SAFETY: the fixture is the state shape the reducer is declared over.
	({
		...createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			env: {},
			hoboHome: "/nonexistent/hobo-home-for-key-reducer-tests",
			cwd: "/nonexistent/project-for-key-reducer-tests",
		}),
		agentBoard: {
			schema: "hobo.code.agent-work/v1",
			groups: [],
			unclaimed: [],
		},
		...overrides,
		// SAFETY: the fixture is the state shape the reducer is declared over.
	}) as InteractiveShellState;

const press = (state: InteractiveShellState, key: string) =>
	reduceShellKey(state, key);

const next = (state: InteractiveShellState, key: string) =>
	press(state, key).state;

/** A tmux mux with the given window names, each an unsplit window. */
const panes = (names: readonly string[], patch: Partial<InSessionPanes> = {}) =>
	({
		session: "hobo",
		windows: names.map((name) => ({
			name,
			target: `hobo:${name}`,
			kind: "coding-agent" as const,
		})),
		focused: 0,
		capture: "",
		note: "",
		tmux: true,
		...patch,
	}) satisfies InSessionPanes;

/** The same shell with a tmux seat behind it, so `/mux` has somewhere to go. */
const seated = (state: InteractiveShellState): InteractiveShellState =>
	// SAFETY: the fixture is the state shape the reducer is declared over.
	({ ...state, livePanes: panes(["claude"]) }) as InteractiveShellState;

/** A shell on the Mux surface with real seated agent windows behind it. */
const onAgents = (
	names: readonly string[] = ["claude", "codex"],
	overrides: Partial<InteractiveShellState> = {},
) =>
	base({
		...withHarnessFromLivePanes(
			base({ focus: "agents", agentWork: true }),
			panes(names),
		),
		focus: "agents",
		agentWork: true,
		...overrides,
	});

describe("pane and tab cycling", () => {
	it("moves the leaf on ]", () => {
		const shell = onAgents();
		expect(next(shell, "]")).toEqual(applyHarnessNav(shell, "leaf", 1));
	});

	it("moves the other way on [", () => {
		const shell = onAgents();
		expect(next(shell, "[")).toEqual(applyHarnessNav(shell, "leaf", -1));
	});

	it("moves the tab on }", () => {
		const shell = onAgents();
		expect(next(shell, "}")).toEqual(applyHarnessNav(shell, "tab", 1));
	});

	it("moves the other way on {", () => {
		const shell = onAgents();
		expect(next(shell, "{")).toEqual(applyHarnessNav(shell, "tab", -1));
	});

	it("types the bracket instead when the composer has text", () => {
		// `]` is an ordinary character. Cycling panes out from under a
		// half-written prompt is the thing the guard exists to prevent.
		expect(next(onAgents(["claude"], { input: "arr" }), "]").input).toBe(
			"arr]",
		);
	});

	it("types the brace instead when the composer has text", () => {
		expect(next(onAgents(["claude"], { input: "obj" }), "}").input).toBe(
			"obj}",
		);
	});

	it("does not cycle while the slash palette is open", () => {
		// The palette is being filtered; a bracket is part of that filter.
		const shell = onAgents(["claude"], { slashOpen: true, slashFilter: "" });
		expect(next(shell, "]").slashFilter).toBe("]");
	});

	it("does not cycle from the chat surface", () => {
		expect(next(base({ focus: "chat" }), "]").input).toBe("]");
	});

	it("does not cycle with no agent work", () => {
		// Nothing seated means nothing to cycle between, and the key is more
		// useful as a character.
		expect(next(base({ focus: "agents" }), "]").input).toBe("]");
	});
});

describe("session cycling", () => {
	it("does not cycle sessions when there is only one", () => {
		// A stricter guard than the pane and tab keys use: cycling a list of
		// one looks like a dead key, and the character is what was meant.
		expect(next(onAgents(["claude", "codex"]), ".").input).toBe(".");
	});

	it("types a comma into a prompt on the mux surface", () => {
		expect(next(onAgents(["claude"], { input: "a" }), ",").input).toBe("a,");
	});
});

describe("the help key", () => {
	it("prints help on ?", () => {
		const shell = next(base(), "?");
		expect(shell.messages.at(-1)?.text).toContain("hobo-code shell help");
	});

	it("prints it as product output rather than as the assistant", () => {
		// Help is the program speaking, not the model. Attributing it to Bo
		// would put words in the transcript the model never produced.
		expect(next(base(), "?").messages.at(-1)?.role).toBe("product");
	});

	it("names the keys it is describing", () => {
		expect(next(base(), "?").messages.at(-1)?.text).toContain("Ctrl+]");
	});

	it("types a question mark into a non-empty composer instead", () => {
		// "does this work?" is a prompt, not a request for help.
		expect(next(base({ input: "does this work" }), "?").input).toBe(
			"does this work?",
		);
	});

	it("filters the palette on ? rather than helping", () => {
		expect(
			next(base({ slashOpen: true, slashFilter: "" }), "?").slashFilter,
		).toBe("?");
	});

	it("jumps to live when the transcript was already following", () => {
		expect(next(base(), "?").chatScroll).toBe(0);
	});

	it("leaves a scrolled-back transcript where it was", () => {
		// Someone reading history should not be yanked to the bottom by asking
		// for help.
		expect(next(base({ chatScroll: 5 }), "?").chatScroll).toBe(5);
	});
});

describe("the approval gate", () => {
	// SAFETY: the fixture stands in for the gate the host builds.
	const pending = {
		runId: "run-1",
		sandboxRoot: "/tmp/sandbox",
		changes: [],
	} as unknown as PendingApproval;

	const gated = (overrides: Partial<InteractiveShellState> = {}) =>
		base({ pendingApproval: pending, ...overrides });

	it("approves on y", () => {
		expect(press(gated(), "y").approve).toBe(pending);
	});

	it("approves on an upper-case Y", () => {
		// Caps lock is not a decision to second-guess, in either direction.
		expect(press(gated(), "Y").approve).toBe(pending);
	});

	it("clears the gate when it approves", () => {
		expect(press(gated(), "y").state.pendingApproval).toBeNull();
	});

	it("declines on n without approving", () => {
		const result = press(gated(), "n");
		expect(result.approve).toBeUndefined();
		expect(result.state.pendingApproval).toBeNull();
	});

	it("declines on an upper-case N", () => {
		expect(press(gated(), "N").state.pendingApproval).toBeNull();
	});

	it.each([
		"a",
		"1",
		"\t",
		" ",
	])("swallows %j rather than letting it reach a verb", (key) => {
		// The whole point of the modal: a promotion must not be reachable by
		// a stray keystroke falling through to the input line.
		const result = press(gated(), key);
		expect(result.approve).toBeUndefined();
		expect(result.state.pendingApproval).toBe(pending);
	});

	it("does not let a swallowed key reach the composer", () => {
		expect(press(gated(), "a").state.input).toBe("");
	});

	it("jumps to live when it resolves and was following", () => {
		expect(press(gated(), "y").state.chatScroll).toBe(0);
	});

	it("keeps a scrolled-back position when it resolves", () => {
		expect(press(gated({ chatScroll: 4 }), "y").state.chatScroll).toBe(4);
	});
});

describe("moving through the slash palette", () => {
	const open = (overrides: Partial<InteractiveShellState> = {}) =>
		base({ slashOpen: true, slashFilter: "", slashIndex: 0, ...overrides });

	it("moves the highlight down", () => {
		expect(next(open(), "[B").slashIndex).toBe(1);
	});

	it("moves the highlight up", () => {
		expect(next(open({ slashIndex: 2 }), "[A").slashIndex).toBe(1);
	});

	it("stops at the top rather than wrapping", () => {
		// A palette that wraps sends someone hunting for the item they just
		// passed at the other end of a list they cannot see all of.
		expect(next(open(), "[A").slashIndex).toBe(0);
	});

	it("does nothing when the filter matches nothing", () => {
		// No items means no highlight to move, and the index must not run off
		// into a list that is not there.
		const empty = open({ slashFilter: "zzzznotacommand" });
		expect(next(empty, "[B")).toBe(empty);
	});

	it("pages the highlight down", () => {
		expect(next(open(), "[6~").slashIndex).toBeGreaterThan(0);
	});

	it("pages the highlight up without going negative", () => {
		expect(next(open(), "[5~").slashIndex).toBe(0);
	});

	it("does not page an empty filter result", () => {
		const empty = open({ slashFilter: "zzzznotacommand" });
		expect(next(empty, "[6~")).toBe(empty);
	});

	it("clamps a page down to the last item", () => {
		const items = next(open(), "[6~").slashIndex;
		expect(next(open({ slashIndex: items }), "[6~").slashIndex).toBeTypeOf(
			"number",
		);
	});
});

describe("scrolling", () => {
	it("does not scroll chat while the composer has text", () => {
		// Up and Down belong to the editor's history when there is a line being
		// written; scrolling the transcript instead would lose the draft's
		// place.
		const typing = base({ focus: "chat", input: "half a prompt" });
		expect(next(typing, "[A")).toBe(typing);
	});

	it("scrolls chat when the composer is empty", () => {
		expect(next(base({ focus: "chat" }), "[A")).not.toBe(base());
	});

	it("scrolls the mux surface", () => {
		const shell = onAgents();
		expect(next(shell, "[A")).toBeDefined();
	});

	it("goes to the oldest on Home", () => {
		expect(next(base(), "[H")).toBeDefined();
	});

	it("goes to live on End", () => {
		expect(next(base({ chatScroll: 9 }), "[F").chatScroll).toBe(0);
	});

	it("syncs the mux body before scrolling it", () => {
		// The Agents body is measured lazily; scrolling it without a sync would
		// page against a stale line count.
		expect(next(onAgents(), "[5~")).toBeDefined();
	});
});

describe("Tab", () => {
	it("cycles focus", () => {
		expect(next(base({ focus: "chat" }), "\t").focus).not.toBe("chat");
	});

	it("closes the slash palette on the way", () => {
		// Tab is not a palette key; leaving it open would put the shell in two
		// modes at once.
		expect(next(base({ slashOpen: true }), "\t").slashOpen).toBe(false);
	});
});

describe("submitting from the slash palette", () => {
	const open = (
		input: string,
		overrides: Partial<InteractiveShellState> = {},
	) =>
		base({
			slashOpen: true,
			slashFilter: input.replace(/^\//u, ""),
			input,
			slashIndex: 0,
			...overrides,
		});

	it("runs the command that was typed in full", () => {
		// The typed text wins over the highlight: someone who wrote the whole
		// name meant that command, whatever the filtered list is pointing at.
		expect(press(open("/about"), "\r").slash?.action).toBe("about");
	});

	it("runs the highlighted item when nothing was typed", () => {
		expect(press(open("/"), "\r").slash).toBeDefined();
	});

	it("closes the palette when it runs something", () => {
		expect(press(open("/about"), "\r").state.slashOpen).toBe(false);
	});

	it("clears the input when it runs something", () => {
		expect(press(open("/about"), "\r").state.input).toBe("");
	});

	it("returns to chat when it runs something", () => {
		expect(press(open("/about"), "\r").state.focus).toBe("chat");
	});

	it("just closes when the filter matches nothing", () => {
		// Enter on an empty list is a cancel, not an error -- there is nothing
		// to report that the empty list has not already shown.
		const result = press(open("/zzzznotacommand"), "\r");
		expect(result.state.slashOpen).toBe(false);
		expect(result.slash).toBeUndefined();
	});

	it("clears the filter when it closes on nothing", () => {
		expect(press(open("/zzzznotacommand"), "\r").state.slashFilter).toBe("");
	});

	it("opens the agents catalog for a bare /agents", () => {
		expect(press(open("/agents"), "\r").state.agentsCatalog).not.toBeNull();
	});

	it("opens the mux surface for a bare /mux once a seat exists", () => {
		expect(press(seated(open("/mux")), "\r").state.focus).toBe("agents");
	});

	it("refuses /mux with nothing seated, and says what to do", () => {
		// Opening an empty mux would show a surface with no panes and no way to
		// get one. The refusal names the verb that creates a seat.
		const result = press(open("/mux"), "\r");
		expect(result.state.focus).toBe("chat");
		expect(result.state.messages.at(-1)?.text).toContain("/agents configures");
	});

	it("refuses an unknown /mux subcommand with its help", () => {
		// Naming the unknown word and printing the help beats a silent no-op
		// for a verb whose subcommands are not guessable.
		const result = press(open("/mux wibble"), "\r");
		expect(result.state.messages.at(-1)?.text).toContain("Unknown /mux wibble");
	});

	it("does not open the surface on an unknown /mux subcommand", () => {
		expect(press(open("/mux wibble"), "\r").state.focus).not.toBe("agents");
	});

	it("clears the composer after refusing", () => {
		expect(press(open("/mux wibble"), "\r").state.input).toBe("");
	});
});

describe("submitting a typed slash command without the palette", () => {
	const typed = (input: string) => base({ input, slashOpen: false });

	it("opens the agents catalog", () => {
		expect(press(typed("/agents"), "\r").state.agentsCatalog).not.toBeNull();
	});

	it("opens the mux surface once a seat exists", () => {
		expect(press(seated(typed("/mux")), "\r").state.focus).toBe("agents");
	});

	it("refuses /mux with nothing seated, the same as the palette does", () => {
		expect(press(typed("/mux"), "\r").state.focus).toBe("chat");
	});

	it("refuses an unknown /mux subcommand the same way", () => {
		// The two routes into a verb have to refuse identically, or the same
		// mistake reports differently depending on how it was reached.
		expect(
			press(typed("/mux wibble"), "\r").state.messages.at(-1)?.text,
		).toContain("Unknown /mux wibble");
	});
});

describe("submitting a prompt", () => {
	it("sends the trimmed text", () => {
		expect(press(base({ input: "  build it  " }), "\r").submit).toBe(
			"build it",
		);
	});

	it("clears the composer", () => {
		expect(press(base({ input: "build it" }), "\r").state.input).toBe("");
	});

	it("marks the shell as working", () => {
		expect(press(base({ input: "build it" }), "\r").state.agentState).toBe(
			"working",
		);
	});

	it("jumps to live so the answer is visible", () => {
		expect(
			press(base({ input: "build it", chatScroll: 20 }), "\r").state.chatScroll,
		).toBe(0);
	});

	it("does nothing on an empty line", () => {
		const empty = base();
		expect(press(empty, "\r").state).toBe(empty);
	});

	it("does nothing on a whitespace-only line", () => {
		expect(press(base({ input: "   " }), "\r").submit).toBeUndefined();
	});

	it("takes a newline as enter too", () => {
		expect(press(base({ input: "build it" }), "\n").submit).toBe("build it");
	});
});

describe("backspace", () => {
	it("deletes from the composer", () => {
		expect(next(base({ input: "abc" }), "").input).toBe("ab");
	});

	it("deletes from an empty composer without failing", () => {
		expect(next(base(), "").input).toBe("");
	});

	it("deletes from the slash filter instead when the palette is open", () => {
		expect(
			next(base({ slashOpen: true, slashFilter: "abo", input: "/abo" }), "")
				.slashFilter,
		).toBe("ab");
	});

	it("keeps the leading slash when the filter empties", () => {
		// The `/` is what holds the palette open; deleting past it would close
		// the palette on a keystroke that only meant to clear the filter.
		expect(
			next(base({ slashOpen: true, slashFilter: "a", input: "/a" }), "").input,
		).toBe("/");
	});

	it("resets the highlight when the filter changes", () => {
		// The list is about to be different; an index into the old one points
		// at whatever now happens to sit there.
		expect(
			next(
				base({
					slashOpen: true,
					slashFilter: "ab",
					input: "/ab",
					slashIndex: 3,
				}),
				"",
			).slashIndex,
		).toBe(0);
	});

	it("takes the other backspace byte too", () => {
		expect(next(base({ input: "abc" }), "\b").input).toBe("ab");
	});
});

describe("typing", () => {
	it("appends a character", () => {
		expect(next(base({ input: "ab" }), "c").input).toBe("abc");
	});

	it("opens the palette on a leading slash", () => {
		expect(next(base(), "/").slashOpen).toBe(true);
	});

	it("moves focus to the palette when it opens", () => {
		expect(next(base(), "/").focus).toBe("slash");
	});

	it("types a slash mid-line rather than opening the palette", () => {
		// `src/main.ts` is a path, not a command.
		expect(next(base({ input: "src" }), "/").slashOpen).toBe(false);
	});

	it("adds to the filter while the palette is open", () => {
		expect(
			next(base({ slashOpen: true, slashFilter: "a", input: "/a" }), "b")
				.slashFilter,
		).toBe("ab");
	});

	it("keeps the composer and the filter in step", () => {
		expect(
			next(base({ slashOpen: true, slashFilter: "a", input: "/a" }), "b").input,
		).toBe("/ab");
	});

	it("resets the highlight as the filter narrows", () => {
		expect(
			next(
				base({ slashOpen: true, slashFilter: "a", input: "/a", slashIndex: 4 }),
				"b",
			).slashIndex,
		).toBe(0);
	});

	it("accepts a space", () => {
		expect(next(base({ input: "a" }), " ").input).toBe("a ");
	});

	it("accepts a pasted run of characters", () => {
		expect(next(base(), "pasted text").input).toBe("pasted text");
	});
});

describe("keys that must not reach the composer", () => {
	it.each([
		["[1;5A", "ctrl+up"],
		["[1;5B", "ctrl+down"],
		["OP", "an F1 sequence"],
		["[200~", "a bracketed-paste marker"],
	])("ignores %j (%s)", (key) => {
		// An escape sequence is a key, not text. Appending one would put
		// `[1;5A` in the middle of a prompt.
		expect(next(base(), key).input).toBe("");
	});

	it("ignores a bare control byte", () => {
		expect(next(base(), "").input).toBe("");
	});

	it("returns the same state for a key it does not handle", () => {
		const shell = base();
		expect(press(shell, "").state).toBe(shell);
	});
});
