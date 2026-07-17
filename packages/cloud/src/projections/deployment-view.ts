import { defineProjection, type Projection } from "@hobo/data";

import { CLOUD_EVENTS } from "../events.js";
import type { DeploymentPlan, PlanRemediation } from "../plan-types.js";

// The DeploymentView projection (control-plane.md "Choreography over
// orchestration": a DeploymentView reconstructs the saga graph from events for
// the dashboard). It is a read-model fold, rebuildable from zero — the log is
// authoritative, the materialized view is derived.

export interface DeploymentDecisionRow {
	resource: string;
	winner: string;
	providerId: string;
	port: string;
	region?: string;
}

// The provisioning-phase FSM status per resource, reconstructed for the saga
// graph (control-plane.md "a DeploymentView projection … reconstructs the saga
// graph from events for the dashboard").
export type ResourceLifecycle =
	| "provisioning"
	| "provisioned"
	| "failed"
	| "destroying"
	| "destroyed";

export interface DeploymentViewRow {
	deploymentId: string;
	status: "requested" | "planned" | "rejected" | "deployed" | "rolled-back";
	bindleHash?: string;
	decisions: DeploymentDecisionRow[];
	planHash?: string;
	plan?: DeploymentPlan;
	rejection?: { reason: string; remediations: PlanRemediation[] };
	// Saga graph: per-resource lifecycle folded from resource.* facts.
	resources: Record<string, ResourceLifecycle>;
	rollback?: { reason: string; targetSetId: string };
}

function base(row: DeploymentViewRow | undefined, deploymentId: string): DeploymentViewRow {
	return row
		? { ...row, decisions: [...row.decisions], resources: { ...row.resources } }
		: { deploymentId, status: "requested", decisions: [], resources: {} };
}

export const deploymentViewProjection: Projection<DeploymentViewRow> =
	defineProjection<DeploymentViewRow>({
		name: "deployment-view",
		key: (event) => (event.data as { deploymentId: string }).deploymentId,
		on: {
			[CLOUD_EVENTS.DeploymentRequested]: (row, event) => {
				const data = event.data as { deploymentId: string; bindleHash: string };
				const next = base(row, data.deploymentId);
				next.status = "requested";
				next.bindleHash = data.bindleHash;
				return next;
			},
			[CLOUD_EVENTS.MatchDecided]: (row, event) => {
				const data = event.data as DeploymentDecisionRow & { deploymentId: string };
				const next = base(row, data.deploymentId);
				const decision: DeploymentDecisionRow = {
					resource: data.resource,
					winner: data.winner,
					providerId: data.providerId,
					port: data.port,
				};
				if (data.region !== undefined) decision.region = data.region;
				next.decisions = [...next.decisions, decision].sort((a, b) =>
					a.resource.localeCompare(b.resource),
				);
				return next;
			},
			[CLOUD_EVENTS.DeploymentPlanned]: (row, event) => {
				const data = event.data as {
					deploymentId: string;
					planHash: string;
					plan: DeploymentPlan;
				};
				const next = base(row, data.deploymentId);
				next.status = "planned";
				next.planHash = data.planHash;
				next.plan = data.plan;
				return next;
			},
			[CLOUD_EVENTS.DeploymentPlanRejected]: (row, event) => {
				const data = event.data as {
					deploymentId: string;
					reason: string;
					remediations: PlanRemediation[];
				};
				const next = base(row, data.deploymentId);
				next.status = "rejected";
				next.rejection = { reason: data.reason, remediations: data.remediations };
				return next;
			},
			[CLOUD_EVENTS.ResourceProvisioning]: (row, event) => {
				const data = event.data as { deploymentId: string; resourceId: string };
				const next = base(row, data.deploymentId);
				next.resources[data.resourceId] = "provisioning";
				return next;
			},
			[CLOUD_EVENTS.ResourceProvisioned]: (row, event) => {
				const data = event.data as { deploymentId: string; resourceId: string };
				const next = base(row, data.deploymentId);
				next.resources[data.resourceId] = "provisioned";
				return next;
			},
			[CLOUD_EVENTS.ResourceFailed]: (row, event) => {
				const data = event.data as { deploymentId: string; resourceId: string };
				const next = base(row, data.deploymentId);
				next.resources[data.resourceId] = "failed";
				return next;
			},
			[CLOUD_EVENTS.ResourceDestroying]: (row, event) => {
				const data = event.data as { deploymentId: string; resourceId: string };
				const next = base(row, data.deploymentId);
				next.resources[data.resourceId] = "destroying";
				return next;
			},
			[CLOUD_EVENTS.ResourceDestroyed]: (row, event) => {
				const data = event.data as { deploymentId: string; resourceId: string };
				const next = base(row, data.deploymentId);
				next.resources[data.resourceId] = "destroyed";
				return next;
			},
			[CLOUD_EVENTS.DeploymentDeployed]: (row, event) => {
				const data = event.data as { deploymentId: string };
				const next = base(row, data.deploymentId);
				next.status = "deployed";
				return next;
			},
			[CLOUD_EVENTS.DeploymentRolledBack]: (row, event) => {
				const data = event.data as { deploymentId: string; reason: string; targetSetId: string };
				const next = base(row, data.deploymentId);
				next.status = "rolled-back";
				next.rollback = { reason: data.reason, targetSetId: data.targetSetId };
				return next;
			},
		},
	});
