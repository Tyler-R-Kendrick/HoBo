export { bindle } from "./bindle.js";
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
	golden,
	guardrail,
	job,
	kv,
	notify,
	queue,
	schedule,
	secret,
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
