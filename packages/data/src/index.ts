export {
	createInMemoryActorHost,
	LeaseConflictError,
	type ActorHost,
	type AggregateLease,
	type InMemoryActorHostOptions,
} from "./actor-host.js";
export {
	AggregateConflictError,
	AggregateInvariantError,
	defineAggregate,
	type Aggregate,
	type AggregateDefinition,
	type AggregateDeps,
	type CommandContext,
	type CommandEmitter,
	type CommandResult,
	type Decide,
} from "./aggregate.js";
export {
	isOptimisticConflict,
	ProjectionWriteError,
} from "./errors.js";
export {
	createActorActivatedEvent,
	createActorPassivatedEvent,
	createActorStateAppendedEvent,
	createProjectionDeclaredEvent,
	createProjectionLaggedEvent,
	createProjectionSinkReboundEvent,
	DATA_EVENT_SCHEMA_VERSION,
	type DataFact,
} from "./events.js";
export {
	foldEvents,
	type Evolve,
	type FoldOutcome,
	type FoldSpec,
} from "./fold.js";
export {
	defineProjection,
	type ApplyHandler,
	type Projection,
	type ProjectionDefinition,
	type ProjectionSnapshot,
} from "./projection.js";
export {
	PROJECTION_INTERFACE,
	PROJECTION_PORT,
} from "./port.js";
export {
	createUpcasterRegistry,
	type Upcaster,
	type UpcasterRegistry,
} from "./upcaster.js";

export const HOBO_DATA_PACKAGE = "@hobo/data";
