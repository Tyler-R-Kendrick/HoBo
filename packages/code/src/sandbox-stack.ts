/**
 * Secure sandbox stack for hobo-code agent execution:
 * **DeepAgents + OpenShell + MxC**.
 *
 * - **DeepAgents** (LangChain Deep Agents) — orchestrates long-horizon coding
 *   agents with planning, filesystem tools, and subagent spawn.
 * - **OpenShell** (NVIDIA OpenShell) — kernel-enforced sandbox (Landlock,
 *   seccomp, namespaces, policy) for agent code execution; deny-by-default
 *   network; credentials stay outside the sandbox.
 * - **MxC** — stronger process / micro-VM isolation class for high-risk work
 *   (review of untrusted diffs, elevated gates).
 *
 * hobo-code does **not** vendor these runtimes. It pins the composition
 * contract and routes isolation classes (see compute COMPUTE_ISOLATION_CLASSES).
 * Local offline default remains worktree/rift mediated isolation; production
 * secure path is DeepAgents-orchestrated work inside OpenShell, with MxC when
 * the task class demands it.
 */

import type { EveAgentDefinition } from "./eve.js";

// public-contract: secure sandbox stack schema.
export const SECURE_SANDBOX_STACK_SCHEMA =
	"hobo.code.sandbox.deepagents-openshell-mxc/v1" as const;

export type SecureSandboxTier = "deepagents-openshell" | "mxc" | "mediated-local";

export interface SecureSandboxStackDescriptor {
	readonly schemaVersion: typeof SECURE_SANDBOX_STACK_SCHEMA;
	/** Always composed as a stack — not pick-one marketing. */
	readonly stack: readonly ["deepagents", "openshell", "mxc"];
	readonly deepAgents: {
		readonly role: "orchestrator";
		readonly inspiration: "https://docs.langchain.com/oss/python/deepagents/overview";
		readonly openshellDeepAgent: "https://github.com/langchain-ai/openshell-deepagent";
	};
	readonly openShell: {
		readonly role: "secure-runtime";
		readonly inspiration: "https://github.com/NVIDIA/OpenShell";
		readonly properties: readonly [
			"deny-by-default-network",
			"kernel-enforced",
			"credentials-outside-sandbox",
			"policy-governed-fs",
		];
	};
	readonly mxc: {
		readonly role: "strong-isolation-class";
		readonly properties: readonly [
			"process-or-microvm",
			"stronger-than-openshell-container",
			"review-and-untrusted-diff",
		];
	};
	/** Offline/CI still uses mediated worktree/rift; secure stack is preferred prod. */
	readonly localFallback: "worktree-or-rift-mediated";
	readonly defaultOn: true;
}

export function describeSecureSandboxStack(): SecureSandboxStackDescriptor {
	return {
		schemaVersion: SECURE_SANDBOX_STACK_SCHEMA,
		stack: ["deepagents", "openshell", "mxc"],
		deepAgents: {
			role: "orchestrator",
			inspiration:
				"https://docs.langchain.com/oss/python/deepagents/overview",
			openshellDeepAgent:
				"https://github.com/langchain-ai/openshell-deepagent",
		},
		openShell: {
			role: "secure-runtime",
			inspiration: "https://github.com/NVIDIA/OpenShell",
			properties: [
				"deny-by-default-network",
				"kernel-enforced",
				"credentials-outside-sandbox",
				"policy-governed-fs",
			],
		},
		mxc: {
			role: "strong-isolation-class",
			properties: [
				"process-or-microvm",
				"stronger-than-openshell-container",
				"review-and-untrusted-diff",
			],
		},
		localFallback: "worktree-or-rift-mediated",
		defaultOn: true,
	};
}

/**
 * Map Eve sandboxClass → secure tier used when dispatching work.
 */
export function tierForEveSandboxClass(
	sandboxClass: EveAgentDefinition["sandboxClass"],
): SecureSandboxTier {
	if (sandboxClass === "mxc") return "mxc";
	if (sandboxClass === "openshell") return "deepagents-openshell";
	return "mediated-local";
}

export interface SecureSandboxPlan {
	readonly tier: SecureSandboxTier;
	readonly orchestrator: "deepagents";
	readonly runtime: "openshell" | "mxc" | "mediated-local";
	readonly mediatedOnly: true;
	readonly credentialsInSandbox: false;
	readonly agentId: string;
	readonly stack: SecureSandboxStackDescriptor;
}

/**
 * Plan secure sandbox for an Eve agent/subagent definition.
 * Always mediatedOnly; never place credentials inside the sandbox.
 */
export function planSecureSandbox(
	agent: EveAgentDefinition,
): SecureSandboxPlan {
	const tier = tierForEveSandboxClass(agent.sandboxClass);
	const runtime =
		tier === "mxc"
			? "mxc"
			: tier === "deepagents-openshell"
				? "openshell"
				: "mediated-local";
	return {
		tier,
		orchestrator: "deepagents",
		runtime,
		mediatedOnly: true,
		credentialsInSandbox: false,
		agentId: agent.id,
		stack: describeSecureSandboxStack(),
	};
}
