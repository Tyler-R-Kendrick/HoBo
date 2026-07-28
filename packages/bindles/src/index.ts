export { bindle } from "./bindle.js";
export {
	connectionRef,
	requireConnection,
	type ConnectionClient,
	type ConnectionRequirement,
} from "./connection.js";
export {
	collectRequiredRuntimes,
	containerDependencyAnnotation,
	DEPENDENCY_OPTION,
	dependencyAnnotation,
	dependencyRuntimeOf,
	discoveryEnvForDependency,
	externalDependencyAnnotation,
	isDependencyAnnotation,
	readDependencyConfig,
	wasmComponentDependencyAnnotation,
	type RequiredRuntimeKind,
} from "./dependencies.js";
export { env } from "./env.js";
export {
	APP_KIT_KINDS,
	HTTP_APP_KIT_KINDS,
	INFRA_KIT_KINDS,
	appKitLabel,
	isAppKitKind,
	isHttpAppKitKind,
	type AppKitKind,
	type HttpAppKitKind,
} from "./app-kits.js";
export {
	defaultAppKitSessionReplayAnnotation,
	isSessionReplayAnnotation,
	sessionReplay,
	SESSION_REPLAY_OPTION,
	type SessionReplayBindleConfig,
} from "./session-replay.js";
export {
	assertSourceAllowed,
	config,
	envField,
	fromBinding,
	schemaOnlyView,
	SECRET_SOURCE_RANKS,
	secretField,
	sourceRankIndex,
	type ConfigFieldDef,
	type ConfigFieldKind,
	type ConfigSchema,
	type SecretSourceRank,
} from "./config-schema.js";
export {
	generateCtxConfigSource,
	materializeAgentConfigView,
	type GeneratedAgentConfigView,
} from "./config-codegen.js";
export {
	evaluateSecretlessConfigGate,
	type ConfigGateReason,
	type SecretlessConfigGateInput,
	type SecretlessConfigGateResult,
} from "./config-can-deploy.js";
export { secret } from "./secret-surface.js";
export {
	BINDLE_FEATURES_SCHEMA,
	experiment as declareExperiment,
	features,
	featureSpecsToStoreInputs,
	rollout,
	type ExperimentDeclaration,
	type ExperimentSpec,
	type FeatureFlagSpec,
	type FeaturesDeclaration,
	type FeatureState,
	type RolloutDeclaration,
	type RolloutSpec,
	type RolloutStageSpec,
} from "./features.js";
export {
	assertNoBindleProviderSelection,
	BINDLE_PROVIDER_SELECTION_FORBIDDEN,
	BINDLE_PROVIDER_SELECTION_REMEDIATION,
	collectExplicitProviderPins,
	emptyBindleRequirements,
	hashBindleRequirements,
	isPlatformAnnotation,
	parseBindleRequirements,
	type BindleRequirementsHash,
} from "./requirements.js";

export {
	api,
	auth,
	bucket,
	CATALOG,
	catalogFactoryNames,
	crypto,
	data,
	experiment,
	flag,
	rolloutResource,
	golden,
	guardrail,
	job,
	kv,
	notify,
	queue,
	schedule,
	// secret is dual-exported from secret-surface.ts (resource + field builders)
	service,
	topic,
	ui,
	web,
	websocket,
} from "./catalog.js";
export type {
	CollectionContext,
	CollectionEvent,
	CollectionEventType,
	CollectionResult,
	CollectionTarget,
	ComponentHostDescriptor,
	ManifestProducedData,
	ManifestProducedEvent,
	ResourcesCollectedData,
	ResourcesCollectedEvent,
} from "./collect/index.js";
export {
	COLLECTION_EVENT_SOURCE,
	CollectionEngineError,
	collectBindleManifest,
	createCollectionEvents,
	manifestFromWiring,
} from "./collect/index.js";
export { secretRef } from "./secret-ref.js";
export type {
	AllowVerbsFor,
	BindleBuilder,
	BindleDefinition,
	BindleEdge,
	BindleRequirements,
	BindleResource,
	BindleResourceRecord,
	ContainerDependencyOptions,
	ExternalDependencyOptions,
	LoweringDescriptor,
	ProviderAnnotation,
	ResourceCatalogEntry,
	ResourceDescriptor,
	ResourceHandle,
	ResourceKind,
	SecretRef,
	WasmComponentDependencyOptions,
} from "./types.js";
export type {
	BindingMeta,
	ComponentHandle,
	Handle,
	ManifestResource,
	ResourceHandle as WiringResourceHandle,
	WiringManifest,
} from "./wiring/index.js";
export {
	addContainer,
	BindReferenceError,
	bindingTypesFor,
	compileBindleManifest,
	data as wiringData,
	service as wiringService,
} from "./wiring/index.js";

// public-contract: the package id emitted into generated bindle artifacts.
export const HOBO_BINDLES_PACKAGE = "@hobo/bindles";

export type {
	ManifestHash,
	ManifestReference,
	ManifestV1,
	OutputPlaceholder,
} from "./manifest/index.js";
export {
	aspireFallbackEnv,
	canonicalManifestHash,
	MANIFEST_SCHEMA,
	ManifestParseError,
	parseManifest,
	parseManifestReference,
	parseOutputPlaceholder,
	serializeManifest,
} from "./manifest/index.js";
