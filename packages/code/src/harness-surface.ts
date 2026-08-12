/**
 * Discoverable Pi / Flue dual-harness surface for AI automation engineers.
 *
 * Surfaces ADR-0139 fact: interactive Pi TUI and programmatic Flue agent share
 * harness-customization (instructions/skills/tools). Plus Eve subagents,
 * skill roots, self-improve loop, and knowledge-graph/brain notes.
 */

import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
	HOBO_AGENT_MODEL,
	HOBO_AGENT_NAME,
} from "./harness-customization.js";
import {
	defaultHoboCodeEveAgents,
	describeEveSubagentSurface,
} from "./eve.js";
import { describeCodeWorlds } from "./worlds.js";

// public-contract: harness inventory payload
export const CODE_HARNESS_SURFACE_SCHEMA = "hobo.code.harness-surface/v1" as const;

export type HarnessSurfaceKind = "pi-tui" | "flue-run";

export type HarnessSkillRoot = {
	readonly root: string;
	readonly present: boolean;
	readonly role: string;
	/** Absolute path when present (for JSON consumers). */
	readonly resolvedPath?: string;
};

export type HarnessBrainNote = {
	readonly id: string;
	readonly role: string;
	readonly status: "wired" | "mcp-optional" | "residual";
	readonly try: string;
};

export type HarnessSurfaceStatus = {
	readonly schema: typeof CODE_HARNESS_SURFACE_SCHEMA;
	readonly agentName: string;
	readonly model: string;
	readonly dualSurface: {
		readonly pi: {
			readonly kind: "pi-tui";
			readonly path: string;
			readonly narrative: string;
			readonly try: string;
		};
		readonly flue: {
			readonly kind: "flue-run";
			readonly path: string;
			readonly narrative: string;
			readonly try: string;
		};
		readonly sharedCustomization: string;
	};
	readonly skillRoots: readonly HarnessSkillRoot[];
	readonly repoRootHint: string;
	readonly eve: ReturnType<typeof describeEveSubagentSurface>;
	readonly selfImprove: {
		readonly loop: readonly string[];
		readonly narrative: string;
	};
	readonly worlds: ReturnType<typeof describeCodeWorlds>;
	readonly brain: readonly HarnessBrainNote[];
	readonly legend: string;
	readonly notes: readonly string[];
};

const SKILL_ROOT_CANDIDATES = [
	{ rel: ".hobo/recordings", role: "project recording skills" },
	{ rel: ".agents/skills", role: "repo skills (primary)" },
	{ rel: ".claude/skills", role: "Claude-mirrored skills" },
	{ rel: ".agents/skills", role: "package-local skills" }, // also checked under package cwd
] as const;

/** Walk up for monorepo root (pnpm-workspace / .git) so skills resolve from package cwd. */
export function findRepoRoot(start: string): string {
	let dir = start;
	for (let i = 0; i < 10; i++) {
		if (
			existsSync(join(dir, "pnpm-workspace.yaml")) ||
			existsSync(join(dir, ".git"))
		) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return start;
}

function resolveSkillRoots(cwd: string): {
	readonly roots: HarnessSkillRoot[];
	readonly repoRoot: string;
} {
	const repoRoot = findRepoRoot(cwd);
	const seen = new Set<string>();
	const roots: HarnessSkillRoot[] = [];

	const tryAdd = (base: string, rel: string, role: string) => {
		const abs = join(base, rel);
		const key = abs;
		if (seen.has(key)) return;
		seen.add(key);
		const present = existsSync(abs);
		// Prefer path relative to repo root when under monorepo; else relative to cwd.
		let display = rel;
		if (base === repoRoot && base !== cwd) {
			display = rel;
		} else if (base !== repoRoot) {
			try {
				display = relative(repoRoot, abs) || rel;
			} catch {
				display = abs;
			}
		}
		roots.push({
			root: display.startsWith("..") ? abs : display,
			role:
				base === cwd && base !== repoRoot
					? `${role} (cwd)`
					: base === repoRoot
						? `${role} (repo root)`
						: role,
			present,
			...(present ? { resolvedPath: abs } : {}),
		});
	};

	// cwd first (package worktree), then monorepo root.
	for (const c of SKILL_ROOT_CANDIDATES) {
		tryAdd(cwd, c.rel, c.role);
	}
	if (repoRoot !== cwd) {
		tryAdd(repoRoot, ".hobo/recordings", "project recording skills");
		tryAdd(repoRoot, ".agents/skills", "repo skills (primary)");
		tryAdd(repoRoot, ".claude/skills", "Claude-mirrored skills");
	}
	// Package-scoped optional
	tryAdd(repoRoot, "packages/code/.agents/skills", "package-local skills (if any)");

	return { roots, repoRoot };
}

/**
 * Inventory dual harness surfaces + skills + self-improve + brain notes.
 * `cwd` is project root for skill-root presence checks (walks up to monorepo).
 */
export function inspectHarnessSurface(options: {
	readonly cwd?: string;
	readonly hoboHome?: string;
} = {}): HarnessSurfaceStatus {
	const cwd = options.cwd ?? process.cwd();
	const hoboHome = options.hoboHome ?? process.env.HOBO_HOME ?? "$HOBO_HOME";
	const { roots: skillRoots, repoRoot } = resolveSkillRoots(cwd);
	const eve = describeEveSubagentSurface();
	// Touch default agents so JSON always lists concrete ids.
	const agents = defaultHoboCodeEveAgents();
	void agents;

	return {
		schema: CODE_HARNESS_SURFACE_SCHEMA,
		agentName: HOBO_AGENT_NAME,
		model: HOBO_AGENT_MODEL,
		dualSurface: {
			pi: {
				kind: "pi-tui",
				path: "packages/code/pi/extensions/hobo.ts + bin chat",
				narrative:
					"Interactive Pi terminal harness — lightweight tool loop, shared instructions/tools.",
				try: "hobo-code  # bare TTY Pi/chat path when configured",
			},
			flue: {
				kind: "flue-run",
				path: "packages/code/agents/hobo-code.ts",
				narrative:
					"Programmatic Flue agent — durable sessions: flue run hobo-code --input '{\"message\":\"…\"}'.",
				try: "flue run hobo-code --input '{\"message\":\"status\"}'",
			},
			sharedCustomization:
				"src/harness-customization.ts + harness-tools.ts (ADR-0139 single source of truth)",
		},
		skillRoots,
		repoRootHint: repoRoot,
		eve,
		selfImprove: {
			loop: [
				"isolate (sandbox purity)",
				"agent work + skills",
				"evidence / gates",
				"promote (squash-only)",
				"durable handback under $HOBO_HOME",
				"skills/dogfood feedback for next run",
			],
			narrative:
				"Self-improve is instrumented as isolate→evidence→promote→durable learning — not vibes. Pair with optimizexp / skillopt offline for skill evolution.",
		},
		worlds: describeCodeWorlds(hoboHome),
		brain: [
			{
				id: "serena",
				role: "semantic code retrieval MCP (LSP-backed)",
				status: "mcp-optional",
				try: "project .mcp.json serena · avoid dumping whole files",
			},
			{
				id: "gbrain",
				role: "knowledge-graph memory MCP (embeddings; optional key)",
				status: "mcp-optional",
				try: "gbrain init + MCP · never embed secrets",
			},
			{
				id: "durable-handback",
				role: "session-end / isolation durable artifacts (local brain-lite)",
				status: "wired",
				try: "hobo-code session --json · persistence.durableRoot",
			},
			{
				id: "graphrag-full",
				role: "full enterprise GraphRAG brain product",
				status: "residual",
				try: "residual L — use Serena/gbrain/MCP until GraphRAG lands",
			},
		],
		legend: "harness · pi+flue · skills · self-improve",
		notes: [
			"Pi = lightweight terminal harness; Flue = durable TypeScript framework on Pi (describe knowledge, not orchestration).",
			"Both hobo-code surfaces must share harness-customization — never fork instructions.",
			"Skills resolve under .agents/skills and .claude/skills; caveman/ponytail may be external-global.",
			"Eve-shaped subagents: investigator · implementer · reviewer (filesystem-first).",
			"Self-improve: gates + evidence + durable handback; SkillOpt offline for skill training.",
		],
	};
}

/** Human panel for hobo-code harness. */
export function harnessHumanSummary(status: HarnessSurfaceStatus): string {
	const skills = status.skillRoots
		.filter((s) => s.present || s.root.includes(".agents") || s.root.includes(".claude"))
		.slice(0, 4)
		.map((s) => {
			const short = s.root
				.replace(/\\/g, "/")
				.replace(/^.*\/(\.agents\/skills|\.claude\/skills)$/, "$1")
				.replace(/^\.\//, "");
			return `${s.present ? "●" : "○"}${short}`;
		})
		.join(" · ");
	const subs = status.eve.defaultAgents.subagents.map((s) => s.id).join("+");
	const brains = status.brain
		.filter((b) => b.status !== "residual")
		.map((b) => b.id)
		.join("·");
	return [
		`agent · ${status.agentName} · ${status.model}`,
		`pi · TUI extension · interactive`,
		`flue · agents/hobo-code.ts · flue run hobo-code`,
		`shared · harness-customization.ts`,
		`skills · ${skills}`,
		`eve · ${status.eve.defaultAgents.coordinator.id} → ${subs}`,
		`loop · isolate→evidence→promote→durable`,
		`brain · ${brains || "—"} · gbrain residual full GraphRAG`,
		status.legend,
	].join("\n");
}
