export {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
export {
	AWS_IAC_PROVIDER,
	assertLocalIacProgram,
	IAC_PROGRAM_API_VERSION,
	IAC_PROGRAM_KIND,
	IAC_PROVIDER,
	type IacProgram,
	type IacResource,
} from "./iac-program.js";
export {
	AUTH_SCHEMA,
	AWS_PROVIDER_ID,
	type AwsManifestInput,
	CAPABILITIES_SCHEMA,
	COST_FACTS,
	COST_SCHEMA,
	DEFAULT_REGIONS,
	MANIFEST_SCHEMA,
	type PublishedManifestDocuments,
	type PublishedManifestParseResult,
	parsePublishedManifest,
	publishCapabilityManifest,
} from "./manifest.js";
export { AWS_PROVIDER_TARGET, aws, type TypedOptionBlock } from "./options.js";
export {
	type AwsProviderOptions,
	createAwsProvider,
} from "./provider.js";
export {
	type BuildSpec,
	isRealizablePort,
	mergeAwsOptions,
	type RealizablePort,
	realizeResourcePlan,
	realizeResourcePlans,
	resolveEquivalence,
} from "./realize.js";
export {
	AWS_TRAFFIC_ROUTING_OFFERING_IDS,
	AWS_TRAFFIC_ROUTING_PROFILE,
} from "./traffic-routing-offerings.js";
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
	AWS_YARD_GENERATOR_CONNECTOR_ID,
	AWS_YARD_RUNTIME_ID,
	awsDefaultResolverPins,
	awsYardRuntimeRegistration,
} from "./yard-defaults.js";
export {
	AWS_EVENT_STORE_RESOLVER_ID,
	type AwsProviderNativeSignal,
	type AwsYardEvent,
	awsEventStoreFoldDescriptor,
	normalizeAwsYardSignal,
} from "./yard-event-fold.js";
