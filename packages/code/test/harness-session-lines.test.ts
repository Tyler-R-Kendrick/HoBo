/**
 * The Agents pane's own chrome, and keeping the mux focus in step with it.
 *
 * `formatHarnessSessionLines` renders what the operator reads while steering a
 * seated agent; `syncLivePanesFocus` makes the real tmux panes agree with what
 * that render is showing. Both are pure, and both have a failure mode that is
 * quiet rather than loud:
 *
 * **An empty view still says what to do.** No sessions is the state of every
 * machine before an agent is seated. A blank pane there reads as broken; the
 * two lines it renders instead name the command that creates one and the keys
 * that work once it exists.
 *
 * **Attached and detached are different renders, not the same one with a
 * flag.** Attached, the glass *is* the pane capture and the chrome shrinks to
 * one line — because every row of chrome is a row of the agent's output the
 * operator cannot see. Detached, the chrome is the point.
 *
 * **The focused pane is marked, and marked from two independent sources.** A
 * pane is active if the view's index points at it *or* it carries its own
 * `focused` flag, because those two can disagree — the view's index is the
 * shell's idea, the flag is tmux's. Trusting only one would leave the operator
 * steering a pane the chrome says is not selected.
 *
 * **`syncLivePanesFocus` never invents a focus.** With no agent, no windows,
 * or a window list that does not contain the focused agent, it carries the
 * pane index across and leaves the window focus alone. Guessing would switch
 * the operator's tmux window to something they did not select.
 */
import { describe, expect, it } from "vitest";

import {
	emptyHarnessSessionView,
	formatHarnessSessionLines,
	type HarnessPaneView,
	type HarnessSessionView,
	syncLivePanesFocus,
} from "../src/harness-session-view.js";
import type { InSessionPanes } from "../src/in-session-panes.js";

const paneView = (patch: Partial<HarnessPaneView> = {}): HarnessPaneView => ({
	id: "pane-0000000000",
	title: "shell",
	focused: false,
	capture: "",
	...patch,
});

const view = (patch: Partial<HarnessSessionView> = {}): HarnessSessionView => ({
	sessions: [
		{
			id: "sess-1",
			name: "review",
			branch: "code/review",
			lifecycle: "running",
			revision: 3,
			tabs: [
				{
					id: "tab-1",
					title: "main",
					panes: [paneView()],
				},
			],
		},
	],
	focusedSession: 0,
	focusedTab: 0,
	focusedPane: 0,
	...patch,
});

const twoPanes = () =>
	view({
		sessions: [
			{
				...view().sessions[0],
				tabs: [
					{
						id: "tab-1",
						title: "main",
						panes: [
							paneView({ id: "pane-a", title: "codex" }),
							paneView({ id: "pane-b", title: "pi" }),
						],
					},
				],
			},
		],
	} as Partial<HarnessSessionView>);

const lines = (
	v: HarnessSessionView,
	options: { attached?: boolean; contentWidth?: number } = {},
) => formatHarnessSessionLines(v, options).join("\n");

describe("an empty agents pane", () => {
	it("does not render blank", () => {
		// No sessions is the state of every machine before an agent is seated.
		// A blank pane there reads as broken rather than as empty.
		expect(
			formatHarnessSessionLines(emptyHarnessSessionView()),
		).not.toHaveLength(0);
	});

	it("names the command that creates a session", () => {
		expect(lines(emptyHarnessSessionView())).toMatch(/hobo-code session/);
	});

	it("names the other way in, through mux", () => {
		// Two routes to the same place, and which one a reader knows depends on
		// where they came from.
		expect(lines(emptyHarnessSessionView())).toMatch(/mux/);
	});

	it("still lists the keys that will work", () => {
		expect(lines(emptyHarnessSessionView())).toMatch(/Enter attaches/);
	});

	it("names the key that leaves", () => {
		// The one a reader needs most and can guess least.
		expect(lines(emptyHarnessSessionView())).toMatch(/Ctrl\+\\/);
	});
});

describe("the detached chrome", () => {
	it("names the session", () => {
		expect(lines(view())).toContain("review");
	});

	it("carries the session id", () => {
		// The id is what `hobo-code session` commands take; the name is for
		// reading.
		expect(lines(view())).toContain("sess-1");
	});

	it("shows the branch the session is on", () => {
		// A seated agent commits to this branch. Which one is not something to
		// have to go and look up.
		expect(lines(view())).toContain("code/review");
	});

	it("shows the lifecycle state", () => {
		expect(lines(view())).toContain("running");
	});

	it("shows the revision", () => {
		// Session commands are revision-checked; a stale one is refused, and
		// this is where the operator sees which they are on.
		expect(lines(view())).toContain("r3");
	});

	it("offers the session-level actions", () => {
		expect(lines(view())).toMatch(/Detach · Stop session · New tab/);
	});

	it("names the tab", () => {
		expect(lines(view())).toContain("main");
	});

	it("brackets the focused tab", () => {
		// One tab or several, the focused one is marked -- otherwise switching
		// tabs has no visible effect.
		expect(lines(view())).toContain("[main]");
	});

	it("does not bracket an unfocused tab", () => {
		const twoTabs = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{ id: "t1", title: "first", panes: [paneView()] },
						{ id: "t2", title: "second", panes: [paneView()] },
					],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(twoTabs)).toContain("[first]");
		expect(lines(twoTabs)).not.toContain("[second]");
	});

	it("says New pane for a single-leaf tab", () => {
		expect(lines(view())).toMatch(/New pane$/m);
	});

	it("counts the leaves once there are several", () => {
		// The count is how an operator knows there is something to cycle to.
		expect(lines(twoPanes())).toMatch(/New pane · 2 leaves/);
	});

	it("ends with the prompt line", () => {
		// The pane is steered by typing; the last line is what says so.
		expect(lines(view())).toMatch(/type\+Enter steers/);
	});

	it("names what Enter would attach to", () => {
		expect(lines(view())).toMatch(/Enter attach \(shell\)/);
	});
});

describe("marking the focused pane", () => {
	it("marks the pane the view points at", () => {
		expect(lines(view())).toMatch(/focused/);
	});

	it("marks a pane that carries its own focused flag", () => {
		// The two sources can disagree: the index is the shell's idea, the flag
		// is tmux's. Trusting only the index would leave the operator steering
		// a pane the chrome says is not selected.
		const flagged = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{
							id: "t1",
							title: "main",
							panes: [
								paneView({ id: "a", title: "first" }),
								paneView({ id: "b", title: "second", focused: true }),
							],
						},
					],
				},
			],
			focusedPane: 0,
		} as Partial<HarnessSessionView>);
		const rendered = lines(flagged);
		expect(
			rendered.split("\n").filter((row) => row.includes("focused")).length,
		).toBeGreaterThan(1);
	});

	it("offers the pane actions under the focused pane only", () => {
		// The action row follows the selection; showing it under every pane
		// would make it unclear which one Enter would act on.
		const rendered = lines(twoPanes());
		expect(
			rendered.split("\n").filter((row) => row.startsWith("Focus · Prompt")),
		).toHaveLength(1);
	});

	it("shows an agent label when the pane has one", () => {
		const labelled = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{
							id: "t1",
							title: "main",
							panes: [paneView({ agentLabel: "codex · gpt" })],
						},
					],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(labelled)).toContain("codex · gpt");
	});

	it("falls back to the raw agent id when there is no label", () => {
		const raw = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{ id: "t1", title: "main", panes: [paneView({ agent: "codex" })] },
					],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(raw)).toContain("codex");
	});

	it("reports an unknown status rather than leaving it blank", () => {
		// A pane with no status is not a pane with no state -- it is one whose
		// state has not been read yet, and saying so is the honest render.
		expect(lines(view())).toContain("unknown");
	});

	it("shows a status the pane does carry", () => {
		const busy = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{
							id: "t1",
							title: "main",
							panes: [paneView({ agentStatus: "working" })],
						},
					],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(busy)).toContain("working");
	});

	it("shortens a long pane id", () => {
		// The id shares a line with the title, the agent and the status; an
		// untruncated one pushes the status off the end.
		const long = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{
							id: "t1",
							title: "main",
							panes: [paneView({ id: "a".repeat(40) })],
						},
					],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(long)).toContain("…");
	});

	it("leaves a short pane id whole", () => {
		const short = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{ id: "t1", title: "main", panes: [paneView({ id: "short" })] },
					],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(short)).toContain("short");
	});
});

describe("the attached chrome", () => {
	it("shrinks to a single chrome line", () => {
		// Every row of chrome is a row of the agent's output the operator
		// cannot see, so attached mode spends as few as it can.
		expect(lines(view(), { attached: true })).toMatch(/^attached · /);
	});

	it("does not render the detached session header", () => {
		expect(lines(view(), { attached: true })).not.toMatch(
			/Detach · Stop session/,
		);
	});

	it("names who is attached", () => {
		expect(lines(view(), { attached: true })).toContain("shell");
	});

	it("says which leaf of how many", () => {
		// The only way to know there is another pane behind this one.
		expect(lines(twoPanes(), { attached: true })).toMatch(/pane 1\/2/);
	});

	it("reports a single pane as one of one", () => {
		expect(lines(view(), { attached: true })).toMatch(/pane 1\/1/);
	});

	it("names the key that detaches", () => {
		// Attached with no visible way out is the worst state this pane has.
		expect(lines(view(), { attached: true })).toMatch(/Ctrl\+\\ leave/);
	});

	it("names the keys that cycle panes", () => {
		expect(lines(view(), { attached: true })).toMatch(/\[ \] focus/);
	});
});

describe("rendering awkward views", () => {
	it("falls back to the first tab when the focused index is past the end", () => {
		// A stale index after a tab closed. Indexing past the end would render
		// nothing at all.
		expect(lines(view({ focusedTab: 99 })).length).toBeGreaterThan(0);
	});

	it("falls back when the focused pane index is past the end", () => {
		expect(lines(view({ focusedPane: 99 })).length).toBeGreaterThan(0);
	});

	it("renders a session with no tabs", () => {
		const noTabs = view({
			sessions: [{ ...view().sessions[0], tabs: [] }],
		} as Partial<HarnessSessionView>);
		expect(lines(noTabs).length).toBeGreaterThan(0);
	});

	it("renders a tab with no panes", () => {
		const noPanes = view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [{ id: "t1", title: "main", panes: [] }],
				},
			],
		} as Partial<HarnessSessionView>);
		expect(lines(noPanes).length).toBeGreaterThan(0);
	});

	it("renders at a very narrow content width", () => {
		// The width is clamped to a floor; below it the capture grid would get
		// negative columns.
		expect(lines(view(), { contentWidth: 1 }).length).toBeGreaterThan(0);
	});

	it("renders attached at a very narrow width too", () => {
		expect(
			lines(twoPanes(), { attached: true, contentWidth: 1 }).length,
		).toBeGreaterThan(0);
	});

	it("is stable across two renders of the same view", () => {
		// It runs on every repaint and is diffed against the last frame.
		expect(lines(view())).toBe(lines(view()));
	});
});

describe("keeping the mux focus in step", () => {
	const panes = (patch: Partial<InSessionPanes> = {}): InSessionPanes =>
		// SAFETY: the fixture is the pane-set shape the helper is declared over.
		({
			windows: [{ name: "codex" }, { name: "pi" }],
			focused: 0,
			focusedPane: 0,
			capture: "old capture",
			...patch,
		}) as InSessionPanes;

	const withAgent = (agent: string, focusedPane = 0) =>
		view({
			sessions: [
				{
					...view().sessions[0],
					tabs: [
						{
							id: "t1",
							title: "main",
							panes: [paneView({ agent }), paneView({ agent: "other" })],
						},
					],
				},
			],
			focusedPane,
		} as Partial<HarnessSessionView>);

	it("carries the pane index across", () => {
		expect(syncLivePanesFocus(panes(), withAgent("codex", 1)).focusedPane).toBe(
			1,
		);
	});

	it("focuses the window matching the focused agent", () => {
		expect(syncLivePanesFocus(panes(), withAgent("pi")).focused).toBe(1);
	});

	it("leaves the window focus alone when the agent has no window", () => {
		// The window list and the view can disagree while a session is being
		// torn down. Guessing would switch the operator's tmux window to
		// something they did not select.
		expect(syncLivePanesFocus(panes(), withAgent("a-gone-agent")).focused).toBe(
			0,
		);
	});

	it("still carries the pane index when the agent has no window", () => {
		expect(
			syncLivePanesFocus(panes(), withAgent("a-gone-agent", 1)).focusedPane,
		).toBe(1);
	});

	it("leaves the focus alone when there are no windows", () => {
		expect(
			syncLivePanesFocus(panes({ windows: [] }), withAgent("codex"))
				.focusedPane,
		).toBe(0);
	});

	it("leaves the focus alone when the view has no focused agent", () => {
		expect(syncLivePanesFocus(panes(), emptyHarnessSessionView()).focused).toBe(
			0,
		);
	});

	it("keeps the capture when nothing moved", () => {
		// The capture is what is on screen. Clearing it on a no-op sync would
		// blank the pane for a frame on every repaint.
		expect(syncLivePanesFocus(panes(), withAgent("codex")).capture).toBe(
			"old capture",
		);
	});

	it("clears the capture when the window moved", () => {
		// The old capture belongs to the old window; showing it under the new
		// one would attribute output to the wrong agent.
		expect(syncLivePanesFocus(panes(), withAgent("pi")).capture).toBe("");
	});

	it("clears the capture when the pane within a window moved", () => {
		// Same window, different leaf. The capture belongs to the leaf, so it
		// has to go even though the window focus did not change.
		expect(
			syncLivePanesFocus(panes({ focusedPane: 1 }), withAgent("codex", 0))
				.capture,
		).toBe("");
	});

	it("reads the focused agent from the focused pane, not the first one", () => {
		// The view's focusedPane selects which pane's agent is "the" agent.
		// Reading pane zero instead would sync the window to whichever agent
		// happened to be seated first.
		expect(syncLivePanesFocus(panes(), withAgent("codex", 1)).focused).toBe(0);
	});

	it("does not mutate the panes it was given", () => {
		const original = panes();
		syncLivePanesFocus(original, withAgent("pi"));
		expect(original.focused).toBe(0);
	});
});
