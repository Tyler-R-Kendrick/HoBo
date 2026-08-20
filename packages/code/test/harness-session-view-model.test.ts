/**
 * The Agents view model: how a harness session becomes something on screen.
 *
 * The sibling `harness-session-view.test.ts` covers the live-panes path. This
 * file covers the other two sources — the durable session snapshot and the
 * herdr API snapshot — plus the focus arithmetic and the lines the CRT paints.
 *
 * The functions are pure, which is the point: an operator steers agents through
 * this view, and every mistake it makes is a mistake about *which* agent. Three
 * properties carry that weight.
 *
 * **A tab always has a pane.** A tab with none is a tab an operator can focus
 * and then not act on, because every action reaches for a pane and finds
 * nothing. Both builders synthesise a placeholder rather than emitting an empty
 * list, and the placeholder is marked focused when its tab is.
 *
 * **Focus indices are never negative.** `findIndex` returns `-1`, and a `-1`
 * that reached the view would index past the end of an array — resolving to
 * `undefined`, which reads to the operator as the pane simply not responding.
 * Every index is floored at zero.
 *
 * **Cycling wraps and never lands outside the list.** `[` and `]` are how an
 * operator moves between agents; a cycle that walked off the end would leave
 * the focused pane undefined and the next keystroke acting on nothing.
 */
import { describe, expect, it } from "vitest";

import {
	cycleHarnessFocus,
	cycleHarnessLeaf,
	emptyHarnessSessionView,
	focusedHarnessAgentId,
	focusedHarnessPane,
	formatHarnessSessionLines,
	formatPaneCaptureGrid,
	type HarnessSessionNode,
	type HarnessSessionView,
	harnessViewFromHerdrApiSnapshot,
	harnessViewFromSnapshot,
	mergeHarnessSessions,
} from "../src/harness-session-view.js";

/** Lifecycle numbers as the protobuf enum spells them. */
const RUNNING = 2;

function snapshot(overrides: Record<string, unknown> = {}) {
	return {
		session: {
			id: "session-1",
			name: "work",
			branch: "code/work",
			lifecycleState: RUNNING,
		},
		tabs: [{ id: "tab-1", title: "agents" }],
		panes: [{ id: "pane-1", tabId: "tab-1", title: "claude" }],
		agentRuns: [],
		revision: 7n,
		focusedTabId: "tab-1",
		focusedPaneId: "pane-1",
		...overrides,
	} as never;
}

function node(overrides: Partial<HarnessSessionNode> = {}): HarnessSessionNode {
	return {
		id: "s1",
		name: "one",
		branch: "code/one",
		lifecycle: "running",
		revision: 1,
		tabs: [
			{
				id: "t1",
				title: "tab one",
				panes: [{ id: "p1", title: "pane one", focused: true, capture: "" }],
			},
		],
		...overrides,
	};
}

function view(overrides: Partial<HarnessSessionView> = {}): HarnessSessionView {
	return {
		sessions: [node()],
		focusedSession: 0,
		focusedTab: 0,
		focusedPane: 0,
		...overrides,
	};
}

describe("the empty view", () => {
	it("has no sessions", () => {
		expect(emptyHarnessSessionView().sessions).toEqual([]);
	});

	it("still carries zeroed focus indices", () => {
		// A view with `undefined` indices would make every consumer guard, and
		// the ones that forgot would index an array with `undefined`.
		const empty = emptyHarnessSessionView();
		expect(empty.focusedSession).toBe(0);
		expect(empty.focusedTab).toBe(0);
		expect(empty.focusedPane).toBe(0);
	});
});

describe("building from a session snapshot", () => {
	it("returns the empty view when the snapshot carries no session", () => {
		// A snapshot mid-creation has tabs and panes but no session yet, and a
		// view built from those would name a session that does not exist.
		expect(harnessViewFromSnapshot(snapshot({ session: undefined }))).toEqual(
			emptyHarnessSessionView(),
		);
	});

	it("names the session, its branch and its revision", () => {
		// The revision is what an operator quotes when a command is rejected for
		// being out of date.
		const built = harnessViewFromSnapshot(snapshot());
		expect(built.sessions[0]).toMatchObject({
			id: "session-1",
			name: "work",
			branch: "code/work",
			lifecycle: "running",
			revision: 7,
		});
	});

	it.each([
		[1, "starting"],
		[2, "running"],
		[3, "stopping"],
		[4, "stopped"],
		[5, "failed"],
	])("labels lifecycle %s as %s", (state, label) => {
		const built = harnessViewFromSnapshot(
			snapshot({
				session: { id: "s", name: "n", branch: "b", lifecycleState: state },
			}),
		);
		expect(built.sessions[0]?.lifecycle).toBe(label);
	});

	it("labels an unrecognised lifecycle as unknown rather than blank", () => {
		// A blank cell reads as a rendering bug; "unknown" reads as a fact.
		const built = harnessViewFromSnapshot(
			snapshot({
				session: { id: "s", name: "n", branch: "b", lifecycleState: 99 },
			}),
		);
		expect(built.sessions[0]?.lifecycle).toBe("unknown");
	});

	it("gives a tab with no panes a placeholder", () => {
		// A tab an operator can focus but not act on is worse than no tab: every
		// action reaches for a pane and quietly finds nothing.
		const built = harnessViewFromSnapshot(snapshot({ panes: [] }));
		expect(built.sessions[0]?.tabs[0]?.panes).toHaveLength(1);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.id).toBe("tab-1:empty");
	});

	it("marks the placeholder focused when its tab is", () => {
		const built = harnessViewFromSnapshot(snapshot({ panes: [] }));
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.focused).toBe(true);
	});

	it("falls back to the tab title when a pane has none", () => {
		// An untitled pane in a list of titled ones is a row an operator cannot
		// identify.
		const built = harnessViewFromSnapshot(
			snapshot({ panes: [{ id: "pane-1", tabId: "tab-1", title: "" }] }),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.title).toBe("agents");
	});

	it("prefers a running agent's provider as the pane title", () => {
		// The provider is what the operator is steering; the tab title is where
		// it happens to live.
		const built = harnessViewFromSnapshot(
			snapshot({
				panes: [{ id: "pane-1", tabId: "tab-1", title: "" }],
				agentRuns: [
					{ paneId: "pane-1", provider: "claude", lifecycleState: 3 },
				],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.title).toBe("claude");
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.agent).toBe("claude");
	});

	// `done` is deliberately absent from this table. The builder filters out
	// DONE, FAILED and STOPPED runs *before* mapping a status, so a finished run
	// never reaches the mapper at all — its `done` arm is unreachable from this
	// path, and asserting otherwise would pin a behaviour the code does not
	// have. The next test covers what actually happens instead.
	it.each([
		[2, "idle"],
		[3, "working"],
		[4, "blocked"],
	])("maps agent lifecycle %s to %s", (state, status) => {
		const built = harnessViewFromSnapshot(
			snapshot({
				agentRuns: [
					{ paneId: "pane-1", provider: "claude", lifecycleState: state },
				],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.agentStatus).toBe(status);
	});

	it.each([
		["done", 5],
		["failed", 6],
		["stopped", 7],
	])("ignores a %s run rather than showing it as the pane's agent", (_label, state) => {
		// A finished run left attached to a pane would show a stopped agent as
		// the thing an operator is steering — and every prompt would go nowhere.
		const built = harnessViewFromSnapshot(
			snapshot({
				panes: [{ id: "pane-1", tabId: "tab-1", title: "" }],
				agentRuns: [
					{ paneId: "pane-1", provider: "claude", lifecycleState: state },
				],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.agent).toBeUndefined();
	});

	it("attaches a capture when one was supplied for the pane", () => {
		const built = harnessViewFromSnapshot(snapshot(), {
			captureByPaneId: { "pane-1": "hello from the pane" },
		});
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.capture).toBe(
			"hello from the pane",
		);
	});

	it("uses an empty capture rather than undefined when there is none", () => {
		// The renderer splits the capture; `undefined` would throw where an
		// empty string paints an empty pane.
		expect(
			harnessViewFromSnapshot(snapshot()).sessions[0]?.tabs[0]?.panes[0]
				?.capture,
		).toBe("");
	});

	it("floors the focused tab at zero when the focused id is unknown", () => {
		// `findIndex` answers -1, and -1 as an index resolves to undefined —
		// which reads to the operator as the view simply not responding.
		const built = harnessViewFromSnapshot(
			snapshot({ focusedTabId: "no-such-tab" }),
		);
		expect(built.focusedTab).toBe(0);
	});

	it("floors the focused pane at zero when no pane is focused", () => {
		const built = harnessViewFromSnapshot(
			snapshot({
				panes: [{ id: "pane-1", tabId: "tab-1", title: "x" }],
				focusedPaneId: "no-such-pane",
			}),
		);
		expect(built.focusedPane).toBe(0);
	});

	it("keeps only the panes belonging to each tab", () => {
		// A pane rendered under the wrong tab is a prompt sent to the wrong
		// agent.
		const built = harnessViewFromSnapshot(
			snapshot({
				tabs: [
					{ id: "tab-1", title: "one" },
					{ id: "tab-2", title: "two" },
				],
				panes: [
					{ id: "pane-1", tabId: "tab-1", title: "a" },
					{ id: "pane-2", tabId: "tab-2", title: "b" },
				],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes.map((p) => p.id)).toEqual([
			"pane-1",
		]);
		expect(built.sessions[0]?.tabs[1]?.panes.map((p) => p.id)).toEqual([
			"pane-2",
		]);
	});

	it("treats a missing revision as zero rather than NaN", () => {
		expect(
			harnessViewFromSnapshot(snapshot({ revision: undefined })).sessions[0]
				?.revision,
		).toBe(0);
	});
});

describe("merging session nodes", () => {
	it("returns the empty view for no nodes", () => {
		expect(mergeHarnessSessions([])).toEqual(emptyHarnessSessionView());
	});

	it("keeps every node", () => {
		const merged = mergeHarnessSessions([node(), node({ id: "s2" })]);
		expect(merged.sessions.map((s) => s.id)).toEqual(["s1", "s2"]);
	});

	it("defaults focus to the first of everything", () => {
		const merged = mergeHarnessSessions([node()]);
		expect(merged).toMatchObject({
			focusedSession: 0,
			focusedTab: 0,
			focusedPane: 0,
		});
	});

	it("clamps a session index past the end", () => {
		// The caller's remembered focus can outlive the session it pointed at.
		expect(mergeHarnessSessions([node()], { session: 9 }).focusedSession).toBe(
			0,
		);
	});

	it("clamps a negative session index", () => {
		expect(mergeHarnessSessions([node()], { session: -3 }).focusedSession).toBe(
			0,
		);
	});

	it("clamps a tab index past the end", () => {
		expect(mergeHarnessSessions([node()], { tab: 9 }).focusedTab).toBe(0);
	});

	it("clamps a pane index past the end", () => {
		expect(mergeHarnessSessions([node()], { pane: 9 }).focusedPane).toBe(0);
	});

	it("returns zero for a pane index into a session with no tabs", () => {
		// Nothing to clamp against; zero is the only honest answer.
		expect(
			mergeHarnessSessions([node({ tabs: [] })], { pane: 4 }).focusedPane,
		).toBe(0);
	});

	it("honours a focus that is in range", () => {
		const two = node({
			tabs: [
				{
					id: "t1",
					title: "one",
					panes: [{ id: "p1", title: "a", capture: "" }],
				},
				{
					id: "t2",
					title: "two",
					panes: [{ id: "p2", title: "b", capture: "" }],
				},
			],
		});
		expect(mergeHarnessSessions([two], { tab: 1 }).focusedTab).toBe(1);
	});
});

describe("building from a herdr API snapshot", () => {
	const herdr = (overrides: Record<string, unknown> = {}) => ({
		focused_workspace_id: "w1",
		workspaces: [{ workspace_id: "w1", label: "one" }],
		tabs: [{ tab_id: "t1", workspace_id: "w1", label: "tab" }],
		panes: [{ pane_id: "p1", tab_id: "t1", workspace_id: "w1", focused: true }],
		...overrides,
	});

	it("builds a session per workspace", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				workspaces: [
					{ workspace_id: "w1", label: "one" },
					{ workspace_id: "w2", label: "two" },
				],
			}),
		);
		expect(built.sessions.map((s) => s.id)).toEqual(["w1", "w2"]);
	});

	it("returns an empty view when there are no workspaces", () => {
		expect(harnessViewFromHerdrApiSnapshot({})).toEqual(
			emptyHarnessSessionView(),
		);
	});

	it("focuses the workspace the snapshot says is focused", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				focused_workspace_id: "w2",
				workspaces: [
					{ workspace_id: "w1", label: "one" },
					{ workspace_id: "w2", label: "two" },
				],
			}),
		);
		expect(built.focusedSession).toBe(1);
	});

	it("falls back to a workspace flagged focused when no id is given", () => {
		// Two spellings of the same fact; handling one would silently focus the
		// wrong workspace against a herdr that used the other.
		const built = harnessViewFromHerdrApiSnapshot({
			workspaces: [
				{ workspace_id: "w1" },
				{ workspace_id: "w2", focused: true },
			],
		} as never);
		expect(built.focusedSession).toBe(1);
	});

	it("falls back to the first workspace when nothing is flagged", () => {
		const built = harnessViewFromHerdrApiSnapshot({
			workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
		});
		expect(built.focusedSession).toBe(0);
	});

	it("names a workspace by its id when it has no label", () => {
		const built = harnessViewFromHerdrApiSnapshot({
			workspaces: [{ workspace_id: "w1" }],
		});
		expect(built.sessions[0]?.name).toBe("w1");
	});

	it("derives the branch from the last two checkout segments", () => {
		// The full path is too long for the strip, and the last two segments are
		// what distinguishes one worktree from another.
		const built = harnessViewFromHerdrApiSnapshot({
			workspaces: [
				{
					workspace_id: "w1",
					worktree: { checkout_path: "/home/dev/worktrees/code/feature-x" },
				},
			],
		});
		expect(built.sessions[0]?.branch).toBe("code/feature-x");
	});

	it("says herdr when there is no checkout path to derive from", () => {
		expect(
			harnessViewFromHerdrApiSnapshot({ workspaces: [{ workspace_id: "w1" }] })
				.sessions[0]?.branch,
		).toBe("herdr");
	});

	it("keeps only the tabs belonging to each workspace", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
				tabs: [
					{ tab_id: "t1", workspace_id: "w1" },
					{ tab_id: "t2", workspace_id: "w2" },
				],
				panes: [],
			}),
		);
		expect(built.sessions[0]?.tabs.map((t) => t.id)).toEqual(["t1"]);
		expect(built.sessions[1]?.tabs.map((t) => t.id)).toEqual(["t2"]);
	});

	it("gives a tab with no panes a placeholder", () => {
		const built = harnessViewFromHerdrApiSnapshot(herdr({ panes: [] }));
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.id).toBe("t1:empty");
	});

	it("prefers the stripped terminal title for a pane", () => {
		// It is what the pane's own program is showing, which is the most
		// specific thing available.
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				panes: [
					{
						pane_id: "p1",
						tab_id: "t1",
						workspace_id: "w1",
						terminal_title_stripped: "vim README.md",
						agent: "claude",
					},
				],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.title).toBe("vim README.md");
	});

	it("falls back through tab label, agent, then pane id", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				tabs: [{ tab_id: "t1", workspace_id: "w1" }],
				panes: [{ pane_id: "p1", tab_id: "t1", workspace_id: "w1" }],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.title).toBe("p1");
	});

	it("carries the agent and its display label", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				panes: [
					{ pane_id: "p1", tab_id: "t1", workspace_id: "w1", agent: "claude" },
				],
			}),
		);
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.agent).toBe("claude");
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.agentLabel).toBeDefined();
	});

	it("reports an unknown agent status rather than a blank one", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(herdr()).sessions[0]?.tabs[0]?.panes[0]
				?.agentStatus,
		).toBe("unknown");
	});

	it("attaches a capture by pane id", () => {
		const built = harnessViewFromHerdrApiSnapshot(herdr(), {
			captureByPaneId: { p1: "output" },
		});
		expect(built.sessions[0]?.tabs[0]?.panes[0]?.capture).toBe("output");
	});

	it("focuses the tab holding the focused pane", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				tabs: [
					{ tab_id: "t1", workspace_id: "w1" },
					{ tab_id: "t2", workspace_id: "w1" },
				],
				panes: [
					{ pane_id: "p1", tab_id: "t1", workspace_id: "w1" },
					{ pane_id: "p2", tab_id: "t2", workspace_id: "w1", focused: true },
				],
			}),
		);
		expect(built.focusedTab).toBe(1);
	});

	it("floors focus at zero when nothing is focused anywhere", () => {
		const built = harnessViewFromHerdrApiSnapshot(
			herdr({
				panes: [{ pane_id: "p1", tab_id: "t1", workspace_id: "w1" }],
			}),
		);
		expect(built.focusedTab).toBe(0);
		expect(built.focusedPane).toBe(0);
	});
});

describe("finding the focused pane", () => {
	it("returns the pane at the focused index", () => {
		expect(focusedHarnessPane(view())?.id).toBe("p1");
	});

	it("returns undefined for an empty view", () => {
		expect(focusedHarnessPane(emptyHarnessSessionView())).toBeUndefined();
	});

	it("falls back to whichever pane is flagged focused", () => {
		// The index and the flag can disagree after a tmux-side change; the flag
		// is the more recent fact.
		const stale = view({
			focusedPane: 9,
			sessions: [
				node({
					tabs: [
						{
							id: "t1",
							title: "t",
							panes: [
								{ id: "p1", title: "a", capture: "" },
								{ id: "p2", title: "b", focused: true, capture: "" },
							],
						},
					],
				}),
			],
		});
		expect(focusedHarnessPane(stale)?.id).toBe("p2");
	});

	it("returns the focused pane's agent id", () => {
		const withAgent = view({
			sessions: [
				node({
					tabs: [
						{
							id: "t1",
							title: "t",
							panes: [{ id: "p1", title: "a", agent: "claude", capture: "" }],
						},
					],
				}),
			],
		});
		expect(focusedHarnessAgentId(withAgent)).toBe("claude");
	});

	it("reports no agent id when the focused pane has none", () => {
		// A pane with no agent is a plain shell; naming one would send a prompt
		// to a terminal that cannot answer.
		expect(focusedHarnessAgentId(view())).toBeUndefined();
	});
});

describe("cycling focus", () => {
	const two = view({
		sessions: [node(), node({ id: "s2", name: "two" })],
	});

	it("does nothing on an empty view", () => {
		const empty = emptyHarnessSessionView();
		expect(cycleHarnessFocus(empty, "session", 1)).toBe(empty);
	});

	it("moves to the next session", () => {
		expect(cycleHarnessFocus(two, "session", 1).focusedSession).toBe(1);
	});

	it("wraps past the last session rather than walking off the end", () => {
		// An index past the end resolves to undefined, and the next keystroke
		// then acts on nothing at all.
		expect(
			cycleHarnessFocus({ ...two, focusedSession: 1 }, "session", 1)
				.focusedSession,
		).toBe(0);
	});

	it("wraps backwards from the first session", () => {
		expect(cycleHarnessFocus(two, "session", -1).focusedSession).toBe(1);
	});

	it("resets tab and pane focus when the session changes", () => {
		// The old indices point into a different session's tabs, where they mean
		// something else entirely.
		const moved = cycleHarnessFocus(
			{ ...two, focusedTab: 0, focusedPane: 0 },
			"session",
			1,
		);
		expect(moved.focusedTab).toBe(0);
		expect(moved.focusedPane).toBe(0);
	});

	const twoTabs = view({
		sessions: [
			node({
				tabs: [
					{
						id: "t1",
						title: "one",
						panes: [{ id: "p1", title: "a", capture: "" }],
					},
					{
						id: "t2",
						title: "two",
						panes: [
							{ id: "p2", title: "b", capture: "" },
							{ id: "p3", title: "c", capture: "" },
						],
					},
				],
			}),
		],
	});

	it("moves to the next tab and resets the pane", () => {
		const moved = cycleHarnessFocus(twoTabs, "tab", 1);
		expect(moved.focusedTab).toBe(1);
		expect(moved.focusedPane).toBe(0);
	});

	it("wraps around the tabs", () => {
		expect(
			cycleHarnessFocus({ ...twoTabs, focusedTab: 1 }, "tab", 1).focusedTab,
		).toBe(0);
	});

	it("does nothing when the session has no tabs", () => {
		const bare = view({ sessions: [node({ tabs: [] })] });
		expect(cycleHarnessFocus(bare, "tab", 1)).toBe(bare);
	});

	it("moves between panes within a tab", () => {
		const onSplit = { ...twoTabs, focusedTab: 1 };
		expect(cycleHarnessFocus(onSplit, "pane", 1).focusedPane).toBe(1);
	});

	it("wraps around the panes", () => {
		const onLast = { ...twoTabs, focusedTab: 1, focusedPane: 1 };
		expect(cycleHarnessFocus(onLast, "pane", 1).focusedPane).toBe(0);
	});

	it("does nothing when the focused tab has no panes", () => {
		const bare = view({
			sessions: [node({ tabs: [{ id: "t1", title: "t", panes: [] }] })],
		});
		expect(cycleHarnessFocus(bare, "pane", 1)).toBe(bare);
	});
});

describe("the leaf cycle", () => {
	// `[` and `]` mean "next thing" — which is a pane when the tab is split and
	// a tab otherwise, because most agent tabs are single-pane and cycling
	// within one would feel like the key doing nothing.

	it("moves between tabs when the focused tab has one pane", () => {
		const single = view({
			sessions: [
				node({
					tabs: [
						{
							id: "t1",
							title: "one",
							panes: [{ id: "p1", title: "a", capture: "" }],
						},
						{
							id: "t2",
							title: "two",
							panes: [{ id: "p2", title: "b", capture: "" }],
						},
					],
				}),
			],
		});
		expect(cycleHarnessLeaf(single, 1).focusedTab).toBe(1);
	});

	it("moves between panes when the focused tab is split", () => {
		const split = view({
			sessions: [
				node({
					tabs: [
						{
							id: "t1",
							title: "one",
							panes: [
								{ id: "p1", title: "a", capture: "" },
								{ id: "p2", title: "b", capture: "" },
							],
						},
					],
				}),
			],
		});
		const moved = cycleHarnessLeaf(split, 1);
		expect(moved.focusedPane).toBe(1);
		expect(moved.focusedTab).toBe(0);
	});
});

describe("the lines the Agents CRT paints", () => {
	it("says how to get started when there are no sessions", () => {
		// An empty panel with no instruction is a dead end.
		const lines = formatHarnessSessionLines(emptyHarnessSessionView());
		expect(lines.join(" ")).toContain("no harness sessions");
		expect(lines.join(" ")).toContain("hobo-code session");
	});

	it("names the session, branch, lifecycle and revision", () => {
		expect(formatHarnessSessionLines(view())[0]).toContain(
			"one · s1 · code/one · running · r1",
		);
	});

	it("brackets the focused tab so it can be told apart", () => {
		const lines = formatHarnessSessionLines(view());
		expect(lines.join("\n")).toContain("[tab one]");
	});

	it("marks the focused pane", () => {
		expect(formatHarnessSessionLines(view()).join("\n")).toContain("focused");
	});

	it("offers the pane actions under the focused pane only", () => {
		// Repeating them under every pane would push the capture off screen.
		const lines = formatHarnessSessionLines(view());
		expect(
			lines.filter((line) => line.includes("Enter attaches")),
		).toHaveLength(1);
	});

	it("counts the leaves when a tab is split", () => {
		const split = view({
			sessions: [
				node({
					tabs: [
						{
							id: "t1",
							title: "t",
							panes: [
								{ id: "p1", title: "a", capture: "" },
								{ id: "p2", title: "b", capture: "" },
							],
						},
					],
				}),
			],
		});
		expect(formatHarnessSessionLines(split).join("\n")).toContain("2 leaves");
	});

	it("shortens a long pane id rather than letting it push the row", () => {
		const long = view({
			sessions: [
				node({
					tabs: [
						{
							id: "t1",
							title: "t",
							panes: [
								{
									id: "a-very-long-pane-identifier",
									title: "a",
									capture: "",
								},
							],
						},
					],
				}),
			],
		});
		expect(formatHarnessSessionLines(long).join("\n")).toContain("…");
	});

	it("switches to the attached chrome when attached", () => {
		// Attached, the glass *is* the split — the session chrome would be
		// stealing rows from the thing the operator is watching.
		const lines = formatHarnessSessionLines(view(), { attached: true });
		expect(lines[0]).toContain("attached");
		expect(lines.join("\n")).not.toContain("Detach · Stop session");
	});

	it("names the pane being steered in the attached header", () => {
		expect(formatHarnessSessionLines(view(), { attached: true })[0]).toContain(
			"pane one",
		);
	});

	it("reports one of one for an unsplit tab while attached", () => {
		expect(formatHarnessSessionLines(view(), { attached: true })[0]).toContain(
			"1/1",
		);
	});
});

describe("the capture grid", () => {
	const pane = (id: string, capture: string) => ({
		id,
		title: id,
		capture,
	});

	it("says so when there are no panes", () => {
		// An empty grid would read as a pane that is running and silent.
		expect(formatPaneCaptureGrid([], 0)).toEqual(["(no panes)"]);
	});

	it("renders a single pane full width", () => {
		const lines = formatPaneCaptureGrid([pane("p1", "hello")], 0);
		expect(lines.join("\n")).toContain("hello");
	});

	it("renders two panes side by side", () => {
		const lines = formatPaneCaptureGrid(
			[pane("p1", "left"), pane("p2", "right")],
			0,
		).join("\n");
		expect(lines).toContain("left");
		expect(lines).toContain("right");
	});

	it("keeps every line within the content width", () => {
		// A line wider than the glass wraps, and a wrapped split stops being a
		// split.
		for (const line of formatPaneCaptureGrid(
			[pane("p1", "x".repeat(200)), pane("p2", "y".repeat(200))],
			0,
			{ contentWidth: 60 },
		)) {
			expect(line.length).toBeLessThanOrEqual(60);
		}
	});

	it("accepts the deprecated column width", () => {
		// Older call sites still pass it, and dropping it would silently halve
		// the grid rather than fail.
		expect(
			formatPaneCaptureGrid([pane("p1", "a"), pane("p2", "b")], 0, {
				colWidth: 20,
			}).length,
		).toBeGreaterThan(0);
	});

	it("enforces a minimum width rather than rendering a broken grid", () => {
		for (const line of formatPaneCaptureGrid([pane("p1", "hello")], 0, {
			contentWidth: 4,
		})) {
			expect(line.length).toBeLessThanOrEqual(24);
		}
	});
});
