import { createDecisionRequest } from "../../../technical-proofs/hobo-policy-ir-contract/src/policy-ir.js";
import { evaluateBudgetQuotaPolicy } from "../../../technical-proofs/budget-quota-policy-contract/src/budget-quota-policy.js";

export const FINOPS_DEPLOY_GATE_ENGINE = "hobo.finops.deploy-gate/contract@0.1.0";

export function evaluateFinOpsDeployGate(input) {
  const source = expectObject(input, "input");
  const estimateUsd = requireNonNegativeNumber(source.costEstimateUsd, "costEstimateUsd");
  const meteringView = source.meteringView;
  const policies = normalizePolicies(source.policies);
  const owner = expectObject(source.owner, "owner");
  const campScope = `${requireString(owner.tenantId, "owner.tenantId")}/${requireString(owner.campId, "owner.campId")}`;
  const agentScope = `${requireString(owner.tenantId, "owner.tenantId")}/${requireString(owner.agentId ?? "agent-deploy", "owner.agentId")}`;

  const request = createDecisionRequest({
    schemaVersion: "hobo.policy-ir/v1",
    subject: {
      kind: "agent",
      id: `agent:${owner.tenantId}/${owner.agentId ?? "agent-deploy"}`,
      delegatedBy: "user:platform-admin",
      roles: ["deployer"],
      scopes: ["hobo:deployment:apply"],
    },
    action: "hobo:deployment:apply",
    resource: {
      kind: "deployment",
      id: `deployment:${owner.bindleId ?? "checkout"}`,
    },
    phase: "plan",
    context: {
      owner,
      costEstimateUsd: estimateUsd,
      campScope,
    },
  });

  const scopedMeteringView = attachScopeCosts(meteringView, {
    [`camp:${campScope}`]: estimateUsd,
    [`agent:${agentScope}`]: readScopeCost(meteringView, `agent:${agentScope}`),
  });
  const result = evaluateBudgetQuotaPolicy({
    request,
    meteringView: scopedMeteringView,
    policies,
    approval: source.approval ?? null,
    reservation: source.reservation ?? null,
  });

  return {
    engine: FINOPS_DEPLOY_GATE_ENGINE,
    effect: result.decision.effect,
    reason: result.decision.reason,
    costEstimateUsd: estimateUsd,
    violations: result.decision.violations ?? [],
    obligations: result.decision.obligations ?? [],
    policyEvent: result.policyEvent,
    blocksDeploy: result.decision.effect === "deny",
    requiresApproval: result.decision.effect === "require-approval",
  };
}

function readScopeCost(meteringView, scopeKey) {
  const view = expectObject(meteringView, "meteringView");
  const scopeCosts = view.scopeCosts ?? {};
  return scopeCosts[scopeKey]?.cost ?? 0;
}

function attachScopeCosts(meteringView, scopeEntries) {
  const view = expectObject(meteringView, "meteringView");
  const existing = view.scopeCosts ?? {};
  const merged = { ...existing };
  for (const [scopeKey, cost] of Object.entries(scopeEntries)) {
    merged[scopeKey] = {
      cost,
      currency: view.currency ?? "USD",
    };
  }
  return {
    ...view,
    scopeCosts: merged,
  };
}

function normalizePolicies(policies) {
  if (!Array.isArray(policies)) {
    throw new TypeError("policies must be an array");
  }
  return policies;
}

function expectObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireNonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative number`);
  }
  return number;
}
