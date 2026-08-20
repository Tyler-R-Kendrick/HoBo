/**
 * Herdr-shaped harness session view for the Agents TUI.
 *
 * Hierarchy (matches herdr + resident session-control screenshots):
 *   Session → Tab → Pane (subagent terminal)
 *
 * Product mapping:
 *   agent harness → many sessions → many subagents (panes)
 *
 * Nav contract (must not steal harness interaction):
 *   ↑↓ / Pg*  scroll capture only
 *   [ ]       cycle panes; if tab has one pane, cycle tabs (harness chats)
 *   { }       cycle tabs in the focused session
 *   , .       cycle sessions when more than one exists
 *   type+Enter prompt/steer the focused pane
 */

import { must } from "@hobo/core/total-access";
import { AgentLifecycleState } from "./_generated/code_harness_pb.js";
import { harnessDisplayLabel } from "./agent-harness-catalog.js";
import type { InSessionPanes } from "./in-session-panes.js";
import { fitCells } from "./rubberhose.js";
import type { SessionSnapshot } from "./session-contract.js";

export type HarnessAgentStatus =
	| "idle"
	| "working"
	| "blocked"
	| "done"
	| "unknown";

export interface HarnessPaneView {
	readonly id: string;
	readonly title: string;
	readonly agent?: string;
	readonly agentLabel?: string;
	readonly agentStatus?: HarnessAgentStatus;
	readonly focused: boolean;
	readonly capture: string;
}

export interface HarnessTabView {
	readonly id: string;
	readonly title: string;
	readonly panes: readonly HarnessPaneView[];
}

export interface HarnessSessionNode {
	readonly id: string;
	readonly name: string;
	readonly branch: string;
	readonly lifecycle: string;
	readonly revision: number;
	readonly tabs: readonly HarnessTabView[];
}

export interface HarnessSessionView {
	readonly sessions: readonly HarnessSessionNode[];
	readonly focusedSession: number;
	readonly focusedTab: number;
	readonly focusedPane: number;
}

export function emptyHarnessSessionView(): HarnessSessionView {
	return {
		sessions: [],
		focusedSession: 0,
		focusedTab: 0,
		focusedPane: 0,
	};
}

/**
 * Flat in-session mux → herdr agent-tab seating:
 * one session, one tab per harness window, panes = tmux leaves in that window.
 */
export function harnessViewFromLivePanes(
	panes: InSessionPanes,
	options: {
		readonly branch?: string;
		readonly captureByName?: Readonly<Record<string, string>>;
	} = {},
): HarnessSessionView {
	const focused = Math.max(
		0,
		Math.min(panes.focused, Math.max(0, panes.windows.length - 1)),
	);
	const focusedPaneIndex = panes.focusedPane ?? 0;
	const tabs: HarnessTabView[] = panes.windows.map((window, index) => {
		const label = harnessDisplayLabel(window.name);
		const leaves =
			window.panes && window.panes.length > 0
				? window.panes
				: [
						{
							id: window.target || `pane-${window.name}`,
							index: 0,
							active: index === focused,
							width: 0,
							height: 0,
							capture:
								index === focused
									? panes.capture
									: (options.captureByName?.[window.name] ?? ""),
						},
					];
		const paneFocus =
			index === focused
				? Math.max(0, Math.min(focusedPaneIndex, leaves.length - 1))
				: leaves.findIndex((row) => row.active);
		const activeLeaf = paneFocus >= 0 ? paneFocus : 0;
		return {
			id: `tab-${window.name}`,
			title: label,
			panes: leaves.map((leaf, leafIndex) => ({
				id: leaf.id,
				title: leaves.length > 1 ? `${label} · ${leafIndex + 1}` : label,
				agent: window.name,
				agentLabel: label,
				agentStatus:
					index === focused && leafIndex === activeLeaf ? "working" : "idle",
				focused: index === focused && leafIndex === activeLeaf,
				capture:
					index === focused
						? leaf.capture || (leafIndex === activeLeaf ? panes.capture : "")
						: leaf.capture || (options.captureByName?.[window.name] ?? ""),
			})),
		};
	});
	const focusedTabPanes = tabs[focused]?.panes.length ?? 1;
	return {
		sessions: [
			{
				id: panes.session,
				name: panes.session,
				branch: options.branch ?? "in-session",
				lifecycle: panes.tmux ? "running" : "stopped",
				revision: 0,
				tabs,
			},
		],
		focusedSession: 0,
		focusedTab: focused,
		focusedPane: Math.max(
			0,
			Math.min(focusedPaneIndex, Math.max(0, focusedTabPanes - 1)),
		),
	};
}

/** Resident SessionSnapshot → herdr hierarchy. */
export function harnessViewFromSnapshot(
	snapshot: SessionSnapshot,
	options: {
		readonly captureByPaneId?: Readonly<Record<string, string>>;
	} = {},
): HarnessSessionView {
	const session = snapshot.session;
	if (!session) return emptyHarnessSessionView();
	const tabs: HarnessTabView[] = snapshot.tabs.map((tab) => {
		const panes = snapshot.panes
			.filter((pane) => pane.tabId === tab.id)
			.map((pane) => {
				const run = snapshot.agentRuns.find(
					(agent) =>
						agent.paneId === pane.id &&
						agent.lifecycleState !== AgentLifecycleState.DONE &&
						agent.lifecycleState !== AgentLifecycleState.FAILED &&
						agent.lifecycleState !== AgentLifecycleState.STOPPED,
				);
				const provider = run?.provider;
				return {
					id: pane.id,
					title: pane.title || provider || tab.title,
					...(provider
						? {
								agent: provider,
								agentLabel: harnessDisplayLabel(provider),
							}
						: undefined),
					agentStatus: agentStatusFromRun(run?.lifecycleState),
					focused: pane.id === snapshot.focusedPaneId,
					capture: options.captureByPaneId?.[pane.id] ?? "",
				};
			});
		return {
			id: tab.id,
			title: tab.title,
			panes:
				panes.length > 0
					? panes
					: [
							{
								id: `${tab.id}:empty`,
								title: tab.title,
								focused: tab.id === snapshot.focusedTabId,
								capture: "",
							},
						],
		};
	});
	const focusedTab = Math.max(
		0,
		tabs.findIndex((tab) => tab.id === snapshot.focusedTabId),
	);
	const tab = tabs[focusedTab] ?? tabs[0];
	const focusedPane = Math.max(
		0,
		tab?.panes.findIndex((pane) => pane.focused) ?? 0,
	);
	return {
		sessions: [
			{
				id: session.id,
				name: session.name,
				branch: session.branch,
				lifecycle: lifecycleLabel(session.lifecycleState),
				revision: Number(snapshot.revision ?? 0n),
				tabs,
			},
		],
		focusedSession: 0,
		focusedTab: focusedTab < 0 ? 0 : focusedTab,
		focusedPane: focusedPane < 0 ? 0 : focusedPane,
	};
}

/** Merge many session nodes (multi-harness / multi-workspace) into one view. */
export function mergeHarnessSessions(
	nodes: readonly HarnessSessionNode[],
	focus: {
		readonly session?: number;
		readonly tab?: number;
		readonly pane?: number;
	} = {},
): HarnessSessionView {
	if (nodes.length === 0) return emptyHarnessSessionView();
	const focusedSession = clampIndex(focus.session ?? 0, nodes.length);
	const session = must(nodes[focusedSession]);
	const focusedTab = clampIndex(focus.tab ?? 0, session.tabs.length);
	const tab = session.tabs[focusedTab];
	const focusedPane = clampIndex(focus.pane ?? 0, tab?.panes.length ?? 0);
	return {
		sessions: nodes,
		focusedSession,
		focusedTab,
		focusedPane,
	};
}

/**
 * Live `herdr api snapshot` → herdr-shaped Agents view for the focused workspace.
 * Used for parity validation against the real herdr session model.
 */
export function harnessViewFromHerdrApiSnapshot(
	snapshot: {
		readonly focused_workspace_id?: string;
		readonly workspaces?: readonly {
			readonly workspace_id: string;
			readonly label?: string;
			readonly worktree?: { readonly checkout_path?: string };
			readonly agent_status?: string;
		}[];
		readonly tabs?: readonly {
			readonly tab_id: string;
			readonly workspace_id: string;
			readonly label?: string;
			readonly focused?: boolean;
		}[];
		readonly panes?: readonly {
			readonly pane_id: string;
			readonly tab_id: string;
			readonly workspace_id: string;
			readonly focused?: boolean;
			readonly agent?: string;
			readonly agent_status?: string;
			readonly agent_session?: { readonly value?: string };
			readonly terminal_title_stripped?: string;
		}[];
	},
	options: { readonly captureByPaneId?: Readonly<Record<string, string>> } = {},
): HarnessSessionView {
	const workspaces = snapshot.workspaces ?? [];
	const focusedId =
		snapshot.focused_workspace_id ??
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		workspaces.find((row) => (row as { focused?: boolean }).focused)
			?.workspace_id ??
		workspaces[0]?.workspace_id;
	const nodes: HarnessSessionNode[] = workspaces.map((workspace) => {
		const tabs = (snapshot.tabs ?? [])
			.filter((tab) => tab.workspace_id === workspace.workspace_id)
			.map((tab) => {
				const panes = (snapshot.panes ?? [])
					.filter((pane) => pane.tab_id === tab.tab_id)
					.map((pane) => {
						const agent = pane.agent;
						return {
							id: pane.pane_id,
							title:
								pane.terminal_title_stripped ||
								tab.label ||
								agent ||
								pane.pane_id,
							...(agent
								? {
										agent,
										agentLabel: harnessDisplayLabel(agent),
									}
								: undefined),
							agentStatus:
								// SAFETY: parsed or fixture value is the named domain type after this assertion.
								(pane.agent_status as HarnessAgentStatus) ?? "unknown",
							focused: pane.focused === true,
							capture: options.captureByPaneId?.[pane.pane_id] ?? "",
						};
					});
				return {
					id: tab.tab_id,
					title: tab.label || tab.tab_id,
					panes:
						panes.length > 0
							? panes
							: [
									{
										id: `${tab.tab_id}:empty`,
										title: tab.label || tab.tab_id,
										focused: tab.focused === true,
										capture: "",
									},
								],
				};
			});
		const branch =
			workspace.worktree?.checkout_path?.split("/").slice(-2).join("/") ??
			"herdr";
		return {
			id: workspace.workspace_id,
			name: workspace.label || workspace.workspace_id,
			branch,
			lifecycle: "running",
			revision: 0,
			tabs,
		};
	});
	const focusedSession = Math.max(
		0,
		nodes.findIndex((row) => row.id === focusedId),
	);
	const session = nodes[focusedSession] ?? nodes[0];
	const focusedTab = Math.max(
		0,
		session?.tabs.findIndex((tab) => tab.panes.some((pane) => pane.focused)) ??
			0,
	);
	const tab = session?.tabs[focusedTab];
	const focusedPane = Math.max(
		0,
		tab?.panes.findIndex((pane) => pane.focused) ?? 0,
	);
	return mergeHarnessSessions(nodes, {
		session: focusedSession < 0 ? 0 : focusedSession,
		tab: focusedTab < 0 ? 0 : focusedTab,
		pane: focusedPane < 0 ? 0 : focusedPane,
	});
}

function lifecycleLabel(state: number | undefined): string {
	switch (state) {
		case 1:
			return "starting";
		case 2:
			return "running";
		case 3:
			return "stopping";
		case 4:
			return "stopped";
		case 5:
			return "failed";
		default:
			return "unknown";
	}
}

function agentStatusFromRun(state: number | undefined): HarnessAgentStatus {
	switch (state) {
		case 2:
			return "idle";
		case 3:
			return "working";
		case 4:
			return "blocked";
		case 5:
			return "done";
		default:
			return "unknown";
	}
}

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

export function focusedHarnessPane(
	view: HarnessSessionView,
): HarnessPaneView | undefined {
	const session = view.sessions[view.focusedSession];
	const tab = session?.tabs[view.focusedTab];
	return tab?.panes[view.focusedPane] ?? tab?.panes.find((p) => p.focused);
}

export function focusedHarnessAgentId(
	view: HarnessSessionView,
): string | undefined {
	return focusedHarnessPane(view)?.agent;
}

export function cycleHarnessFocus(
	view: HarnessSessionView,
	axis: "session" | "tab" | "pane",
	delta: 1 | -1,
): HarnessSessionView {
	if (view.sessions.length === 0) return view;
	if (axis === "session") {
		const next =
			(view.focusedSession + delta + view.sessions.length) %
			view.sessions.length;
		return {
			...view,
			focusedSession: next,
			focusedTab: 0,
			focusedPane: 0,
		};
	}
	const session = view.sessions[view.focusedSession];
	if (!session || session.tabs.length === 0) return view;
	if (axis === "tab") {
		const next =
			(view.focusedTab + delta + session.tabs.length) % session.tabs.length;
		return { ...view, focusedTab: next, focusedPane: 0 };
	}
	const tab = session.tabs[view.focusedTab] ?? session.tabs[0];
	if (!tab || tab.panes.length === 0) return view;
	const next = (view.focusedPane + delta + tab.panes.length) % tab.panes.length;
	return { ...view, focusedPane: next };
}

/**
 * [ ] leaf cycle: panes when the tab is split; otherwise tabs (harness chats).
 * Matches herdr — most agent tabs are single-pane.
 */
export function cycleHarnessLeaf(
	view: HarnessSessionView,
	delta: 1 | -1,
): HarnessSessionView {
	const session = view.sessions[view.focusedSession];
	const tab = session?.tabs[view.focusedTab];
	if (tab && tab.panes.length > 1) {
		return cycleHarnessFocus(view, "pane", delta);
	}
	return cycleHarnessFocus(view, "tab", delta);
}

/** Keep tmux window + leaf focus aligned with the herdr view. */
export function syncLivePanesFocus(
	panes: InSessionPanes,
	view: HarnessSessionView,
): InSessionPanes {
	const agent = focusedHarnessAgentId(view);
	if (!agent || panes.windows.length === 0) {
		return {
			...panes,
			focusedPane: view.focusedPane,
		};
	}
	const index = panes.windows.findIndex((row) => row.name === agent);
	if (index < 0) {
		return { ...panes, focusedPane: view.focusedPane };
	}
	return {
		...panes,
		focused: index,
		focusedPane: view.focusedPane,
		capture:
			index === panes.focused && view.focusedPane === (panes.focusedPane ?? 0)
				? panes.capture
				: "",
	};
}

/** Lines for the Agents CRT — herdr session/tab/pane chrome + split capture. */
export function formatHarnessSessionLines(
	view: HarnessSessionView,
	options: {
		readonly attached?: boolean;
		/** Glass content width (outer − bezel inset). Drives split column size. */
		readonly contentWidth?: number;
	} = {},
): readonly string[] {
	if (view.sessions.length === 0) {
		return [
			"no harness sessions · create via hobo-code session or seat agents with mux",
			"Enter attaches · [ ] focus pane · Ctrl+\\ leaves",
		];
	}
	const session = must(
		view.sessions[view.focusedSession],
		"view.sessions[view.focusedSession]",
	);
	const tab = session.tabs[view.focusedTab] ?? session.tabs[0];
	const pane =
		tab?.panes[view.focusedPane] ??
		tab?.panes.find((row) => row.focused) ??
		tab?.panes[0];
	const contentWidth = Math.max(24, options.contentWidth ?? 72);
	const multi = (tab?.panes.length ?? 0) > 1;

	// Attached: glass is the split (herdr-shaped). Thin chrome only.
	if (options.attached) {
		const who = pane?.agentLabel ?? pane?.title ?? "pane";
		const leaf =
			multi && tab ? `${view.focusedPane + 1}/${tab.panes.length}` : "1/1";
		return [
			`attached · ${who} · pane ${leaf} · [ ] focus · Ctrl+\\ leave`,
			...formatPaneCaptureGrid(tab?.panes ?? [], view.focusedPane, {
				attached: true,
				contentWidth,
			}),
		];
	}

	const lines: string[] = [];
	lines.push(
		`${session.name} · ${session.id} · ${session.branch} · ${session.lifecycle} · r${session.revision}`,
	);
	lines.push("Detach · Stop session · New tab");
	if (session.tabs.length > 0) {
		lines.push(
			session.tabs
				.map((row, index) =>
					index === view.focusedTab ? `[${row.title}]` : row.title,
				)
				.join(" · "),
		);
	}
	if (tab) {
		lines.push(`${tab.title} · ${tab.id}`);
		lines.push(multi ? `New pane · ${tab.panes.length} leaves` : "New pane");
		for (const [index, row] of tab.panes.entries()) {
			const active = index === view.focusedPane || row.focused;
			const status = row.agentStatus ?? "unknown";
			const agent = row.agentLabel ?? row.agent ?? "";
			const who = agent ? ` · ${agent}` : "";
			const focus = active ? " · focused" : "";
			const idShort = row.id.length > 12 ? `${row.id.slice(0, 8)}…` : row.id;
			lines.push(`${row.title} · ${idShort}${who} · ${status}${focus}`);
			if (active) {
				lines.push(
					"Focus · Prompt · Enter attaches · Split · Close · Start agent",
				);
			}
		}
	}
	lines.push("");
	lines.push(
		...formatPaneCaptureGrid(tab?.panes ?? [], view.focusedPane, {
			attached: false,
			contentWidth,
		}),
	);
	lines.push("");
	const steer = pane?.agentLabel ?? pane?.title ?? "pane";
	lines.push(
		`❯ prompt · Enter attach (${steer}) · type+Enter steers · /mux pane splits`,
	);
	return lines;
}

/**
 * Herdr-style split: side-by-side columns for 2 panes, equal tiles for more.
 * ANSI preserved via fitCells; columns never stack as fake nested boxes.
 */
export function formatPaneCaptureGrid(
	panes: readonly HarnessPaneView[],
	focusedPane: number,
	options: {
		readonly attached?: boolean;
		readonly contentWidth?: number;
		/** @deprecated use contentWidth */
		readonly colWidth?: number;
	} = {},
): readonly string[] {
	if (panes.length === 0) return ["(no panes)"];
	const total = Math.max(
		24,
		options.contentWidth ??
			(options.colWidth !== undefined ? options.colWidth * 2 + 1 : 72),
	);

	if (panes.length === 1) {
		const body =
			panes[0]?.capture && panes[0].capture.trim().length > 0
				? panes[0].capture.replace(/\s+$/u, "").split("\n")
				: [`(${panes[0]?.agentLabel ?? panes[0]?.title ?? "pane"} · waiting)`];
		return body.map((line) => fitCells(line, total));
	}

	const gap = 1;
	const cols = Math.min(panes.length, 3);
	const gaps = gap * (cols - 1);
	const baseCol = Math.max(12, Math.floor((total - gaps) / cols));
	// Last column absorbs remainder so joined width === total (not total-1).
	const colWidths = Array.from({ length: cols }, (_, index) =>
		index < cols - 1
			? baseCol
			: Math.max(12, total - gaps - baseCol * (cols - 1)),
	);
	const visible = panes.slice(0, cols);
	const bodies = visible.map((row, index) => {
		const colW = colWidths[index] ?? baseCol;
		const focused = index === focusedPane;
		const mark = focused ? "▶" : " ";
		const head = fitCells(
			`${mark} ${row.title}${focused ? (options.attached ? " · keys" : " · focus") : ""}`,
			colW,
		);
		const rule = "─".repeat(colW);
		const raw =
			row.capture && row.capture.trim().length > 0
				? row.capture.replace(/\s+$/u, "").split("\n")
				: ["(empty)"];
		// Full capture — glass padLines (end origin) pins live bottom. Never
		// slice(0, N): that hid every new turn under the oldest lines.
		const body = raw.map((line) => fitCells(line, colW));
		return [head, rule, ...body];
	});

	const rows = Math.max(3, ...bodies.map((b) => b.length));
	const padded = bodies.map((b, index) => {
		const colW = colWidths[index] ?? baseCol;
		const next = [...b];
		while (next.length < rows) next.push(fitCells("", colW));
		return next;
	});
	const out: string[] = [];
	for (let r = 0; r < rows; r++) {
		const parts = padded.map(
			(b, index) => b[r] ?? fitCells("", colWidths[index] ?? baseCol),
		);
		out.push(fitCells(parts.join("│"), total));
	}
	if (panes.length > cols) {
		out.push(fitCells(`(+${panes.length - cols} more · [ ] cycle)`, total));
	}
	return out;
}

/** Tokens that must appear for visual parity with herdr session-control chrome. */
export const HERDR_SESSION_CHROME_TOKENS = [
	"· running · r",
	"Detach",
	"Stop session",
	"New tab",
	"New pane",
	"focused",
	"Focus · Prompt",
	"Start agent",
	"prompt ·",
] as const;

/** Tokens pinned on the Agents command-rail legend (not body). */
export const AGENTS_LEGEND_TOKENS = [
	"[ ] focus",
	"/mux",
	"Ctrl+\\",
	"Enter attach",
] as const;
