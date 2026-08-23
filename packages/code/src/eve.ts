/**
 * Vercel Eve–shaped agent / subagent definitions for hobo-code.
 *
 * Eve (https://vercel.com/eve · https://github.com/vercel/eve) is the
 * filesystem-first agent framework: an agent is a directory of instructions,
 * tools, skills, and nested `subagents/`. hobo-code adopts that **shape** as
 * the canonical subagent definition — not a vendored Eve runtime.
 *
 * Layout (Eve parity):
 *   agent/
 *     agent.ts            # model + describe
 *     instructions.md     # who it is
 *     tools/              # TypeScript tools
 *     skills/             # markdown knowledge
 *     subagents/<name>/   # same shape one level down
 *
 * Durable execution of these agents rides Workflow Worlds (see worlds.ts).
 * Secure sandboxes for tool/code execution ride DeepAgents+OpenShell+MxC
 * (see sandbox-stack.ts).
 */

// public-contract: Eve-shaped agent definition schema.
export const EVE_AGENT_SCHEMA = "hobo.code.eve.agent/v1" as const;

export type EveAgentKind = "agent" | "subagent";

/**
 * Minimal Eve `defineAgent`-compatible descriptor.
 * Full Eve runtime remains an optional production adapter; this is the
 * in-repo contract hobo-code plans/validates against.
 */
export interface EveAgentDefinition {
	readonly schemaVersion: typeof EVE_AGENT_SCHEMA;
	readonly kind: EveAgentKind;
	/** Directory name under agent/ or agent/subagents/. */
	readonly id: string;
	readonly description: string;
	/** Model id (provider/model); not a secret. */
	readonly model: string;
	/** Relative paths Eve expects under the agent root. */
	readonly layout: {
		readonly agentTs: "agent.ts";
		readonly instructions: "instructions.md";
		readonly toolsDir: "tools";
		readonly skillsDir: "skills";
		readonly subagentsDir: "subagents";
	};
	/** Nested subagent ids (empty for leaf specialists). */
	readonly subagents: readonly string[];
	/** Tool module basenames under tools/ (without .ts). */
	readonly tools: readonly string[];
	/** Skill markdown stems under skills/. */
	readonly skills: readonly string[];
	/**
	 * Sandbox class for this agent/subagent.
	 * Secure default: openshell (DeepAgents+OpenShell); mxc for stronger VM.
	 */
	readonly sandboxClass: "local-process" | "openshell" | "mxc";
	/** Parent agent id when kind=subagent. */
	readonly parentId?: string;
}

export interface DefineEveAgentInput {
	readonly id: string;
	readonly description: string;
	readonly model?: string;
	readonly tools?: readonly string[];
	readonly skills?: readonly string[];
	readonly subagents?: readonly string[];
	readonly sandboxClass?: EveAgentDefinition["sandboxClass"];
	readonly parentId?: string;
}

const DEFAULT_LAYOUT = {
	agentTs: "agent.ts",
	instructions: "instructions.md",
	toolsDir: "tools",
	skillsDir: "skills",
	subagentsDir: "subagents",
} as const;

/**
 * Define an Eve-shaped root agent (filesystem-first directory contract).
 */
export function defineEveAgent(input: DefineEveAgentInput): EveAgentDefinition {
	const id = input.id.trim();
	if (!id) throw new Error("eve agent id required");
	return {
		schemaVersion: EVE_AGENT_SCHEMA,
		kind: "agent",
		id,
		description: input.description,
		model: input.model ?? "default",
		layout: DEFAULT_LAYOUT,
		subagents: Object.freeze([...(input.subagents ?? [])]),
		tools: Object.freeze([...(input.tools ?? [])]),
		skills: Object.freeze([...(input.skills ?? [])]),
		sandboxClass: input.sandboxClass ?? "openshell",
	};
}

/**
 * Define an Eve-shaped subagent (same shape one level down under subagents/).
 * Parent delegates like a tool; child starts with clean context + its tools only.
 */
export function defineEveSubagent(
	input: DefineEveAgentInput & { readonly parentId: string },
): EveAgentDefinition {
	const parentId = input.parentId.trim();
	if (!parentId) throw new Error("eve subagent parentId required");
	const base = defineEveAgent({
		...input,
		// Subagents default to openshell unless parent forced mxc for harder work.
		sandboxClass: input.sandboxClass ?? "openshell",
	});
	return {
		...base,
		kind: "subagent",
		parentId,
	};
}

/** Relative path of an Eve agent/subagent root under a workspace. */
export function eveAgentRootPath(
	agent: EveAgentDefinition,
	workspaceRoot = "agent",
): string {
	if (agent.kind === "agent") {
		return workspaceRoot === "agent" ? "agent" : `${workspaceRoot}/${agent.id}`;
	}
	const parent = agent.parentId ?? "agent";
	const parentRoot =
		workspaceRoot === "agent" ? "agent" : `${workspaceRoot}/${parent}`;
	return `${parentRoot}/subagents/${agent.id}`;
}

/**
 * Canonical hobo-code coordinator + worker subagent set (Eve shape).
 * Coordinator owns dispatch; workers run inside secure sandbox classes.
 */
export function defaultHoboCodeEveAgents() {
	const coordinator = defineEveAgent({
		id: "hobo-code",
		description:
			"HoBo Code coordinator: dispatch, promote, evidence; delegates specialist work to Eve subagents.",
		model: "default",
		tools: ["dispatch", "status", "promote", "scaffold", "budget"],
		skills: ["repo", "sdlc", "impeccable", "tdd", "review"],
		subagents: ["investigator", "implementer", "reviewer"],
		// Coordinator may stay local-process; tools that mutate code still sandbox.
		sandboxClass: "local-process",
	});
	const subagents = [
		defineEveSubagent({
			id: "investigator",
			parentId: coordinator.id,
			description: "Read-only investigation of code, logs, and contracts.",
			tools: ["search", "read", "status"],
			skills: ["repo", "diagnosing-bugs"],
			sandboxClass: "openshell",
		}),
		defineEveSubagent({
			id: "implementer",
			parentId: coordinator.id,
			description:
				"Mediated implementer: writes only inside isolation; promote is sole merge path.",
			tools: ["edit", "test", "scaffold"],
			skills: ["tdd", "repo", "ponytail"],
			sandboxClass: "openshell",
		}),
		defineEveSubagent({
			id: "reviewer",
			parentId: coordinator.id,
			description: "Independent gate re-run and acceptance checklist walk.",
			tools: ["test", "lint", "status"],
			skills: ["review", "standards"],
			// Stronger isolation for untrusted review of agent diffs.
			sandboxClass: "mxc",
		}),
	] as const;
	return { coordinator, subagents };
}

export function describeEveSubagentSurface() {
	return {
		framework: "vercel-eve",
		role: "subagent-definition",
		filesystemFirst: true,
		inspiration: "https://vercel.com/eve",
		defaultAgents: defaultHoboCodeEveAgents(),
	};
}
