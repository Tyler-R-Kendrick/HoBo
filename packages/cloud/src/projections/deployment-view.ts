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

export interface DeploymentViewRow {
	deploymentId: string;
	status: "requested" | "planned" | "rejected";
	bindleHash?: string;
	decisions: DeploymentDecisionRow[];
	planHash?: string;
	plan?: DeploymentPlan;
	rejection?: { reason: string; remediations: PlanRemediation[] };
}

function base(row: DeploymentViewRow | undefined, deploymentId: string): DeploymentViewRow {
	return row
		? { ...row, decisions: [...row.decisions] }
		: { deploymentId, status: "requested", decisions: [] };
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
		},
	});
