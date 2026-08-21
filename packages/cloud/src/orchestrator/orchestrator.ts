import type { EventEnvelope, EventStore, PrincipalRef } from "@hobo/core";
import type { ActorHost } from "@hobo/data";
import { emit } from "@hobo/events";

import { CLOUD_EVENTS, deploymentDeployed } from "../events.js";
import type { CredentialBroker, Executor } from "../executor/executor.js";
import type { DeploymentPlan, ResourcePlan } from "../plan-types.js";
import { collectStream, currentFenceToken } from "../store/index.js";
import { type CompensationResult, runCompensation } from "./compensation.js";
import {
	foldResourceActor,
	type ReconcileContext,
	type ResourceActorDeps,
	type ResourceActorState,
	reconcileResource,
} from "./resource-actor.js";

// The Orchestrator (control-plane.md "Choreography over orchestration"): given a
// DeploymentPlan DAG it activates ResourceActors; each self-activates when all its
// dependencies' `resource.Provisioned` facts are present (edge-triggered by
// events, level-triggered by this resync loop). When every actor reaches
// Provisioned it drives `deployment.Deployed`. There is no central step-by-step
// coordinator — ordering is the dependency DAG, realized by choreography. A
// no-go failure hands off to choreographed compensation (compensation.ts).

export interface OrchestratorDeps {
	store: EventStore;
	actorHost: ActorHost;
	executor: Executor;
	broker: CredentialBroker;
}

export interface OrchestratorContext {
	tenant: string;
	actor: PrincipalRef;
	correlationId?: string;
	// Resources whose apply-failure crosses the no-go threshold (seeded in tests).
	noGoThresholdResources?: ReadonlySet<string>;
}

export type OrchestratorStatus =
	| "deployed"
	| "rolled-back"
	| "needs-human"
	| "waiting";

export interface OrchestratorResult {
	status: OrchestratorStatus;
	deploymentId: string;
	provisioned: string[];
	destroyed: string[];
	events: EventEnvelope[];
	compensation?: CompensationResult;
}

function streamId(deploymentId: string): string {
	return `deployment:${deploymentId}`;
}

function resourceStates(
	events: EventEnvelope[],
	plan: DeploymentPlan,
	deploymentId: string,
): Map<string, ResourceActorState> {
	const states = new Map<string, ResourceActorState>();
	for (const resource of plan.resources) {
		const snapshot = foldResourceActor(events, { ...resource, deploymentId });
		states.set(resource.name, snapshot.state);
	}
	return states;
}

function depsProvisioned(
	resource: ResourcePlan,
	states: Map<string, ResourceActorState>,
): boolean {
	return resource.deps.every((dep) => states.get(dep) === "Provisioned");
}

// Run the choreography to convergence: reconcile any resource whose deps are all
// Provisioned, re-folding the durable log each pass (level-triggered). Safe to
// re-invoke against a partially-written stream — that is the crash-resume path.
export async function runOrchestrator(
	deps: OrchestratorDeps,
	plan: DeploymentPlan,
	deploymentId: string,
	ctx: OrchestratorContext,
): Promise<OrchestratorResult> {
	const stream = streamId(deploymentId);
	const actorDeps: ResourceActorDeps = {
		store: deps.store,
		actorHost: deps.actorHost,
		executor: deps.executor,
		broker: deps.broker,
	};
	const reconcileCtx: ReconcileContext = {
		deploymentId,
		tenant: ctx.tenant,
		actor: ctx.actor,
		...(ctx.correlationId !== undefined && {
			correlationId: ctx.correlationId,
		}),
		...(ctx.noGoThresholdResources !== undefined && {
			noGoThresholdResources: ctx.noGoThresholdResources,
		}),
	};

	let progressed = true;
	let triggeringFailure: { resourceId: string; reason: string } | null = null;

	while (progressed) {
		progressed = false;
		const events = await collectStream(deps.store, stream);
		const states = resourceStates(events, plan, deploymentId);

		// A no-go failure already on the log short-circuits to compensation.
		const failed = events.find(
			(e) =>
				e.type === CLOUD_EVENTS.ResourceFailed &&
				// SAFETY: The surrounding parser, protocol branch, or fixture establishes this asserted shape.
				(e.data as { crossedNoGoThreshold?: boolean }).crossedNoGoThreshold,
		);
		if (failed) {
			// SAFETY: The surrounding parser, protocol branch, or fixture establishes this asserted shape.
			const data = failed.data as { resourceId: string; reason: string };
			triggeringFailure = { resourceId: data.resourceId, reason: data.reason };
			break;
		}

		for (const resource of plan.resources) {
			const state = states.get(resource.name);
			if (state === "Provisioned" || state === "Destroyed") continue;
			if (!depsProvisioned(resource, states)) continue;

			const outcome = await reconcileResource(
				actorDeps,
				{ ...resource, deploymentId },
				reconcileCtx,
			);
			progressed = true;
			if (outcome.kind === "failed" && outcome.crossedNoGoThreshold) {
				triggeringFailure = {
					resourceId: resource.name,
					reason: outcome.reason,
				};
			}
			// Re-fold from the log on the next while-iteration (level-triggered).
			break;
		}

		if (triggeringFailure) break;
	}

	let events = await collectStream(deps.store, stream);
	let states = resourceStates(events, plan, deploymentId);

	// Compensation path: a no-go failure triggers deployment.RolledBack + reverse
	// dependency-order destroys.
	if (triggeringFailure) {
		const compensation = await runCompensation(
			{
				store: deps.store,
				actorHost: deps.actorHost,
				executor: deps.executor,
				broker: deps.broker,
			},
			plan,
			deploymentId,
			triggeringFailure,
			{
				tenant: ctx.tenant,
				actor: ctx.actor,
				...(ctx.correlationId !== undefined && {
					correlationId: ctx.correlationId,
				}),
			},
		);
		events = await collectStream(deps.store, stream);
		states = resourceStates(events, plan, deploymentId);
		return {
			status:
				compensation.status === "needs-human" ? "needs-human" : "rolled-back",
			deploymentId,
			provisioned: provisionedList(states),
			destroyed: destroyedList(states),
			events,
			compensation,
		};
	}

	// All actors Provisioned → drive deployment.Deployed (choreography terminal).
	const allProvisioned = plan.resources.every(
		(r) => states.get(r.name) === "Provisioned",
	);
	if (
		allProvisioned &&
		!events.some((e) => e.type === CLOUD_EVENTS.DeploymentDeployed)
	) {
		const lastSeq =
			// SAFETY: The surrounding parser, protocol branch, or fixture establishes this asserted shape.
			events.length > 0 ? (events[events.length - 1] as EventEnvelope).seq : 0;
		// The deployment stream is fenced (owner_epoch set by the first leased
		// write); the terminal fact continues under the current owner epoch.
		const fenceToken = currentFenceToken(deps.store, stream);
		await emit(
			deps.store,
			stream,
			[
				deploymentDeployed({
					deploymentId,
					setId: `${deploymentId}-set`,
					resourceIds: plan.resources.map((r) => r.name).sort(),
				}),
			],
			{
				expectedSeq: lastSeq,
				actor: ctx.actor,
				tenant: ctx.tenant,
				...(fenceToken !== undefined && { fenceToken }),
				...(ctx.correlationId !== undefined && {
					correlationId: ctx.correlationId,
				}),
			},
		);
		events = await collectStream(deps.store, stream);
	}

	return {
		status: allProvisioned ? "deployed" : "waiting",
		deploymentId,
		provisioned: provisionedList(states),
		destroyed: destroyedList(states),
		events,
	};
}

function provisionedList(states: Map<string, ResourceActorState>): string[] {
	return [...states.entries()]
		.filter(([, s]) => s === "Provisioned")
		.map(([id]) => id)
		.sort();
}

function destroyedList(states: Map<string, ResourceActorState>): string[] {
	return [...states.entries()]
		.filter(([, s]) => s === "Destroyed")
		.map(([id]) => id)
		.sort();
}
