export {
	assertDriverProgram,
	DRIVER_PROGRAM_API_VERSION,
	DRIVER_PROGRAM_KIND,
	type DriverProgram,
	type DriverResource,
	LAKEBED_DRIVER,
} from "./driver-program.js";
export {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
export {
	AUTH_SCHEMA,
	CAPABILITIES_SCHEMA,
	COST_FACTS,
	COST_SCHEMA,
	DEFAULT_REGIONS,
	LAKEBED_PROVIDER_ID,
	type LakebedManifestInput,
	MANIFEST_SCHEMA,
	type PublishedManifestDocuments,
	type PublishedManifestParseResult,
	parsePublishedManifest,
	publishCapabilityManifest,
} from "./manifest.js";
export {
	LAKEBED_PROVIDER_TARGET,
	lakebed,
	type TypedOptionBlock,
} from "./options.js";
export {
	createLakebedProvider,
	type LakebedProviderOptions,
} from "./provider.js";
export {
	isRealizablePort,
	mergeLakebedOptions,
	type RealizablePort,
	realizeResourcePlan,
	realizeResourcePlans,
	realizeTrafficRoutingPlan,
	resolveEquivalence,
} from "./realize.js";
export type {
	Capability,
	CapabilityManifest,
	CloudProvider,
	CostSignal,
	Match,
	Outputs,
	PortKind,
	PortRequest,
	ProviderClient,
	ResourcePlan,
} from "./types.js";

export {
	LAKEBED_TRAFFIC_ROUTING_OFFERING_IDS,
	LAKEBED_TRAFFIC_ROUTING_PROFILE,
} from "./traffic-routing-offerings.js";

// public-contract: the package id consumers assert against.
export const HOBO_PROVIDER_LAKEBED_PACKAGE = "@hobo/provider-lakebed";
