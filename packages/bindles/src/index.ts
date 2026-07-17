export type {
	AllowVerbsFor,
	BindleBuilder,
	BindleDefinition,
	BindleEdge,
	BindleResource,
	BindleResourceRecord,
	LoweringDescriptor,
	ProviderAnnotation,
	ResourceCatalogEntry,
	ResourceDescriptor,
	ResourceHandle,
	ResourceKind,
	SecretRef,
} from "./types.js";

export {
	CATALOG,
	api,
	auth,
	bucket,
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

export { secretRef } from "./secret-ref.js";

export { bindle } from "./bindle.js";

export {
	addContainer,
	bindingTypesFor,
	BindReferenceError,
	compileBindleManifest,
	data as wiringData,
	service as wiringService,
} from "./wiring/index.js";
export type {
	BindingMeta,
	ComponentHandle,
	Handle,
	ManifestResource,
	ResourceHandle as WiringResourceHandle,
	WiringManifest,
} from "./wiring/index.js";

export {
	COLLECTION_EVENT_SOURCE,
	collectBindleManifest,
	CollectionEngineError,
	createCollectionEvents,
	manifestFromWiring,
} from "./collect/index.js";
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

export const HOBO_BINDLES_PACKAGE = "@hobo/bindles";

export {
	MANIFEST_SCHEMA,
	ManifestParseError,
	aspireFallbackEnv,
	canonicalManifestHash,
	parseManifest,
	parseManifestReference,
	parseOutputPlaceholder,
	serializeManifest,
} from "./manifest/index.js";

export type {
	ManifestHash,
	ManifestReference,
	ManifestV1,
	OutputPlaceholder,
} from "./manifest/index.js";
