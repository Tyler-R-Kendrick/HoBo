import type { PolicyDecisionRequest } from "@hobo/contracts";

import type { FetchLike, GateDecision, GatePlane } from "./planes.js";

// The Cedar policy engine behind the same gate-plane port the Rego adapter
// uses (contracts-policy-flags.md names Cedar as the ABAC-style external
// language beside OPA/Rego). The broker maps its Policy IR decision request
// onto a Cedar authorization request (principal / action / resource /
// context) against the cedar-agent `is_authorized` API, and lowers the
// Allow/Deny verdict onto the engine-neutral GateDecision.
//
// Fail-closed: transport errors and non-200s DENY with
// `policy-engine-unavailable`, exactly like the OPA adapter — an unreachable
// policy engine never allows.

// public-contract: the engine id recorded on Cedar-evaluated policy.Decided facts.
export const CEDAR_ENGINE_ID = "cedar@v1";

export interface CedarGatePlaneOptions {
	endpoint: string;
	fetchFn: FetchLike;
	// Resolves the engine credential out of the token broker; never a raw
	// secret held here.
	tokenProvider?: () => Promise<string> | string;
}

function cedarEntity(kind: string, id: string): string {
	const type = kind.length > 0 ? kind[0]?.toUpperCase() + kind.slice(1) : "Any";
	return `${type}::"${id}"`;
}

export function buildCedarRequest(input: {
	request: PolicyDecisionRequest;
	costQuota: { quota: string; used: number; limit: number };
}): Record<string, unknown> {
	return {
		principal: cedarEntity(
			input.request.subject.kind,
			input.request.subject.id,
		),
		action: `Action::"${input.request.action}"`,
		resource: cedarEntity(
			input.request.resource.kind,
			input.request.resource.id,
		),
		context: {
			phase: input.request.phase,
			...(input.request.context ?? {}),
			costQuota: input.costQuota,
		},
	};
}

function unavailable(message: string): GateDecision {
	return {
		effect: "deny",
		reasons: [{ plane: "policy", code: "policy-engine-unavailable", message }],
		events: [],
	};
}

export function createCedarGatePlane(
	options: CedarGatePlaneOptions,
): GatePlane {
	const url = `${options.endpoint.replace(/\/$/u, "")}/v1/is_authorized`;
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
					body: JSON.stringify(buildCedarRequest(input)),
				});
			} catch (error) {
				return unavailable(`Cedar transport failed: ${String(error)}`);
			}
			if (response.status !== 200) {
				return unavailable(`Cedar engine returned HTTP ${response.status}`);
			}
			// Parse-don't-validate over the untrusted verdict: only an explicit
			// "Allow" allows; anything else fails closed to deny.
			const body = (await response.json()) as {
				decision?: unknown;
				diagnostics?: { reason?: unknown; errors?: unknown };
			};
			const allow = body?.decision === "Allow";
			const policyIds = Array.isArray(body?.diagnostics?.reason)
				? body.diagnostics.reason.filter(
						(id): id is string => typeof id === "string",
					)
				: [];
			const effect: GateDecision["effect"] = allow ? "allow" : "deny";
			const policyDecided: Record<string, unknown> = {
				type: "policy.Decided",
				effect,
				engine: CEDAR_ENGINE_ID,
				policyIds,
				subject: input.request.subject,
				action: input.request.action,
				resource: input.request.resource,
			};
			return {
				effect,
				reasons: allow
					? []
					: [
							{
								plane: "policy",
								code: "policy-denied",
								message:
									policyIds.length > 0
										? `denied by Cedar policies ${policyIds.join(", ")}`
										: "denied by the Cedar authorization decision",
							},
						],
				events: [policyDecided],
			};
		},
	};
}
