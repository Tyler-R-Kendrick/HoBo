/**
 * Which surfaces own the keyboard, and what "owning it" means.
 *
 * Four states take the keyboard away from the composer: a pending approval,
 * transcript reading mode, an attached pane, and the `/agents` modal.
 * `shellModalOwnsInput` is the single predicate that says so, and every one of
 * those four is there for a different reason:
 *
 * - **An approval gate** must see every key, or a mutation could be approved
 *   by something falling through to the editor.
 * - **Transcript mode** is a reading context; keys pressed out of `less` habit
 *   must not accumulate in the input line and get submitted on the way out.
 * - **An attached pane** is forwarding to a nested CLI, which should receive
 *   what the user types rather than the shell.
 * - **The `/agents` modal** has a real bug behind it. The source comment
 *   records it: requiring `focus === "agents-catalog"` previously let Tab
 *   reach `cycleFocus` and wipe the catalog/configure stack out from under the
 *   user. `agentsModalActive` deliberately checks the *state* rather than the
 *   focus, and `pinAgentsModalFocus` puts the focus back if something moved
 *   it.
 *
 * That pairing is the thing worth pinning hardest: the predicate must not
 * depend on focus, and the pin must restore focus. One without the other is
 * the bug again.
 *
 * All pure and exported; no terminal involved.
 */
import { describe, expect, it } from "vitest";

import {
	agentsModalActive,
	createInitialShellState,
	type InteractiveShellState,
	openAgentsCatalog,
	type PendingApproval,
	pinAgentsModalFocus,
	shellModalOwnsInput,
} from "../src/interactive-shell.js";

const base = (overrides: Partial<InteractiveShellState> = {}) =>
	// SAFETY: the fixture is the state shape the predicates are declared over.
	({
		...createInitialShellState({ width: 80, height: 24, welcome: false }),
		...overrides,
		// SAFETY: the fixture is the state shape the predicates are declared over.
	}) as InteractiveShellState;

// SAFETY: the fixture stands in for the gate the host builds.
const approval = {
	runId: "run-1",
	sandboxRoot: "/tmp/sandbox",
	changes: [],
} as unknown as PendingApproval;

/** A state with the agents catalog genuinely open. */
const withCatalog = () => openAgentsCatalog(base());

describe("nothing owns the keyboard by default", () => {
	it("leaves the composer in charge on a fresh shell", () => {
		// The default has to be the composer: chat is first, and a shell that
		// started modal would swallow the user's first keystroke.
		expect(shellModalOwnsInput(base())).toBe(false);
	});

	it("leaves it in charge with the slash palette open", () => {
		// The palette is *not* on the list, deliberately. It filters as you
		// type, so the editor still has to receive the keys.
		expect(shellModalOwnsInput(base({ slashOpen: true }))).toBe(false);
	});

	it("leaves it in charge when the agents pane merely has focus", () => {
		// Focus alone is not attachment. Typing in the chat while looking at
		// the agents pane is the ordinary case.
		expect(shellModalOwnsInput(base({ focus: "agents" }))).toBe(false);
	});

	it("leaves it in charge on the status pane", () => {
		expect(shellModalOwnsInput(base({ focus: "status" }))).toBe(false);
	});

	it("leaves it in charge on the resources pane", () => {
		expect(shellModalOwnsInput(base({ focus: "resources" }))).toBe(false);
	});
});

describe("the four states that take the keyboard", () => {
	it("hands it to a pending approval", () => {
		// The gate must see every key, or a mutation could be approved by
		// something falling through to the editor.
		expect(shellModalOwnsInput(base({ pendingApproval: approval }))).toBe(true);
	});

	it("hands it to transcript reading mode", () => {
		expect(shellModalOwnsInput(base({ transcriptMode: { offset: 0 } }))).toBe(
			true,
		);
	});

	it("hands it to an attached pane", () => {
		expect(
			shellModalOwnsInput(base({ paneInteract: true, focus: "agents" })),
		).toBe(true);
	});

	it("does not hand it to an attachment on the wrong pane", () => {
		// Attachment is scoped to the pane that has focus; forwarding from a
		// different scene would type into a program nobody is looking at.
		expect(
			shellModalOwnsInput(base({ paneInteract: true, focus: "chat" })),
		).toBe(false);
	});

	it("hands it to the agents modal", () => {
		expect(shellModalOwnsInput(withCatalog())).toBe(true);
	});

	it("keeps it when several modal states overlap", () => {
		// They can genuinely coexist -- an approval raised while the catalog is
		// open. Any one of them is enough.
		expect(
			shellModalOwnsInput(
				base({ pendingApproval: approval, transcriptMode: { offset: 0 } }),
			),
		).toBe(true);
	});
});

describe("the agents modal is detected by state, not by focus", () => {
	it("reports the catalog as active", () => {
		expect(agentsModalActive(withCatalog())).toBe(true);
	});

	it("still reports it active when the focus has moved away", () => {
		// The whole point. Requiring focus === "agents-catalog" is exactly the
		// bug the source comment records: Tab reached cycleFocus and wiped the
		// catalog stack out from under the user.
		expect(agentsModalActive({ ...withCatalog(), focus: "chat" })).toBe(true);
	});

	it("still owns the keyboard when the focus has moved away", () => {
		// The predicate and the ownership check have to agree, or the modal is
		// dismissible by whatever moved the focus.
		expect(shellModalOwnsInput({ ...withCatalog(), focus: "chat" })).toBe(true);
	});

	it("reports no modal on a fresh shell", () => {
		expect(agentsModalActive(base())).toBe(false);
	});

	it("reports no modal for a bare agents focus", () => {
		// Focus is not a modal in either direction.
		expect(agentsModalActive(base({ focus: "agents-catalog" }))).toBe(false);
	});
});

describe("pinning the focus back", () => {
	it("restores the catalog focus when something moved it", () => {
		// The other half of the pair. Detecting the modal without restoring
		// focus leaves the frame rendering a different pane than the one
		// receiving keys.
		expect(pinAgentsModalFocus({ ...withCatalog(), focus: "chat" }).focus).toBe(
			"agents-catalog",
		);
	});

	it("restores it from the agents pane too", () => {
		expect(
			pinAgentsModalFocus({ ...withCatalog(), focus: "agents" }).focus,
		).toBe("agents-catalog");
	});

	it("leaves a correctly focused modal alone", () => {
		const state = withCatalog();
		expect(pinAgentsModalFocus(state)).toBe(state);
	});

	it("returns the same object when there is nothing to pin", () => {
		// Identity matters here: the caller diffs states to decide whether to
		// repaint, and a fresh object every keystroke would repaint always.
		const state = base();
		expect(pinAgentsModalFocus(state)).toBe(state);
	});

	it("does not invent a modal on a shell that has none", () => {
		expect(pinAgentsModalFocus(base({ focus: "chat" })).focus).toBe("chat");
	});

	it("does not mutate the state it was given", () => {
		const state = { ...withCatalog(), focus: "chat" as const };
		pinAgentsModalFocus(state);
		expect(state.focus).toBe("chat");
	});
});

describe("opening the agents catalog", () => {
	it("focuses the catalog", () => {
		expect(withCatalog().focus).toBe("agents-catalog");
	});

	it("builds a catalog to show", () => {
		expect(withCatalog().agentsCatalog).not.toBeNull();
	});

	it("starts with no configure panel open", () => {
		// The catalog is the entry point; opening straight into a configure
		// form would skip choosing what to configure.
		expect(withCatalog().agentsConfigure).toBeNull();
	});

	it("closes the slash palette that opened it", () => {
		// `/agents` is typed into the palette. Leaving it open would stack two
		// modal surfaces and leave the filter text behind.
		expect(openAgentsCatalog(base({ slashOpen: true })).slashOpen).toBe(false);
	});

	it("clears the palette filter", () => {
		expect(
			openAgentsCatalog(base({ slashOpen: true, slashFilter: "age" }))
				.slashFilter,
		).toBe("");
	});

	it("clears the composed slash text out of the composer", () => {
		// The palette writes `/agents` into the input as it filters; leaving it
		// there would submit it again on the next Enter.
		expect(
			openAgentsCatalog(base({ slashOpen: true, input: "/agents" })).input,
		).toBe("");
	});

	it("resets the palette selection", () => {
		expect(
			openAgentsCatalog(base({ slashOpen: true, slashIndex: 4 })).slashIndex,
		).toBe(0);
	});

	it("leaves any pane attachment", () => {
		// Two things cannot own the keyboard at once. Opening the catalog while
		// attached would forward the catalog's own keys to a nested CLI.
		expect(
			openAgentsCatalog(base({ paneInteract: true, focus: "agents" }))
				.paneInteract,
		).toBe(false);
	});

	it("shows the catalog's own key legend", () => {
		// The keys change when the modal opens; a footer still describing the
		// chat keys would be actively wrong.
		expect(withCatalog().footerHints.length).toBeGreaterThan(0);
	});

	it("does not mutate the state it was given", () => {
		const state = base({ slashOpen: true });
		openAgentsCatalog(state);
		expect(state.slashOpen).toBe(true);
	});

	it("owns the keyboard as soon as it is open", () => {
		// The end-to-end property the other tests build up to.
		expect(shellModalOwnsInput(openAgentsCatalog(base()))).toBe(true);
	});
});
