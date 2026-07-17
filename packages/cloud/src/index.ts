// @hobo/cloud — the Yard control-plane kernel (S2-01) and the Planner (S2-02).
// A coherent vertical: a Deploy command becomes past-tense facts, the pure
// Planner resolves them to a content-addressed DeploymentPlan DAG, and the
// DeploymentView projection reconstructs deployment state from the log.

export {
	DEPLOYMENT_PLAN_SCHEMA,
	canonicalPlanJson,
	hashDeploymentPlan,
	type CapabilityVerdict,
	type DeploymentPlan,
	type MatchDecided,
	type Negotiation,
	type PlanHash,
	type PlanRemediation,
	type ResourceIntent,
	type ResourcePlan,
} from "./plan-types.js";

export {
	CLOUD_EVENTS,
	CLOUD_EVENT_SCHEMA_VERSION,
	deploymentPlanRejected,
	deploymentPlanned,
	deploymentRequested,
	matchDecided,
	providerRegistered,
	type DeploymentRequestedData,
} from "./events.js";

export { lowerManifest, type LowerOptions } from "./intent.js";

export {
	plan,
	matchResource,
	type MatchAccepted,
	type MatchOutcome,
	type MatchRejected,
	type PlanConfig,
	type PlanRejection,
	type PlanResult,
	type PlanSuccess,
} from "./planner/index.js";

export {
	createRegistryFromProviders,
	definitionsFor,
	registerProviderFact,
	registryCatalogProjection,
	type PlannerRegistry,
	type RegistrableCapability,
	type RegistrableProvider,
	type RegistryCatalogRow,
	type ResourceDefinition,
} from "./registry/catalog.js";

export {
	deploymentViewProjection,
	type DeploymentDecisionRow,
	type DeploymentViewRow,
} from "./projections/deployment-view.js";

export {
	authorize,
	deploy,
	deploymentStreamId,
	UnauthorizedCommandError,
	type AuthzResult,
	type DeployCommand,
	type DeployResult,
	type DeployResultPlanned,
	type DeployResultRejected,
	type GatewayContext,
	type GatewayDeps,
} from "./gateway/gateway.js";

export { collectStream } from "./store/index.js";

export const HOBO_CLOUD_PACKAGE = "@hobo/cloud";
