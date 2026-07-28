export {
	evaluateReplayAccess,
	type AccessDecision,
	type AccessRequest,
} from "./access.js";
export {
	isReplayAutoWired,
	webReplayAutowire,
	type ReplayAutowireSnippet,
} from "./autowire.js";
export {
	applySessionReplayToEntrypoints,
	defaultWebSessionReplayAnnotation,
	deriveBindleSessionReplayPlan,
	isReplayableAppKitKind,
	isResourceReplayable,
	listReplayableResources,
	readSessionReplayAnnotation,
	sessionReplayAnnotation,
	wrapBindleWebHandler,
	REPLAYABLE_APP_KIT_KINDS,
	SESSION_REPLAY_OPTION,
	SESSION_REPLAY_PATH_PREFIX,
	type BindleAnnotationLike,
	type BindleDefinitionLike,
	type BindleResourceLike,
	type BindleSessionReplayPlan,
	type FetchHandler as SessionReplayFetchHandler,
	type ReplayableAppKitKind,
	type SessionReplayAnnotationConfig,
	type SessionReplayHostSurface,
	type WrapBindleWebHandlerOptions,
} from "./bindle-integration.js";
export {
	injectSessionReplayBootstrap,
	renderSessionReplayBootstrapScript,
	type BrowserBootstrapConfig,
} from "./browser-bootstrap.js";
export {
	buildCorrelation,
	withErrorLink,
	withHarnessExposures,
	withTrail,
	type CorrelationInput,
} from "./correlation.js";
export {
	buildEvidencePack,
	type EvidencePack,
} from "./evidence.js";
export {
	createReplayEvent,
	REPLAY_EVENT_SCHEMA,
	REPLAY_EVENTS,
	type ReplayEvent,
	type ReplayEventType,
} from "./events.js";
export {
	createMemoryMeterSink,
	meterIngest,
	meterPlayerAccess,
	type MeterSink,
	type ReplayMeterEvent,
	type ReplayMeterKind,
} from "./metering.js";
export {
	createFixtureReplayEngine,
	loadPlayerPayload,
	summarizeSession,
	type OpenUiPlayerDescriptor,
	type PlayerPayload,
	type ReplayEngine,
} from "./player.js";
export {
	evaluateRecordingPolicy,
	REPLAY_ENV_KILL,
	REPLAY_FLAG_KEY,
	type RecordingDecision,
	type RecordingPolicyInput,
} from "./policy.js";
export {
	assertNoSensitivePlaintext,
	defaultPrivacyPolicy,
	maskRrwebEvent,
	maskRrwebEvents,
	shouldMaskNode,
	MASK_TOKEN,
} from "./privacy.js";
export {
	applyRetention,
	DEFAULT_RETENTION,
	eraseSessionById,
	REPLAY_RETENTION_RECIPE,
	replayRetentionTrailStep,
	type RetentionPolicy,
	type RetentionResult,
} from "./retention.js";
export {
	createContractAssertedReplayFixtures,
	createReplayService,
	type ReplayService,
} from "./service.js";
export {
	createReplayHttpSurface,
	REPLAY_BOUNDARIES,
	seedReplayFixture,
	type HttpMethod,
	type ReplayBoundaryDescriptor,
	type ReplayHttpRequest,
	type ReplayHttpResponse,
	type ReplayHttpSurface,
} from "./http-surface.js";
export {
	createFilesystemDualFixtures,
	createMemoryDualFixtures,
	createObjectStorageBlobStore,
	type DualFixtureStore,
	type ObjectStoragePort,
	type SessionBlobStore,
	type SessionIndex,
	type SessionListQuery,
} from "./storage.js";
export {
	createDefaultLocalTracker,
	createFixtureRecordEngine,
	createRrwebRecordEngine,
	createTracker,
	type RecordEngine,
	type TrackerHandle,
	type TrackerOptions,
} from "./tracker.js";
export {
	parsePrivacyPolicy,
	parseSessionCorrelation,
	parseSessionRecord,
	REPLAY_CONTRACT_VERSION,
	REPLAY_CORRELATION_SCHEMA,
	REPLAY_PRIVACY_SCHEMA,
	REPLAY_SCHEMA_VERSION,
	ReplayParseError,
	type IsolationClass,
	type PrivacyPolicy,
	type RecordingChunk,
	type RrwebEvent,
	type SessionCorrelation,
	type SessionRecord,
	type SessionStatus,
} from "./types.js";

// public-contract: package id consumers assert against.
export const HOBO_REPLAY_PACKAGE = "@hobo/replay";
