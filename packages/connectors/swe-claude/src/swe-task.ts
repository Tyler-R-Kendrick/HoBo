import {
	type AcpAgentFactory,
	type AcpSessionFact,
	type AgentGuardrailPolicy,
	type AgentPrincipal,
	type AgentSandboxPosture,
	openGovernedSession,
	parseAgentGuardrailPolicy,
	replaySessionFacts,
} from "@hobo/connector-acp";

// The standard SWE-task session shape over the Claude ACP bridge (same
// contract as the swe-gemini reference adapter): a workspace-mounted
// governed session where the agent streams edits/diffs as tool calls, and
// the final report AND the sandbox access report are projections over the
// audit facts.

// public-contract: the SWE-task report document schema id.
export const SWE_TASK_REPORT_SCHEMA = "hobo.swe-task-report/v1";
// public-contract: the sandbox access-report document schema id.
export const SANDBOX_REPORT_SCHEMA = "hobo.sandbox-access-report/v1";

// The default SWE-task guardrail posture: workspace reads/edits and test
// runs flow (that is the job); anything reaching outside the workspace —
// deploys, destroys, token/admin surface — needs a human or is denied.
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

// The sandbox access report (s3-07 acceptance): every GRANTED action must
// stay inside the workspace/test surface; anything else is out of scope.
export interface SandboxAccessReport {
	readonly schema: typeof SANDBOX_REPORT_SCHEMA;
	readonly workspaceRoot: string;
	readonly grantedActions: readonly string[];
	readonly outOfScopeAccess: readonly string[];
	readonly clean: boolean;
}

const IN_SCOPE_PREFIXES = ["workspace:", "tests:", "logs:"];

export interface SweTaskRunInput {
	readonly task: SweTask;
	// The vendor agent factory (transcript agent in replay; the stdio bridge
	// connection in the live lane).
	readonly agent: AcpAgentFactory;
	readonly principal: AgentPrincipal;
	readonly policy?: AgentGuardrailPolicy;
	readonly sandbox?: AgentSandboxPosture;
	readonly onFact?: (fact: AcpSessionFact) => void;
}

export interface SweTaskRunResult {
	readonly report: SweTaskReport;
	readonly sandboxReport: SandboxAccessReport;
	readonly facts: readonly AcpSessionFact[];
}

// Run one governed SWE task end to end through the shared HOBO-721 session
// engine; both reports derive from the recorded facts.
export async function runSweTask(
	input: SweTaskRunInput,
): Promise<SweTaskRunResult> {
	const policy = input.policy ?? sweTaskPolicy(input.principal.id);
	const session = await openGovernedSession({
		connector: "swe-claude",
		agent: input.agent,
		principal: input.principal,
		policy,
		cwd: input.task.workspace,
		...(input.onFact ? { onFact: input.onFact } : {}),
	});
	const result = await session.prompt(input.task.instruction);
	return {
		report: extractSweTaskReport(input.task.taskId, result.facts),
		sandboxReport: buildSandboxAccessReport(input.task.workspace, result.facts),
		facts: result.facts,
	};
}

/**
 * Derive the SWE-task report purely from the session's audit facts — a
 * projection over the log, re-derivable at any time.
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

/**
 * Derive the sandbox access report from the audit facts: granted actions
 * outside the workspace/test surface are out-of-scope findings (the s3-07
 * acceptance expects none).
 */
export function buildSandboxAccessReport(
	workspaceRoot: string,
	facts: readonly AcpSessionFact[],
): SandboxAccessReport {
	const replayed = replaySessionFacts(facts);
	const granted = replayed.decisions
		.filter((decision) => decision.effect === "allow")
		.map((decision) => decision.action);
	const outOfScope = granted.filter(
		(action) => !IN_SCOPE_PREFIXES.some((prefix) => action.startsWith(prefix)),
	);
	return Object.freeze({
		schema: SANDBOX_REPORT_SCHEMA,
		workspaceRoot,
		grantedActions: granted,
		outOfScopeAccess: outOfScope,
		clean: outOfScope.length === 0,
	});
}
