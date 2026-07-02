export {
	CoreParseError,
	EnvelopeParseError,
	ManifestParseError,
	PortDescriptorParseError,
} from "./errors.js";

export type {
	EventEnvelope,
	PrincipalRef,
	PrincipalKind,
	CloudEvent,
} from "./envelope.js";
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

export type {
	AppendOptions,
	AppendResult,
	Clock,
	EventInput,
	EventStore,
	FoldHandlers,
	FoldResult,
	QuarantineRecord,
	SnapshotRecord,
	StreamFilter,
	Subscription,
} from "./ports/eventstore.js";

export type {
	CapabilityManifestBundle,
	ParseCapabilityManifestOptions,
} from "./manifest.js";
export {
	parseCapabilityManifestBundle,
	CORE_SCHEMA_VERSION,
} from "./manifest.js";

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

export {
	linkKey,
	NoRouteError,
	parseWireVersion,
	ProviderHandlerStore,
	WireVersionIncompatibleError,
} from "./ports/wrpc-link.js";
export type {
	ComponentRegistration,
	EstablishedLink,
	InterfacePin,
	LinkCalledEvent as WrpcLinkCalledEvent,
	LinkEstablishedEvent as WrpcLinkEstablishedEvent,
	LinkRejectedEvent,
	LinkRequest as WrpcLinkRequest,
	MembraneEvent,
	NegotiatedWire,
	ProviderHandler,
	ProviderRegistration,
	TransportInvocation,
	TransportKind,
	WitCodec,
	WireVersion,
	WrpcLinkPort,
	WrpcTransport,
} from "./ports/wrpc-link.js";

export type {
	CapabilityDenialCode,
	CapabilityDiagnostic,
	CapabilityGrant,
	CapabilityGrantDeniedEvent,
	CapabilityLinkTableEvent,
	CapabilityUsageResult,
	GrantEvaluation,
	LinkCalledEvent,
	LinkEstablishedEvent,
} from "./capability/index.js";
export {
	CapabilityDeniedError,
	CapabilityParseError,
	evaluateCapabilityGrants,
	inferCapabilityUsage,
	parseCapabilityGrant,
} from "./capability/index.js";

export type {
	BindingResolverPort,
	ResourceId,
	ResolvedBinding,
} from "./ports/binding-resolver.js";
export {
	parseResourceId,
	RESOURCE_ID_PATTERN,
} from "./ports/binding-resolver.js";

export type {
	RunId,
	Seq,
	StreamName,
	Streamer,
	StreamerFrame,
	StreamerFrameRecord,
	StreamerRunHandle,
	StreamerRunResult,
	StreamerRunResultRecord,
	StreamerRunStatus,
	StreamerWritable,
} from "./ports/streamer.js";
export {
	DEFAULT_STREAM_NAME,
	StreamerBackpressureError,
	StreamerClosedError,
	StreamerParseError,
	createStreamerFrame,
	createStreamerRunResult,
	parseRunId,
	parseSeq,
	parseStreamName,
} from "./ports/streamer.js";

export type {
	ActorKey,
	CompleteResult,
	DequeueOptions,
	EnqueueOptions,
	EnqueueResult,
	HandleReport,
	IdempotencyKey,
	LeaseId,
	LeasedMessage,
	MessageId,
	Queue,
	QueueName,
	ReleaseResult,
	SignalResult,
} from "./ports/queue.js";
export {
	QUEUE_CLOCK_RUNTIME_PORT_CONTRACT_VERSION,
	QueueLeaseLostError,
	QueueParseError,
	createEnqueueResult,
	createLeasedMessage,
	parseActorKey,
	parseDequeueOptions,
	parseIdempotencyKey,
	parseLeaseId,
	parseMessageId,
	parseQueueName,
} from "./ports/queue.js";

export type {
	ClockReplayResult,
	ClockTraceEntry,
	CronSchedule,
	FiredTimer,
	IntervalCronSpec,
	IsoInstant,
	FireId,
	ScheduleId,
	ScheduledTimer,
	TimerId,
	TimerOptions,
	VirtualClock,
} from "./ports/clock.js";
export {
	ClockParseError,
	NondeterministicClockError,
	createClockReplayResult,
	createCronSchedule,
	createFiredTimer,
	createScheduledTimer,
	parseCronEveryMs,
	parseDelayMs,
	parseFireId,
	parseIsoInstant,
	parseScheduleId,
	parseTimerId,
} from "./ports/clock.js";
