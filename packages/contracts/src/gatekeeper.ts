import {
	type CandidateDeployment,
	type CanDeployResult,
	type DeployedContractState,
	evaluateCanDeploy,
} from "./can-deploy.js";
import {
	EFFECT_RANK,
	type PolicyDecisionRequest,
	type PolicyEffect,
	type PolicyPack,
	createPermissiveDefaultPack,
	evaluatePolicyPack,
} from "./policy-pack.js";

// The unified Gatekeeper (contracts-policy-flags.md §unified Gatekeeper). It sits
// in front of every deploy and composes four gates into ONE explainable,
// machine-readable decision (FR-050/051/052, NFR-017):
//   (a) the can-deploy contract-compatibility check,
//   (b) the @hobo/policy policy-pack decision (imported and RUN, not reinvented),
//   (c) an obligation check (allowed-but-must-do effects must be satisfiable),
//   (d) a cost/quota check.
// Every evaluation records a `policy.Decided` fact even when it allows; a seeded
// unsafe change (breaking contract OR deny policy OR quota-exceeded) is denied
// with a precise reason.

export const GATEKEEPER_SCHEMA_VERSION = "hobo.gatekeeper/v1";
export const GATEKEEPER_DECIDED_EVENT = "gatekeeper.Decided";

export type GatekeeperEffect =
	| "allow"
	| "allow-degraded"
	| "deny"
	| "require-approval";

// domain-view: composed gate reason; wire form is MachineReadableReason in data-models/contracts.proto.
export interface MachineReadableReason {
	gate: "contracts" | "policy" | "obligations" | "cost";
	code: string;
	message: string;
	details?: Record<string, unknown>;
}

// domain-view: allowed-but-must-do effect; wire form is ObligationRecord in data-models/contracts.proto.
export interface ObligationRecord {
	id: string;
	kind: string;
	satisfied: boolean;
	deadline?: string;
}

// domain-view: quota check input/verdict; wire form is CostQuotaRecord in data-models/contracts.proto.
export interface CostQuotaRecord {
	quota: string;
	used: number;
	requested: number;
	limit: number;
	remaining: number;
	ok: boolean;
}

export interface CostQuotaInput {
	quota: string;
	used: number;
	limit: number;
	requested?: number;
}

// domain-view: single composed Gatekeeper verdict; wire form is GatekeeperDecision in data-models/contracts.proto.
export interface GatekeeperDecision {
	schemaVersion: typeof GATEKEEPER_SCHEMA_VERSION;
	decision: GatekeeperEffect;
	reasons: MachineReadableReason[];
	obligations: ObligationRecord[];
	policyDecided: Record<string, unknown>;
	canDeploy: CanDeployResult;
	costQuota: CostQuotaRecord;
	events: Array<Record<string, unknown>>;
}

export interface GatekeeperInput {
	request: PolicyDecisionRequest;
	deployedState: DeployedContractState;
	candidate: CandidateDeployment;
	policyPack?: PolicyPack;
	obligations?: ObligationRecord[];
	costQuota: CostQuotaInput;
}

export function evaluateGatekeeper(input: GatekeeperInput): GatekeeperDecision {
	const reasons: MachineReadableReason[] = [];

	// (a) contract compatibility.
	const canDeploy = evaluateCanDeploy({
		target: input.request.context?.target
			? String(input.request.context.target)
			: (input.request.resource?.id ?? "target"),
		deployedState: input.deployedState,
		candidate: input.candidate,
	});
	if (!canDeploy.ok) {
		for (const reason of canDeploy.reasons) {
			reasons.push({
				gate: "contracts",
				code: reason.code,
				message: reason.message,
				details: {
					contractId: reason.contractId,
					channel: reason.channel,
					fields: reason.fields,
					suggestedFixes: canDeploy.suggestedFixes,
				},
			});
		}
	}

	// (b) policy decision — RUN @hobo/policy.
	const policy = evaluatePolicyPack({
		request: input.request,
		pack: input.policyPack ?? createPermissiveDefaultPack(),
	});
	const policyEffect = policy.decision.effect as PolicyEffect;
	if (policyEffect === "deny") {
		reasons.push({
			gate: "policy",
			code: "policy-denied",
			message: policy.decision.reason,
			details: {
				policyIds: policy.decision.evidence.policyIds,
				violations: policy.decision.violations,
			},
		});
	}

	// (c) obligations — an allowed-but-must-do effect must be satisfiable. Policy
	// obligations that are not yet satisfied gate the deploy to require-approval.
	const obligations = collectObligations(
		input.obligations,
		policy.decision.obligations,
	);
	const pendingObligations = obligations.filter(
		(obligation) => !obligation.satisfied,
	);
	if (pendingObligations.length > 0) {
		reasons.push({
			gate: "obligations",
			code: "obligation-pending",
			message: `${pendingObligations.length} obligation(s) must be satisfied before apply`,
			details: {
				pending: pendingObligations.map((obligation) => obligation.id),
			},
		});
	}

	// (d) cost / quota.
	const costQuota = evaluateCostQuota(input.costQuota);
	if (!costQuota.ok) {
		reasons.push({
			gate: "cost",
			code: "quota-exceeded",
			message: `quota ${costQuota.quota} exceeded: ${costQuota.used}+${costQuota.requested} > ${costQuota.limit}`,
			details: { remaining: costQuota.remaining },
		});
	}

	const decision = composeEffect({
		contractOk: canDeploy.ok,
		policyEffect,
		pendingObligations: pendingObligations.length > 0,
		quotaOk: costQuota.ok,
	});

	const policyDecided = policy.event as unknown as Record<string, unknown>;
	const gatekeeperEvent = {
		type: GATEKEEPER_DECIDED_EVENT,
		schemaVersion: GATEKEEPER_SCHEMA_VERSION,
		decision,
		reasons,
		deployable: decision === "allow" || decision === "allow-degraded",
	};

	return {
		schemaVersion: GATEKEEPER_SCHEMA_VERSION,
		decision,
		reasons,
		obligations,
		// policy.Decided is recorded on EVERY evaluation, allow included.
		policyDecided,
		canDeploy,
		costQuota,
		events: [...canDeploy.events, policyDecided, gatekeeperEvent],
	};
}

function composeEffect(input: {
	contractOk: boolean;
	policyEffect: PolicyEffect;
	pendingObligations: boolean;
	quotaOk: boolean;
}): GatekeeperEffect {
	// Any hard-deny gate denies the whole decision.
	if (!input.contractOk || input.policyEffect === "deny" || !input.quotaOk) {
		return "deny";
	}
	if (input.policyEffect === "require-approval" || input.pendingObligations) {
		return "require-approval";
	}
	if (input.policyEffect === "allow-degraded") {
		return "allow-degraded";
	}
	return "allow";
}

function collectObligations(
	provided: ObligationRecord[] | undefined,
	policyObligations: Array<Record<string, unknown>>,
): ObligationRecord[] {
	const fromProvided = (provided ?? []).map((obligation) => ({
		id: obligation.id,
		kind: obligation.kind,
		satisfied: obligation.satisfied === true,
		...(obligation.deadline ? { deadline: obligation.deadline } : {}),
	}));
	const providedIds = new Set(fromProvided.map((obligation) => obligation.id));
	const fromPolicy = policyObligations
		.map((obligation, index) => ({
			id: String(obligation.id ?? `policy-obligation-${index}`),
			kind: String(obligation.kind ?? "unknown"),
			satisfied: obligation.satisfied === true,
			...(obligation.deadline ? { deadline: String(obligation.deadline) } : {}),
		}))
		.filter((obligation) => !providedIds.has(obligation.id));
	return [...fromProvided, ...fromPolicy];
}

function evaluateCostQuota(input: CostQuotaInput): CostQuotaRecord {
	const requested = input.requested ?? 1;
	const remaining = input.limit - input.used - requested;
	return {
		quota: input.quota,
		used: input.used,
		requested,
		limit: input.limit,
		remaining,
		ok: remaining >= 0,
	};
}

// Re-exported so callers can rank gate effects consistently with policy.
export { EFFECT_RANK };
