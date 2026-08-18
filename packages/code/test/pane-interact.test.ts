import { setKittyProtocolActive } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { harnessViewFromLivePanes } from "../src/harness-session-view.js";
import type { InSessionPanes } from "../src/in-session-panes.js";
import {
	canEnterPaneInteract,
	createInitialShellState,
	cycleFocus,
	enterPaneInteract,
	leavePaneInteract,
	reduceShellKey,
	resolvePaneInteractTarget,
} from "../src/interactive-shell.js";
import {
	attachTmuxFullscreen,
	isPaneInteractDetach,
	PANE_INTERACT_DETACH,
	tmuxKeyArgvForInput,
} from "../src/pane-interact.js";
import { fitCells } from "../src/rubberhose.js";

const muxPanes: InSessionPanes = {
	session: "hobo",
	windows: [
		{ name: "codex", target: "%1", kind: "coding-agent" },
		{ name: "pi", target: "%2", kind: "coding-agent" },
	],
	focused: 0,
	capture: "\u001b[32mgreen\u001b[0m menu",
	note: "in-session",
	tmux: true,
};

describe("pane-interact", () => {
	it("maps arrows and Enter for tmux send-keys", () => {
		expect(tmuxKeyArgvForInput("\x1b[A")).toEqual([["Up"]]);
		expect(tmuxKeyArgvForInput("\x1b[B")).toEqual([["Down"]]);
		expect(tmuxKeyArgvForInput("\r")).toEqual([["Enter"]]);
		expect(tmuxKeyArgvForInput("\t")).toEqual([["Tab"]]);
		expect(tmuxKeyArgvForInput("\x03")).toEqual([["C-c"]]);
		expect(tmuxKeyArgvForInput("y")).toEqual([["-l", "--", "y"]]);
		expect(tmuxKeyArgvForInput(PANE_INTERACT_DETACH)).toEqual([]);
	});

	it("translates Kitty CSI-u to legacy tmux keys", () => {
		setKittyProtocolActive(true);
		try {
			expect(tmuxKeyArgvForInput("\x1b[13u")).toEqual([["Enter"]]);
			expect(tmuxKeyArgvForInput("\x1b[13;1u")).toEqual([["Enter"]]);
			expect(tmuxKeyArgvForInput("\x1b[A")).toEqual([["Up"]]);
			expect(tmuxKeyArgvForInput("\x1b[1;2A")).toEqual([["Up"]]);
			expect(tmuxKeyArgvForInput("\x1b[121u")).toEqual([["-l", "--", "y"]]);
			expect(tmuxKeyArgvForInput("\x1b[13;1:3u")).toEqual([]);
		} finally {
			setKittyProtocolActive(false);
		}
	});

	it("maps Kitty ctrl+c and enter with event types", () => {
		setKittyProtocolActive(true);
		try {
			expect(tmuxKeyArgvForInput("\x1b[99;5u")).toEqual([["C-c"]]);
			expect(tmuxKeyArgvForInput("\x1b[27u")).toEqual([["Escape"]]);
			expect(tmuxKeyArgvForInput("\x1b[13;1:1u")).toEqual([["Enter"]]);
			expect(tmuxKeyArgvForInput("\x1b[13;1:3u")).toEqual([]);
		} finally {
			setKittyProtocolActive(false);
		}
	});

	it("treats Ctrl+] as detach only", () => {
		expect(isPaneInteractDetach(PANE_INTERACT_DETACH)).toBe(true);
		expect(isPaneInteractDetach("\x1b")).toBe(false);
		setKittyProtocolActive(true);
		try {
			expect(isPaneInteractDetach("\x1b[93;5u")).toBe(true);
		} finally {
			setKittyProtocolActive(false);
		}
	});

	it("empty Enter on Agents attaches in TV (soft key-forward)", () => {
		let state = createInitialShellState({
			welcome: false,
			reducedMotion: true,
			width: 80,
			height: 24,
		});
		state = {
			...state,
			focus: "agents",
			agentWork: true,
			livePanes: muxPanes,
			harnessView: harnessViewFromLivePanes(muxPanes),
		};
		expect(canEnterPaneInteract(state)).toBe(true);
		expect(resolvePaneInteractTarget(state)).toBe("%1");

		const attached = reduceShellKey(state, "\r");
		expect(attached.state.paneInteract).toBe(true);
		expect(attached.fullscreenAttach).toBeUndefined();

		setKittyProtocolActive(true);
		try {
			const kittyEnter = reduceShellKey(state, "\x1b[13u");
			expect(kittyEnter.state.paneInteract).toBe(true);
		} finally {
			setKittyProtocolActive(false);
		}

		const soft = reduceShellKey({ ...state, paneInteract: true }, "\x1b[A");
		expect(soft.forwardPaneKey).toBe("\x1b[A");
		expect(soft.quit).toBeUndefined();

		const left = reduceShellKey(
			{ ...state, paneInteract: true },
			PANE_INTERACT_DETACH,
		);
		expect(left.state.paneInteract).toBe(false);

		const leftAlt = reduceShellKey({ ...state, paneInteract: true }, "\x1c");
		expect(leftAlt.state.paneInteract).toBe(false);
	});

	it("Tab cycle clears soft attach so shell nav is never trapped", () => {
		let state = createInitialShellState({
			welcome: false,
			reducedMotion: true,
		});
		state = enterPaneInteract({
			...state,
			focus: "agents",
			agentWork: true,
			livePanes: muxPanes,
			harnessView: harnessViewFromLivePanes(muxPanes),
		});
		expect(state.paneInteract).toBe(true);
		state = cycleFocus(state);
		expect(state.paneInteract).toBe(false);
		expect(state.focus).not.toBe("agents");
		expect(
			leavePaneInteract(
				enterPaneInteract({
					...createInitialShellState({ welcome: false }),
					focus: "agents",
					agentWork: true,
					livePanes: muxPanes,
					harnessView: harnessViewFromLivePanes(muxPanes),
				}),
			).paneInteract,
		).toBe(false);
	});

	it("attachTmuxFullscreen selects window, binds detach, then attaches", async () => {
		const calls: string[][] = [];
		const runner = {
			async run(args: readonly string[]) {
				calls.push([...args]);
				return { code: 0, stdout: "", stderr: "" };
			},
		};
		const attachArgs: string[][] = [];
		const result = await attachTmuxFullscreen({
			session: "hobo",
			window: "codex",
			pane: "%19",
			runner,
			attach: async (args) => {
				attachArgs.push([...args]);
				return 0;
			},
		});
		expect(result.code).toBe(0);
		expect(
			calls.some((c) => c[0] === "select-window" && c.includes("hobo:codex")),
		).toBe(true);
		expect(calls.some((c) => c[0] === "select-pane" && c.includes("%19"))).toBe(
			true,
		);
		expect(
			calls.some(
				(c) =>
					c[0] === "bind-key" &&
					c.includes("C-]") &&
					c.includes("detach-client"),
			),
		).toBe(true);
		expect(attachArgs).toEqual([["attach-session", "-t", "hobo"]]);
	});

	it("fitCells keeps SGR when truncating coloured capture", () => {
		const coloured = "\u001b[32mabcdefghij\u001b[0m";
		const fitted = fitCells(coloured, 6);
		expect(fitted.startsWith("\u001b[32m")).toBe(true);
		expect(fitted).toContain("…");
		expect(fitted.endsWith("\u001b[0m")).toBe(true);
	});
});
