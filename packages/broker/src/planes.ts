import {
	type CandidateDeployment,
	type DeployedContractState,
	evaluateGatekeeper,
	type GatekeeperDecision,
	type PolicyDecisionRequest,
	type PolicyPack,
} from "@hobo/contracts";

import type {
	BillingPolicy,
	BrokerRequest,
	DeliveryPolicy,
	RejectionReason,
	ResolutionReceipt,
} from "./types.js";

// The enforcement/execution planes the broker wraps. Each plane is a port so
// deployments can swap engines (OPA for the policy plane, a Pact broker for
// the contract plane, a metering service for billing, Argo CD for delivery)
// without touching the brokering pipeline. The defaults below COMPOSE
// @hobo/contracts — the Gatekeeper (contract compatibility + policy pack +
// obligations + quota) is imported and RUN, not reinvented.

// OPA-shaped: a decision request document in, an effect + reasons out. An OPA
// adapter maps this to a Rego `hobo/broker/decision` query; the default runs
// the @hobo/contracts policy pack + Gatekeeper composition in process.
export interface GatePlane {
	evaluate(input: {
		request: PolicyDecisionRequest;
		costQuota: { quota: string; used: number; limit: number };
	}): {
		decision: GatekeeperDecision;
		reasons: RejectionReason[];
	};
}

// Billing enforcement plane: authorize estimated spend against the billing
// policy (budget + per-resolution spend cap) before any placement happens.
export interface BillingPlane {
	authorize(input: { spendEstimateUsd: number; billing: BillingPolicy }): {
		ok: boolean;
		reasons: RejectionReason[];
	};
}

// Argo-shaped delivery plane: hand an accepted receipt to the rollout engine.
export interface DeliveryTicket {
	engine: string;
	target: string;
	document: Record<string, unknown>;
}

export interface DeliveryPlane {
	submit(receipt: ResolutionReceipt, policy: DeliveryPolicy): DeliveryTicket;
}

export interface GatePlaneOptions {
	policyPack?: PolicyPack;
	deployedState?: DeployedContractState;
	candidate?: CandidateDeployment;
}

export function createGatekeeperGatePlane(
	options: GatePlaneOptions = {},
): GatePlane {
	return {
		evaluate(input) {
			const decision = evaluateGatekeeper({
				request: input.request,
				deployedState: options.deployedState ?? { contracts: [] },
				candidate: options.candidate ?? {
					plan: { resources: [] },
					contracts: [],
				},
				...(options.policyPack !== undefined
					? { policyPack: options.policyPack }
					: {}),
				costQuota: input.costQuota,
			});
			const reasons: RejectionReason[] = decision.reasons.map((reason) => ({
				plane:
					reason.gate === "cost"
						? "billing"
						: reason.gate === "contracts"
							? "contracts"
							: "policy",
				code: reason.code,
				message: reason.message,
			}));
			return { decision, reasons };
		},
	};
}

export function createBillingPlane(): BillingPlane {
	return {
		authorize({ spendEstimateUsd, billing }) {
			const reasons: RejectionReason[] = [];
			if (billing.spendCapUsd > 0 && spendEstimateUsd > billing.spendCapUsd) {
				reasons.push({
					plane: "billing",
					code: "spend-cap-exceeded",
					message: `estimated spend ${spendEstimateUsd} USD exceeds per-resolution cap ${billing.spendCapUsd} USD`,
				});
			}
			if (billing.budgetUsd > 0 && spendEstimateUsd > billing.budgetUsd) {
				reasons.push({
					plane: "billing",
					code: "budget-exceeded",
					message: `estimated spend ${spendEstimateUsd} USD exceeds remaining budget ${billing.budgetUsd} USD`,
				});
			}
			return { ok: reasons.length === 0, reasons };
		},
	};
}

// Render an Argo CD Application document for an accepted receipt. Pure data —
// submission to a real Argo control plane happens behind DeliveryPlane, so
// tests and dry runs can inspect exactly what would be applied.
export function renderArgoApplication(
	receipt: ResolutionReceipt,
	policy: DeliveryPolicy,
): Record<string, unknown> {
	return {
		apiVersion: "argoproj.io/v1alpha1",
		kind: "Application",
		metadata: {
			name: `hobo-${receipt.requestId}`,
			labels: {
				"hobo.dev/broker": receipt.brokerId,
				"hobo.dev/policy-hash": receipt.policyHash,
			},
		},
		spec: {
			project: "hobo",
			source: {
				repoURL: policy.gitopsRepo ?? "",
				path: `receipts/${receipt.requestId}`,
			},
			destination: {
				namespace: policy.destinationNamespace ?? "hobo",
			},
			syncPolicy:
				policy.syncMode === "auto"
					? { automated: { prune: policy.prune } }
					: {},
		},
	};
}

export function createDeliveryPlane(): DeliveryPlane {
	return {
		submit(receipt, policy) {
			if (policy.engine === "argo") {
				return {
					engine: "argo",
					target: policy.gitopsRepo ?? "",
					document: renderArgoApplication(receipt, policy),
				};
			}
			return {
				engine: "in-proc",
				target: receipt.brokerId,
				document: { receipt: receipt as unknown as Record<string, unknown> },
			};
		},
	};
}

// Adapt a parsed BrokerRequest into the OPA-shaped policy decision request the
// gate plane evaluates: the most specific topology id becomes the resource.
export function toPolicyDecisionRequest(
	brokerId: string,
	request: BrokerRequest,
): PolicyDecisionRequest {
	const scope = request.scope;
	const resource =
		scope.campId !== undefined
			? { kind: "camp", id: scope.campId }
			: scope.yardId !== undefined
				? { kind: "yard", id: scope.yardId }
				: scope.junctionId !== undefined
					? { kind: "junction", id: scope.junctionId }
					: { kind: "bindle", id: scope.bindleId };
	return {
		// The broker acts as a control-plane service in the Policy IR's subject
		// taxonomy (user | service | agent | system).
		subject: { kind: "service", id: brokerId },
		action: "hobo:broker:resolve",
		resource,
		phase: "plan",
		context: {
			target: scope.bindleId,
			costEstimateUsd: request.spendEstimateUsd,
			requirementCount: request.requirements.length,
		},
	};
}
