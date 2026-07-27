export {
	assertComposedIsolation,
	type ComposedIsolationVerdict,
} from "./compose.js";
export {
	elevatedDeniedEvent,
	mintElevatedAccessCapability,
	type MintElevatedInput,
	type VerifiedElevatedAccess,
	verifyElevatedAccessCapability,
} from "./elevated-capability.js";
export {
	ACCESS_EVENT_SCHEMA_VERSION,
	ACCESS_EVENTS,
	type AccessEvent,
	type AccessEventType,
	createAccessEvent,
} from "./events.js";
export {
	evaluateEnvIsolation,
	type EnvIsolationEvalContext,
	type EnvIsolationVerdict,
} from "./evaluate.js";
export {
	BREAK_GLASS_SCHEMA,
	BreakGlassService,
	type BreakGlassGrant,
	CROSS_ENV_GRANT_SCHEMA,
	CrossEnvGrantStore,
	type CrossEnvGrant,
	ELEVATED_ACCESS_SCHEMA,
	type ElevatedAccessCapability,
} from "./grants.js";
export {
	assertLocalNamedEndpointBackend,
	evaluateOverlayJoin,
	hoboDevOverlayJoinAllowed,
	type OverlayJoinDecision,
	type OverlayJoinRequest,
	recordOverlayJoinDenied,
} from "./local-airgap.js";
export {
	assertMembershipIntegrity,
	ENV_MEMBERSHIP_SCHEMA,
	type AssignMembershipInput,
	type EnvMembership,
	EnvMembershipService,
} from "./membership.js";
export {
	DEFAULT_ENV_NETWORK_ISOLATION_POLICY_PACK,
	ENV_ISOLATION_RAIL_POLICY_PACK_REF,
	ENV_NETWORK_ISOLATION_POLICY_PACK_ID,
	ENV_NETWORK_ISOLATION_POLICY_PACK_VERSION,
	type EnvNetworkIsolationPolicyPack,
	parseEnvNetworkIsolationPolicyPack,
} from "./policy-pack.js";
export {
	createEnvNetworkIsolationRegistry,
	type EnvControlPlanePartition,
	type EnvNetworkIsolationRegistry,
	type EnvNetworkIsolationRegistryOptions,
	type EnvOverlayPlane,
	envIsolationTags,
} from "./registry.js";
export {
	BREAK_GLASS_TTL_SECONDS,
	classesDiffer,
	defaultTierForClass,
	ELEVATED_CAPABILITY_TTL_SECONDS,
	ENV_TAG_PREFIX,
	ISOLATION_CLASSES,
	ISOLATION_TIERS,
	type IsolationClass,
	type IsolationTier,
	isolationClassTag,
	isExpired,
	isShortLivedClass,
	parseIsolationClass,
	SHORT_LIVED_MEMBERSHIP_TTL_SECONDS,
} from "./types.js";
