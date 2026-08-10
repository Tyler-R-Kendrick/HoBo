export {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
	webernetesNativePorts,
} from "./equivalence.js";
export {
	PROVIDER_TARGET,
	type TypedOptionBlock,
	webernetes,
} from "./options.js";
export {
	parseWebernetesBindings,
	parseWebernetesLocalEndpoint,
	parseWebernetesPort,
	parseWebernetesResourceName,
	parseWebernetesResourcePlan,
	parseWebernetesStationDeployment,
	parseWebernetesStationId,
	WEBERNETES_PORTS,
	WEBERNETES_REJECTED_CODE,
	type WebernetesBindings,
	type WebernetesEndpointLocality,
	type WebernetesFeature,
	WebernetesInputRejectedError,
	type WebernetesLocalEndpoint,
	type WebernetesPortKind,
	type WebernetesResourceName,
	type WebernetesResourcePlan,
	type WebernetesStationDeployment,
	webernetesPortOrUndefined,
} from "./parse.js";
export { createWebernetesProvider } from "./provider.js";
export {
	type LocalTemporaryStationInput,
	type LocalTempTransport,
	provisionTemporaryEnvironmentStation,
	supportsAnonymousTemporaryDeploy,
} from "./temporary-station.js";
export type {
	Capability,
	CapabilityManifest,
	CloudProvider,
	ResourcePlan,
} from "./types.js";

// public-contract: package identity used by generated catalogs.
export const HOBO_PROVIDER_WEBERNETES_PACKAGE = "@hobo/provider-webernetes";
