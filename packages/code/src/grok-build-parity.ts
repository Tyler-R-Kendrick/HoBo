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

import type { AgentPaneState, AgentSemanticState } from "./types.js";
import {
	describeCodeWorlds,
	planDurableWorkflowRun,
	type CodeWorldDescriptor,
	type DurableWorkflowRun,
} from "./worlds.js";
import { createPane } from "./tui.js";

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
	readonly kind: "subagent" | "task" | "watcher";
	readonly state: AgentSemanticState;
	readonly summary: string;
	readonly clickable: true;
}

export interface TasksSurface {
	readonly schema: "hobo.code.tasks/v1";
	readonly grokBuild: GrokBuildParity;
	readonly rows: readonly TaskBoardRow[];
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
			headless:
				"Grok -p vs hobo-code --json envelopes for automation.",
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
}): TasksSurface {
	const parity = grokBuildParity();
	const worlds = describeCodeWorlds(options.hoboHome);
	const world = worlds.localDefault;
	const runId = options.runId ?? "tasks-preview";
	const panes =
		options.panes ??
		([
			createPane("coord", "working", "dispatch"),
			createPane("worker", "idle", "standby"),
			createPane("watcher", "idle", "monitor"),
		] as const);
	const rows: TaskBoardRow[] = panes.map((p) => {
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
	const workflow = planDurableWorkflowRun({
		runId,
		world,
		stepNames: ["plan", "implement", "verify", "handback"],
	});
	return {
		schema: "hobo.code.tasks/v1",
		grokBuild: parity,
		rows,
		workflow,
		world,
		legend: parity.legend,
	};
}

const STATE_GLYPH: Record<AgentSemanticState, string> = {
	idle: "○",
	working: "●",
	blocked: "▲",
	done: "✓",
};

/** Dense human task board (Grok Build tasks-pane analogue). */
export function renderTasksBoardText(surface: TasksSurface): string {
	const title = "▣ tasks";
	const fold = surface.rows
		.map((r) => {
			const g = STATE_GLYPH[r.state];
			const focus = r.state === "working" ? "▸" : "";
			const short =
				r.id === "coord" || r.id === "coordinator"
					? "co"
					: r.id === "worker"
						? "wk"
						: r.id === "watcher"
							? "wch"
							: r.id.length > 6
								? `${r.id.slice(0, 5)}…`
								: r.id;
			return `${focus}${g}${short}`;
		})
		.join("·");
	const wf =
		surface.workflow.steps.length > 0
			? `wf · ${surface.workflow.steps.length} steps · ${surface.world.kind}`
			: `wf · ${surface.world.kind}`;
	const soft = "·".repeat(20);
	const rule = "─".repeat(20);
	return [
		title,
		soft,
		` ${fold}`,
		` ${surface.legend}`,
		` ${wf}`,
		` click · task-row · still-running`,
		rule,
	].join("\n");
}
