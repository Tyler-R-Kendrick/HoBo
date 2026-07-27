export {
	TrailRunService,
	TRAIL_RUN_STATES,
	type TrailRunRecord,
	type TrailRunState,
} from "./aggregate.js";
export {
	CAN_TRAIL_SCHEMA_VERSION,
	evaluateCanTrail,
	type CanTrailInput,
	type CanTrailReason,
	type CanTrailResult,
} from "./can-trail.js";
export {
	applySchemaStep,
	createContractAssertedDataDualFixtures,
	DATA_DUAL_SCHEMA,
	evaluateDataDual,
	type DataDualFixture,
	type DataDualResult,
	type SchemaApplyResult,
} from "./data-steps.js";
export {
	defineTrail,
	orderTrailSteps,
	wireTrailPhaseDependencies,
	TRAIL_DEFINITION_SCHEMA,
	type TrailDefinition,
	type TrailDefinitionInput,
	type TrailStep,
	type TrailStepKind,
} from "./definition.js";
export {
	createTrailEvent,
	TRAIL_EVENT_SCHEMA,
	TRAIL_EVENTS,
	type TrailEvent,
	type TrailEventType,
} from "./events.js";
export {
	createContractAssertedTrailFixtures,
	type LocalTrailFixtures,
} from "./fixtures.js";
export {
	goldenCompensation,
	goldenDualConsistency,
	goldenFailClosed,
	goldenHistoryIdempotent,
	goldenIdentityHandsOff,
	goldenJunctionIntegrity,
	goldenProgressiveAbort,
	goldenZeroLoss,
	runTrailGoldenSuite,
	TRAIL_GOLDEN_SCHEMA,
	type TrailGoldenOracleId,
	type TrailGoldenVerdict,
} from "./golden.js";
export {
	stepChecksum,
	TRAIL_HISTORY_SCHEMA,
	TrailHistoryStore,
	type TrailHistoryEntry,
} from "./history.js";
export {
	activateIdentityContinuousFromMatching,
	advanceIdentityTrailRamp,
	assertIdentityContinuousHandsOff,
	createHandsOffIdentityTrail,
	IDENTITY_TRAIL_SCHEMA,
	type IdentityTrailHandle,
	type TrailCanMigrateEvidence,
	type TrailIdentityFixturesView,
	type TrailIdentityProgress,
} from "./identity-trail.js";
export {
	composeTrailWithRecipes,
	expandRecipes,
	getPlatformRecipe,
	identityContinuousTrail,
	listPlatformRecipes,
	PLATFORM_RECIPES,
	type PlatformRecipe,
	type PlatformRecipeId,
} from "./recipes.js";
export {
	TRAIL_RUNNER_SCHEMA,
	TrailRunner,
	type TrailPlanEvidence,
	type TrailRunnerOptions,
	type TrailRunResult,
} from "./runner.js";

// public-contract: package id consumers assert against.
export const HOBO_TRAILS_PACKAGE = "@hobo/trails";
