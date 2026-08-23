/**
 * The herdr-shaped session hierarchy: four ways in, one shape out.
 *
 * Session → Tab → Pane, built from a live tmux mux, a resident snapshot, a
 * live `herdr api snapshot`, or a hand-merged list of nodes. The value of the
 * shape is that everything downstream — focus cycling, the CRT lines, the
 * capture grid — works the same regardless of which door the data came in.
 * These tests hold each builder to that shape and then drive the shared parts
 * once.
 *
 * What the module is careful about, and why:
 *
 * **A tab always has at least one pane.** Both snapshot builders synthesise an
 * `:empty` pane for a tab with none. A tab that renders as nothing is
 * indistinguishable from a tab that failed to load, and the focus arithmetic
 * downstream indexes into `panes` without checking.
 *
 * **Focus is clamped, never trusted.** Every index arrives from somewhere else
 * — a snapshot, a tmux listing, a previous view — and each is pulled back
 * inside its list rather than allowed to index past the end.
 *
 * **A finished agent run does not decorate its pane.** The snapshot builder
 * looks for a run that is not done, failed, or stopped; matching on pane id
 * alone would label a pane with the provider of a run that ended.
 *
 * **The grid never slices the capture.** The comment in the source says what
 * the bug was: slicing to the first N lines hid every new turn under the
 * oldest ones. The glass pins the bottom instead.
 *
 * Pure: records in, records and strings out.
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
	type HarnessPaneView,
	type HarnessSessionNode,
	harnessViewFromHerdrApiSnapshot,
	harnessViewFromLivePanes,
	harnessViewFromSnapshot,
	mergeHarnessSessions,
	syncLivePanesFocus,
} from "../src/harness-session-view.js";
import type {
	InSessionPaneLeaf,
	InSessionPanes,
	InSessionWindow,
} from "../src/in-session-panes.js";

// ---------------------------------------------------------------- fixtures

const leaf = (patch: Partial<InSessionPaneLeaf> = {}): InSessionPaneLeaf => ({
	id: "pane-0",
	index: 0,
	active: false,
	width: 80,
	height: 24,
	capture: "",
	...patch,
});

const window_ = (
	name: string,
	patch: Partial<InSessionWindow> = {},
): InSessionWindow => ({
	name,
	target: `hobo:${name}`,
	kind: "coding-agent",
	...patch,
});

const live = (patch: Partial<InSessionPanes> = {}): InSessionPanes => ({
	session: "hobo",
	windows: [window_("claude")],
	focused: 0,
	capture: "live capture",
	note: "",
	tmux: true,
	...patch,
});

const pane = (patch: Partial<HarnessPaneView> = {}): HarnessPaneView => ({
	id: "pane-1",
	title: "shell",
	focused: false,
	capture: "",
	...patch,
});

const node = (
	id: string,
	tabs: HarnessSessionNode["tabs"],
): HarnessSessionNode => ({
	id,
	name: id,
	branch: "feature",
	lifecycle: "running",
	revision: 1,
	tabs,
});

const oneTab = (panes: readonly HarnessPaneView[] = [pane()]) => [
	{ id: "tab-1", title: "main", panes },
];

// SAFETY: the fixture is the snapshot shape the builder reads.
const snap = (patch: Record<string, unknown>) => patch as never;

// ------------------------------------------------------------------- tests

describe("the empty view", () => {
	it("has no sessions", () => {
		expect(emptyHarnessSessionView().sessions).toEqual([]);
	});

	it("puts every cursor at zero", () => {
		// Not -1: the indices are used directly, and a sentinel would have to be
		// checked at every read.
		const view = emptyHarnessSessionView();
		expect([view.focusedSession, view.focusedTab, view.focusedPane]).toEqual([
			0, 0, 0,
		]);
	});
});

describe("from a live tmux mux", () => {
	it("makes one session", () => {
		// A flat mux is one workspace; the hierarchy above it is synthetic.
		expect(harnessViewFromLivePanes(live()).sessions).toHaveLength(1);
	});

	it("names the session after the mux", () => {
		expect(harnessViewFromLivePanes(live()).sessions[0]?.id).toBe("hobo");
	});

	it("makes one tab per window", () => {
		expect(
			harnessViewFromLivePanes(
				live({ windows: [window_("claude"), window_("codex")] }),
			).sessions[0]?.tabs,
		).toHaveLength(2);
	});

	it("synthesises a pane for a window tmux did not split", () => {
		// An unsplit window has no pane listing; the tab still needs a leaf for
		// the capture to live on.
		expect(
			harnessViewFromLivePanes(live()).sessions[0]?.tabs[0]?.panes,
		).toHaveLength(1);
	});

	it("uses the window target as the synthetic pane id", () => {
		expect(
			harnessViewFromLivePanes(live()).sessions[0]?.tabs[0]?.panes[0]?.id,
		).toBe("hobo:claude");
	});

	it("falls back to a name-derived id when the window has no target", () => {
		expect(
			harnessViewFromLivePanes(
				live({ windows: [window_("claude", { target: "" })] }),
			).sessions[0]?.tabs[0]?.panes[0]?.id,
		).toBe("pane-claude");
	});

	it("uses the real leaves when tmux listed them", () => {
		expect(
			harnessViewFromLivePanes(
				live({
					windows: [
						window_("claude", {
							panes: [leaf({ id: "a" }), leaf({ id: "b", index: 1 })],
						}),
					],
				}),
			).sessions[0]?.tabs[0]?.panes,
		).toHaveLength(2);
	});

	it("numbers split leaves in the title", () => {
		// One leaf keeps the plain harness label; two or more need telling
		// apart, and the number is the only thing that differs.
		const panes = harnessViewFromLivePanes(
			live({
				windows: [
					window_("claude", {
						panes: [leaf({ id: "a" }), leaf({ id: "b", index: 1 })],
					}),
				],
			}),
		).sessions[0]?.tabs[0]?.panes;
		expect(panes?.[1]?.title).toContain("2");
	});

	it("leaves an unsplit title unnumbered", () => {
		expect(
			harnessViewFromLivePanes(live()).sessions[0]?.tabs[0]?.panes[0]?.title,
		).not.toContain("· 1");
	});

	it("gives the focused leaf the live capture", () => {
		expect(
			harnessViewFromLivePanes(live()).sessions[0]?.tabs[0]?.panes[0]?.capture,
		).toBe("live capture");
	});

	it("prefers a leaf's own capture over the session one", () => {
		expect(
			harnessViewFromLivePanes(
				live({
					windows: [window_("claude", { panes: [leaf({ capture: "mine" })] })],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.capture,
		).toBe("mine");
	});

	it("takes an unfocused window's capture from the by-name map", () => {
		// Only the focused window has a live capture; the rest come from
		// whatever was last read for them.
		expect(
			harnessViewFromLivePanes(
				live({ windows: [window_("claude"), window_("codex")] }),
				{ captureByName: { codex: "stale codex" } },
			).sessions[0]?.tabs[1]?.panes[0]?.capture,
		).toBe("stale codex");
	});

	it("leaves an unfocused window blank when the map has nothing", () => {
		expect(
			harnessViewFromLivePanes(
				live({ windows: [window_("claude"), window_("codex")] }),
			).sessions[0]?.tabs[1]?.panes[0]?.capture,
		).toBe("");
	});

	it("marks only the focused leaf as working", () => {
		const tabs = harnessViewFromLivePanes(
			live({ windows: [window_("claude"), window_("codex")] }),
		).sessions[0]?.tabs;
		expect(tabs?.[0]?.panes[0]?.agentStatus).toBe("working");
		expect(tabs?.[1]?.panes[0]?.agentStatus).toBe("idle");
	});

	it("follows the active flag for an unfocused window's leaf", () => {
		// tmux's own idea of which leaf is active, for a window the user is not
		// currently looking at.
		expect(
			harnessViewFromLivePanes(
				live({
					windows: [
						window_("claude"),
						window_("codex", {
							panes: [leaf({ id: "a" }), leaf({ id: "b", active: true })],
						}),
					],
				}),
			).sessions[0]?.tabs[1]?.panes[1]?.capture,
		).toBe("");
	});

	it("clamps a focused window past the end", () => {
		expect(harnessViewFromLivePanes(live({ focused: 9 })).focusedTab).toBe(0);
	});

	it("clamps a negative focused window", () => {
		expect(harnessViewFromLivePanes(live({ focused: -3 })).focusedTab).toBe(0);
	});

	it("clamps a focused leaf past the end", () => {
		expect(harnessViewFromLivePanes(live({ focusedPane: 9 })).focusedPane).toBe(
			0,
		);
	});

	it("defaults the focused leaf to the first", () => {
		expect(harnessViewFromLivePanes(live()).focusedPane).toBe(0);
	});

	it("keeps a focused leaf that is in range", () => {
		expect(
			harnessViewFromLivePanes(
				live({
					windows: [
						window_("claude", {
							panes: [leaf({ id: "a" }), leaf({ id: "b", index: 1 })],
						}),
					],
					focusedPane: 1,
				}),
			).focusedPane,
		).toBe(1);
	});

	it("says running while tmux is up", () => {
		expect(harnessViewFromLivePanes(live()).sessions[0]?.lifecycle).toBe(
			"running",
		);
	});

	it("says stopped when it is not", () => {
		// The mux is the session here; without tmux there is nothing running,
		// whatever the window list still says.
		expect(
			harnessViewFromLivePanes(live({ tmux: false })).sessions[0]?.lifecycle,
		).toBe("stopped");
	});

	it("defaults the branch when none is given", () => {
		expect(harnessViewFromLivePanes(live()).sessions[0]?.branch).toBe(
			"in-session",
		);
	});

	it("takes a branch when one is given", () => {
		expect(
			harnessViewFromLivePanes(live(), { branch: "feature" }).sessions[0]
				?.branch,
		).toBe("feature");
	});

	it("handles a mux with no windows", () => {
		expect(
			harnessViewFromLivePanes(live({ windows: [] })).sessions[0]?.tabs,
		).toEqual([]);
	});
});

describe("from a resident snapshot", () => {
	const base = (patch: Record<string, unknown> = {}) =>
		snap({
			session: {
				id: "s1",
				name: "work",
				branch: "feature",
				lifecycleState: 2,
			},
			tabs: [{ id: "t1", title: "main" }],
			panes: [{ id: "p1", tabId: "t1", title: "shell" }],
			agentRuns: [],
			focusedTabId: "t1",
			focusedPaneId: "p1",
			revision: 4n,
			...patch,
		});

	it("returns the empty view with no session", () => {
		expect(harnessViewFromSnapshot(base({ session: undefined }))).toEqual(
			emptyHarnessSessionView(),
		);
	});

	it("carries the session identity", () => {
		expect(harnessViewFromSnapshot(base()).sessions[0]?.name).toBe("work");
	});

	it("converts the revision to a number", () => {
		// It arrives as a bigint and is only ever displayed.
		expect(harnessViewFromSnapshot(base()).sessions[0]?.revision).toBe(4);
	});

	it("treats a missing revision as zero", () => {
		expect(
			harnessViewFromSnapshot(base({ revision: undefined })).sessions[0]
				?.revision,
		).toBe(0);
	});

	it.each([
		[1, "starting"],
		[2, "running"],
		[3, "stopping"],
		[4, "stopped"],
		[5, "failed"],
	])("labels lifecycle %i as %s", (state, label) => {
		expect(
			harnessViewFromSnapshot(
				base({
					session: { id: "s1", name: "w", branch: "b", lifecycleState: state },
				}),
			).sessions[0]?.lifecycle,
		).toBe(label);
	});

	it("labels an unknown lifecycle rather than showing the number", () => {
		expect(
			harnessViewFromSnapshot(
				base({
					session: { id: "s1", name: "w", branch: "b", lifecycleState: 99 },
				}),
			).sessions[0]?.lifecycle,
		).toBe("unknown");
	});

	it("groups panes under their own tab", () => {
		const tabs = harnessViewFromSnapshot(
			base({
				tabs: [
					{ id: "t1", title: "a" },
					{ id: "t2", title: "b" },
				],
				panes: [
					{ id: "p1", tabId: "t1", title: "one" },
					{ id: "p2", tabId: "t2", title: "two" },
				],
			}),
		).sessions[0]?.tabs;
		expect(tabs?.[1]?.panes[0]?.id).toBe("p2");
	});

	it("synthesises an empty pane for a tab with none", () => {
		// A tab that renders as nothing looks like one that failed to load, and
		// the focus arithmetic indexes into `panes` without checking.
		const tabs = harnessViewFromSnapshot(base({ panes: [], focusedPaneId: "" }))
			.sessions[0]?.tabs;
		expect(tabs?.[0]?.panes[0]?.id).toBe("t1:empty");
	});

	it("focuses a synthesised pane when its tab is focused", () => {
		const tabs = harnessViewFromSnapshot(base({ panes: [], focusedPaneId: "" }))
			.sessions[0]?.tabs;
		expect(tabs?.[0]?.panes[0]?.focused).toBe(true);
	});

	it("labels a pane with its live agent's provider", () => {
		expect(
			harnessViewFromSnapshot(
				base({
					agentRuns: [
						{ id: "r1", paneId: "p1", provider: "claude", lifecycleState: 3 },
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.agent,
		).toBe("claude");
	});

	it.each([
		[2, "idle"],
		[3, "working"],
		[4, "blocked"],
	])("maps agent state %i to %s", (state, status) => {
		expect(
			harnessViewFromSnapshot(
				base({
					agentRuns: [
						{
							id: "r1",
							paneId: "p1",
							provider: "claude",
							lifecycleState: state,
						},
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.agentStatus,
		).toBe(status);
	});

	it.each([5, 6, 7])("ignores a run that has finished in state %i", (state) => {
		// Matching on pane id alone would label a pane with the provider of a
		// run that already ended.
		expect(
			harnessViewFromSnapshot(
				base({
					agentRuns: [
						{
							id: "r1",
							paneId: "p1",
							provider: "claude",
							lifecycleState: state,
						},
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.agent,
		).toBeUndefined();
	});

	it("reports unknown when there is no live run", () => {
		expect(
			harnessViewFromSnapshot(base()).sessions[0]?.tabs[0]?.panes[0]
				?.agentStatus,
		).toBe("unknown");
	});

	it("falls back to the provider for an untitled pane", () => {
		expect(
			harnessViewFromSnapshot(
				base({
					panes: [{ id: "p1", tabId: "t1", title: "" }],
					agentRuns: [
						{ id: "r1", paneId: "p1", provider: "claude", lifecycleState: 3 },
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.title,
		).toBe("claude");
	});

	it("falls back to the tab title when there is neither", () => {
		expect(
			harnessViewFromSnapshot(
				base({ panes: [{ id: "p1", tabId: "t1", title: "" }] }),
			).sessions[0]?.tabs[0]?.panes[0]?.title,
		).toBe("main");
	});

	it("attaches a capture by pane id", () => {
		expect(
			harnessViewFromSnapshot(base(), {
				captureByPaneId: { p1: "hello" },
			}).sessions[0]?.tabs[0]?.panes[0]?.capture,
		).toBe("hello");
	});

	it("leaves a pane with no capture blank", () => {
		expect(
			harnessViewFromSnapshot(base()).sessions[0]?.tabs[0]?.panes[0]?.capture,
		).toBe("");
	});

	it("finds the focused tab", () => {
		expect(
			harnessViewFromSnapshot(
				base({
					tabs: [
						{ id: "t1", title: "a" },
						{ id: "t2", title: "b" },
					],
					panes: [{ id: "p2", tabId: "t2", title: "two" }],
					focusedTabId: "t2",
					focusedPaneId: "p2",
				}),
			).focusedTab,
		).toBe(1);
	});

	it("falls back to the first tab when the focused one is missing", () => {
		expect(
			harnessViewFromSnapshot(base({ focusedTabId: "nope" })).focusedTab,
		).toBe(0);
	});

	it("falls back to the first pane when the focused one is missing", () => {
		expect(
			harnessViewFromSnapshot(base({ focusedPaneId: "nope" })).focusedPane,
		).toBe(0);
	});

	it("handles a snapshot with no tabs at all", () => {
		expect(
			harnessViewFromSnapshot(base({ tabs: [], panes: [] })).sessions[0]?.tabs,
		).toEqual([]);
	});
});

describe("merging session nodes", () => {
	it("returns the empty view for no nodes", () => {
		expect(mergeHarnessSessions([])).toEqual(emptyHarnessSessionView());
	});

	it("keeps every node", () => {
		expect(
			mergeHarnessSessions([node("a", oneTab()), node("b", oneTab())]).sessions,
		).toHaveLength(2);
	});

	it("defaults focus to the first of everything", () => {
		const view = mergeHarnessSessions([node("a", oneTab())]);
		expect([view.focusedSession, view.focusedTab, view.focusedPane]).toEqual([
			0, 0, 0,
		]);
	});

	it("takes the focus it is given", () => {
		expect(
			mergeHarnessSessions([node("a", oneTab()), node("b", oneTab())], {
				session: 1,
			}).focusedSession,
		).toBe(1);
	});

	it("clamps a session index past the end", () => {
		expect(
			mergeHarnessSessions([node("a", oneTab())], { session: 9 })
				.focusedSession,
		).toBe(0);
	});

	it("clamps a tab index past the end", () => {
		expect(
			mergeHarnessSessions([node("a", oneTab())], { tab: 9 }).focusedTab,
		).toBe(0);
	});

	it("clamps a pane index past the end", () => {
		expect(
			mergeHarnessSessions([node("a", oneTab())], { pane: 9 }).focusedPane,
		).toBe(0);
	});

	it("clamps a negative index", () => {
		expect(
			mergeHarnessSessions([node("a", oneTab())], { session: -5 })
				.focusedSession,
		).toBe(0);
	});

	it("holds at zero for a session with no tabs", () => {
		// `clampIndex` returns 0 for an empty list rather than -1, so the
		// downstream reads get an index they can use.
		expect(mergeHarnessSessions([node("a", [])], { tab: 3 }).focusedTab).toBe(
			0,
		);
	});

	it("holds at zero for a tab with no panes", () => {
		expect(
			mergeHarnessSessions([node("a", [{ id: "t", title: "t", panes: [] }])], {
				pane: 3,
			}).focusedPane,
		).toBe(0);
	});
});

describe("from a live herdr api snapshot", () => {
	const api = (patch: Record<string, unknown> = {}) => ({
		focused_workspace_id: "w1",
		workspaces: [{ workspace_id: "w1", label: "Work" }],
		tabs: [{ tab_id: "t1", workspace_id: "w1", label: "main" }],
		panes: [{ pane_id: "p1", tab_id: "t1", workspace_id: "w1", focused: true }],
		...patch,
	});

	it("makes a session per workspace", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					workspaces: [
						{ workspace_id: "w1", label: "A" },
						{ workspace_id: "w2", label: "B" },
					],
				}),
			).sessions,
		).toHaveLength(2);
	});

	it("uses the workspace label as the name", () => {
		expect(harnessViewFromHerdrApiSnapshot(api()).sessions[0]?.name).toBe(
			"Work",
		);
	});

	it("falls back to the workspace id when unlabelled", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({ workspaces: [{ workspace_id: "w1" }] }),
			).sessions[0]?.name,
		).toBe("w1");
	});

	it("derives the branch from the last two path segments", () => {
		// A checkout path is long and mostly shared; the tail is the part that
		// distinguishes one worktree from another.
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					workspaces: [
						{
							workspace_id: "w1",
							worktree: { checkout_path: "/home/me/repos/app/feature-x" },
						},
					],
				}),
			).sessions[0]?.branch,
		).toBe("app/feature-x");
	});

	it("falls back to herdr with no worktree", () => {
		expect(harnessViewFromHerdrApiSnapshot(api()).sessions[0]?.branch).toBe(
			"herdr",
		);
	});

	it("groups tabs under their own workspace", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
					tabs: [
						{ tab_id: "t1", workspace_id: "w1" },
						{ tab_id: "t2", workspace_id: "w2" },
					],
					panes: [],
				}),
			).sessions[1]?.tabs[0]?.id,
		).toBe("t2");
	});

	it("synthesises an empty pane for a tab with none", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(api({ panes: [] })).sessions[0]?.tabs[0]
				?.panes[0]?.id,
		).toBe("t1:empty");
	});

	it("focuses a synthesised pane when its tab was focused", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					panes: [],
					tabs: [
						{ tab_id: "t1", workspace_id: "w1", label: "m", focused: true },
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.focused,
		).toBe(true);
	});

	it("prefers the stripped terminal title", () => {
		// The terminal's own title is what the agent is actually doing; the tab
		// label is only what it was opened as.
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					panes: [
						{
							pane_id: "p1",
							tab_id: "t1",
							workspace_id: "w1",
							terminal_title_stripped: "running tests",
						},
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.title,
		).toBe("running tests");
	});

	it("falls back to the tab label", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(api()).sessions[0]?.tabs[0]?.panes[0]
				?.title,
		).toBe("main");
	});

	it("falls back to the agent name", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					tabs: [{ tab_id: "t1", workspace_id: "w1" }],
					panes: [
						{
							pane_id: "p1",
							tab_id: "t1",
							workspace_id: "w1",
							agent: "claude",
						},
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.title,
		).toBe("claude");
	});

	it("falls back to the pane id when there is nothing else", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					tabs: [{ tab_id: "t1", workspace_id: "w1" }],
					panes: [{ pane_id: "p1", tab_id: "t1", workspace_id: "w1" }],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.title,
		).toBe("p1");
	});

	it("labels a pane that names an agent", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					panes: [
						{
							pane_id: "p1",
							tab_id: "t1",
							workspace_id: "w1",
							agent: "claude",
						},
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.agentLabel,
		).toBeDefined();
	});

	it("leaves a pane with no agent unlabelled", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(api()).sessions[0]?.tabs[0]?.panes[0]
				?.agent,
		).toBeUndefined();
	});

	it("carries the agent status through", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					panes: [
						{
							pane_id: "p1",
							tab_id: "t1",
							workspace_id: "w1",
							agent_status: "working",
						},
					],
				}),
			).sessions[0]?.tabs[0]?.panes[0]?.agentStatus,
		).toBe("working");
	});

	it("says unknown with no status", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(api()).sessions[0]?.tabs[0]?.panes[0]
				?.agentStatus,
		).toBe("unknown");
	});

	it("finds the named focused workspace", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					focused_workspace_id: "w2",
					workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
					tabs: [{ tab_id: "t2", workspace_id: "w2" }],
					panes: [],
				}),
			).focusedSession,
		).toBe(1);
	});

	it("falls back to a workspace flagged focused", () => {
		// Two ways the payload can say it; the explicit id wins when present.
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					focused_workspace_id: undefined,
					workspaces: [
						{ workspace_id: "w1" },
						{ workspace_id: "w2", focused: true },
					],
					tabs: [{ tab_id: "t2", workspace_id: "w2" }],
					panes: [],
				}),
			).focusedSession,
		).toBe(1);
	});

	it("falls back to the first workspace", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					focused_workspace_id: undefined,
					workspaces: [{ workspace_id: "w1" }, { workspace_id: "w2" }],
				}),
			).focusedSession,
		).toBe(0);
	});

	it("focuses the tab that holds a focused pane", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(
				api({
					tabs: [
						{ tab_id: "t1", workspace_id: "w1" },
						{ tab_id: "t2", workspace_id: "w1" },
					],
					panes: [
						{ pane_id: "p1", tab_id: "t1", workspace_id: "w1" },
						{
							pane_id: "p2",
							tab_id: "t2",
							workspace_id: "w1",
							focused: true,
						},
					],
				}),
			).focusedTab,
		).toBe(1);
	});

	it("handles a snapshot with no workspaces", () => {
		expect(
			harnessViewFromHerdrApiSnapshot({ workspaces: [] }).sessions,
		).toEqual([]);
	});

	it("handles a snapshot with nothing in it at all", () => {
		expect(harnessViewFromHerdrApiSnapshot({})).toEqual(
			emptyHarnessSessionView(),
		);
	});

	it("attaches captures by pane id", () => {
		expect(
			harnessViewFromHerdrApiSnapshot(api(), {
				captureByPaneId: { p1: "output" },
			}).sessions[0]?.tabs[0]?.panes[0]?.capture,
		).toBe("output");
	});
});

describe("reading the focused pane", () => {
	const view = (focus: { pane?: number } = {}) =>
		mergeHarnessSessions(
			[
				node("s", [
					{
						id: "t1",
						title: "main",
						panes: [
							pane({ id: "p1", agent: "claude" }),
							pane({ id: "p2", agent: "codex" }),
						],
					},
				]),
			],
			focus,
		);

	it("returns the pane at the cursor", () => {
		expect(focusedHarnessPane(view({ pane: 1 }))?.id).toBe("p2");
	});

	it("returns the first pane by default", () => {
		expect(focusedHarnessPane(view())?.id).toBe("p1");
	});

	it("returns undefined on an empty view", () => {
		expect(focusedHarnessPane(emptyHarnessSessionView())).toBeUndefined();
	});

	it("falls back to a pane that says it is focused", () => {
		// The cursor and the flag are two sources; the flag is what a foreign
		// snapshot carries.
		expect(
			focusedHarnessPane({
				sessions: [
					node("s", [
						{
							id: "t",
							title: "t",
							panes: [pane({ id: "p1", focused: true })],
						},
					]),
				],
				focusedSession: 0,
				focusedTab: 0,
				focusedPane: 9,
			})?.id,
		).toBe("p1");
	});

	it("names the focused agent", () => {
		expect(focusedHarnessAgentId(view())).toBe("claude");
	});

	it("names no agent when the pane has none", () => {
		expect(focusedHarnessAgentId(emptyHarnessSessionView())).toBeUndefined();
	});
});

describe("cycling focus", () => {
	const two = mergeHarnessSessions([
		node("s1", [
			{ id: "t1", title: "a", panes: [pane({ id: "p1" }), pane({ id: "p2" })] },
			{ id: "t2", title: "b", panes: [pane({ id: "p3" })] },
		]),
		node("s2", oneTab()),
	]);

	it("does nothing on an empty view", () => {
		const empty = emptyHarnessSessionView();
		expect(cycleHarnessFocus(empty, "session", 1)).toBe(empty);
	});

	it("moves to the next session", () => {
		expect(cycleHarnessFocus(two, "session", 1).focusedSession).toBe(1);
	});

	it("wraps past the last session", () => {
		expect(
			cycleHarnessFocus({ ...two, focusedSession: 1 }, "session", 1)
				.focusedSession,
		).toBe(0);
	});

	it("wraps backward past the first", () => {
		expect(cycleHarnessFocus(two, "session", -1).focusedSession).toBe(1);
	});

	it("resets tab and pane when the session changes", () => {
		// The old indices mean nothing in a different session's tree, and
		// carrying them across is how focus lands on an unrelated pane.
		const moved = cycleHarnessFocus(
			{ ...two, focusedTab: 1, focusedPane: 0 },
			"session",
			1,
		);
		expect([moved.focusedTab, moved.focusedPane]).toEqual([0, 0]);
	});

	it("moves to the next tab", () => {
		expect(cycleHarnessFocus(two, "tab", 1).focusedTab).toBe(1);
	});

	it("wraps tabs", () => {
		expect(
			cycleHarnessFocus({ ...two, focusedTab: 1 }, "tab", 1).focusedTab,
		).toBe(0);
	});

	it("resets the pane when the tab changes", () => {
		expect(
			cycleHarnessFocus({ ...two, focusedPane: 1 }, "tab", 1).focusedPane,
		).toBe(0);
	});

	it("moves to the next pane", () => {
		expect(cycleHarnessFocus(two, "pane", 1).focusedPane).toBe(1);
	});

	it("wraps panes", () => {
		expect(
			cycleHarnessFocus({ ...two, focusedPane: 1 }, "pane", 1).focusedPane,
		).toBe(0);
	});

	it("does nothing when the session has no tabs", () => {
		const none = mergeHarnessSessions([node("s", [])]);
		expect(cycleHarnessFocus(none, "tab", 1)).toBe(none);
	});

	it("does nothing when the tab has no panes", () => {
		const none = mergeHarnessSessions([
			node("s", [{ id: "t", title: "t", panes: [] }]),
		]);
		expect(cycleHarnessFocus(none, "pane", 1)).toBe(none);
	});

	it("falls back to the first tab when the cursor is past the end", () => {
		expect(
			cycleHarnessFocus({ ...two, focusedTab: 9 }, "pane", 1).focusedPane,
		).toBe(1);
	});
});

describe("the leaf cycle", () => {
	it("cycles panes when the tab is split", () => {
		// `[` and `]` mean "next thing" -- which is a pane in a split tab and a
		// tab everywhere else, because most agent tabs are single-pane.
		const split = mergeHarnessSessions([
			node("s", [
				{
					id: "t1",
					title: "a",
					panes: [pane({ id: "p1" }), pane({ id: "p2" })],
				},
				{ id: "t2", title: "b", panes: [pane({ id: "p3" })] },
			]),
		]);
		expect(cycleHarnessLeaf(split, 1).focusedPane).toBe(1);
	});

	it("keeps the tab when it cycles panes", () => {
		const split = mergeHarnessSessions([
			node("s", [
				{
					id: "t1",
					title: "a",
					panes: [pane({ id: "p1" }), pane({ id: "p2" })],
				},
				{ id: "t2", title: "b", panes: [pane({ id: "p3" })] },
			]),
		]);
		expect(cycleHarnessLeaf(split, 1).focusedTab).toBe(0);
	});

	it("cycles tabs when the tab is not split", () => {
		const flat = mergeHarnessSessions([
			node("s", [
				{ id: "t1", title: "a", panes: [pane({ id: "p1" })] },
				{ id: "t2", title: "b", panes: [pane({ id: "p2" })] },
			]),
		]);
		expect(cycleHarnessLeaf(flat, 1).focusedTab).toBe(1);
	});

	it("cycles tabs when there is no tab at the cursor", () => {
		const none = mergeHarnessSessions([node("s", [])]);
		expect(cycleHarnessLeaf(none, 1)).toBe(none);
	});
});

describe("syncing tmux focus back", () => {
	it("carries the pane cursor across", () => {
		expect(
			syncLivePanesFocus(live(), {
				...emptyHarnessSessionView(),
				focusedPane: 2,
			}).focusedPane,
		).toBe(2);
	});

	it("leaves the window alone when the view names no agent", () => {
		expect(
			syncLivePanesFocus(live({ focused: 0 }), emptyHarnessSessionView())
				.focused,
		).toBe(0);
	});

	it("leaves the window alone when there are no windows", () => {
		const view = harnessViewFromLivePanes(live());
		expect(syncLivePanesFocus(live({ windows: [] }), view).focused).toBe(0);
	});

	it("moves the window to the view's agent", () => {
		const panes = live({ windows: [window_("claude"), window_("codex")] });
		const view = cycleHarnessFocus(harnessViewFromLivePanes(panes), "tab", 1);
		expect(syncLivePanesFocus(panes, view).focused).toBe(1);
	});

	it("leaves the window alone for an agent tmux does not have", () => {
		const view = harnessViewFromLivePanes(
			live({ windows: [window_("gemini")] }),
		);
		expect(
			syncLivePanesFocus(live({ windows: [window_("claude")] }), view).focused,
		).toBe(0);
	});

	it("keeps the capture when the focus did not actually move", () => {
		const panes = live();
		const view = harnessViewFromLivePanes(panes);
		expect(syncLivePanesFocus(panes, view).capture).toBe("live capture");
	});

	it("drops the capture when the focus moved", () => {
		// The capture belongs to the window that was focused. Carrying it onto
		// a different one would show the wrong agent's output.
		const panes = live({ windows: [window_("claude"), window_("codex")] });
		const view = cycleHarnessFocus(harnessViewFromLivePanes(panes), "tab", 1);
		expect(syncLivePanesFocus(panes, view).capture).toBe("");
	});
});

describe("the capture grid", () => {
	it("says so with no panes", () => {
		expect(formatPaneCaptureGrid([], 0)).toEqual(["(no panes)"]);
	});

	it("renders a single pane's capture full width", () => {
		expect(
			formatPaneCaptureGrid([pane({ capture: "hello\nworld" })], 0),
		).toHaveLength(2);
	});

	it("says a single empty pane is waiting", () => {
		expect(
			formatPaneCaptureGrid([pane({ agentLabel: "Claude" })], 0)[0],
		).toContain("waiting");
	});

	it("names the waiting pane", () => {
		expect(
			formatPaneCaptureGrid([pane({ agentLabel: "Claude" })], 0)[0],
		).toContain("Claude");
	});

	it("falls back to the title for a waiting pane", () => {
		expect(formatPaneCaptureGrid([pane({ title: "shell" })], 0)[0]).toContain(
			"shell",
		);
	});

	it("treats a whitespace-only capture as empty", () => {
		// A pane that has printed only newlines has not said anything, and a
		// grid of blank rows reads as a broken pane rather than a quiet one.
		expect(
			formatPaneCaptureGrid([pane({ capture: "  \n \n" })], 0)[0],
		).toContain("waiting");
	});

	it("puts two panes side by side", () => {
		const grid = formatPaneCaptureGrid(
			[pane({ id: "a", capture: "one" }), pane({ id: "b", capture: "two" })],
			0,
		);
		expect(grid.some((line) => line.includes("│"))).toBe(true);
	});

	it("marks the focused column", () => {
		expect(
			formatPaneCaptureGrid([pane({ id: "a" }), pane({ id: "b" })], 0)[0],
		).toContain("▶");
	});

	it("says focus on the marked column when detached", () => {
		expect(
			formatPaneCaptureGrid([pane({ id: "a" }), pane({ id: "b" })], 0)[0],
		).toContain("focus");
	});

	it("says keys instead when attached", () => {
		// Attached, the column is taking keystrokes rather than offering to.
		expect(
			formatPaneCaptureGrid([pane({ id: "a" }), pane({ id: "b" })], 0, {
				attached: true,
			})[0],
		).toContain("keys");
	});

	it("labels an empty column", () => {
		expect(
			formatPaneCaptureGrid([pane({ id: "a" }), pane({ id: "b" })], 0).join(
				"\n",
			),
		).toContain("(empty)");
	});

	it("caps at three columns", () => {
		const grid = formatPaneCaptureGrid(
			Array.from({ length: 5 }, (_u, i) => pane({ id: `p${i}` })),
			0,
		);
		expect(grid.join("\n")).toContain("+2 more");
	});

	it("does not announce more panes when all fit", () => {
		expect(
			formatPaneCaptureGrid([pane({ id: "a" }), pane({ id: "b" })], 0).join(
				"\n",
			),
		).not.toContain("more");
	});

	it("keeps every row the same width", () => {
		const grid = formatPaneCaptureGrid(
			[pane({ id: "a", capture: "one" }), pane({ id: "b", capture: "two" })],
			0,
			{ contentWidth: 60 },
		);
		expect(new Set(grid.map((l) => [...l].length)).size).toBe(1);
	});

	it("holds a minimum width", () => {
		// Below it a column is narrower than the mark and a first character.
		const grid = formatPaneCaptureGrid(
			[pane({ id: "a" }), pane({ id: "b" })],
			0,
			{ contentWidth: 4 },
		);
		expect([...(grid[0] ?? "")].length).toBeGreaterThanOrEqual(24);
	});

	it("still honours the deprecated column width", () => {
		expect(
			formatPaneCaptureGrid([pane({ id: "a" }), pane({ id: "b" })], 0, {
				colWidth: 20,
			})[0],
		).toBeDefined();
	});

	it("pads short columns to the tallest", () => {
		// Ragged columns would let one pane's output run into the next row of
		// another's.
		const grid = formatPaneCaptureGrid(
			[
				pane({ id: "a", capture: "1\n2\n3\n4\n5" }),
				pane({ id: "b", capture: "1" }),
			],
			0,
		);
		expect(new Set(grid.map((l) => [...l].length)).size).toBe(1);
	});

	it("keeps the whole capture rather than slicing it", () => {
		// The source says what the bug was: slicing to the first N lines hid
		// every new turn under the oldest ones.
		const grid = formatPaneCaptureGrid(
			[
				pane({
					id: "a",
					capture: Array.from({ length: 40 }, (_u, i) => `l${i}`).join("\n"),
				}),
				pane({ id: "b" }),
			],
			0,
		);
		expect(grid.join("\n")).toContain("l39");
	});
});

describe("the agents CRT lines", () => {
	const view = mergeHarnessSessions([
		node("s1", [
			{
				id: "t1",
				title: "main",
				panes: [
					pane({ id: "p1", agentLabel: "Claude", agentStatus: "working" }),
					pane({ id: "p2", agentLabel: "Codex" }),
				],
			},
			{ id: "t2", title: "other", panes: [pane({ id: "p3" })] },
		]),
	]);

	it("offers a way in when there are no sessions", () => {
		const empty = formatHarnessSessionLines(emptyHarnessSessionView());
		expect(empty[0]).toContain("no harness sessions");
	});

	it("names the keys even with nothing to show", () => {
		expect(formatHarnessSessionLines(emptyHarnessSessionView())[1]).toContain(
			"Enter attaches",
		);
	});

	it("heads with the session identity", () => {
		expect(formatHarnessSessionLines(view)[0]).toContain("s1");
	});

	it("shows the revision", () => {
		expect(formatHarnessSessionLines(view)[0]).toContain("r1");
	});

	it("brackets the focused tab", () => {
		expect(formatHarnessSessionLines(view).join("\n")).toContain("[main]");
	});

	it("leaves other tabs unbracketed", () => {
		expect(formatHarnessSessionLines(view).join("\n")).toContain("· other");
	});

	it("counts the leaves on a split tab", () => {
		expect(formatHarnessSessionLines(view).join("\n")).toContain("2 leaves");
	});

	it("just says new pane on an unsplit tab", () => {
		expect(
			formatHarnessSessionLines({ ...view, focusedTab: 1 }).join("\n"),
		).toContain("New pane");
	});

	it("marks the focused pane", () => {
		expect(formatHarnessSessionLines(view).join("\n")).toContain("focused");
	});

	it("offers the pane actions under the focused row only", () => {
		const actions = formatHarnessSessionLines(view).filter((l) =>
			l.includes("Start agent"),
		);
		expect(actions).toHaveLength(1);
	});

	it("shortens a long pane id", () => {
		// The id is for disambiguation, not for reading; the row has a title
		// and a status that matter more.
		expect(
			formatHarnessSessionLines(
				mergeHarnessSessions([
					node("s", oneTab([pane({ id: "a-very-long-pane-identifier" })])),
				]),
			).join("\n"),
		).toContain("…");
	});

	it("keeps a short pane id whole", () => {
		expect(
			formatHarnessSessionLines(
				mergeHarnessSessions([node("s", oneTab([pane({ id: "p1" })]))]),
			).join("\n"),
		).toContain("p1");
	});

	it("names the agent on a pane that has one", () => {
		expect(formatHarnessSessionLines(view).join("\n")).toContain("Claude");
	});

	it("says unknown for a pane with no status", () => {
		expect(
			formatHarnessSessionLines(
				mergeHarnessSessions([node("s", oneTab())]),
			).join("\n"),
		).toContain("unknown");
	});

	it("ends with the prompt line", () => {
		expect(formatHarnessSessionLines(view).at(-1)).toContain("❯ prompt");
	});

	it("names the pane the prompt would steer", () => {
		expect(formatHarnessSessionLines(view).at(-1)).toContain("Claude");
	});

	it("drops the chrome when attached", () => {
		// Attached, the glass is the split; chrome would take rows from the
		// thing being watched.
		expect(
			formatHarnessSessionLines(view, { attached: true }).join("\n"),
		).not.toContain("Stop session");
	});

	it("says which leaf is focused when attached", () => {
		expect(formatHarnessSessionLines(view, { attached: true })[0]).toContain(
			"1/2",
		);
	});

	it("says one of one on an unsplit tab when attached", () => {
		expect(
			formatHarnessSessionLines(
				{ ...view, focusedTab: 1 },
				{ attached: true },
			)[0],
		).toContain("1/1");
	});

	it("names how to leave when attached", () => {
		expect(formatHarnessSessionLines(view, { attached: true })[0]).toContain(
			"leave",
		);
	});

	it("renders a session with no tabs", () => {
		expect(
			formatHarnessSessionLines(mergeHarnessSessions([node("s", [])])).join(
				"\n",
			),
		).toContain("s");
	});

	it("takes a content width", () => {
		const wide = formatHarnessSessionLines(view, { contentWidth: 100 });
		const narrow = formatHarnessSessionLines(view, { contentWidth: 40 });
		expect(wide).not.toEqual(narrow);
	});

	it("holds a minimum content width", () => {
		expect(formatHarnessSessionLines(view, { contentWidth: 1 })).toBeDefined();
	});
});
