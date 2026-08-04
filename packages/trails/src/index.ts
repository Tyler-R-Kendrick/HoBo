export {
	TRAIL_RUN_STATES,
	type TrailRunRecord,
	TrailRunService,
	type TrailRunState,
} from "./aggregate.js";
export {
	CAN_TRAIL_SCHEMA_VERSION,
	type CanTrailInput,
	type CanTrailReason,
	type CanTrailResult,
	evaluateCanTrail,
} from "./can-trail.js";
export {
	type CreateSqliteDataDualPortOptions,
	createSqliteDataDualPort,
	type DataDualPort,
	type SqliteDataDualPort,
	type SqliteDataDualWrite,
} from "./data-dual-port.js";
export {
	applySchemaStep,
	createContractAssertedDataDualFixtures,
	DATA_DUAL_SCHEMA,
	type DataDualFixture,
	type DataDualResult,
	type DataDualView,
	evaluateDataDual,
	type SchemaApplyResult,
} from "./data-steps.js";
export {
	defineTrail,
	orderTrailSteps,
	TRAIL_DEFINITION_SCHEMA,
	type TrailDefinition,
	type TrailDefinitionInput,
	type TrailStep,
	type TrailStepKind,
	wireTrailPhaseDependencies,
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
	type TrailHistoryEntry,
	TrailHistoryStore,
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
	type TrailPlanEvidence,
	TrailRunner,
	type TrailRunnerOptions,
	type TrailRunResult,
} from "./runner.js";

// public-contract: package id consumers assert against.
export const HOBO_TRAILS_PACKAGE = "@hobo/trails";
