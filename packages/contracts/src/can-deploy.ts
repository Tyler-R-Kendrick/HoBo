import {
	type BoundaryContract,
	type CompatibilityReason,
	checkCompatibility,
	parseBoundaryContract,
} from "./contract-ir.js";

// The `can-deploy` gate (contracts-policy-flags.md §can-deploy): given the
// contract state currently deployed to a target and a candidate deployment plan,
// decide whether the candidate's boundary contracts are compatible with what is
// already running there. Incompatibility yields a precise, machine-readable
// reason an agent can self-correct against (like `deployment.PlanRejected`).

export const CAN_DEPLOY_SCHEMA_VERSION = "hobo.can-deploy/v1";
export const COMPAT_GATE_PASSED = "compat.GatePassed";
export const COMPAT_GATE_FAILED = "compat.GateFailed";

// A minimal, structural mirror of @hobo/cloud's ResourcePlan/DeploymentPlan
// (packages/cloud/src/plan-types.ts). The gate depends on the plan's *shape*,
// not on @hobo/cloud at runtime, so contracts stays inward of cloud; a caller in
// the gateway adapts a real DeploymentPlan to this input.
export interface ResourcePlanRef {
	name: string;
	port: string;
	provider?: string;
}

export interface DeploymentPlanInput {
	objective?: string;
	resources: ResourcePlanRef[];
}

// domain-view: parsed deployed-state snapshot; wire form is CanDeployResult inputs in data-models/contracts.proto.
export interface DeployedContractState {
	contracts: BoundaryContract[];
}

export interface CandidateDeployment {
	plan: DeploymentPlanInput;
	contracts: BoundaryContract[];
}

export interface CompatibilityMatrixRow {
	channel: string;
	contractId: string;
	deployedVersion: string | null;
	candidateVersion: string;
	compatible: boolean;
}

// domain-view: parsed can-deploy verdict; wire form is CanDeployResult in data-models/contracts.proto.
export interface CanDeployResult {
	schemaVersion: typeof CAN_DEPLOY_SCHEMA_VERSION;
	ok: boolean;
	target: string;
	matrix: CompatibilityMatrixRow[];
	reasons: CompatibilityReason[];
	summary: string;
	suggestedFixes: string[];
	events: Array<Record<string, unknown>>;
}

export interface CanDeployInput {
	target: string;
	deployedState: DeployedContractState;
	candidate: CandidateDeployment;
}

export function evaluateCanDeploy(input: CanDeployInput): CanDeployResult {
	const target = requireString(input.target, "target");
	const deployed = new Map<string, BoundaryContract>();
	for (const contract of input.deployedState?.contracts ?? []) {
		const parsed = parseBoundaryContract(contract);
		deployed.set(parsed.edge.channel, parsed);
	}

	const matrix: CompatibilityMatrixRow[] = [];
	const reasons: CompatibilityReason[] = [];

	for (const candidateRaw of input.candidate?.contracts ?? []) {
		const candidate = parseBoundaryContract(candidateRaw);
		const prior = deployed.get(candidate.edge.channel);
		if (!prior) {
			// A channel nothing consumes yet — introducing it cannot break a
			// running consumer, so it is compatible by construction.
			matrix.push({
				channel: candidate.edge.channel,
				contractId: candidate.id,
				deployedVersion: null,
				candidateVersion: candidate.version,
				compatible: true,
			});
			continue;
		}

		const result = checkCompatibility(prior, candidate);
		matrix.push({
			channel: candidate.edge.channel,
			contractId: candidate.id,
			deployedVersion: prior.version,
			candidateVersion: candidate.version,
			compatible: result.kind === "compatible",
		});
		if (result.kind === "breaking") {
			reasons.push(...result.reasons);
		}
	}

	const ok = reasons.length === 0;
	const summary = ok
		? "compatible"
		: buildSummary(target, reasons[0] as CompatibilityReason);
	const suggestedFixes = ok
		? []
		: buildSuggestedFixes(reasons[0] as CompatibilityReason);

	const event = {
		type: ok ? COMPAT_GATE_PASSED : COMPAT_GATE_FAILED,
		schemaVersion: CAN_DEPLOY_SCHEMA_VERSION,
		target,
		matrix,
		reasons,
		summary,
		suggestedFixes,
	};

	return {
		schemaVersion: CAN_DEPLOY_SCHEMA_VERSION,
		ok,
		target,
		matrix,
		reasons,
		summary,
		suggestedFixes,
		events: [event],
	};
}

export function replayCanDeployDecision(
	events: Array<Record<string, unknown>> = [],
): CanDeployResult {
	const event = events.at(-1);
	if (
		!event ||
		(event.type !== COMPAT_GATE_PASSED && event.type !== COMPAT_GATE_FAILED)
	) {
		throw new Error("no compat.Gate event to replay");
	}
	return {
		schemaVersion: CAN_DEPLOY_SCHEMA_VERSION,
		ok: event.type === COMPAT_GATE_PASSED,
		target: event.target as string,
		matrix: (event.matrix as CompatibilityMatrixRow[]) ?? [],
		reasons: (event.reasons as CompatibilityReason[]) ?? [],
		summary: event.summary as string,
		suggestedFixes: (event.suggestedFixes as string[]) ?? [],
		events,
	};
}

function buildSummary(target: string, reason: CompatibilityReason): string {
	if (reason.code === "required-field-removed") {
		return `blocked: ${reason.contractId}@${reason.nextVersion} on ${reason.channel} removed ${reason.fields.join(", ")}, but consumers running in ${target} require them.`;
	}
	return `blocked: ${reason.contractId} ${reason.code} on ${reason.channel} (${target}): ${reason.message}`;
}

function buildSuggestedFixes(reason: CompatibilityReason): string[] {
	if (reason.code === "required-field-removed") {
		return [
			`dual-publish ${reason.fields.join(", ")} during a migration window`,
			`deploy the consumer that tolerates missing ${reason.fields.join(", ")} first`,
			"add a compatibility shim",
		];
	}
	if (reason.code === "version-regressed") {
		return [`promote a version >= ${reason.prevVersion}`];
	}
	return ["reconcile the contract change with running consumers"];
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${field} is required`);
	}
	return value;
}
