import type { GatekeeperEffect, PolicyDecisionRequest } from "@hobo/contracts";

// The OPA/Rego policy engine behind the broker's gate-plane port, extracted
// from `@hobo/broker` per docs/plans/0017 F30 (the broker re-exports this
// adapter, so `createOpaGatePlane` keeps its original import surface). Rego
// is the broker's first-class external policy language
// (contracts-policy-flags.md: the policy-engine port genuinely accepts
// OPA/Rego and Cedar providers; the in-proc TypeScript policy pack stays the
// default). This adapter maps the broker's Policy IR decision request onto an
// OPA `input` document, queries the OPA Data API decision at
// `hobo/broker/decision`, and lowers the Rego result back onto the
// engine-neutral gate decision.
//
// The types below are STRUCTURAL mirrors of the broker's gate-plane port
// (`@hobo/broker` planes.ts) — declared here so the dependency points
// provider→contracts only and the broker can depend on this package without
// a cycle. TypeScript's structural typing keeps them assignable.
//
// The Rego decision document contract (see docs/design/hobo-broker.md
// §Policy languages for the reference policy):
//   input:  { request: <Policy IR decision request>, costQuota: {...} }
//   result: { effect: "allow"|"allow-degraded"|"deny"|"require-approval",
//             reasons: [{ code, message, plane? }], policyIds?: [string] }
//
// Fail-closed: transport errors, non-200s, and undefined results DENY with
// `policy-engine-unavailable` — an unreachable policy engine never allows.

// public-contract: the Rego decision path the broker queries on the OPA Data API.
export const OPA_DECISION_PATH = "hobo/broker/decision";
// public-contract: the engine id recorded on OPA-evaluated policy.Decided facts.
export const OPA_ENGINE_ID = "opa/rego@v1";

// Structural mirror of the broker's RejectionPlane union.
export type PolicyEnginePlane =
	| "policy"
	| "contracts"
	| "billing"
	| "placement"
	| "connectors"
	| "residency";

// Structural mirror of the broker's RejectionReason.
export interface PolicyEngineReason {
	plane: PolicyEnginePlane;
	code: string;
	message: string;
}

// Structural mirror of the broker's GateDecision.
export interface PolicyEngineDecision {
	effect: GatekeeperEffect;
	reasons: PolicyEngineReason[];
	events: Array<Record<string, unknown>>;
}

// Structural mirror of the broker's GatePlane port.
export interface PolicyEnginePlanePort {
	evaluate(input: {
		request: PolicyDecisionRequest;
		costQuota: { quota: string; used: number; limit: number };
	}): PolicyEngineDecision | Promise<PolicyEngineDecision>;
}

// Structural mirror of the broker's FetchLike (injected transport — the
// adapter never reaches for a global fetch).
export type PolicyEngineFetch = (
	url: string,
	init: {
		method: string;
		headers: Record<string, string>;
		body: string;
	},
) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface OpaGatePlaneOptions {
	endpoint: string;
	fetchFn: PolicyEngineFetch;
	decisionPath?: string;
	// Resolves the OPA credential out of the token broker when the sidecar or
	// remote OPA requires one; never a raw secret held here.
	tokenProvider?: () => Promise<string> | string;
}

export function buildOpaInput(input: {
	request: PolicyDecisionRequest;
	costQuota: { quota: string; used: number; limit: number };
}): Record<string, unknown> {
	return { input: { request: input.request, costQuota: input.costQuota } };
}

const GATE_EFFECTS = new Set([
	"allow",
	"allow-degraded",
	"deny",
	"require-approval",
]);

const PLANES: readonly PolicyEnginePlane[] = [
	"policy",
	"contracts",
	"billing",
	"placement",
	"connectors",
	"residency",
];

function unavailable(message: string): PolicyEngineDecision {
	return {
		effect: "deny",
		reasons: [
			{
				plane: "policy",
				code: "policy-engine-unavailable",
				message,
			},
		],
		events: [],
	};
}

// Parse-don't-validate over the untrusted Rego result: only well-formed
// reasons survive, and an unknown effect fails closed to deny.
function parseRegoResult(
	raw: unknown,
	request: PolicyDecisionRequest,
): PolicyEngineDecision {
	if (raw === null || typeof raw !== "object") {
		return unavailable("the Rego decision returned no result document");
	}
	const result = raw as Record<string, unknown>;
	const effect =
		typeof result.effect === "string" && GATE_EFFECTS.has(result.effect)
			? (result.effect as PolicyEngineDecision["effect"])
			: "deny";
	const reasons: PolicyEngineReason[] = [];
	if (Array.isArray(result.reasons)) {
		for (const entry of result.reasons) {
			if (entry === null || typeof entry !== "object") continue;
			const rec = entry as Record<string, unknown>;
			if (typeof rec.code !== "string" || rec.code.length === 0) continue;
			reasons.push({
				plane:
					typeof rec.plane === "string" &&
					(PLANES as readonly string[]).includes(rec.plane)
						? (rec.plane as PolicyEnginePlane)
						: "policy",
				code: rec.code,
				message:
					typeof rec.message === "string" && rec.message.length > 0
						? rec.message
						: rec.code,
			});
		}
	}
	if (effect === "deny" && reasons.length === 0) {
		reasons.push({
			plane: "policy",
			code: "policy-denied",
			message: "denied by the Rego decision with no reason document",
		});
	}
	const policyIds = Array.isArray(result.policyIds)
		? result.policyIds.filter((id): id is string => typeof id === "string")
		: [];
	// Every evaluation records a policy.Decided fact, allow included — the
	// same governed-by-default discipline as the in-proc policy pack.
	const policyDecided: Record<string, unknown> = {
		type: "policy.Decided",
		effect,
		engine: OPA_ENGINE_ID,
		policyIds,
		subject: request.subject,
		action: request.action,
		resource: request.resource,
	};
	return { effect, reasons, events: [policyDecided] };
}

export function createOpaGatePlane(
	options: OpaGatePlaneOptions,
): PolicyEnginePlanePort {
	const decisionPath = options.decisionPath ?? OPA_DECISION_PATH;
	const url = `${options.endpoint.replace(/\/$/u, "")}/v1/data/${decisionPath}`;
	return {
		async evaluate(input) {
			const token = options.tokenProvider
				? await options.tokenProvider()
				: undefined;
			let response: { status: number; json(): Promise<unknown> };
			try {
				response = await options.fetchFn(url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						...(token !== undefined
							? { authorization: `Bearer ${token}` }
							: {}),
					},
					body: JSON.stringify(buildOpaInput(input)),
				});
			} catch (error) {
				return unavailable(`OPA transport failed: ${String(error)}`);
			}
			if (response.status !== 200) {
				return unavailable(`OPA Data API returned HTTP ${response.status}`);
			}
			const body = (await response.json()) as { result?: unknown };
			return parseRegoResult(body?.result, input.request);
		},
	};
}
