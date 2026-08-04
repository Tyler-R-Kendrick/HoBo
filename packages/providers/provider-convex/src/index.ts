export {
	assertDriverProgram,
	CONVEX_DRIVER,
	DRIVER_PROGRAM_API_VERSION,
	DRIVER_PROGRAM_KIND,
	type DriverProgram,
	type DriverResource,
} from "./driver-program.js";
export {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
export {
	CONVEX_IMPEDANCE_SCHEMA,
	CONVEX_LIMITS,
	CONVEX_PARADIGM,
	CONVEX_PARADIGM_MISMATCHES,
	convexImpedanceFindings,
	type ImpedanceFinding,
} from "./impedance.js";
export {
	CONVEX_MANAGEMENT_API_BASE,
	ConvexCredentialsError,
	type ConvexDeploymentInfo,
	type ConvexManagementClient,
	type ConvexManagementClientOptions,
	createConvexManagementClient,
	describeConvexTarget,
} from "./management-api.js";
export {
	AUTH_SCHEMA,
	CAPABILITIES_SCHEMA,
	CONVEX_PROVIDER_ID,
	COST_FACTS,
	COST_SCHEMA,
	type ConvexManifestInput,
	DEFAULT_REGIONS,
	MANIFEST_SCHEMA,
	type PublishedManifestDocuments,
	type PublishedManifestParseResult,
	parsePublishedManifest,
	publishCapabilityManifest,
} from "./manifest.js";
export {
	type ConvexProviderOptions,
	createConvexProvider,
} from "./provider.js";
export { realizeResourcePlan } from "./realize.js";
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
