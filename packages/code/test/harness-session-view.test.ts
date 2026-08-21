import { describe, expect, it } from "vitest";
import {
	cycleHarnessFocus,
	cycleHarnessLeaf,
	formatHarnessSessionLines,
	type HarnessSessionView,
	HERDR_SESSION_CHROME_TOKENS,
	harnessViewFromLivePanes,
	mergeHarnessSessions,
} from "../src/harness-session-view.js";
import type { InSessionPanes } from "../src/in-session-panes.js";
import { cellWidth } from "../src/rubberhose.js";

const mux: InSessionPanes = {
	session: "hobo",
	windows: [
		{ name: "hobo-code", target: "%0", kind: "harness" },
		{ name: "codex", target: "%1", kind: "coding-agent" },
		{ name: "pi", target: "%2", kind: "coding-agent" },
	],
	focused: 1,
	capture: "codex › reading auth.ts\nI'll add OAuth.",
	note: "in-session",
	tmux: true,
};

/** Fixture shaped like herdr evidence pane-layout-desktop.png */
function releaseOrchestrationView(): HarnessSessionView {
	return {
		sessions: [
			{
				id: "release-orchestration-35add782",
				name: "Release orchestration",
				branch: "code/release-orchestration",
				lifecycle: "running",
				revision: 6,
				tabs: [
					{
						id: "tab-main",
						title: "main",
						panes: [
							{
								id: "pane-main",
								title: "main",
								focused: false,
								capture: "",
							},
						],
					},
					{
						id: "2b51e226-a933-4f9b-9787-8018987ebd74",
						title: "Review",
						panes: [
							{
								id: "0bfe1fb9-26d3-4c09-97ae-02bfab4ed3c0",
								title: "Review",
								agent: "codex",
								agentLabel: "Codex",
								agentStatus: "working",
								focused: true,
								capture: "browser journey output",
							},
							{
								id: "53f9d6d7-391c-47da-b5c000000001",
								title: "Observer",
								agentStatus: "idle",
								focused: false,
								capture: "",
							},
							{
								id: "7f548ee3-185a-46f4-ac8000000002",
								title: "Monitor",
								agentStatus: "idle",
								focused: false,
								capture: "",
							},
						],
					},
				],
			},
		],
		focusedSession: 0,
		focusedTab: 1,
		focusedPane: 0,
	};
}

describe("harness-session-view", () => {
	it("maps mux windows to herdr tabs and keeps capture on the focused pane", () => {
		const view = harnessViewFromLivePanes(mux);
		expect(view.sessions).toHaveLength(1);
		expect(view.sessions[0]?.tabs).toHaveLength(3);
		expect(view.focusedTab).toBe(1);
		expect(view.sessions[0]?.tabs[1]?.title).toMatch(/Codex/i);
		expect(view.sessions[0]?.tabs[1]?.panes[0]?.capture).toContain("OAuth");
	});

	it("formats chrome tokens that match herdr session-control screenshots", () => {
		const lines = formatHarnessSessionLines(releaseOrchestrationView()).join(
			"\n",
		);
		for (const token of HERDR_SESSION_CHROME_TOKENS) {
			expect(lines).toContain(token);
		}
		expect(lines).toContain(
			"Release orchestration · release-orchestration-35add782 · code/release-orchestration · running · r6",
		);
		expect(lines).toContain("[Review]");
		expect(lines).toContain("browser journey output");
		expect(lines).toMatch(/Review · 0bfe1fb9….*focused/);
	});

	it("[ ] leaf-cycles panes when a tab is split", () => {
		const start = releaseOrchestrationView();
		const next = cycleHarnessLeaf(start, 1);
		expect(next.focusedPane).toBe(1);
		expect(next.focusedTab).toBe(1);
		const back = cycleHarnessLeaf(next, -1);
		expect(back.focusedPane).toBe(0);
	});

	it("[ ] leaf-cycles tabs when each harness tab is single-pane", () => {
		const view = harnessViewFromLivePanes(mux);
		const next = cycleHarnessLeaf(view, 1);
		expect(next.focusedTab).toBe(2);
		expect(next.sessions[0]?.tabs[next.focusedTab]?.title).toMatch(/Pi/i);
	});

	it("{ } cycles tabs and , . cycles sessions", () => {
		const multi = mergeHarnessSessions([
			...releaseOrchestrationView().sessions,
			{
				id: "second",
				name: "Second workspace",
				branch: "main",
				lifecycle: "running",
				revision: 1,
				tabs: [
					{
						id: "t1",
						title: "codex",
						panes: [
							{
								id: "p1",
								title: "codex",
								agent: "codex",
								agentLabel: "Codex",
								focused: true,
								capture: "hi",
							},
						],
					},
				],
			},
		]);
		expect(multi.sessions).toHaveLength(2);
		expect(multi.focusedTab).toBe(0);
		const tabbed = cycleHarnessFocus(multi, "tab", 1);
		expect(tabbed.focusedTab).toBe(1);
		const sessioned = cycleHarnessFocus(multi, "session", 1);
		expect(sessioned.focusedSession).toBe(1);
		expect(sessioned.sessions[1]?.name).toBe("Second workspace");
	});

	it("imports live herdr api snapshot shape into Session→Tab→Pane", async () => {
		const { readFileSync, existsSync } = await import("node:fs");
		const path = "/tmp/herdr-snap.json";
		if (!existsSync(path)) return;
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const json = JSON.parse(readFileSync(path, "utf8")) as {
			result?: { snapshot?: unknown };
			snapshot?: unknown;
		};
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const snap = (json.result?.snapshot ?? json.snapshot ?? json) as Parameters<
			typeof import("../src/harness-session-view.js").harnessViewFromHerdrApiSnapshot
		>[0];
		const {
			harnessViewFromHerdrApiSnapshot,
			formatHarnessSessionLines,
			HERDR_SESSION_CHROME_TOKENS,
		} = await import("../src/harness-session-view.js");
		const view = harnessViewFromHerdrApiSnapshot(snap);
		expect(view.sessions.length).toBeGreaterThan(0);
		const lines = formatHarnessSessionLines(view).join("\n");
		for (const token of HERDR_SESSION_CHROME_TOKENS) {
			expect(lines).toContain(token);
		}
	});

	it("maps split tmux leaves into one herdr tab with multiple panes", () => {
		const split: InSessionPanes = {
			session: "hobo",
			windows: [
				{
					name: "pi",
					target: "%6",
					kind: "coding-agent",
					panes: [
						{
							id: "%6",
							index: 0,
							active: true,
							width: 40,
							height: 24,
							capture: "Trust project?\n→ Yes",
						},
						{
							id: "%56",
							index: 1,
							active: false,
							width: 39,
							height: 24,
							capture: "SECOND PANE",
						},
					],
				},
			],
			focused: 0,
			focusedPane: 0,
			capture: "Trust project?\n→ Yes",
			note: "live",
			tmux: true,
		};
		const view = harnessViewFromLivePanes(split);
		expect(view.sessions[0]?.tabs[0]?.panes).toHaveLength(2);
		const lines = formatHarnessSessionLines(view, {
			attached: true,
			contentWidth: 72,
		}).join("\n");
		expect(lines).toMatch(/▶/);
		expect(lines).toContain("SECOND PANE");
		expect(lines).toMatch(/Trust project/);
		expect(lines).toContain("│");
		expect(lines).not.toMatch(/┌─/);
		expect(lines).not.toMatch(/fullscreen/i);
		// Both columns stay visible when focus moves.
		const focusedRight = formatHarnessSessionLines(
			{ ...view, focusedPane: 1 },
			{ attached: true, contentWidth: 72 },
		).join("\n");
		expect(focusedRight).toContain("Trust project");
		expect(focusedRight).toContain("SECOND PANE");
		expect(focusedRight).toMatch(/▶.*keys|keys/);
	});

	it("pins multi-turn capture to the newest lines (not the oldest)", () => {
		const turns = Array.from(
			{ length: 30 },
			(_, i) => `turn-${String(i).padStart(2, "0")}`,
		).join("\n");
		const view = harnessViewFromLivePanes({
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
							height: 24,
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
		});
		const lines = formatHarnessSessionLines(view, {
			attached: true,
			contentWidth: 72,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("turn-29");
		expect(joined).toContain("turn-00");
		// Split path also pins: newest in both columns.
		const split = harnessViewFromLivePanes({
			session: "hobo",
			windows: [
				{
					name: "pi",
					target: "%6",
					kind: "coding-agent",
					panes: [
						{
							id: "%6",
							index: 0,
							active: true,
							width: 40,
							height: 24,
							capture: turns,
						},
						{
							id: "%56",
							index: 1,
							active: false,
							width: 40,
							height: 24,
							capture: "other-old\nother-new",
						},
					],
				},
			],
			focused: 0,
			focusedPane: 0,
			capture: turns,
			note: "live",
			tmux: true,
		});
		const splitLines = formatHarnessSessionLines(split, {
			attached: true,
			contentWidth: 72,
		}).join("\n");
		expect(splitLines).toContain("turn-29");
		expect(splitLines).toContain("other-new");
	});

	it("split capture grid fills exact contentWidth (no short columns)", () => {
		const view = harnessViewFromLivePanes({
			session: "hobo",
			windows: [
				{
					name: "pi",
					target: "%6",
					kind: "coding-agent",
					panes: [
						{
							id: "%6",
							index: 0,
							active: true,
							width: 40,
							height: 24,
							capture: "LEFT",
						},
						{
							id: "%56",
							index: 1,
							active: false,
							width: 40,
							height: 24,
							capture: "RIGHT",
						},
					],
				},
			],
			focused: 0,
			focusedPane: 0,
			capture: "LEFT",
			note: "live",
			tmux: true,
		});
		for (const total of [50, 66, 72, 80, 100]) {
			const lines = formatHarnessSessionLines(view, {
				attached: true,
				contentWidth: total,
			}).filter((line) => line.includes("│"));
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(cellWidth(line)).toBe(total);
			}
		}
	});
});
