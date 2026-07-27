export {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
} from "./equivalence.js";
export {
	AZURE_IAC_PROVIDER,
	assertLocalIacProgram,
	IAC_PROGRAM_API_VERSION,
	IAC_PROGRAM_KIND,
	IAC_PROVIDER,
	type IacProgram,
	type IacResource,
} from "./iac-program.js";
export {
	AUTH_SCHEMA,
	AZURE_PROVIDER_ID,
	type AzureManifestInput,
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
export {
	AZURE_PROVIDER_TARGET,
	azure,
	type TypedOptionBlock,
} from "./options.js";
export {
	type AzureProviderOptions,
	createAzureProvider,
} from "./provider.js";
export {
	type BuildSpec,
	isRealizablePort,
	mergeAzureOptions,
	type RealizablePort,
	realizeResourcePlan,
	realizeResourcePlans,
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
	AZURE_YARD_GENERATOR_CONNECTOR_ID,
	AZURE_YARD_RUNTIME_ID,
	azureDefaultResolverPins,
	azureYardRuntimeRegistration,
} from "./yard-defaults.js";
