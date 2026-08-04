import { createHash } from "node:crypto";

// Parse, don't validate: the types below are the parsed derived domain types the
// Planner works with. Their protobuf wire forms live in data-models/cloud.proto
// and their CUE constraints in data-models/cloud.cue; these narrow those wire
// shapes with unions and required fields. Constructors here are the only way to
// build a plan value, so downstream code never re-validates a raw record.

export const DEPLOYMENT_PLAN_SCHEMA = "hobo.deployment-plan/v1" as const;

export type Negotiation = "require" | "prefer";

// ---- E19: placement-constraint vocabulary (HoBo-native; KubeFleet semantics
// cited, shapes native — ADR-0107 non-goal: no Kubernetes types). The
// vocabulary records what the Planner PLANS; spread/anti-affinity EXECUTION
// stays delegated to wadm (adr/01-architecture-core.md:419).

export type PlacementSelectorOp =
	| "eq"
	| "ne"
	| "in"
	| "not-in"
	| "lt"
	| "lte"
	| "gt"
	| "gte"
	| "exists";

// domain-view: parsed property selector; wire form is PlacementPropertySelector in data-models/cloud.proto.
export interface PlacementPropertySelector {
	/** "cost" | "region" | "provider" | "capacity" | "latency" | custom feature key. */
	key: string;
	op: PlacementSelectorOp;
	values: string[];
}

export type PlacementAffinityMode = "affinity" | "anti-affinity";
export type PlacementScope = "region" | "yard";

// domain-view: parsed affinity/anti-affinity rule; wire form is PlacementAffinityRule in data-models/cloud.proto.
export interface PlacementAffinityRule {
	mode: PlacementAffinityMode;
	/** The referenced resource class (capability port). */
	targetPort: string;
	scope: PlacementScope;
}

// domain-view: parsed spread directive; wire form is PlacementSpread in data-models/cloud.proto.
export interface PlacementSpread {
	dimension: PlacementScope;
}

// domain-view: parsed pickN cardinality; wire form is PlacementPickN in data-models/cloud.proto.
export interface PlacementPickN {
	/** Minimum distinct satisfying candidates matching must find (>= 1). */
	count: number;
}

// domain-view: parsed placement-constraint set; wire form is PlacementCriteria in data-models/cloud.proto.
export interface PlacementCriteria {
	selectors: PlacementPropertySelector[];
	affinities: PlacementAffinityRule[];
	spread?: PlacementSpread;
	pickN?: PlacementPickN;
}

// domain-view: parsed provider-neutral intent; wire form is ResourceIntent in data-models/cloud.proto.
export interface ResourceIntent {
	name: string;
	port: string;
	require: string[];
	prefer: string[];
	negotiation: Negotiation;
	deps: string[];
	region?: string;
	objective: string;
	placement?: PlacementCriteria;
}

// domain-view: capability-negotiation verdict; wire form is CapabilityVerdict in data-models/cloud.proto.
export type CapabilityVerdict =
	| { kind: "full" }
	| { kind: "partial"; missing: string[] }
	| { kind: "none" };

// domain-view: resolved plan node; wire form is ResourcePlan in data-models/cloud.proto.
export interface ResourcePlan {
	name: string;
	port: string;
	provider: string;
	deps: string[];
	strategy?: string;
	region?: string;
	deploymentId?: string;
}

// domain-view: content-addressed plan DAG; wire form is DeploymentPlan in data-models/cloud.proto.
export interface DeploymentPlan {
	schema: typeof DEPLOYMENT_PLAN_SCHEMA;
	resources: ResourcePlan[];
	dependencyOrder: string[];
	objective: string;
}

// domain-view: ranked candidate inside match.Decided; wire form is RankedCandidate in data-models/cloud.proto.
export interface RankedCandidate {
	definitionId: string;
	providerId: string;
	specificity: number;
	priority: number;
}

// domain-view: structured rejection inside match.Decided; wire form is RejectedCandidate in data-models/cloud.proto.
export interface RejectedCandidate {
	definitionId: string;
	reason: string;
}

// Canonical shape per control-plane-event-schema-contract (ADR-0033/ADR-0088):
// full ranking, structured rejections with reasons, an explicit tie flag, and
// the catalog content-hash. `rejected`/`catalogHash` remain populated as
// deprecated aliases for one release.
// domain-view: match.Decided body; wire form is MatchDecided in data-models/cloud.proto.
export interface MatchDecided {
	deploymentId: string;
	resource: string;
	winner: string;
	providerId: string;
	port: string;
	specificity: number;
	/** @deprecated flat ids; read `rejectedCandidates` (reasons included). */
	rejected: string[];
	rejectedCandidates: RejectedCandidate[];
	/** Full ranking, winner first (ADR-0088 attribution). */
	ranking: RankedCandidate[];
	/** True when the winner beat the runner-up only on the definition-id tiebreak. */
	tie: boolean;
	objective: string;
	region?: string;
	rationale: string;
	/** @deprecated alias of `catalogContentHash`. */
	catalogHash: string;
	catalogContentHash: string;
}

// domain-view: rejection remediation; wire form is PlanRemediation in data-models/cloud.proto.
export interface PlanRemediation {
	resource: string;
	code: string;
	requiredPort: string;
	requiredFeatures: string[];
	missing: string[];
	suggestedProvider?: string;
	remediation: string;
}

export type PlanHash = `sha256:${string}`;

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
		);
	}
	return value;
}

// Canonical, key-sorted serialization — the byte-stable form a plan is
// content-addressed by (control-plane.md: "The plan is content-addressed and
// stored via deployment.Planned").
export function canonicalPlanJson(plan: DeploymentPlan): string {
	return JSON.stringify(sortKeys(plan));
}

export function hashDeploymentPlan(plan: DeploymentPlan): PlanHash {
	const digest = createHash("sha256")
		.update(canonicalPlanJson(plan))
		.digest("hex");
	return `sha256:${digest}`;
}
