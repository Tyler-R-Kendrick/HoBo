export {
	type CompensationContext,
	type CompensationDeps,
	type CompensationResult,
	runCompensation,
} from "./compensation.js";

export {
	type OrchestratorContext,
	type OrchestratorDeps,
	type OrchestratorResult,
	type OrchestratorStatus,
	runOrchestrator,
} from "./orchestrator.js";
export {
	destroyResource,
	foldResourceActor,
	iacProgramFor,
	RESOURCE_ACTOR_STATES,
	type ReconcileContext,
	type ReconcileOutcome,
	type ResourceActorDeps,
	type ResourceActorSnapshot,
	type ResourceActorState,
	reconcileResource,
	resourceActorKey,
} from "./resource-actor.js";
