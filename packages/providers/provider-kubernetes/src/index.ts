export {
	type ApiStatus,
	type DeploymentRecord,
	NAMESPACE_PHASES,
	type NamespacePhase,
	type NamespaceRecord,
	parseApiStatus,
	parseDeploymentRecord,
	parseNamespaceRecord,
	parseServiceRecord,
	ROLLOUT_PHASES,
	type RolloutPhase,
	rolloutPhaseFor,
	type ServiceRecord,
} from "./api.js";
export {
	APPS_PATH,
	createKubernetesApiClient,
	errorForApiResponse,
	type KubernetesApiClient,
	type KubernetesApiClientOptions,
	NAMESPACES_PATH,
} from "./client.js";
export {
	CLEANUP_STATES,
	type CleanupOutcome,
	type CleanupState,
	cleanupWorkload,
	observeRollout,
	type ProvisionReceipt,
	provisionWorkload,
	RECEIPT_SCHEMA_VERSION,
} from "./driver.js";
export {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	type InitialCapabilityPort,
	kubernetesNativePorts,
} from "./equivalence.js";
export {
	isKubernetesProviderError,
	KUBERNETES_ERROR_CODES,
	type KubernetesErrorCode,
	KubernetesProviderError,
	redactClusterText,
} from "./errors.js";
export {
	kubernetes,
	PROVIDER_TARGET,
	type TypedOptionBlock,
} from "./options.js";
export {
	clusterDnsName,
	clusterEndpointUrl,
	formatMemoryQuantity,
	MAX_SURGE,
	PROVIDER_RESOURCE_CLASS,
	parseCpuMillicores,
	parseMemoryBytes,
	parseWorkloadPlacement,
	type ResourceQuantity,
	renderDeploymentManifest,
	renderNamespaceManifest,
	renderServiceManifest,
	SERVICE_PORT,
	type WorkloadPlacement,
} from "./placement.js";
export { createKubernetesProvider } from "./provider.js";
export {
	provisionTemporaryEnvironmentStation,
	supportsAnonymousTemporaryDeploy,
} from "./temporary-station.js";
export {
	assertAllowedEndpoint,
	createFetchTransport,
	createGuardedTransport,
	DEFAULT_TRANSPORT_POLICY,
	type KubernetesTransport,
	type TransportMethod,
	type TransportPolicy,
	type TransportRequest,
	type TransportResponse,
} from "./transport.js";
export type {
	Capability,
	CapabilityManifest,
	CloudProvider,
	ResourcePlan,
} from "./types.js";

// public-contract: package identity used by generated catalogs.
export const HOBO_PROVIDER_KUBERNETES_PACKAGE = "@hobo/provider-kubernetes";
