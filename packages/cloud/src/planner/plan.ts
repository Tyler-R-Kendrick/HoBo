import type { ManifestV1 } from "@hobo/bindles";

import { lowerManifest } from "../intent.js";
import {
	DEPLOYMENT_PLAN_SCHEMA,
	type DeploymentPlan,
	hashDeploymentPlan,
	type MatchDecided,
	type PlacementCriteria,
	type PlanHash,
	type PlanRemediation,
	type ResourceIntent,
	type ResourcePlan,
} from "../plan-types.js";
import type { PlannerRegistry } from "../registry/catalog.js";
import { matchResource } from "./matching.js";
import { emptyPlacementContext } from "./placement.js";

// The Planner: a pure function `plan(bindle, config, registry) -> DeploymentPlan`
// (control-plane.md "The Planner"). Easy to test, replayable, deterministic. It
// never provisions anything — it emits the content-addressed plan (or a precise,
// machine-readable rejection) and the per-resource match.Decided decisions.

export interface PlanConfig {
	deploymentId: string;
	objective?: string;
	region?: string;
	// E19: per-resource placement-constraint criteria, keyed by resource name.
	// Attached to the lowered intents so the bindle manifest stays untouched.
	placement?: Record<string, PlacementCriteria>;
}

export interface PlanSuccess {
	ok: true;
	deploymentId: string;
	decisions: MatchDecided[];
	plan: DeploymentPlan;
	planHash: PlanHash;
}

export interface PlanRejection {
	ok: false;
	deploymentId: string;
	reason: string;
	remediations: PlanRemediation[];
}

export type PlanResult = PlanSuccess | PlanRejection;

// Stable topological order over the bind-edge DAG (Kahn's algorithm with an
// alphabetical tiebreak, so the dependency order is byte-stable).
function dependencyOrder(intents: ResourceIntent[]): string[] {
	const names = new Set(intents.map((i) => i.name));
	const indegree = new Map<string, number>();
	const dependents = new Map<string, string[]>();
	for (const intent of intents) indegree.set(intent.name, 0);

	for (const intent of intents) {
		for (const dep of intent.deps) {
			if (!names.has(dep)) continue;
			// edge dep -> intent (dependency provisioned before dependent)
			indegree.set(intent.name, (indegree.get(intent.name) ?? 0) + 1);
			dependents.set(dep, [...(dependents.get(dep) ?? []), intent.name]);
		}
	}

	const ready = [...indegree.entries()]
		.filter(([, deg]) => deg === 0)
		.map(([name]) => name)
		.sort();
	const order: string[] = [];
	while (ready.length > 0) {
		const next = ready.shift() as string;
		order.push(next);
		for (const child of (dependents.get(next) ?? []).sort()) {
			const deg = (indegree.get(child) ?? 0) - 1;
			indegree.set(child, deg);
			if (deg === 0) {
				ready.push(child);
				ready.sort();
			}
		}
	}
	// A cycle would leave nodes unordered; append any stragglers deterministically.
	for (const name of [...names].sort()) {
		if (!order.includes(name)) order.push(name);
	}
	return order;
}

export function plan(
	bindle: ManifestV1,
	config: PlanConfig,
	registry: PlannerRegistry,
): PlanResult {
	const objective = config.objective ?? "min-cost";
	const lowerOptions: { objective: string; region?: string } = { objective };
	if (config.region !== undefined) lowerOptions.region = config.region;
	const intents = lowerManifest(bindle, lowerOptions);
	// E19: attach per-resource placement criteria to the lowered intents.
	if (config.placement !== undefined) {
		for (const intent of intents) {
			const criteria = config.placement[intent.name];
			if (criteria !== undefined) intent.placement = criteria;
		}
	}

	const decisions: MatchDecided[] = [];
	const resources: ResourcePlan[] = [];
	const remediations: PlanRemediation[] = [];
	// Placements decided so far this pass — affinity/anti-affinity/spread rules
	// evaluate against it; deterministic because intents arrive in the
	// byte-stable lowered (sorted-name) order.
	const placementContext = emptyPlacementContext();

	for (const intent of intents) {
		const outcome = matchResource(intent, registry, placementContext);
		if (!outcome.ok) {
			remediations.push(outcome.remediation);
			continue;
		}
		const decision = { ...outcome.decision, deploymentId: config.deploymentId };
		decisions.push(decision);
		placementContext.placements.push({
			resource: intent.name,
			port: intent.port,
			providerId: decision.providerId,
			region: outcome.region,
		});
		const node: ResourcePlan = {
			name: intent.name,
			port: intent.port,
			provider: decision.providerId,
			deps: intent.deps,
			strategy: "rolling-update",
		};
		if (outcome.region) node.region = outcome.region;
		resources.push(node);
	}

	if (remediations.length > 0) {
		return {
			ok: false,
			deploymentId: config.deploymentId,
			reason: `plan rejected: ${remediations.length} resource(s) could not be satisfied`,
			remediations,
		};
	}

	const deploymentPlan: DeploymentPlan = {
		schema: DEPLOYMENT_PLAN_SCHEMA,
		resources: resources.sort((a, b) => a.name.localeCompare(b.name)),
		dependencyOrder: dependencyOrder(intents),
		objective,
	};

	return {
		ok: true,
		deploymentId: config.deploymentId,
		decisions,
		plan: deploymentPlan,
		planHash: hashDeploymentPlan(deploymentPlan),
	};
}
