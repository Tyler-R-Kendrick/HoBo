import {
	type AcpAgentFactory,
	type AcpSessionFact,
	type AgentGuardrailPolicy,
	type AgentPrincipal,
	openGovernedSession,
	parseAgentGuardrailPolicy,
	replaySessionFacts,
} from "@hobo/connector-acp";

// The standard SWE-task session shape every vendor adapter runs (HOBO-723
// establishes it; siblings reuse the same contract): a workspace-mounted
// governed session where the agent streams edits as tool calls, and the
// final report is EXTRACTED FROM THE AUDIT FACTS — not from process memory.

// public-contract: the SWE-task report document schema id.
export const SWE_TASK_REPORT_SCHEMA = "hobo.swe-task-report/v1";

// The default SWE-task guardrail posture: workspace reads and edits flow
// (that is the job), anything reaching outside the workspace — deploys,
// destroys, token/admin surface — needs a human or is denied outright.
export function sweTaskPolicy(agentId: string): AgentGuardrailPolicy {
	return parseAgentGuardrailPolicy({
		agentId,
		actionClasses: {
			read: "auto-allow",
			write: "auto-allow",
			deploy: "require-approval",
			destroy: "deny",
			token: "deny",
			admin: "deny",
		},
		allowedApprovers: [],
	});
}

export interface SweTask {
	readonly taskId: string;
	readonly instruction: string;
	readonly workspace: string;
}

export interface SweTaskReport {
	readonly schema: typeof SWE_TASK_REPORT_SCHEMA;
	readonly taskId: string;
	readonly sessionId: string;
	readonly stopReason: string;
	readonly edits: readonly string[];
	readonly refusals: readonly string[];
	readonly completed: boolean;
}

export interface SweTaskRunInput {
	readonly task: SweTask;
	// The vendor agent factory (transcript agent in replay; stdio connection
	// factory in the live lane).
	readonly agent: AcpAgentFactory;
	readonly principal: AgentPrincipal;
	readonly policy?: AgentGuardrailPolicy;
	readonly onFact?: (fact: AcpSessionFact) => void;
}

export interface SweTaskRunResult {
	readonly report: SweTaskReport;
	readonly facts: readonly AcpSessionFact[];
}

// Run one governed SWE task end to end through the shared HOBO-721 session
// engine and derive the report from the recorded facts.
export async function runSweTask(
	input: SweTaskRunInput,
): Promise<SweTaskRunResult> {
	const policy = input.policy ?? sweTaskPolicy(input.principal.id);
	const session = await openGovernedSession({
		connector: "swe-gemini",
		agent: input.agent,
		principal: input.principal,
		policy,
		cwd: input.task.workspace,
		...(input.onFact ? { onFact: input.onFact } : {}),
	});
	const result = await session.prompt(input.task.instruction);
	return {
		report: extractSweTaskReport(input.task.taskId, result.facts),
		facts: result.facts,
	};
}

/**
 * Derive the SWE-task report purely from the session's audit facts — the
 * report is a projection over the log, re-derivable at any time.
 */
export function extractSweTaskReport(
	taskId: string,
	facts: readonly AcpSessionFact[],
): SweTaskReport {
	const replayed = replaySessionFacts(facts);
	const edits = replayed.decisions
		.filter(
			(decision) =>
				decision.effect === "allow" &&
				(decision.action.includes("edit") || decision.action.includes("write")),
		)
		.map((decision) => decision.action);
	return Object.freeze({
		schema: SWE_TASK_REPORT_SCHEMA,
		taskId,
		sessionId: replayed.sessionId,
		stopReason: replayed.stopReason ?? "unknown",
		edits,
		refusals: [...replayed.refusals],
		completed: replayed.closed && replayed.stopReason === "end_turn",
	});
}
