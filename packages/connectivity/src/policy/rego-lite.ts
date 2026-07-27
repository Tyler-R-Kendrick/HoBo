/**
 * In-process policy document evaluator (Rego-inspired JSON rules).
 * Used when OPA HTTP/CLI is unavailable — still tenant-aware and auditable.
 *
 * Rule document shape (JSON):
 * {
 *   "default": "deny" | "allow",
 *   "rules": [
 *     {
 *       "effect": "allow" | "deny",
 *       "actions": ["junction.join", "*"],
 *       "when": {
 *         "sameTenant": true,
 *         "subjectTagsAny": ["role:admin"],
 *         "subjectTagsAll": ["role:junction"],
 *         "resourceKinds": ["junction", "dns-endpoint"],
 *         "resourceShared": true
 *       }
 *     }
 *   ]
 * }
 */
import {
	type PolicyDecision,
	type PolicyRequest,
	allowDecision,
	denyDecision,
} from "@hobo/core";

// Keep engine id local to avoid circular import with opa-engine.ts.
const REGO_LITE_ENGINE_ID = "hobo.policy.opa-rego/v1" as const;

export interface RegoLiteWhen {
	readonly sameTenant?: boolean;
	readonly subjectTagsAny?: readonly string[];
	readonly subjectTagsAll?: readonly string[];
	readonly resourceKinds?: readonly string[];
	readonly resourceShared?: boolean;
	readonly actions?: readonly string[];
}

export interface RegoLiteRule {
	readonly effect: "allow" | "deny";
	readonly actions?: readonly string[];
	readonly when?: RegoLiteWhen;
	readonly reason?: string;
}

export interface RegoLiteDocument {
	readonly default?: "allow" | "deny";
	readonly rules: readonly RegoLiteRule[];
}

export function parseRegoLiteDocument(raw: unknown): RegoLiteDocument {
	if (raw === null || typeof raw !== "object") {
		throw new TypeError("rego-lite document must be an object");
	}
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.rules)) {
		throw new TypeError("rego-lite.rules must be an array");
	}
	const rules: RegoLiteRule[] = obj.rules.map((r, i) => {
		if (!r || typeof r !== "object") {
			throw new TypeError(`rego-lite.rules[${i}] must be an object`);
		}
		const rule = r as Record<string, unknown>;
		if (rule.effect !== "allow" && rule.effect !== "deny") {
			throw new TypeError(`rego-lite.rules[${i}].effect must be allow|deny`);
		}
		return {
			effect: rule.effect,
			...(Array.isArray(rule.actions)
				? {
						actions: rule.actions.filter(
							(a): a is string => typeof a === "string",
						),
					}
				: {}),
			...(rule.when && typeof rule.when === "object"
				? { when: rule.when as RegoLiteWhen }
				: {}),
			...(typeof rule.reason === "string" ? { reason: rule.reason } : {}),
		};
	});
	return {
		rules,
		...(obj.default === "allow" || obj.default === "deny"
			? { default: obj.default }
			: {}),
	};
}

export function evaluateRegoLite(
	doc: RegoLiteDocument,
	request: PolicyRequest,
	engineId: string = REGO_LITE_ENGINE_ID,
): PolicyDecision {
	for (const rule of doc.rules) {
		if (!actionMatches(rule.actions ?? rule.when?.actions, request.action)) {
			continue;
		}
		if (!whenMatches(rule.when, request)) {
			continue;
		}
		const reason = rule.reason ?? `rego-lite rule ${rule.effect}`;
		return rule.effect === "allow"
			? allowDecision(engineId, request, [reason])
			: denyDecision(engineId, request, [reason]);
	}
	const def = doc.default ?? "deny";
	return def === "allow"
		? allowDecision(engineId, request, ["rego-lite default allow"])
		: denyDecision(engineId, request, ["rego-lite default deny"]);
}

function actionMatches(
	actions: readonly string[] | undefined,
	action: string,
): boolean {
	if (!actions || actions.length === 0) return true;
	return actions.some((a) => a === "*" || a === action);
}

function whenMatches(
	when: RegoLiteWhen | undefined,
	request: PolicyRequest,
): boolean {
	if (!when) return true;
	const sameTenant =
		request.subject.tenantId === request.resource.tenantId;
	if (when.sameTenant === true && !sameTenant) return false;
	if (when.sameTenant === false && sameTenant) return false;

	const shared =
		request.resource.tags?.includes("shared:true") === true ||
		request.resource.attributes?.shared === "true";
	if (when.resourceShared === true && !shared) return false;
	if (when.resourceShared === false && shared) return false;

	if (when.resourceKinds && when.resourceKinds.length > 0) {
		if (!when.resourceKinds.includes(request.resource.kind)) return false;
	}
	if (when.subjectTagsAny && when.subjectTagsAny.length > 0) {
		if (!when.subjectTagsAny.some((t) => request.subject.tags.includes(t))) {
			return false;
		}
	}
	if (when.subjectTagsAll && when.subjectTagsAll.length > 0) {
		if (!when.subjectTagsAll.every((t) => request.subject.tags.includes(t))) {
			return false;
		}
	}
	return true;
}

/** Built-in default document: admin, same-tenant, or shared allow; else deny. */
export const HOBO_DEFAULT_POLICY_DOCUMENT: RegoLiteDocument = {
	default: "deny",
	rules: [
		{
			effect: "allow",
			actions: ["*"],
			when: { subjectTagsAny: ["role:admin"] },
			reason: "admin role",
		},
		{
			effect: "allow",
			when: { sameTenant: true },
			reason: "same-tenant",
		},
		{
			effect: "allow",
			when: { resourceShared: true },
			reason: "shared-resource",
		},
	],
};

/** @deprecated use HOBO_DEFAULT_POLICY_DOCUMENT */
export const DEFAULT_REGO_LITE_DOCUMENT = HOBO_DEFAULT_POLICY_DOCUMENT;
