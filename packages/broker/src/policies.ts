import { createHash } from "node:crypto";

import {
	type BillingPolicy,
	BROKER_SCHEMA_VERSION,
	type BrokerPolicySet,
	type BrokerRequest,
	CONNECTOR_KINDS,
	type ConnectorKind,
	type DeliveryPolicy,
	PLACEMENT_OBJECTIVES,
	type PlacementObjective,
	type PlacementPolicy,
	type PolicyHash,
	type ResourceRequirement,
	SCOPE_KINDS,
	type ScopeKind,
	type TopologyScope,
} from "./types.js";

// Parse, don't validate: untrusted policy/request documents cross exactly one
// parser boundary here and come out as refined domain types (types.ts). Every
// constraint mirrors data-models/broker.cue so a value that violates the CUE
// invariants never exists past this module.

export class BrokerParseError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "BrokerParseError";
		this.code = code;
	}
}

function asRecord(input: unknown, code: string): Record<string, unknown> {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		throw new BrokerParseError(code, `${code}: expected an object`);
	}
	return input as Record<string, unknown>;
}

function requireString(value: unknown, code: string, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new BrokerParseError(
			code,
			`${code}: ${field} must be a non-empty string`,
		);
	}
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringList(value: unknown): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is string => typeof entry === "string" && entry.length > 0,
	);
}

function nonNegativeNumber(
	value: unknown,
	fallback: number,
	code: string,
	field: string,
): number {
	if (value === undefined) return fallback;
	if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
		throw new BrokerParseError(code, `${code}: ${field} must be a number >= 0`);
	}
	return value;
}

export function parsePlacementPolicy(input: unknown): PlacementPolicy {
	const raw = asRecord(input, "invalid-placement-policy");
	const id = requireString(raw.id, "invalid-placement-policy", "id");
	const scopeKind = requireString(
		raw.scopeKind ?? raw.scope_kind,
		"invalid-placement-policy",
		"scopeKind",
	);
	if (!SCOPE_KINDS.includes(scopeKind as ScopeKind)) {
		throw new BrokerParseError(
			"invalid-scope-kind",
			`invalid-scope-kind: ${scopeKind} is not one of ${SCOPE_KINDS.join("|")}`,
		);
	}
	const objective = requireString(
		raw.objective,
		"invalid-placement-policy",
		"objective",
	);
	if (!PLACEMENT_OBJECTIVES.includes(objective as PlacementObjective)) {
		throw new BrokerParseError(
			"invalid-objective",
			`invalid-objective: ${objective} is not one of ${PLACEMENT_OBJECTIVES.join("|")}`,
		);
	}
	const pinnedProviderId = optionalString(
		raw.pinnedProviderId ?? raw.pinned_provider_id,
	);
	// Dependent constraint (broker.cue): pinned objective names its provider.
	if (objective === "pinned" && pinnedProviderId === undefined) {
		throw new BrokerParseError(
			"pinned-provider-required",
			"pinned-provider-required: objective 'pinned' requires pinnedProviderId",
		);
	}
	return {
		id,
		scopeKind: scopeKind as ScopeKind,
		objective: objective as PlacementObjective,
		...(pinnedProviderId !== undefined ? { pinnedProviderId } : {}),
		allowedProviders: stringList(raw.allowedProviders ?? raw.allowed_providers),
		deniedProviders: stringList(raw.deniedProviders ?? raw.denied_providers),
		allowedRegions: stringList(raw.allowedRegions ?? raw.allowed_regions),
		requireExplicitCamps:
			(raw.requireExplicitCamps ?? raw.require_explicit_camps) === true,
	};
}

export function parseBillingPolicy(input: unknown): BillingPolicy {
	const raw = asRecord(input, "invalid-billing-policy");
	const quota = requireString(raw.quota, "invalid-billing-policy", "quota");
	const quotaUsed = nonNegativeNumber(
		raw.quotaUsed ?? raw.quota_used,
		0,
		"invalid-billing-policy",
		"quotaUsed",
	);
	const quotaLimit = nonNegativeNumber(
		raw.quotaLimit ?? raw.quota_limit,
		0,
		"invalid-billing-policy",
		"quotaLimit",
	);
	// Cross-field invariant (broker.cue): consumed quota never exceeds limit.
	if (quotaUsed > quotaLimit) {
		throw new BrokerParseError(
			"quota-overflow",
			`quota-overflow: quotaUsed ${quotaUsed} exceeds quotaLimit ${quotaLimit}`,
		);
	}
	return {
		quota,
		quotaUsed,
		quotaLimit,
		budgetUsd: nonNegativeNumber(
			raw.budgetUsd ?? raw.budget_usd,
			0,
			"invalid-billing-policy",
			"budgetUsd",
		),
		spendCapUsd: nonNegativeNumber(
			raw.spendCapUsd ?? raw.spend_cap_usd,
			0,
			"invalid-billing-policy",
			"spendCapUsd",
		),
	};
}

export function parseDeliveryPolicy(input: unknown): DeliveryPolicy {
	const raw = asRecord(input, "invalid-delivery-policy");
	const engine = requireString(raw.engine, "invalid-delivery-policy", "engine");
	if (engine !== "argo" && engine !== "in-proc") {
		throw new BrokerParseError(
			"invalid-delivery-engine",
			`invalid-delivery-engine: ${engine} is not argo|in-proc`,
		);
	}
	const syncMode = (raw.syncMode ?? raw.sync_mode ?? "manual") as string;
	if (syncMode !== "auto" && syncMode !== "manual") {
		throw new BrokerParseError(
			"invalid-sync-mode",
			`invalid-sync-mode: ${syncMode} is not auto|manual`,
		);
	}
	const gitopsRepo = optionalString(raw.gitopsRepo ?? raw.gitops_repo);
	const destinationNamespace = optionalString(
		raw.destinationNamespace ?? raw.destination_namespace,
	);
	// Dependent constraint (broker.cue): argo needs a repo and a namespace.
	if (
		engine === "argo" &&
		(gitopsRepo === undefined || destinationNamespace === undefined)
	) {
		throw new BrokerParseError(
			"argo-destination-required",
			"argo-destination-required: engine 'argo' requires gitopsRepo and destinationNamespace",
		);
	}
	return {
		engine,
		syncMode,
		prune: raw.prune === true,
		...(gitopsRepo !== undefined ? { gitopsRepo } : {}),
		...(destinationNamespace !== undefined ? { destinationNamespace } : {}),
	};
}

export function parseBrokerPolicySet(input: unknown): BrokerPolicySet {
	const raw = asRecord(input, "invalid-policy-set");
	const schemaVersion = requireString(
		raw.schemaVersion ?? raw.schema_version,
		"invalid-policy-set",
		"schemaVersion",
	);
	if (schemaVersion !== BROKER_SCHEMA_VERSION) {
		throw new BrokerParseError(
			"unsupported-schema",
			`unsupported-schema: ${schemaVersion} is not ${BROKER_SCHEMA_VERSION}`,
		);
	}
	const placementRaw = raw.placementPolicies ?? raw.placement_policies;
	const placementPolicies = Array.isArray(placementRaw)
		? placementRaw.map(parsePlacementPolicy)
		: [];
	const requiredRaw = stringList(
		raw.requiredConnectorKinds ?? raw.required_connector_kinds,
	);
	for (const kind of requiredRaw) {
		if (!CONNECTOR_KINDS.includes(kind as ConnectorKind)) {
			throw new BrokerParseError(
				"invalid-connector-kind",
				`invalid-connector-kind: ${kind} is not one of ${CONNECTOR_KINDS.join("|")}`,
			);
		}
	}
	return {
		schemaVersion: BROKER_SCHEMA_VERSION,
		brokerId: requireString(
			raw.brokerId ?? raw.broker_id,
			"invalid-policy-set",
			"brokerId",
		),
		placementPolicies,
		billing: parseBillingPolicy(raw.billing ?? {}),
		delivery: parseDeliveryPolicy(raw.delivery ?? { engine: "in-proc" }),
		requiredConnectorKinds: requiredRaw as ConnectorKind[],
	};
}

export function parseTopologyScope(input: unknown): TopologyScope {
	const raw = asRecord(input, "invalid-scope");
	const bindleId = requireString(
		raw.bindleId ?? raw.bindle_id,
		"invalid-scope",
		"bindleId",
	);
	const campId = optionalString(raw.campId ?? raw.camp_id);
	const yardId = optionalString(raw.yardId ?? raw.yard_id);
	const junctionId = optionalString(raw.junctionId ?? raw.junction_id);
	return {
		bindleId,
		...(campId !== undefined ? { campId } : {}),
		...(yardId !== undefined ? { yardId } : {}),
		...(junctionId !== undefined ? { junctionId } : {}),
	};
}

export function parseResourceRequirement(input: unknown): ResourceRequirement {
	const raw = asRecord(input, "invalid-requirement");
	const region = optionalString(raw.region);
	return {
		resourceId: requireString(
			raw.resourceId ?? raw.resource_id,
			"invalid-requirement",
			"resourceId",
		),
		port: requireString(raw.port, "invalid-requirement", "port"),
		features: stringList(raw.features),
		...(region !== undefined ? { region } : {}),
	};
}

export function parseBrokerRequest(input: unknown): BrokerRequest {
	const raw = asRecord(input, "invalid-request");
	const schemaVersion = requireString(
		raw.schemaVersion ?? raw.schema_version,
		"invalid-request",
		"schemaVersion",
	);
	if (schemaVersion !== BROKER_SCHEMA_VERSION) {
		throw new BrokerParseError(
			"unsupported-schema",
			`unsupported-schema: ${schemaVersion} is not ${BROKER_SCHEMA_VERSION}`,
		);
	}
	const requirementsRaw = raw.requirements;
	if (!Array.isArray(requirementsRaw) || requirementsRaw.length === 0) {
		throw new BrokerParseError(
			"empty-requirements",
			"empty-requirements: a broker request must place at least one resource",
		);
	}
	return {
		schemaVersion: BROKER_SCHEMA_VERSION,
		requestId: requireString(
			raw.requestId ?? raw.request_id,
			"invalid-request",
			"requestId",
		),
		scope: parseTopologyScope(raw.scope ?? {}),
		requirements: requirementsRaw.map(parseResourceRequirement),
		spendEstimateUsd: nonNegativeNumber(
			raw.spendEstimateUsd ?? raw.spend_estimate_usd,
			0,
			"invalid-request",
			"spendEstimateUsd",
		),
	};
}

// Content-address the policy state so every receipt/rejection pins the exact
// policies that produced it (same discipline as the registry catalogHash).
export function policyHashOf(policies: BrokerPolicySet): PolicyHash {
	const canonical = JSON.stringify(
		policies,
		Object.keys(flatten(policies)).sort(),
	);
	const digest = createHash("sha256").update(canonical).digest("hex");
	return `sha256:${digest}` as PolicyHash;
}

function flatten(
	value: unknown,
	out: Record<string, true> = {},
): Record<string, true> {
	if (value === null || typeof value !== "object") return out;
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		out[key] = true;
		flatten(entry, out);
	}
	return out;
}

// Scope-kind specificity: bindle overrides camp overrides yard overrides
// junction for choice-shaped fields, while restrictive fields (denied
// providers, explicit-camp lockdown) ACCUMULATE outward-in — a junction
// broker admin's lockdown cannot be overridden by a narrower policy.
const SPECIFICITY: Record<ScopeKind, number> = {
	junction: 0,
	yard: 1,
	camp: 2,
	bindle: 3,
};

export interface EffectivePlacementPolicy extends PlacementPolicy {
	contributingPolicyIds: readonly string[];
}

export function effectivePlacementPolicy(
	policies: BrokerPolicySet,
	scope: TopologyScope,
): EffectivePlacementPolicy | undefined {
	const present = new Set<ScopeKind>(["bindle"]);
	if (scope.campId !== undefined) present.add("camp");
	if (scope.yardId !== undefined) present.add("yard");
	if (scope.junctionId !== undefined) present.add("junction");

	const applicable = policies.placementPolicies
		.filter((policy) => present.has(policy.scopeKind))
		.sort((a, b) => SPECIFICITY[a.scopeKind] - SPECIFICITY[b.scopeKind]);
	if (applicable.length === 0) return undefined;

	let merged: PlacementPolicy = applicable[0] as PlacementPolicy;
	for (const layer of applicable.slice(1)) {
		merged = {
			// The narrower layer wins choice-shaped fields...
			id: layer.id,
			scopeKind: layer.scopeKind,
			objective: layer.objective,
			...(layer.pinnedProviderId !== undefined
				? { pinnedProviderId: layer.pinnedProviderId }
				: merged.pinnedProviderId !== undefined && layer.objective === "pinned"
					? { pinnedProviderId: merged.pinnedProviderId }
					: {}),
			allowedProviders:
				layer.allowedProviders.length > 0
					? layer.allowedProviders
					: merged.allowedProviders,
			allowedRegions:
				layer.allowedRegions.length > 0
					? layer.allowedRegions
					: merged.allowedRegions,
			// ...restrictions accumulate and can never be relaxed inward.
			deniedProviders: [
				...new Set([...merged.deniedProviders, ...layer.deniedProviders]),
			],
			requireExplicitCamps:
				merged.requireExplicitCamps || layer.requireExplicitCamps,
		};
	}
	return {
		...merged,
		contributingPolicyIds: applicable.map((policy) => policy.id),
	};
}
