/**
 * Herdr chrome actions for the Agents surface.
 *
 * Keys (Agents focus, composer empty):
 *   d  Detach
 *   S  Stop session
 *   t  New tab
 *   p  New pane
 *   f  Focus pane (runtime select)
 *
 * Mux in-session seating uses tmux directly.
 * Durable resident sessions use LocalSessionControl envelopes.
 */
import { randomUUID } from "node:crypto";

import {
	focusedHarnessPane,
	harnessViewFromLivePanes,
	harnessViewFromSnapshot,
	mergeHarnessSessions,
	type HarnessSessionNode,
	type HarnessSessionView,
} from "./harness-session-view.js";
import type { InSessionPanes } from "./in-session-panes.js";
import {
	listInSessionWindows,
	refreshInSessionPanes,
} from "./in-session-panes.js";
import {
	createLocalSessionControl,
	sessionCommandEnvelope,
} from "./local-session-control.js";
import { type MuxRunner, safeWindowName, sessionTarget, tmuxRunner } from "./mux.js";

export type HarnessChromeActionKind =
	| "detach"
	| "stop"
	| "createTab"
	| "createPane"
	| "focus";

export interface HarnessChromeAction {
	readonly kind: HarnessChromeActionKind;
}

/** Slash action id → chrome action. No bare letter hotkeys — composer stays free. */
export function harnessActionFromSlash(
	action: string | undefined,
): HarnessChromeAction | undefined {
	switch (action) {
		case "session-detach":
			return { kind: "detach" };
		case "session-stop":
			return { kind: "stop" };
		case "session-tab":
			return { kind: "createTab" };
		case "session-pane":
			return { kind: "createPane" };
		case "session-focus":
			return { kind: "focus" };
		default:
			return undefined;
	}
}

/** @deprecated Bare letters steal chat — use slash commands. */
export function parseHarnessChromeKey(
	_key: string,
): HarnessChromeAction | undefined {
	return undefined;
}

export function isMuxHarnessSession(session: HarnessSessionNode): boolean {
	return session.branch === "in-session" || session.id === "hobo";
}

/** Next window name keeps the agent id so tabs stay trackable (codex → codex-2). */
export function nextAgentTabName(
	windows: readonly { readonly name: string }[],
	agent: string,
): string {
	const base = safeWindowName(agent) || "agent";
	const escaped = base.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const re = new RegExp(`^${escaped}(?:-(\\d+))?$`, "u");
	let max = 0;
	let sawBase = false;
	for (const window of windows) {
		const match = window.name.match(re);
		if (!match) continue;
		sawBase = true;
		max = Math.max(max, match[1] ? Number(match[1]) : 1);
	}
	if (!sawBase) return `${base}-2`;
	return `${base}-${max + 1}`;
}

export interface HarnessActionContext {
	readonly hoboHome: string;
	readonly actorId?: string;
	readonly harnessView: HarnessSessionView;
	readonly livePanes: InSessionPanes | null;
	readonly runner?: MuxRunner;
}

export interface HarnessActionResult {
	readonly harnessView: HarnessSessionView;
	readonly livePanes: InSessionPanes | null;
	readonly focus?: "chat" | "agents";
	readonly note: string;
}

function revision(snapshot: { revision?: bigint | undefined }): bigint {
	return snapshot.revision ?? 0n;
}

function focusedSession(view: HarnessSessionView): HarnessSessionNode | undefined {
	return view.sessions[view.focusedSession];
}

/** Detach from Agents back to chat (mux + durable share this UX). */
export function applyHarnessDetach(
	view: HarnessSessionView,
	livePanes: InSessionPanes | null,
): HarnessActionResult {
	return {
		harnessView: view,
		livePanes,
		focus: "chat",
		note: "detached · Tab agents to return · session keeps running",
	};
}

async function refreshMux(
	livePanes: InSessionPanes,
	runner: MuxRunner,
	focusedName?: string,
): Promise<{ view: HarnessSessionView; panes: InSessionPanes }> {
	const windows = await listInSessionWindows(runner, livePanes.session);
	let focused = livePanes.focused;
	if (focusedName) {
		const hit = windows.findIndex((row) => row.name === focusedName);
		if (hit >= 0) focused = hit;
	} else {
		focused = Math.max(0, Math.min(focused, Math.max(0, windows.length - 1)));
	}
	const next: InSessionPanes = {
		...livePanes,
		windows,
		focused,
		capture: "",
	};
	const refreshed = await refreshInSessionPanes(next, runner);
	return {
		view: harnessViewFromLivePanes(refreshed),
		panes: refreshed,
	};
}

async function executeMuxAction(
	ctx: HarnessActionContext,
	action: HarnessChromeAction,
): Promise<HarnessActionResult> {
	const panes = ctx.livePanes;
	if (!panes || !panes.tmux) {
		return {
			harnessView: ctx.harnessView,
			livePanes: panes,
			note: "no in-session mux — seat agents or open a durable session",
		};
	}
	const runner = ctx.runner ?? tmuxRunner();
	const session = panes.session;
	const window = panes.windows[panes.focused] ?? panes.windows[0];

	switch (action.kind) {
		case "detach":
			return applyHarnessDetach(ctx.harnessView, panes);
		case "stop": {
			if (!window) {
				return {
					harnessView: ctx.harnessView,
					livePanes: panes,
					note: "no focused pane to stop",
				};
			}
			await runner.run([
				"kill-window",
				"-t",
				window.target.includes("%")
					? `${sessionTarget(session)}:${window.name}`
					: window.target,
			]);
			const { view, panes: next } = await refreshMux(panes, runner);
			return {
				harnessView: view,
				livePanes: next,
				focus: "agents",
				note: `stopped · ${window.name}`,
			};
		}
		case "createTab": {
			const agent =
				window?.name ??
				focusedHarnessPane(ctx.harnessView)?.agent ??
				"agent";
			const name = nextAgentTabName(panes.windows, agent);
			const created = await runner.run([
				"new-window",
				"-d",
				"-t",
				sessionTarget(session),
				"-n",
				name,
				"--",
				"bash",
				"-lc",
				`printf 'hobo-code tab · ${name} · waiting\\n'; exec bash`,
			]);
			if (created.code !== 0) {
				return {
					harnessView: ctx.harnessView,
					livePanes: panes,
					note: `new tab failed · ${(created.stderr ?? "").trim() || created.stdout.trim() || "tmux"}`,
				};
			}
			const { view, panes: next } = await refreshMux(panes, runner, name);
			return {
				harnessView: view,
				livePanes: next,
				focus: "agents",
				note: `new tab · ${name}`,
			};
		}
		case "createPane": {
			if (!window) {
				return {
					harnessView: ctx.harnessView,
					livePanes: panes,
					note: "no focused tab to split",
				};
			}
			const split = await runner.run([
				"split-window",
				"-h",
				"-t",
				window.target,
				"--",
				"bash",
				"-lc",
				"printf 'hobo-code pane · waiting\\n'; exec bash",
			]);
			if (split.code !== 0) {
				return {
					harnessView: ctx.harnessView,
					livePanes: panes,
					note: `new pane failed · ${(split.stderr ?? "").trim() || split.stdout.trim() || "tmux"}`,
				};
			}
			const capture = await refreshInSessionPanes(panes, runner);
			const leafCount = capture.windows[capture.focused]?.panes?.length ?? 1;
			return {
				harnessView: harnessViewFromLivePanes(capture),
				livePanes: capture,
				focus: "agents",
				note: `new pane · ${leafCount} leaves under ${window.name}`,
			};
		}
		case "focus": {
			if (!window) {
				return {
					harnessView: ctx.harnessView,
					livePanes: panes,
					note: "no pane to focus",
				};
			}
			const leaf =
				window.panes?.[panes.focusedPane ?? 0] ??
				window.panes?.find((row) => row.active);
			await runner.run(["select-window", "-t", `${session}:${window.name}`]);
			if (leaf) {
				await runner.run(["select-pane", "-t", leaf.id]);
			}
			const refreshed = await refreshInSessionPanes(panes, runner);
			return {
				harnessView: harnessViewFromLivePanes(refreshed),
				livePanes: refreshed,
				focus: "agents",
				note: `focused · ${window.name}${leaf ? ` · ${leaf.id}` : ""}`,
			};
		}
	}
}

async function executeDurableAction(
	ctx: HarnessActionContext,
	action: HarnessChromeAction,
	session: HarnessSessionNode,
): Promise<HarnessActionResult> {
	if (action.kind === "detach") {
		return applyHarnessDetach(ctx.harnessView, ctx.livePanes);
	}
	const actorId = ctx.actorId ?? "hobo-code-shell";
	const control = createLocalSessionControl({ hoboHome: ctx.hoboHome });
	try {
		const loaded = await control.load(session.id);
		if (!loaded?.session) {
			return {
				harnessView: ctx.harnessView,
				livePanes: ctx.livePanes,
				note: `session ${session.id} not in durable store`,
			};
		}
		const pane = focusedHarnessPane(ctx.harnessView);
		const tab = session.tabs[ctx.harnessView.focusedTab];
		let command: string;
		let value: Record<string, unknown>;
		switch (action.kind) {
			case "stop":
				command = "stopSession";
				value = {};
				break;
			case "createTab": {
				const agent =
					pane?.agentLabel ?? pane?.agent ?? pane?.title ?? session.name;
				const title = nextAgentTabName(
					session.tabs.map((row) => ({ name: row.title })),
					agent,
				);
				command = "createTab";
				value = { title };
				break;
			}
			case "createPane":
				if (!tab) {
					return {
						harnessView: ctx.harnessView,
						livePanes: ctx.livePanes,
						note: "no focused tab for new pane",
					};
				}
				command = "createPane";
				value = {
					tabId: tab.id,
					title: `pane-${randomUUID().slice(0, 8)}`,
					command: [],
				};
				break;
			case "focus":
				if (!pane) {
					return {
						harnessView: ctx.harnessView,
						livePanes: ctx.livePanes,
						note: "no focused pane",
					};
				}
				command = "focusPane";
				value = { paneId: pane.id };
				break;
			default:
				return {
					harnessView: ctx.harnessView,
					livePanes: ctx.livePanes,
					note: "unsupported action",
				};
		}
		const next = await control.execute(
			sessionCommandEnvelope(
				session.id,
				revision(loaded),
				actorId,
				command,
				value,
			),
			true,
		);
		const node = harnessViewFromSnapshot(next).sessions[0];
		const others = ctx.harnessView.sessions.filter((row) => row.id !== session.id);
		const view = node
			? mergeHarnessSessions([...others, node], {
					session: others.length,
					tab: ctx.harnessView.focusedTab,
					pane: ctx.harnessView.focusedPane,
				})
			: ctx.harnessView;
		return {
			harnessView: view,
			livePanes: ctx.livePanes,
			focus: action.kind === "stop" ? "chat" : "agents",
			note: `${action.kind} · ${session.name}`,
		};
	} finally {
		control.close();
	}
}

/** Run a herdr chrome action against mux or durable session control. */
export async function executeHarnessChromeAction(
	ctx: HarnessActionContext,
	action: HarnessChromeAction,
): Promise<HarnessActionResult> {
	const session = focusedSession(ctx.harnessView);
	if (!session) {
		return {
			harnessView: ctx.harnessView,
			livePanes: ctx.livePanes,
			note: "no harness session focused",
		};
	}
	if (isMuxHarnessSession(session)) {
		return executeMuxAction(ctx, action);
	}
	return executeDurableAction(ctx, action, session);
}

/** Footer hint when Agents is focused — mirrors pinned rail. */
// public-contract: mux Agents chrome key hint on the command rail
export const HARNESS_CHROME_KEY_HINT =
	"Enter attach · [ ] focus · Ctrl+\\ leave · /mux pane";
