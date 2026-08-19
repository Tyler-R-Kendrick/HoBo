import { describe, expect, it } from "vitest";

import {
	appendAssistant,
	createInitialShellState,
	reduceShellKey,
	renderShellFrame,
	replaceLastAssistant,
	scrollFocused,
} from "../src/interactive-shell.js";
import {
	followingLive,
	halfPageStep,
	maxChatScroll,
	pageStep,
	scrollToHome,
	scrollToLive,
	shellViewportRows,
} from "../src/shell-scroll.js";

/** Visible text only — accents must never change what a test sees. */
const plain = (frame: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR is the point
	frame.replace(/\u001b\[[0-9;]*m/g, "");

function fatChat(height = 24) {
	let state = createInitialShellState({
		width: 60,
		height,
		welcome: false,
		reducedMotion: true,
	});
	for (let i = 0; i < 40; i += 1) {
		state = appendAssistant(state, `line-${i} with enough text to wrap maybe`);
	}
	return state;
}

describe("shell-scroll helpers", () => {
	it("pageStep is half the viewport (Claude fullscreen convention)", () => {
		expect(pageStep(20)).toBe(10);
		expect(pageStep(3)).toBe(1);
		expect(halfPageStep(20)).toBe(10);
		expect(halfPageStep(5)).toBe(3);
	});

	it("clamps chat scroll so overshoot keys stay at max", () => {
		const state = fatChat();
		const max = maxChatScroll(state);
		expect(max).toBeGreaterThan(5);
		const overshot = scrollFocused(state, "up", 10_000);
		expect(overshot.chatScroll).toBe(max);
		expect(followingLive(overshot)).toBe(false);
	});

	it("Home jumps to oldest; End restores live follow", () => {
		let state = fatChat();
		state = reduceShellKey(state, "\x1b[5~").state;
		expect(state.chatScroll).toBeGreaterThan(0);
		state = reduceShellKey(state, "\x1b[H").state; // Home
		expect(state.chatScroll).toBe(maxChatScroll(state));
		state = reduceShellKey(state, "\x1b[F").state; // End
		expect(state.chatScroll).toBe(0);
		expect(followingLive(state)).toBe(true);
	});

	it("Ctrl+U / Ctrl+D move by half page", () => {
		let state = fatChat(24);
		const half = halfPageStep(shellViewportRows(state));
		state = reduceShellKey(state, "\x15").state; // Ctrl+U
		expect(state.chatScroll).toBe(half);
		state = reduceShellKey(state, "\x04").state; // Ctrl+D
		expect(state.chatScroll).toBe(0);
	});

	it("preserves chatScroll when streaming while scrolled up", () => {
		let state = fatChat();
		state = { ...state, chatScroll: 8 };
		const kept = appendAssistant(state, "new while reviewing");
		expect(kept.chatScroll).toBe(8);
		const streamed = replaceLastAssistant(kept, "new while reviewing…more");
		expect(streamed.chatScroll).toBe(8);
	});

	it("stays pinned to live when chatScroll is 0", () => {
		let state = fatChat();
		expect(followingLive(state)).toBe(true);
		state = appendAssistant(state, "live append");
		expect(state.chatScroll).toBe(0);
	});

	it("Agents pins to newest capture; PgUp scrolls history; End returns live", () => {
		const turns = Array.from(
			{ length: 40 },
			(_, i) => `turn-${String(i).padStart(2, "0")} conversation line`,
		).join("\n");
		let state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			focus: "agents",
			agentWork: true,
			paneInteract: false,
			livePanes: {
				session: "hobo",
				windows: [
					{
						name: "codex",
						target: "%1",
						kind: "coding-agent",
						panes: [
							{
								id: "%1",
								index: 0,
								active: true,
								width: 80,
								height: 40,
								capture: turns,
							},
						],
					},
				],
				focused: 0,
				focusedPane: 0,
				capture: turns,
				note: "live",
				tmux: true,
			},
		};
		const live = plain(renderShellFrame(state));
		expect(live).toContain("turn-39");
		expect(live).not.toContain("turn-00");
		expect(followingLive(state)).toBe(true);

		state = reduceShellKey(state, "\x1b[5~").state; // PgUp
		expect(state.paneScroll).toBeGreaterThan(0);
		expect(followingLive(state)).toBe(false);
		const older = plain(renderShellFrame(state));
		expect(older).toMatch(/↑/);
		expect(older).not.toContain("turn-39");

		state = reduceShellKey(state, "\x1b[F").state; // End
		expect(state.paneScroll).toBe(0);
		expect(plain(renderShellFrame(state))).toContain("turn-39");
	});

	it("attached Agents: PgUp scrolls TV instead of forwarding", () => {
		const turns = Array.from(
			{ length: 40 },
			(_, i) => `msg-${String(i).padStart(2, "0")}`,
		).join("\n");
		let state = createInitialShellState({
			width: 72,
			height: 18,
			welcome: false,
			reducedMotion: true,
		});
		state = {
			...state,
			focus: "agents",
			agentWork: true,
			paneInteract: true,
			livePanes: {
				session: "hobo",
				windows: [
					{
						name: "codex",
						target: "%1",
						kind: "coding-agent",
						panes: [
							{
								id: "%1",
								index: 0,
								active: true,
								width: 80,
								height: 40,
								capture: turns,
							},
						],
					},
				],
				focused: 0,
				focusedPane: 0,
				capture: turns,
				note: "live",
				tmux: true,
			},
		};
		const result = reduceShellKey(state, "\x1b[5~");
		expect(result.forwardPaneKey).toBeUndefined();
		expect(result.state.paneScroll).toBeGreaterThan(0);
	});

	it("shows history footer hint when scrolled; omits at live", () => {
		let state = fatChat();
		const live = plain(renderShellFrame(state));
		expect(live).not.toMatch(/history · End live/);
		state = reduceShellKey(state, "\x1b[A").state;
		const scrolled = plain(renderShellFrame(state));
		expect(scrolled).toMatch(/chat ↑/);
		expect(scrolled).toMatch(/history · End live/);
	});

	it("scrollToHome / scrollToLive helpers match keys", () => {
		const state = fatChat();
		const home = scrollToHome(state);
		expect(home.chatScroll).toBe(maxChatScroll(state));
		expect(scrollToLive(home).chatScroll).toBe(0);
	});
});
