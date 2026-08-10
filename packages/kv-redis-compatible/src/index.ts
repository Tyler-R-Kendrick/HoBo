export {
	CONFORMANCE_AREAS,
	type ConformanceArea,
	type ConformanceCase,
	type ConformanceStep,
	type ConsistencyClaim,
	KV_REDIS_CONFORMANCE_CASES,
	KV_REDIS_CONSISTENCY_CLAIMS,
} from "./cases.js";
export {
	isKvRedisCompatibleError,
	KV_REDIS_ERROR_CODES,
	KvRedisCompatibleError,
	type KvRedisErrorCode,
} from "./errors.js";

export {
	CONFORMANCE_KEY_NAMESPACE,
	type CommandArgTemplate,
	type CommandTemplate,
	describeCommand,
	type ExpectationOutcome,
	evaluateExpectation,
	type FillKind,
	type FillSizes,
	type KvRedisExecutor,
	type RedisCommand,
	type RedisReply,
	type RedisValue,
	type ReplyExpectation,
	requiredFills,
	resolveCommand,
	resolveFillSizes,
} from "./protocol.js";
export {
	createReferenceRedisStore,
	createTimelessReferenceStore,
	type ReferenceStore,
	type ReferenceStoreOptions,
} from "./reference-store.js";
export {
	KV_KEY_VALUE_PROFILE,
	KV_REDIS_COMPATIBLE_PROFILE,
	KV_VALKEY_PROFILE,
	type KvRuntimeRequest,
	type RedisStoreInput,
	redisCompatible,
	type ValkeyStoreInput,
	valkey,
} from "./requirement.js";
export {
	type ConformanceCaseResult,
	type ConformanceReport,
	type ConformanceRunInput,
	type DeclaredLimits,
	KV_REDIS_CONFORMANCE_SUITE_REF,
	runKvRedisConformance,
	type StepResult,
	TRANSPORT_KINDS,
	type TransportKind,
	toProfileImplementations,
	toStructuredCapabilities,
} from "./runner.js";

export {
	assertNoQueueTopicImplication,
	explainNonImplication,
	findQueueTopicImplications,
	type ImplicationViolation,
	isNonImpliedProfile,
	KV_REDIS_NON_IMPLIED_PROFILES,
	type NonImpliedProfile,
} from "./separation.js";
