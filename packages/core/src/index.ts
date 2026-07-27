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
export type { Container } from "./container.js";
export { createContainer } from "./container.js";
export type {
	CloudEvent,
	EventEnvelope,
	PrincipalKind,
	PrincipalRef,
} from "./envelope.js";
export {
	createEventEnvelope,
	fromCloudEvent,
	parseEventEnvelope,
	toCloudEvent,
} from "./envelope.js";
export {
	CoreParseError,
	EnvelopeParseError,
	ManifestParseError,
	PortDescriptorParseError,
} from "./errors.js";
export type {
	CapabilityManifestBundle,
	ParseCapabilityManifestOptions,
} from "./manifest.js";
export {
	CORE_SCHEMA_VERSION,
	parseCapabilityManifestBundle,
} from "./manifest.js";
export type {
	BindingResolverPort,
	BindingSource,
	ResolvedBinding,
	ResourceId,
} from "./ports/binding-resolver.js";
export {
	parseResourceId,
	RESOURCE_ID_PATTERN,
} from "./ports/binding-resolver.js";
export type {
	NamedEndpointMode,
	NamedEndpointParams,
} from "./naming.js";
export {
	DEFAULT_LOCAL_TLD,
	DEFAULT_OMITTED_ENV,
	DEFAULT_OVERLAY_TLD,
	getNamedEndpoint,
	getNamedEndpointHost,
	HOBO_ZONE_LABEL,
	isHoboHierarchicalName,
	sanitizeDnsLabel,
} from "./naming.js";
export type {
	ProjectId,
	Tenant,
	TenantContext,
	TenantId,
	TenantIsolationMode,
	TenantScoped,
} from "./ports/tenant.js";
export {
	LOCAL_DEFAULT_TENANT_ID,
	parseProjectId,
	parseTenantId,
	tenantContextFromEnv,
} from "./ports/tenant.js";
export type {
	PolicyDecision,
	PolicyDecisionEffect,
	PolicyEngine,
	PolicyRequest,
	PolicyResource,
	PolicySubject,
} from "./ports/policy-engine.js";
export { allowDecision, denyDecision } from "./ports/policy-engine.js";
export type {
	MeteringBus,
	MeteringSink,
	UsageEvent,
	UsageEventType,
} from "./ports/metering.js";
export { createMeteringBus, createUsageEvent } from "./ports/metering.js";
export type {
	DnsManagedBy,
	DnsProvider,
	DnsProviderKind,
	DnsRecord,
	DnsRecordType,
	PublicDnsConfig,
	PublicDnsManager,
} from "./ports/dns.js";
export type {
	FunnelPublishOptions,
	FunnelPublishResult,
	MagicDnsSplitConfig,
	MagicDnsSplitResult,
	OverlayIdentity,
	OverlayJoinOptions,
	OverlayJoinResult,
	OverlayNetwork,
	OverlayProviderKind,
} from "./ports/overlay.js";
export type {
	ClockReplayResult,
	ClockTraceEntry,
	CronSchedule,
	FiredTimer,
	FireId,
	IntervalCronSpec,
	IsoInstant,
	ScheduledTimer,
	ScheduleId,
	TimerId,
	TimerOptions,
	VirtualClock,
} from "./ports/clock.js";
export {
	ClockParseError,
	createClockReplayResult,
	createCronSchedule,
	createFiredTimer,
	createScheduledTimer,
	NondeterministicClockError,
	parseCronEveryMs,
	parseDelayMs,
	parseFireId,
	parseIsoInstant,
	parseScheduleId,
	parseTimerId,
} from "./ports/clock.js";
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
export type {
	FetchHandler,
	HoboRuntimeHost,
	HoboRuntimeHostKind,
	IsolationInfo,
	PrivateComponentSpec,
	PrivateServeResult,
	RuntimeEnsureContext,
	RuntimeEnsureResult,
	ServePrivateContext,
} from "./ports/runtime-host.js";
export {
	HOBO_RUNTIME_HOST_KINDS,
	isHoboRuntimeHostKind,
} from "./ports/runtime-host.js";
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
	ActorKey,
	CompleteResult,
	DequeueOptions,
	EnqueueOptions,
	EnqueueResult,
	HandleReport,
	IdempotencyKey,
	LeasedMessage,
	LeaseId,
	MessageId,
	Queue,
	QueueName,
	ReleaseResult,
	SignalResult,
} from "./ports/queue.js";
export {
	createEnqueueResult,
	createLeasedMessage,
	parseActorKey,
	parseDequeueOptions,
	parseIdempotencyKey,
	parseLeaseId,
	parseMessageId,
	parseQueueName,
	QUEUE_CLOCK_RUNTIME_PORT_CONTRACT_VERSION,
	QueueLeaseLostError,
	QueueParseError,
} from "./ports/queue.js";
export type {
	RunId,
	Seq,
	Streamer,
	StreamerFrame,
	StreamerFrameRecord,
	StreamerRunHandle,
	StreamerRunResult,
	StreamerRunResultRecord,
	StreamerRunStatus,
	StreamerWritable,
	StreamName,
} from "./ports/streamer.js";
export {
	createStreamerFrame,
	createStreamerRunResult,
	DEFAULT_STREAM_NAME,
	parseRunId,
	parseSeq,
	parseStreamName,
	StreamerBackpressureError,
	StreamerClosedError,
	StreamerParseError,
} from "./ports/streamer.js";
export type {
	CandidateEdit,
	CandidateId,
	CandidatePatch,
	CandidateProvenance,
	ContractRef,
	GeneratedRegion,
	OpenInferenceSpan,
	OptimizeRequest,
	ProgramDemo,
	Traceparent,
	TrainingArtifact,
	TrainingArtifactProgram,
	TrainingCandidate,
	TrainingEngineId,
	TrainingEnginePort,
	TrainingRubric,
	Trajectory,
	TrajectoryHash,
	TrajectoryId,
	TrajectoryPayload,
	TrajectoryReward,
	TrajectoryRun,
} from "./ports/training-engine.js";
export {
	hashTrajectory,
	OpenInferenceSpanKind,
	parseOptimizeRequest,
	parseTraceparent,
	parseTrainingArtifact,
	parseTrainingArtifactProgram,
	parseTrainingCandidate,
	parseTrainingEngineId,
	parseTrajectory,
	parseTrajectoryHash,
	serializeTrainingArtifactProgram,
	TRAINING_ENGINE_PORT,
	TrainingEngineParseError,
	TrajectoryRewardSchema,
} from "./ports/training-engine.js";
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
	WireVersion,
	WitCodec,
	WrpcLinkPort,
	WrpcTransport,
} from "./ports/wrpc-link.js";
export {
	linkKey,
	NoRouteError,
	ProviderHandlerStore,
	parseWireVersion,
	WireVersionIncompatibleError,
} from "./ports/wrpc-link.js";
export type {
	InterfaceStability,
	Port,
	PortDescriptor,
	PortKind,
	ProviderPort,
	RuntimePort,
} from "./ports.js";
export { createPortDescriptor } from "./ports.js";
export type { PublicTypeSurfaceResult } from "./surface-guard.js";
export {
	assertCoreApiSnapshot,
	CORE_API_SNAPSHOT,
	validatePublicTypeSurface,
} from "./surface-guard.js";
