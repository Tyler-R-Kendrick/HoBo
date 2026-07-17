// Past-tense control-plane facts the Yard kernel appends (control-plane.md
// "Command / event API surface": commands are validated and authorized and the
// only side effect is appending events). The event *type* obeys core's
// `family.PastTenseFact` envelope pattern (no colon), so the per-resource subject
// (`match.Decided:<resource>` in the reference architecture) is carried in the
// fact body's `resource`/`deploymentId` fields, never in the type string.

import type { EventInput } from "@hobo/core";

import type {
	DeploymentPlan,
	MatchDecided,
	PlanRemediation,
} from "./plan-types.js";

export const CLOUD_EVENT_SCHEMA_VERSION = "hobo.cloud-events/v1";

// Control-plane event catalog (control-plane.md + the epic reference
// architecture). These are the only fact types the S2-01/S2-02 vertical emits.
export const CLOUD_EVENTS = Object.freeze({
	DeploymentRequested: "deployment.Requested",
	MatchDecided: "match.Decided",
	DeploymentPlanned: "deployment.Planned",
	DeploymentPlanRejected: "deployment.PlanRejected",
	ProviderRegistered: "provider.Registered",
	ResourcePlanning: "resource.Planning",
	ResourceProvisioned: "resource.Provisioned",
} as const);

export interface DeploymentRequestedData {
	deploymentId: string;
	bindleHash: string;
	tenant: string;
	config: Record<string, unknown>;
}

export function deploymentRequested(data: DeploymentRequestedData): EventInput {
	return { type: CLOUD_EVENTS.DeploymentRequested, data };
}

export function matchDecided(data: MatchDecided): EventInput {
	return { type: CLOUD_EVENTS.MatchDecided, data };
}

export function deploymentPlanned(data: {
	deploymentId: string;
	planHash: string;
	plan: DeploymentPlan;
}): EventInput {
	return { type: CLOUD_EVENTS.DeploymentPlanned, data };
}

export function deploymentPlanRejected(data: {
	deploymentId: string;
	reason: string;
	remediations: PlanRemediation[];
}): EventInput {
	return { type: CLOUD_EVENTS.DeploymentPlanRejected, data };
}

export function providerRegistered(data: {
	providerId: string;
	definitions: unknown[];
	manifestIndexDigest: string;
}): EventInput {
	return { type: CLOUD_EVENTS.ProviderRegistered, data };
}
