/**
 * Executing herdr chrome actions against the two backends they can land on.
 *
 * `harness-session-actions.test.ts` covers the pure helpers — slash parsing,
 * mux classification, tab naming. This file drives the two functions that do
 * the work: `executeMuxAction`, which talks to tmux, and `executeDurableAction`,
 * which talks to the durable session store. Between them they hold nearly all
 * the branching in the module, and none of it was reached.
 *
 * What makes these worth pinning rather than trusting:
 *
 * - Every one of these actions is destructive or creative against somebody's
 *   running agents. `stop` kills a window; picking the wrong tmux target kills
 *   the wrong agent's work, and the note the user reads would still say it
 *   stopped the one they asked for.
 * - Nearly half the branches are *failure* paths that exist to turn a tmux
 *   non-zero exit into a readable note. Untested, the usual failure is that
 *   the note interpolates an empty string and the user sees "new tab failed ·"
 *   with nothing after it — a dead end at exactly the moment they need to know
 *   what went wrong.
 * - The guards ("no focused tab to split", "no pane to focus") are the only
 *   thing standing between an empty view and an undefined dereference.
 *
 * tmux is faked, because the point is to assert *which* commands are issued
 * with which targets — a real tmux would let a wrong-but-valid target pass. The
 * durable path uses a real store on a temp home, because there the risk is the
 * opposite: a fake store would happily agree with a command the real one
 * rejects.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	executeHarnessChromeAction,
	type HarnessActionContext,
} from "../src/harness-session-actions.js";
import type {
	HarnessSessionNode,
	HarnessSessionView,
} from "../src/harness-session-view.js";
import type { InSessionPanes } from "../src/in-session-panes.js";
import type { MuxRunner } from "../src/mux.js";

function temp(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

interface FakeTmux extends MuxRunner {
	/** Every argv handed to tmux, in order, so targets can be asserted. */
	readonly calls: readonly (readonly string[])[];
}

/**
 * A tmux that answers the four queries this module's refresh path makes.
 *
 * `overrides` lets a test make one verb fail without having to restate the
 * others — the failure paths are the interesting half and each needs a
 * different exit shape.
 */
function fakeTmux(
	options: {
		readonly windows?: readonly string[];
		readonly panes?: readonly string[];
		readonly overrides?: Record<
			string,
			{ code: number; stdout?: string; stderr?: string }
		>;
	} = {},
): FakeTmux {
	const windows = options.windows ?? ["codex"];
	const panes = options.panes ?? ["%1\t0\t1\t80\t24"];
	const calls: string[][] = [];
	return {
		calls,
		async run(args) {
			calls.push([...args]);
			const verb = args[0] ?? "";
			const override = options.overrides?.[verb];
			if (override) {
				return {
					code: override.code,
					stdout: override.stdout ?? "",
					stderr: override.stderr ?? "",
				};
			}
			if (verb === "list-windows") {
				return {
					code: 0,
					stdout: windows.map((name, i) => `${name}\t%${i + 1}`).join("\n"),
				};
			}
			if (verb === "list-panes") return { code: 0, stdout: panes.join("\n") };
			if (verb === "capture-pane") return { code: 0, stdout: "output\n" };
			if (verb === "new-window" || verb === "split-window") {
				return { code: 0, stdout: "%9\n" };
			}
			return { code: 0, stdout: "" };
		},
	};
}

function muxPanes(overrides: Partial<InSessionPanes> = {}): InSessionPanes {
	return {
		session: "hobo",
		windows: [{ name: "codex", target: "%1", kind: "coding" }],
		focused: 0,
		capture: "",
		note: "",
		tmux: true,
		...overrides,
	} as InSessionPanes;
}

function muxSession(): HarnessSessionNode {
	return {
		id: "hobo",
		name: "hobo",
		branch: "in-session",
		lifecycle: "RUNNING",
		revision: 0,
		tabs: [
			{
				id: "tab-1",
				title: "codex",
				panes: [
					{
						id: "%1",
						title: "codex",
						agent: "codex",
						agentLabel: "Codex",
						focused: true,
						capture: "",
					},
				],
			},
		],
	};
}

function view(session: HarnessSessionNode): HarnessSessionView {
	return {
		sessions: [session],
		focusedSession: 0,
		focusedTab: 0,
		focusedPane: 0,
	};
}

function muxContext(
	overrides: Partial<HarnessActionContext> = {},
): HarnessActionContext {
	return {
		hoboHome: temp("hobo-chrome-home-"),
		harnessView: view(muxSession()),
		livePanes: muxPanes(),
		...overrides,
	};
}

/** The argv of the first tmux call whose verb matches. */
function callFor(tmux: FakeTmux, verb: string): readonly string[] | undefined {
	return tmux.calls.find((call) => call[0] === verb);
}

describe("choosing a backend", () => {
	it("reports plainly when nothing is focused", async () => {
		// An empty Agents surface is the ordinary state before any session is
		// seated. Reaching tmux from here would be an undefined dereference, so
		// the guard is load-bearing rather than defensive decoration.
		const result = await executeHarnessChromeAction(
			muxContext({
				harnessView: {
					sessions: [],
					focusedSession: 0,
					focusedTab: 0,
					focusedPane: 0,
				},
			}),
			{ kind: "stop" },
		);
		expect(result.note).toBe("no harness session focused");
	});

	it("says there is no mux rather than shelling out to a tmux that is absent", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({ livePanes: null }),
			{ kind: "stop" },
		);
		expect(result.note).toContain("no in-session mux");
	});

	it("treats a non-tmux pane set the same as no pane set at all", async () => {
		// `tmux: false` is what the pane set carries when tmux is installed but
		// this shell is not inside a session. The commands would all fail, so the
		// note has to come from here rather than from five failed tmux calls.
		const result = await executeHarnessChromeAction(
			muxContext({ livePanes: muxPanes({ tmux: false }) }),
			{ kind: "createTab" },
		);
		expect(result.note).toContain("no in-session mux");
	});
});

describe("detaching", () => {
	it("returns focus to chat without touching tmux", async () => {
		// Detach is a pure UI move: the session must keep running. If it issued
		// any tmux command at all, that would be the bug.
		const tmux = fakeTmux();
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "detach" },
		);
		expect(result.focus).toBe("chat");
		expect(tmux.calls).toEqual([]);
	});

	it("keeps the live panes so returning to Agents finds them", async () => {
		const panes = muxPanes();
		const result = await executeHarnessChromeAction(
			muxContext({ livePanes: panes, runner: fakeTmux() }),
			{ kind: "detach" },
		);
		expect(result.livePanes).toBe(panes);
	});
});

describe("stopping a window", () => {
	it("refuses when there is no window to stop", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({
				livePanes: muxPanes({ windows: [] }),
				runner: fakeTmux(),
			}),
			{ kind: "stop" },
		);
		expect(result.note).toBe("no focused pane to stop");
	});

	it("addresses a pane-id target by session and window name", async () => {
		// A `%`-prefixed target is a *pane* id. `kill-window -t %1` would kill
		// whichever window that pane happens to sit in — which is right only
		// until a split moves it. Naming the window is what makes this stable.
		const tmux = fakeTmux();
		await executeHarnessChromeAction(muxContext({ runner: tmux }), {
			kind: "stop",
		});
		expect(callFor(tmux, "kill-window")).toEqual([
			"kill-window",
			"-t",
			"hobo:codex",
		]);
	});

	it("passes a non-pane target through unchanged", async () => {
		// A target that is already `session:window` needs no rewriting, and
		// rewriting it anyway would double the session prefix.
		const tmux = fakeTmux();
		await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({
					windows: [{ name: "codex", target: "hobo:codex", kind: "coding" }],
				}),
			}),
			{ kind: "stop" },
		);
		expect(callFor(tmux, "kill-window")).toEqual([
			"kill-window",
			"-t",
			"hobo:codex",
		]);
	});

	it("names the stopped window in the note", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({ runner: fakeTmux() }),
			{ kind: "stop" },
		);
		expect(result.note).toBe("stopped · codex");
	});

	it("re-lists windows afterwards so the surface loses the dead one", async () => {
		// Without the refresh the killed window keeps rendering, and the next key
		// aimed at it goes to a target tmux no longer has.
		const tmux = fakeTmux({ windows: ["claude"] });
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "stop" },
		);
		expect(callFor(tmux, "list-windows")).toBeDefined();
		expect(result.livePanes?.windows.map((row) => row.name)).toEqual([
			"claude",
		]);
	});

	it("clamps the focused index when the refresh returns fewer windows", async () => {
		// Killing the last window leaves `focused` pointing past the end. Left
		// unclamped, every later action reads `windows[focused]` as undefined and
		// falls into the "no focused pane" guards forever.
		const tmux = fakeTmux({ windows: ["only"] });
		const result = await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({
					windows: [
						{ name: "a", target: "%1", kind: "coding" },
						{ name: "b", target: "%2", kind: "coding" },
						{ name: "only", target: "%3", kind: "coding" },
					],
					focused: 2,
				}),
			}),
			{ kind: "stop" },
		);
		expect(result.livePanes?.focused).toBe(0);
	});

	it("leaves the surface on Agents so the next stop needs no re-focus", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({ runner: fakeTmux() }),
			{ kind: "stop" },
		);
		expect(result.focus).toBe("agents");
	});
});

describe("creating a tab", () => {
	it("names the new tab after the focused window's agent", async () => {
		// Tab names are how a user tells two codex runs apart. Losing the agent id
		// turns the second one into an anonymous shell.
		const tmux = fakeTmux();
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createTab" },
		);
		expect(result.note).toBe("new tab · codex-2");
	});

	it("falls back to the focused pane's agent when there is no window", async () => {
		// A durable-looking view with an empty mux window list still knows which
		// agent the user is looking at; that is a better name than "agent".
		const tmux = fakeTmux({ windows: [] });
		const result = await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({ windows: [] }),
			}),
			{ kind: "createTab" },
		);
		expect(result.note).toBe("new tab · codex-2");
	});

	it('falls back to "agent" when nothing names one', async () => {
		const session = muxSession();
		const tmux = fakeTmux({ windows: [] });
		const result = await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({ windows: [] }),
				harnessView: view({ ...session, tabs: [] }),
			}),
			{ kind: "createTab" },
		);
		expect(result.note).toBe("new tab · agent-2");
	});

	it("creates the window detached so the user is not yanked out of chat", async () => {
		const tmux = fakeTmux();
		await executeHarnessChromeAction(muxContext({ runner: tmux }), {
			kind: "createTab",
		});
		expect(callFor(tmux, "new-window")).toContain("-d");
	});

	it("surfaces the tmux stderr when creation fails", async () => {
		// The whole value of this branch is that the user learns *why*. A bare
		// "new tab failed" would send them to the tmux logs by hand.
		const tmux = fakeTmux({
			overrides: { "new-window": { code: 1, stderr: "no space for a window" } },
		});
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createTab" },
		);
		expect(result.note).toBe("new tab failed · no space for a window");
	});

	it("falls back to stdout when tmux reported the failure there", async () => {
		// tmux is inconsistent about which stream carries an error, so reading
		// only stderr yields an empty reason for a real failure.
		const tmux = fakeTmux({
			overrides: { "new-window": { code: 1, stdout: "session not found\n" } },
		});
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createTab" },
		);
		expect(result.note).toBe("new tab failed · session not found");
	});

	it('says "tmux" rather than trailing off when neither stream explains', async () => {
		const tmux = fakeTmux({
			overrides: { "new-window": { code: 1 } },
		});
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createTab" },
		);
		expect(result.note).toBe("new tab failed · tmux");
	});

	it("leaves the view untouched when creation fails", async () => {
		// A failed create that still advanced the view would leave the surface
		// showing a tab that does not exist.
		const ctx = muxContext({
			runner: fakeTmux({ overrides: { "new-window": { code: 1 } } }),
		});
		const result = await executeHarnessChromeAction(ctx, { kind: "createTab" });
		expect(result.harnessView).toBe(ctx.harnessView);
		expect(result.livePanes).toBe(ctx.livePanes);
	});

	it("focuses the new tab by name rather than by position", async () => {
		// tmux orders windows its own way, so the new tab is not reliably last.
		// Focusing by index would land the user on somebody else's agent.
		const tmux = fakeTmux({ windows: ["claude", "codex", "codex-2"] });
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createTab" },
		);
		expect(result.livePanes?.focused).toBe(2);
	});
});

describe("splitting a pane", () => {
	it("refuses when there is no tab to split", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({
				runner: fakeTmux(),
				livePanes: muxPanes({ windows: [] }),
			}),
			{ kind: "createPane" },
		);
		expect(result.note).toBe("no focused tab to split");
	});

	it("splits the focused window's own target", async () => {
		const tmux = fakeTmux();
		await executeHarnessChromeAction(muxContext({ runner: tmux }), {
			kind: "createPane",
		});
		expect(callFor(tmux, "split-window")?.slice(0, 4)).toEqual([
			"split-window",
			"-h",
			"-t",
			"%1",
		]);
	});

	it("counts the leaves under the tab it split", async () => {
		// The count is the only feedback that the split landed where the user
		// meant, since both panes render the same waiting banner.
		const tmux = fakeTmux({
			panes: ["%1\t0\t1\t80\t24", "%2\t1\t0\t80\t24"],
		});
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createPane" },
		);
		expect(result.note).toBe("new pane · 2 leaves under codex");
	});

	it("reports one leaf when tmux lists none, rather than zero", async () => {
		// Zero would be a lie: the split succeeded. This is the shape when the
		// pane list comes back empty because the pane has not started yet.
		const tmux = fakeTmux({ overrides: { "list-panes": { code: 1 } } });
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createPane" },
		);
		expect(result.note).toBe("new pane · 1 leaves under codex");
	});

	it("explains a failed split from stderr", async () => {
		const tmux = fakeTmux({
			overrides: { "split-window": { code: 1, stderr: "pane too small" } },
		});
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createPane" },
		);
		expect(result.note).toBe("new pane failed · pane too small");
	});

	it('says "tmux" when a failed split explains nothing', async () => {
		const tmux = fakeTmux({ overrides: { "split-window": { code: 1 } } });
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "createPane" },
		);
		expect(result.note).toBe("new pane failed · tmux");
	});
});

describe("focusing a pane", () => {
	it("refuses when there is no pane to focus", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({
				runner: fakeTmux(),
				livePanes: muxPanes({ windows: [] }),
			}),
			{ kind: "focus" },
		);
		expect(result.note).toBe("no pane to focus");
	});

	it("selects the window before the pane", async () => {
		// tmux `select-pane` is scoped to the current window. Selecting the pane
		// first would apply it to whichever window happened to be current.
		const tmux = fakeTmux();
		await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({
					windows: [
						{
							name: "codex",
							target: "%1",
							kind: "coding",
							panes: [
								{
									id: "%1",
									index: 0,
									active: true,
									width: 80,
									height: 24,
									capture: "",
								},
							],
						},
					],
				}) as InSessionPanes,
			}),
			{ kind: "focus" },
		);
		const verbs = tmux.calls.map((call) => call[0]);
		expect(verbs.indexOf("select-window")).toBeLessThan(
			verbs.indexOf("select-pane"),
		);
	});

	it("selects the window by name so a moved pane still resolves", async () => {
		const tmux = fakeTmux();
		await executeHarnessChromeAction(muxContext({ runner: tmux }), {
			kind: "focus",
		});
		expect(callFor(tmux, "select-window")).toEqual([
			"select-window",
			"-t",
			"hobo:codex",
		]);
	});

	it("selects the leaf named by focusedPane", async () => {
		const tmux = fakeTmux();
		await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({
					focusedPane: 1,
					windows: [
						{
							name: "codex",
							target: "%1",
							kind: "coding",
							panes: [
								{
									id: "%1",
									index: 0,
									active: false,
									width: 80,
									height: 24,
									capture: "",
								},
								{
									id: "%2",
									index: 1,
									active: true,
									width: 80,
									height: 24,
									capture: "",
								},
							],
						},
					],
				}) as InSessionPanes,
			}),
			{ kind: "focus" },
		);
		expect(callFor(tmux, "select-pane")).toEqual(["select-pane", "-t", "%2"]);
	});

	it("falls back to the active leaf when the index points nowhere", async () => {
		// `focusedPane` is remembered across refreshes and can outlive the pane it
		// named. tmux's own idea of active is the safer answer.
		const tmux = fakeTmux();
		await executeHarnessChromeAction(
			muxContext({
				runner: tmux,
				livePanes: muxPanes({
					focusedPane: 7,
					windows: [
						{
							name: "codex",
							target: "%1",
							kind: "coding",
							panes: [
								{
									id: "%5",
									index: 0,
									active: true,
									width: 80,
									height: 24,
									capture: "",
								},
							],
						},
					],
				}) as InSessionPanes,
			}),
			{ kind: "focus" },
		);
		expect(callFor(tmux, "select-pane")).toEqual(["select-pane", "-t", "%5"]);
	});

	it("still selects the window when the tab has no leaves at all", async () => {
		// No leaves means no `select-pane` — but the window select must still
		// happen, or the key does nothing visible and reads as a dropped input.
		const tmux = fakeTmux();
		const result = await executeHarnessChromeAction(
			muxContext({ runner: tmux }),
			{ kind: "focus" },
		);
		expect(callFor(tmux, "select-window")).toBeDefined();
		expect(result.note).toContain("focused · codex");
	});

	it("names the selected leaf in the note", async () => {
		const result = await executeHarnessChromeAction(
			muxContext({
				runner: fakeTmux(),
				livePanes: muxPanes({
					windows: [
						{
							name: "codex",
							target: "%1",
							kind: "coding",
							panes: [
								{
									id: "%3",
									index: 0,
									active: true,
									width: 80,
									height: 24,
									capture: "",
								},
							],
						},
					],
				}) as InSessionPanes,
			}),
			{ kind: "focus" },
		);
		expect(result.note).toBe("focused · codex · %3");
	});
});

describe("a durable session", () => {
	function durableSession(): HarnessSessionNode {
		return {
			id: "session-absent",
			name: "review",
			branch: "code/review",
			lifecycle: "RUNNING",
			revision: 0,
			tabs: [
				{
					id: "tab-1",
					title: "review",
					panes: [
						{
							id: "pane-1",
							title: "claude",
							agent: "claude",
							focused: true,
							capture: "",
						},
					],
				},
			],
		};
	}

	function durableContext(
		session: HarnessSessionNode = durableSession(),
	): HarnessActionContext {
		return {
			hoboHome: temp("hobo-chrome-durable-"),
			harnessView: view(session),
			livePanes: null,
		};
	}

	it("detaches without opening the durable store", async () => {
		// Detach short-circuits before the store is constructed. That matters
		// beyond speed: opening the store creates directories under hoboHome, and
		// a UI-only key should not write to disk.
		const result = await executeHarnessChromeAction(durableContext(), {
			kind: "detach",
		});
		expect(result.focus).toBe("chat");
	});

	it("says so when the focused session is not in the store", async () => {
		// The view can outlive the store — another process can end a session while
		// this surface still lists it. Naming the id is what lets the user tell
		// which of several sessions went missing.
		const result = await executeHarnessChromeAction(durableContext(), {
			kind: "stop",
		});
		expect(result.note).toBe("session session-absent not in durable store");
	});

	it("leaves the view alone when the session is missing", async () => {
		const ctx = durableContext();
		const result = await executeHarnessChromeAction(ctx, { kind: "focus" });
		expect(result.harnessView).toBe(ctx.harnessView);
	});

	it("reaches the store rather than tmux for a non-mux session", async () => {
		// The branch check is the whole routing decision. A durable session that
		// took the mux path would issue tmux commands against a session name that
		// is not a tmux session, and every one would silently fail.
		const result = await executeHarnessChromeAction(durableContext(), {
			kind: "createTab",
		});
		expect(result.note).toContain("not in durable store");
	});

	it("routes a session named hobo through mux however it is branched", async () => {
		// `id === "hobo"` is the in-session escape hatch: the shell's own tmux
		// session carries an ordinary-looking branch but is not durable.
		const result = await executeHarnessChromeAction(
			{
				...durableContext({ ...durableSession(), id: "hobo" }),
				livePanes: null,
			},
			{ kind: "stop" },
		);
		expect(result.note).toContain("no in-session mux");
	});
});
