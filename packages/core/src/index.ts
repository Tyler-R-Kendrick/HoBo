export {
	CoreParseError,
	EnvelopeParseError,
	ManifestParseError,
	PortDescriptorParseError,
} from "./errors.js";

export type { EventEnvelope, PrincipalRef, PrincipalKind, CloudEvent } from "./envelope.js";
export {
	parseEventEnvelope,
	createEventEnvelope,
	toCloudEvent,
	fromCloudEvent,
} from "./envelope.js";

export type {
	PortDescriptor,
	Port,
	RuntimePort,
	ProviderPort,
	PortKind,
	InterfaceStability,
} from "./ports.js";
export { createPortDescriptor } from "./ports.js";

export type { CapabilityManifestBundle, ParseCapabilityManifestOptions } from "./manifest.js";
export { parseCapabilityManifestBundle, CORE_SCHEMA_VERSION } from "./manifest.js";

export type { Container } from "./container.js";
export { createContainer } from "./container.js";

export {
	CORE_API_SNAPSHOT,
	assertCoreApiSnapshot,
	validatePublicTypeSurface,
} from "./surface-guard.js";
export type { PublicTypeSurfaceResult } from "./surface-guard.js";

export type {
	BoundaryMode,
	ComponentDescriptor,
	ComponentHostEvent,
	ComponentHostPort,
	ComponentInstance,
	ComponentLifecycle,
	HttpRequest,
	HttpResponse,
	InterfaceId,
	LinkRecord,
	LinkRequest,
	LinkTransport,
	ParsedComponentDescriptor,
	ProviderDescriptor,
	WasmtimeEngine,
} from "./ports/component-host.js";
export { parseInterfaceId } from "./ports/component-host.js";
