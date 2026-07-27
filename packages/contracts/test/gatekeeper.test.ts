import { describe, expect, it } from "vitest";

import { createBoundaryContract } from "../src/contract-ir.js";
import { evaluateGatekeeper } from "../src/gatekeeper.js";
import { definePolicyRule, type PolicyPack } from "../src/policy-pack.js";

const deployedContract = createBoundaryContract({
	id: "contract-orders-http",
	version: "1.2.0",
	edge: {
		kind: "event",
		producer: "checkout-api@1.2.0",
		consumer: "checkout-worker@1.7.0",
		channel: "orders.http",
		operation: "order.created",
	},
	requiredShape: {
		format: "json-schema",
		requiredFields: ["id", "tenantId", "total"],
		providedFields: ["id", "tenantId", "total"],
	},
});

const compatibleCandidate = createBoundaryContract({
	id: "contract-orders-http",
	version: "1.3.0",
	edge: {
		kind: "event",
		producer: "checkout-api@2.4.0",
		consumer: "checkout-worker@1.7.0",
		channel: "orders.http",
		operation: "order.created",
	},
	requiredShape: {
		format: "json-schema",
		requiredFields: ["id", "tenantId", "total"],
		providedFields: ["id", "tenantId", "total", "currency"],
	},
});

const breakingCandidate = createBoundaryContract({
	id: "contract-orders-http",
	version: "3.0.0",
	edge: {
		kind: "event",
		producer: "checkout-api@3.0.0",
		consumer: "checkout-worker@1.7.0",
		channel: "orders.http",
		operation: "order.created",
	},
	requiredShape: {
		format: "json-schema",
		requiredFields: ["id", "total"],
		providedFields: ["id", "total"],
	},
});

const baseRequest = {
	subject: { kind: "agent", id: "spiffe://tenant-a/yard/prod/agent/deployer" },
	action: "hobo:delta:promote",
	resource: { kind: "deployment", id: "deployment:checkout-prod" },
	phase: "apply",
	context: { target: "prod" },
};

const plan = {
	objective: "cost",
	resources: [{ name: "checkout-api", port: "hobo:http/handler" }],
};
const goodQuota = { quota: "deployments/day", used: 7, limit: 20 };

describe("Gatekeeper composition", () => {
	it("allows a compatible deploy under a permissive default pack and STILL records policy.Decided", () => {
		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [compatibleCandidate] },
			costQuota: goodQuota,
		});

		expect(result.decision).toBe("allow");
		expect(result.reasons).toEqual([]);
		// governed-by-default: a policy.Decided is emitted even on allow
		expect(result.policyDecided.type).toBe("policy.Decided");
		expect(result.policyDecided.data.effect).toBe("allow");
		expect(result.canDeploy.ok).toBe(true);
		expect(result.costQuota.ok).toBe(true);
		expect(
			result.events.some((event) => event.type === "gatekeeper.Decided"),
		).toBe(true);
	});

	it("DENIES a seeded breaking contract change with an explainable machine-readable reason", () => {
		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [breakingCandidate] },
			costQuota: goodQuota,
		});

		expect(result.decision).toBe("deny");
		const contractReason = result.reasons.find(
			(reason) => reason.gate === "contracts",
		);
		expect(contractReason?.code).toBe("required-field-removed");
		expect(contractReason?.details?.fields).toContain("tenantId");
		// still audited
		expect(result.policyDecided.type).toBe("policy.Decided");
	});

	it("DENIES when a policy pack denies the action", () => {
		const denyPack: PolicyPack = {
			id: "yard-prod-freeze",
			version: "1.0.0",
			rules: [
				definePolicyRule({
					id: "freeze-prod-deploys",
					when: (request) => request.action === "hobo:delta:promote",
					decide: () => ({
						effect: "deny",
						reason: "prod deploys are frozen by mandatory policy",
						violations: ["deploy-freeze-active"],
					}),
				}),
			],
		};

		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [compatibleCandidate] },
			policyPack: denyPack,
			costQuota: goodQuota,
		});

		expect(result.decision).toBe("deny");
		const policyReason = result.reasons.find(
			(reason) => reason.gate === "policy",
		);
		expect(policyReason?.code).toBe("policy-denied");
		expect(policyReason?.message).toMatch(/frozen/);
	});

	it("DENIES when the cost quota is exceeded", () => {
		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [compatibleCandidate] },
			costQuota: { quota: "deployments/day", used: 20, limit: 20 },
		});

		expect(result.decision).toBe("deny");
		const costReason = result.reasons.find((reason) => reason.gate === "cost");
		expect(costReason?.code).toBe("quota-exceeded");
	});

	it("requires approval when a policy obligation is pending", () => {
		const approvalPack: PolicyPack = {
			id: "yard-prod-governance",
			version: "1.0.0",
			rules: [
				definePolicyRule({
					id: "prod-deploy-requires-approval",
					when: (request) => request.action === "hobo:delta:promote",
					decide: () => ({
						effect: "require-approval",
						reason: "production deploy requires approval",
						obligations: [
							{
								id: "obl:approval:checkout-prod",
								kind: "require-approval",
								satisfied: false,
							},
						],
					}),
				}),
			],
		};

		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [compatibleCandidate] },
			policyPack: approvalPack,
			costQuota: goodQuota,
		});

		expect(result.decision).toBe("require-approval");
		expect(
			result.obligations.some(
				(obligation) => obligation.id === "obl:approval:checkout-prod",
			),
		).toBe(true);
		expect(result.reasons.some((reason) => reason.gate === "obligations")).toBe(
			true,
		);
	});

	it("allows once the obligation is satisfied", () => {
		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [compatibleCandidate] },
			obligations: [
				{
					id: "obl:canary:checkout-prod",
					kind: "require-canary",
					satisfied: true,
				},
			],
			costQuota: goodQuota,
		});
		expect(result.decision).toBe("allow");
	});
});

	it("DENIES when secretless-config ranking gate fails (ADR-0027)", () => {
		const result = evaluateGatekeeper({
			request: baseRequest,
			deployedState: { contracts: [deployedContract] },
			candidate: { plan, contracts: [compatibleCandidate] },
			costQuota: goodQuota,
			secretlessConfig: {
				ok: false,
				reasons: [
					{
						code: "static-escape-forbidden",
						message: "field LEGACY source static-escape exceeds policy ceiling",
						field: "LEGACY",
					},
				],
			},
		});
		expect(result.decision).toBe("deny");
		expect(
			result.reasons.some((r) => r.code === "secretless-config:static-escape-forbidden"),
		).toBe(true);
	});
