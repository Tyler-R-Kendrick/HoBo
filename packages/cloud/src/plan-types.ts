import { createHash } from "node:crypto";

// Parse, don't validate: the types below are the parsed derived domain types the
// Planner works with. Their protobuf wire forms live in data-models/cloud.proto
// and their CUE constraints in data-models/cloud.cue; these narrow those wire
// shapes with unions and required fields. Constructors here are the only way to
// build a plan value, so downstream code never re-validates a raw record.

export const DEPLOYMENT_PLAN_SCHEMA = "hobo.deployment-plan/v1" as const;

export type Negotiation = "require" | "prefer";

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

// domain-view: match.Decided body; wire form is MatchDecided in data-models/cloud.proto.
export interface MatchDecided {
	deploymentId: string;
	resource: string;
	winner: string;
	providerId: string;
	port: string;
	specificity: number;
	rejected: string[];
	objective: string;
	region?: string;
	rationale: string;
	catalogHash: string;
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
