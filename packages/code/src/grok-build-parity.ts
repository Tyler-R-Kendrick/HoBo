/**
 * Grok Build–shaped TUI / tasks / workflows parity *story* for hobo-code.
 *
 * Not a reimplementation of xAI Grok Build. Surfaces discoverable language that
 * AI-native Grok Build users expect: clickable regions, background tasks pane,
 * workflow Worlds, multi-agent panes, headless JSON.
 *
 * Snapshot of Grok Build differentiators (research 2026-07-31): fullscreen
 * mouse TUI, tasks pane (click “still running”), workflows default-on with
 * live multi-agent progress, subagents, headless -p, ACP, plan mode.
 */

import {
	type AgentWorkBoard,
	groupTasksUnderAgents,
	listWorkClaims,
	type WorkClaim,
} from "./agent-work.js";
import {
	projectSessionWorkLedger,
	type SessionWorkItem,
} from "./session-evidence.js";
import type { AgentPaneState, AgentSemanticState } from "./types.js";
import {
	type CodeWorldDescriptor,
	type DurableWorkflowRun,
	describeCodeWorlds,
	planDurableWorkflowRun,
} from "./worlds.js";

export interface GrokBuildCompare {
	readonly grokBuild: string;
	readonly clickableTui: string;
	readonly backgroundTasks: string;
	readonly workflows: string;
	readonly subagents: string;
	readonly headless: string;
	readonly planMode: string;
}

export interface GrokBuildParity {
	readonly theme: "grok-build";
	readonly fullscreenTui: true;
	readonly mouseInteractive: true;
	readonly clickableRegions: readonly string[];
	readonly backgroundTasks: {
		readonly supported: true;
		readonly groups: readonly ["subagents", "tasks", "watchers"];
		readonly narrative: string;
	};
	readonly workflows: {
		readonly model: "vercel-workflows-worlds";
		readonly localDefault: true;
		readonly survivingRestart: true;
		readonly narrative: string;
	};
	readonly subagents: {
		readonly supported: true;
		readonly narrative: string;
	};
	readonly headless: {
		readonly supported: true;
		readonly narrative: string;
	};
	readonly planMode: {
		readonly supported: true;
		readonly narrative: string;
	};
	readonly compare: GrokBuildCompare;
	readonly legend: string;
	readonly latestNotes: readonly string[];
}

export interface TaskBoardRow {
	readonly id: string;
	readonly kind: "subagent" | "task" | "watcher" | "ask" | "look" | "impact";
	readonly state: AgentSemanticState | SessionWorkItem["state"];
	readonly summary: string;
	readonly clickable: true;
	readonly provenance?: SessionWorkItem["provenance"];
}

export interface TasksSurface {
	readonly schema: "hobo.code.tasks/v1";
	readonly grokBuild: GrokBuildParity;
	readonly rows: readonly TaskBoardRow[];
	readonly board: AgentWorkBoard<TaskBoardRow>;
	readonly claims: readonly WorkClaim[];
	readonly workflow: DurableWorkflowRun;
	readonly world: CodeWorldDescriptor;
	readonly legend: string;
}

const CLICKABLE = [
	"pane-header",
	"pane-body",
	"status-bar",
	"task-row",
	"still-running",
	"budget-chip",
	"agent-state-badge",
] as const;

/** Product Grok Build parity card for status/tasks --json and help. */
export function grokBuildParity(): GrokBuildParity {
	return {
		theme: "grok-build",
		fullscreenTui: true,
		mouseInteractive: true,
		clickableRegions: [...CLICKABLE],
		backgroundTasks: {
			supported: true,
			groups: ["subagents", "tasks", "watchers"],
			narrative:
				"Agent panes + tasks board map to Grok Build’s background tasks pane (Subagents → Tasks → Watchers). Working agents ≈ still-running.",
		},
		workflows: {
			model: "vercel-workflows-worlds",
			localDefault: true,
			survivingRestart: true,
			narrative:
				"Durable Local World under $HOBO_HOME/worlds; production shape Vercel Workflow Worlds. planDurableWorkflowRun for step status.",
		},
		subagents: {
			supported: true,
			narrative:
				"Concurrent agent panes (coord/worker/station) + Eve/harness subagent surface — compare to Grok Build explore/general/plan subagents.",
		},
		headless: {
			supported: true,
			narrative:
				"Scriptable via --json on verbs (dispatch/status/tasks/session) — analogous to Grok Build headless -p.",
		},
		planMode: {
			supported: true,
			narrative:
				"isolate → work → promote gate checklist is the plan/apply loop; sandbox mediated.",
		},
		compare: {
			grokBuild:
				"Grok Build: fullscreen mouse TUI, tasks pane, workflows overlay, subagents, headless -p, ACP (xAI). hobo-code: HoBo app-building agent with Grok Build–shaped discoverability.",
			clickableTui:
				"Grok Build click targets (still-running → tasks). hobo-code exposes clickableRegions + task-row click story in tasks/status JSON.",
			backgroundTasks:
				"Grok Build Ctrl+B / background tools + tasks pane groups. hobo-code tasks board + working panes as background-ready work.",
			workflows:
				"Grok Build workflows default-on + live multi-agent progress. hobo-code World model + planDurableWorkflowRun steps on tasks --json.",
			subagents:
				"Grok Build spawn_subagent types. hobo-code multi-pane status/session + Eve define surface.",
			headless: "Grok -p vs hobo-code --json envelopes for automation.",
			planMode:
				"Grok /plan markdown vs hobo-code isolate/promote gated plan-apply.",
		},
		legend: "grok-build · click · tasks · workflows",
		latestNotes: [
			"Grok Build 2026: workflows enabled by default; overlay live per-agent progress; resume failed workflow runs",
			"Grok Build: click still-running opens tasks; Tab Prompt→Scrollback→Tasks; grouped Subagents→Tasks→Watchers",
			"Grok Build: mouse support, native subagent view, Plan Mode, Grok 4.5",
		],
	};
}

export function renderGrokBuildFooter(
	parity: GrokBuildParity = grokBuildParity(),
): string {
	return ` ${parity.legend}`;
}

/**
 * Build a Grok Build–shaped tasks board from agent panes + a sample workflow.
 */
export function buildTasksSurface(options: {
	readonly hoboHome: string;
	readonly runId?: string;
	readonly panes?: readonly AgentPaneState[];
	readonly evidence?: Parameters<
		typeof projectSessionWorkLedger
	>[0]["evidence"];
}): TasksSurface {
	const parity = grokBuildParity();
	const worlds = describeCodeWorlds(options.hoboHome);
	const world = worlds.localDefault;
	const runId = options.runId ?? "tasks-preview";
	const ledger = projectSessionWorkLedger({
		hoboHome: options.hoboHome,
		...(options.evidence !== undefined ? { evidence: options.evidence } : {}),
	});
	const workRows: TaskBoardRow[] = ledger.items.map((item) => ({
		id: item.id,
		kind: workKind(item.kind),
		state: item.state,
		summary: item.summary,
		clickable: true as const,
		provenance: item.provenance,
	}));
	const panes = options.panes ?? [];
	const paneRows: TaskBoardRow[] = panes.map((p) => {
		let kind: TaskBoardRow["kind"] = "task";
		if (p.agentId.includes("watch")) kind = "watcher";
		else if (
			p.agentId.includes("coord") ||
			p.agentId.includes("worker") ||
			p.agentId.includes("agent")
		) {
			kind = "subagent";
		}
		return {
			id: p.agentId,
			kind,
			state: p.semanticState,
			summary: p.summary,
			clickable: true as const,
		};
	});
	const rows = workRows.length > 0 ? [...workRows, ...paneRows] : paneRows;
	const claims = listWorkClaims(options.hoboHome);
	const board = groupTasksUnderAgents({
		agents: uniqueAgents(panes, claims),
		tasks: workRows,
		claims,
	});
	const workflow = planDurableWorkflowRun({
		runId,
		world,
		stepNames: ["plan", "implement", "verify", "handback"],
	});
	return {
		schema: "hobo.code.tasks/v1",
		grokBuild: parity,
		rows,
		board,
		claims,
		workflow,
		world,
		legend: parity.legend,
	};
}

function uniqueAgents(
	panes: readonly AgentPaneState[],
	claims: readonly WorkClaim[],
): readonly { readonly agentId: string }[] {
	const seen = new Set<string>();
	const agents: { agentId: string }[] = [];
	for (const pane of panes) {
		if (seen.has(pane.agentId)) continue;
		seen.add(pane.agentId);
		agents.push({ agentId: pane.agentId });
	}
	for (const claim of claims) {
		if (seen.has(claim.agentId)) continue;
		seen.add(claim.agentId);
		agents.push({ agentId: claim.agentId });
	}
	return agents;
}

function workKind(kind: SessionWorkItem["kind"]): TaskBoardRow["kind"] {
	if (kind === "ask") return "ask";
	if (kind === "look") return "look";
	if (kind === "impact") return "impact";
	return "task";
}

const STATE_GLYPH: Record<string, string> = {
	idle: "○",
	working: "●",
	blocked: "▲",
	done: "✓",
	claimed: "○",
	captured: "●",
	verified: "✓",
	stale: "▲",
	missing: "?",
};

/** Dense human board — tasks nest under the subagent that claimed them. */
export function renderTasksBoardText(surface: TasksSurface): string {
	const lines: string[] = [
		"▣ agents",
		"tasks nest under the subagent that claimed them · same work as Evidence",
	];
	if (
		surface.board.groups.length === 0 &&
		surface.board.unclaimed.length === 0
	) {
		lines.push(" no session work yet");
	}
	for (const group of surface.board.groups) {
		lines.push(` ${group.agentId}`);
		if (group.tasks.length === 0) {
			lines.push("   (no claimed tasks)");
			continue;
		}
		for (const row of group.tasks) {
			const claim = group.claims.find((entry) => entry.taskId === row.id);
			lines.push(formatClaimedTask(row, claim));
		}
	}
	if (surface.board.unclaimed.length > 0) {
		lines.push(" unclaimed");
		for (const row of surface.board.unclaimed) {
			lines.push(formatClaimedTask(row));
		}
	}
	const wf =
		surface.workflow.steps.length > 0
			? `wf · ${surface.workflow.steps.length} steps · ${surface.world.kind}`
			: `wf · ${surface.world.kind}`;
	lines.push(` ${wf}`);
	lines.push(" incremental checkins · stacked PRs · squash-merge");
	lines.push(" Evidence: visual report of this board");
	return lines.join("\n");
}

function formatClaimedTask(row: TaskBoardRow, claim?: WorkClaim): string {
	const glyph = STATE_GLYPH[String(row.state)] ?? "·";
	const summary = row.summary.slice(0, 48);
	if (!claim) return `   ${glyph} ${summary}`;
	return `   ${glyph} ${summary} · ${claim.branch} · ${claim.isolation} · incremental · stacked · squash`;
}
