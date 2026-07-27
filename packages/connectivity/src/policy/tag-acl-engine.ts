import {
	type PolicyDecision,
	type PolicyEngine,
	type PolicyRequest,
	allowDecision,
	denyDecision,
	createUsageEvent,
	type MeteringBus,
} from "@hobo/core";

// public-contract: engine id for the initial tag/ACL PolicyEngine.
export const TAG_ACL_POLICY_ENGINE_ID = "hobo.policy.tag-acl/v1" as const;

/**
 * Simple tenant-aware tag/ACL evaluator.
 * - Cross-tenant access is denied unless resource tags include `shared:true`.
 * - Optional required tags on the resource must all be present on the subject.
 * - Overlay-style role tags (`role:*`) are informational; callers pass them for audit.
 */
export function createTagAclPolicyEngine(options?: {
	readonly metering?: MeteringBus;
}): PolicyEngine {
	const metering = options?.metering;
	return {
		engineId: TAG_ACL_POLICY_ENGINE_ID,
		async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
			const sameTenant =
				request.subject.tenantId === request.resource.tenantId;
			const shared =
				request.resource.tags?.includes("shared:true") === true ||
				request.resource.attributes?.shared === "true";

			let decision: PolicyDecision;
			if (!sameTenant && !shared) {
				decision = denyDecision(TAG_ACL_POLICY_ENGINE_ID, request, [
					"cross-tenant access denied",
				]);
			} else {
				const required = (request.resource.tags ?? []).filter((t) =>
					t.startsWith("require:"),
				);
				const missing = required.filter(
					(tag) => !request.subject.tags.includes(tag.slice("require:".length)),
				);
				if (missing.length > 0) {
					decision = denyDecision(TAG_ACL_POLICY_ENGINE_ID, request, [
						`missing required tags: ${missing.join(", ")}`,
					]);
				} else {
					decision = allowDecision(TAG_ACL_POLICY_ENGINE_ID, request, [
						sameTenant ? "same-tenant" : "shared-resource",
					]);
				}
			}

			if (metering) {
				await metering.emit(
					createUsageEvent({
						tenantId: request.subject.tenantId,
						eventType: "policy.evaluate",
						resource: `${request.resource.kind}:${request.resource.id}`,
						metadata: {
							effect: decision.effect,
							action: request.action,
							engineId: TAG_ACL_POLICY_ENGINE_ID,
						},
					}),
				);
			}
			return decision;
		},
	};
}
