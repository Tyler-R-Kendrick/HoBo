import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "./harness-surface.js";

/**
 * Programmable harness core (composition boundary).
 * Does not vendor Flue/Pi; exposes the same conceptual surface:
 * useModel, useSandbox, useSkill, useTool, durable streams, MCP.
 *
 * Subagents: Vercel Eve–shaped definitions (`eve.ts`).
 * Secure sandbox: DeepAgents + OpenShell + MxC (`sandbox-stack.ts`).
 * Durability: Vercel Workflow Worlds; Local World offline (`worlds.ts`).
 */

export type SkillName = string & { readonly __skillName: unique symbol };

export interface LoadedSkill {
	readonly name: SkillName;
	readonly source: "hobo-agents" | "external-global";
	readonly available: boolean;
	readonly pathHint: string;
}

export interface RhaiWorkflowResult {
	readonly ok: boolean;
	readonly steps: readonly string[];
	readonly output: readonly string[];
	readonly error?: string;
}

export interface DurableWorldState {
	readonly worldId: string;
	readonly runId: string;
	readonly step: number;
	readonly checkpoint: string;
	readonly survivingRestart: true;
	readonly updatedAt: string;
	/** World kind: local offline or vercel workflow production shape. */
	readonly worldKind: "local" | "vercel";
}

export interface HarnessCore {
	readonly useModel: (id: string) => { id: string; provider: string };
	readonly useSandbox: (root: string) => {
		readonly root: string;
		readonly mediated: true;
		/** Secure stack preferred in prod; local is mediated worktree/rift. */
		readonly stack: "deepagents+openshell+mxc" | "mediated-local";
	};
	readonly useSkill: (name: string) => LoadedSkill;
	readonly useTool: (name: string) => { name: string; mcp: boolean };
	readonly listSkills: () => readonly LoadedSkill[];
	readonly runRhaiWorkflow: (source: string) => RhaiWorkflowResult;
	readonly checkpoint: (runId: string, step: number, data: string) => DurableWorldState;
	readonly restore: (runId: string) => DurableWorldState | null;
	readonly exposeMcp: () => {
		readonly tools: readonly string[];
		readonly protocol: "mcp";
	};
	/** Portable durable runtime descriptors (Workflow Worlds). */
	readonly worlds: () => {
		readonly localDefault: "local";
		readonly productionDefault: "vercel";
		readonly model: "vercel-workflows-worlds";
	};
}

const HOBO_SKILL_NAMES = [
	"repo",
	"sdlc",
	"draft",
	"impeccable",
	"caveman",
	"ponytail",
	"improve",
	"tdd",
	"review",
] as const;

export function parseSkillName(input: string): SkillName {
	if (!/^[a-z0-9](?:[a-z0-9-]{0,127})$/u.test(input))
		throw new TypeError("skill name must be a lowercase slug");
	return input as SkillName;
}

/**
 * Minimal sandboxed Rhai-subset interpreter for workflow definitions.
 * Full Rhai (via WASM) is composition-ready; this subset is gate-safe offline.
 *
 * Supported:
 *   // comments
 *   step "name"
 *   log "message"
 *   assert true|false
 */
export function runRhaiSubset(source: string): RhaiWorkflowResult {
	const steps: string[] = [];
	const output: string[] = [];
	const lines = source.split(/\r?\n/);
	for (const raw of lines) {
		const line = raw.trim();
		if (line.length === 0 || line.startsWith("//")) continue;
		const stepMatch = /^step\s+"([^"]+)"\s*$/.exec(line);
		if (stepMatch) {
			steps.push(stepMatch[1]!);
			output.push(`step:${stepMatch[1]}`);
			continue;
		}
		const logMatch = /^log\s+"([^"]*)"\s*$/.exec(line);
		if (logMatch) {
			output.push(`log:${logMatch[1]}`);
			continue;
		}
		const assertMatch = /^assert\s+(true|false)\s*$/.exec(line);
		if (assertMatch) {
			if (assertMatch[1] === "false") {
				return {
					ok: false,
					steps,
					output,
					error: `assert failed at: ${line}`,
				};
			}
			output.push("assert:ok");
			continue;
		}
		return {
			ok: false,
			steps,
			output,
			error: `unsupported rhai-subset statement: ${line}`,
		};
	}
	return { ok: true, steps, output };
}

export interface CreateHarnessOptions {
	/** Durable world root (outside ephemeral isolation). Default HOBO_HOME/worlds. */
	readonly worldRoot: string;
	/** Project whose local skills and recordings are available to this harness. */
	readonly projectRoot?: string;
	readonly skillRoots?: readonly string[];
}

export function createHarnessCore(options: CreateHarnessOptions): HarnessCore {
	const worldRoot = options.worldRoot;
	mkdirSync(worldRoot, { recursive: true });

	const projectRoot = options.projectRoot ?? process.cwd();
	const repoRoot = findRepoRoot(projectRoot);
	const skillRoots = options.skillRoots ?? [
		join(projectRoot, ".hobo", "recordings"),
		...(repoRoot === projectRoot
			? []
			: [
					join(repoRoot, ".hobo", "recordings"),
					join(repoRoot, ".agents", "skills"),
					join(repoRoot, ".claude", "skills"),
				]),
		join(projectRoot, ".agents", "skills"),
		join(projectRoot, ".claude", "skills"),
	];

	function resolveSkill(name: SkillName): LoadedSkill {
		for (const root of skillRoots) {
			const hint = join(root, name, "SKILL.md");
			if (existsSync(hint)) {
				return {
					name,
					source: "hobo-agents",
					available: true,
					pathHint: hint,
				};
			}
		}
		// External-global tools stay global / MCP-served — never vendored.
		const external = name === "caveman" || name === "ponytail";
		return {
			name,
			source: external ? "external-global" : "hobo-agents",
			available: external,
			pathHint: external ? `global:${name}` : `missing:${name}`,
		};
	}

	function skillNames(): readonly SkillName[] {
		const names = new Set<SkillName>(HOBO_SKILL_NAMES.map(parseSkillName));
		for (const root of skillRoots) {
			if (!existsSync(root)) continue;
			for (const entry of readdirSync(root, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				let name: SkillName;
				try {
					name = parseSkillName(entry.name);
				} catch {
					continue;
				}
				if (existsSync(join(root, name, "SKILL.md"))) names.add(name);
			}
		}
		return [...names].sort();
	}

	return {
		useModel(id: string) {
			const provider = id.includes("/") ? id.split("/")[0]! : "default";
			return { id, provider };
		},
		useSandbox(root: string) {
			// Offline harness: mediated-local. Prod prefers DeepAgents+OpenShell+MxC.
			const stack =
				process.env.HOBO_CODE_SECURE_SANDBOX === "0"
					? ("mediated-local" as const)
					: ("deepagents+openshell+mxc" as const);
			return { root, mediated: true as const, stack };
		},
		useSkill(name: string) {
			return resolveSkill(parseSkillName(name));
		},
		useTool(name: string) {
			return { name, mcp: true };
		},
		listSkills() {
			return skillNames().map(resolveSkill);
		},
		runRhaiWorkflow(source: string) {
			return runRhaiSubset(source);
		},
		checkpoint(runId: string, step: number, data: string) {
			const dir = join(worldRoot, runId);
			mkdirSync(dir, { recursive: true });
			const checkpoint = createHash("sha256").update(data).digest("hex");
			const state: DurableWorldState = {
				worldId: `local-world:${runId}`,
				runId,
				step,
				checkpoint,
				survivingRestart: true,
				updatedAt: new Date().toISOString(),
				worldKind: "local",
			};
			writeFileSync(join(dir, "state.json"), JSON.stringify(state, null, 2));
			writeFileSync(join(dir, "payload.txt"), data, "utf8");
			return state;
		},
		restore(runId: string) {
			const path = join(worldRoot, runId, "state.json");
			if (!existsSync(path)) return null;
			const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DurableWorldState> &
				Pick<DurableWorldState, "worldId" | "runId" | "step" | "checkpoint">;
			return {
				worldId: raw.worldId,
				runId: raw.runId,
				step: raw.step,
				checkpoint: raw.checkpoint,
				survivingRestart: true as const,
				updatedAt: raw.updatedAt ?? new Date().toISOString(),
				worldKind: raw.worldKind === "vercel" ? ("vercel" as const) : ("local" as const),
			};
		},
		exposeMcp() {
			return {
				protocol: "mcp",
				tools: [
					"hobo.code.isolation",
					"hobo.code.promote",
					"hobo.code.scaffold",
					"hobo.code.evidence",
					"hobo.code.status",
					"hobo.code.budget",
					...skillNames().map((skill) => `skill.${skill}`),
				],
			};
		},
		worlds() {
			return {
				localDefault: "local",
				productionDefault: "vercel",
				model: "vercel-workflows-worlds",
			};
		},
	};
}

/** Survive restart: write checkpoint, clear memory, restore from world. */
export function demonstrateDurability(
	harness: HarnessCore,
	runId: string,
): { before: DurableWorldState; after: DurableWorldState } {
	const before = harness.checkpoint(runId, 1, "durable-payload-v1");
	const after = harness.restore(runId);
	if (!after) {
		throw new Error("durability restore failed");
	}
	return { before, after };
}
