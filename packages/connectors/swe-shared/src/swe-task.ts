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

// Shared SWE-task session shape every vendor adapter runs (HOBO-722..726).
// Vendor packages pass their connector id and keep launch/transcript local.

/** public-contract: SWE-task report document schema id. */
export const SWE_TASK_REPORT_SCHEMA = "hobo.swe-task-report/v1";
/** public-contract: sandbox access-report document schema id. */
export const SANDBOX_REPORT_SCHEMA = "hobo.sandbox-access-report/v1";

/** Default SWE-task guardrails: workspace R/W + tests auto; deploy/destroy/token/admin gated. */
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

export interface SandboxAccessReport {
	readonly schema: typeof SANDBOX_REPORT_SCHEMA;
	readonly workspaceRoot: string;
	readonly grantedActions: readonly string[];
	readonly outOfScopeAccess: readonly string[];
	readonly clean: boolean;
}

const IN_SCOPE_PREFIXES = ["workspace:", "tests:", "logs:"];

export interface SweTaskRunInput {
	/** Vendor connector id, e.g. `swe-claude`. */
	readonly connector: string;
	readonly task: SweTask;
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

/** Run one governed SWE task; reports are projections over audit facts. */
export async function runSweTask(
	input: SweTaskRunInput,
): Promise<SweTaskRunResult> {
	const policy = input.policy ?? sweTaskPolicy(input.principal.id);
	const session = await openGovernedSession({
		connector: input.connector,
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
