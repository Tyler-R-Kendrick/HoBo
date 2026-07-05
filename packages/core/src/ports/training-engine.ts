import { CoreParseError } from "../errors.js";
import { deepFreeze } from "../parse-utils.js";

// Promoted from src/draft/technical-proofs/training-engine-port-contract
// (frozen in scripts/promotions.json) and extended with the ADR-0125
// training-artifact candidate form.

export const TRAINING_ENGINE_PORT =
	"hobo:training-engine/training-engine@0.1.0";
export const BUILT_IN_ENGINE_ID = "hobo.training-engine/built-in-opto@0.1.0";

export const TRAINING_TRAJECTORY_SCHEMA = "hobo.training.trajectory/v1";
export const TRAINING_OPTIMIZE_REQUEST_SCHEMA =
	"hobo.training.optimize-request/v1";
export const TRAINING_CANDIDATE_SCHEMA = "hobo.training.candidate-patch/v1";
export const TRAINING_ARTIFACT_SCHEMA = "hobo.training.artifact/v1";

export const TRAINING_EVENT_TYPES = deepFreeze([
	"training.RunStarted",
	"training.TrajectoryCaptured",
	"training.RewardObserved",
	"training.CandidateProposed",
	"training.CandidateEvaluated",
	"training.Promoted",
	"training.Rejected",
] as const);

export const OPENINFERENCE_SPAN_KINDS = deepFreeze([
	"LLM",
	"CHAIN",
	"TOOL",
	"RETRIEVER",
	"RERANKER",
	"EMBEDDING",
	"AGENT",
	"GUARDRAIL",
	"EVALUATOR",
	"PROMPT",
] as const);

const TRACEPARENT_PATTERN = /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SENSITIVE_CLASSIFICATIONS = new Set([
	"pii",
	"secret",
	"confidential",
	"regulated",
]);

export type TrainingEventType = (typeof TRAINING_EVENT_TYPES)[number];
export type OpenInferenceSpanKind = (typeof OPENINFERENCE_SPAN_KINDS)[number];

export type TrajectoryId = string & { readonly __brand: "TrajectoryId" };
export type CandidateId = string & { readonly __brand: "CandidateId" };
export type TrainingEngineId = string & {
	readonly __brand: "TrainingEngineId";
};
export type Traceparent = string & { readonly __brand: "Traceparent" };
export type TrajectoryHash = string & { readonly __brand: "TrajectoryHash" };

export class TrainingEngineParseError extends CoreParseError {
	constructor(
		path: string,
		expected: string,
		received: unknown,
		message?: string,
	) {
		super("HOBO_CORE_TRAINING_PARSE", path, expected, received, message);
		this.name = "TrainingEngineParseError";
	}
}

export interface GeneratedRegion {
	readonly regionId: string;
	readonly artifactRef: string;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly owner: string;
}

export interface TrajectoryRunCorrelation {
	readonly id: string;
	readonly tenantId: string;
	readonly bindle: string;
	readonly agent: {
		readonly id: string;
		readonly principalRef: string;
	};
}

export interface OpenInferenceSpan {
	readonly id: string;
	readonly parentId: string | null;
	readonly name: string;
	readonly startTime: string;
	readonly endTime: string;
	readonly attributes: Readonly<Record<string, unknown>>;
	readonly inputs?: Readonly<Record<string, unknown>>;
	readonly outputs?: Readonly<Record<string, unknown>>;
}

export interface TrajectoryReward {
	readonly source: string;
	readonly rubricRef: string;
	readonly eventId?: string;
	readonly score: number;
	readonly observedAt?: string;
}

export interface TrajectoryPayload {
	readonly classification?: string;
	readonly redaction?: "none" | "tokenized" | "encrypted";
	readonly value?: unknown;
	readonly tokenRef?: string;
	readonly encryptedRef?: string;
}

export interface Trajectory {
	readonly schema: typeof TRAINING_TRAJECTORY_SCHEMA;
	readonly id: TrajectoryId;
	readonly traceparent: Traceparent;
	readonly run: TrajectoryRunCorrelation;
	readonly subject: {
		readonly method: string;
		readonly contractRef: string;
		readonly generatedRegion: GeneratedRegion;
	};
	readonly spans: readonly OpenInferenceSpan[];
	readonly payloads: Readonly<Record<string, TrajectoryPayload>>;
	readonly reward: TrajectoryReward;
}

export interface TrainingRubric {
	readonly id: string;
	readonly objective: string;
	readonly thresholds?: Readonly<Record<string, number>>;
}

export interface OptimizeRequest {
	readonly schema: typeof TRAINING_OPTIMIZE_REQUEST_SCHEMA;
	readonly requestId: string;
	readonly generatedRegion: GeneratedRegion;
	readonly trajectories: readonly Trajectory[];
	readonly rubric: TrainingRubric;
	readonly contract: {
		readonly ref: string;
		readonly method: string;
		readonly allowedRegionId: string;
	};
}

export interface CandidateEdit {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly replacement: string;
}

export interface CandidateProvenance {
	readonly trajectoryHashes: readonly TrajectoryHash[];
	readonly rubricRef: string;
	readonly contractRef: string;
}

/**
 * ADR-0125: the serialized-optimized-program candidate form. Applied at
 * component instantiation (no source mutation); the `program` payload is
 * engine-defined and opaque to the platform, pinned by engine id + version.
 */
export interface TrainingArtifact {
	readonly schema: typeof TRAINING_ARTIFACT_SCHEMA;
	readonly engineId: TrainingEngineId;
	readonly engineVersion: string;
	readonly methodRef: string;
	readonly program: Readonly<Record<string, unknown>>;
}

export type TrainingCandidate =
	| {
			readonly schema: typeof TRAINING_CANDIDATE_SCHEMA;
			readonly kind: "patch";
			readonly id: CandidateId;
			readonly engineId: TrainingEngineId;
			readonly region: GeneratedRegion;
			readonly edits: readonly CandidateEdit[];
			readonly provenance: CandidateProvenance;
	  }
	| {
			readonly schema: typeof TRAINING_CANDIDATE_SCHEMA;
			readonly kind: "artifact";
			readonly id: CandidateId;
			readonly engineId: TrainingEngineId;
			readonly artifact: TrainingArtifact;
			readonly provenance: CandidateProvenance;
	  };

/**
 * The `hobo:training-engine` port (ADR-0025). Engines are internal: the SDK
 * surface never exposes this interface; swapping engines is configuration.
 */
export interface TrainingEnginePort {
	readonly engineId: TrainingEngineId;
	optimize(request: OptimizeRequest): Promise<TrainingCandidate>;
}

function fail(path: string, expected: string, received: unknown): never {
	throw new TrainingEngineParseError(path, expected, received);
}

function parseObject(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		fail(path, "object", value);
	}
	return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		fail(path, "non-empty string", value);
	}
	return value;
}

export function parseTraceparent(value: unknown): Traceparent {
	if (typeof value !== "string" || !TRACEPARENT_PATTERN.test(value)) {
		fail("traceparent", "W3C traceparent", value);
	}
	return value as Traceparent;
}

export function parseTrajectoryHash(value: unknown): TrajectoryHash {
	if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
		fail("trajectoryHash", "sha256:<hex64>", value);
	}
	return value as TrajectoryHash;
}

export function parseTrainingEngineId(value: unknown): TrainingEngineId {
	return parseNonEmptyString(value, "engineId") as TrainingEngineId;
}

export function parseGeneratedRegion(
	value: unknown,
	path = "generatedRegion",
): GeneratedRegion {
	const source = parseObject(value, path);
	const startOffset = source.startOffset;
	const endOffset = source.endOffset;
	if (!Number.isInteger(startOffset) || (startOffset as number) < 0) {
		fail(`${path}.startOffset`, "non-negative integer", startOffset);
	}
	if (
		!Number.isInteger(endOffset) ||
		(endOffset as number) <= (startOffset as number)
	) {
		fail(`${path}.endOffset`, "integer greater than startOffset", endOffset);
	}
	return deepFreeze({
		regionId: parseNonEmptyString(source.regionId, `${path}.regionId`),
		artifactRef: parseNonEmptyString(source.artifactRef, `${path}.artifactRef`),
		startOffset: startOffset as number,
		endOffset: endOffset as number,
		owner: parseNonEmptyString(source.owner, `${path}.owner`),
	});
}

function parseRunCorrelation(value: unknown): TrajectoryRunCorrelation {
	const source = parseObject(value, "trajectory.run");
	const agent = parseObject(source.agent, "trajectory.run.agent");
	return deepFreeze({
		id: parseNonEmptyString(source.id, "trajectory.run.id"),
		tenantId: parseNonEmptyString(source.tenantId, "trajectory.run.tenantId"),
		bindle: parseNonEmptyString(source.bindle, "trajectory.run.bindle"),
		agent: {
			id: parseNonEmptyString(agent.id, "trajectory.run.agent.id"),
			principalRef: parseNonEmptyString(
				agent.principalRef,
				"trajectory.run.agent.principalRef",
			),
		},
	});
}

function parseSpans(value: unknown): readonly OpenInferenceSpan[] {
	if (!Array.isArray(value) || value.length === 0) {
		fail("trajectory.spans", "non-empty array", value);
	}
	const kinds = new Set<string>(OPENINFERENCE_SPAN_KINDS);
	const spanIds = new Set<string>();
	const spans = value.map((entry, index) => {
		const path = `trajectory.spans.${index}`;
		const source = parseObject(entry, path);
		const id = parseNonEmptyString(source.id, `${path}.id`);
		if (spanIds.has(id)) {
			fail(`${path}.id`, "unique span id", id);
		}
		spanIds.add(id);
		const attributes = parseObject(source.attributes, `${path}.attributes`);
		const kind = attributes["openinference.span.kind"];
		if (typeof kind !== "string" || !kinds.has(kind)) {
			fail(
				`${path}.attributes.openinference.span.kind`,
				`one of ${OPENINFERENCE_SPAN_KINDS.join(", ")}`,
				kind,
			);
		}
		return {
			id,
			parentId:
				source.parentId === null || source.parentId === undefined
					? null
					: parseNonEmptyString(source.parentId, `${path}.parentId`),
			name: parseNonEmptyString(source.name, `${path}.name`),
			startTime: parseNonEmptyString(source.startTime, `${path}.startTime`),
			endTime: parseNonEmptyString(source.endTime, `${path}.endTime`),
			attributes: attributes as Readonly<Record<string, unknown>>,
			...(source.inputs === undefined
				? {}
				: { inputs: source.inputs as Readonly<Record<string, unknown>> }),
			...(source.outputs === undefined
				? {}
				: { outputs: source.outputs as Readonly<Record<string, unknown>> }),
		};
	});
	for (const [index, span] of spans.entries()) {
		if (span.parentId !== null && !spanIds.has(span.parentId)) {
			fail(
				`trajectory.spans.${index}.parentId`,
				"reference to another span",
				span.parentId,
			);
		}
	}
	return deepFreeze(spans);
}

function parseReward(value: unknown): TrajectoryReward {
	const source = parseObject(value, "trajectory.reward");
	const score = source.score;
	if (
		typeof score !== "number" ||
		!Number.isFinite(score) ||
		score < 0 ||
		score > 1
	) {
		fail("trajectory.reward.score", "number in [0, 1]", score);
	}
	return deepFreeze({
		source: parseNonEmptyString(source.source, "trajectory.reward.source"),
		rubricRef: parseNonEmptyString(
			source.rubricRef,
			"trajectory.reward.rubricRef",
		),
		score,
		...(source.eventId === undefined
			? {}
			: { eventId: String(source.eventId) }),
		...(source.observedAt === undefined
			? {}
			: { observedAt: String(source.observedAt) }),
	});
}

function parsePayloads(
	value: unknown,
	runId: string,
): Readonly<Record<string, TrajectoryPayload>> {
	const source = parseObject(value, "trajectory.payloads");
	const payloads: Record<string, TrajectoryPayload> = {};
	for (const [name, entry] of Object.entries(source)) {
		const path = `trajectory.payloads.${name}`;
		const payload = parseObject(entry, path);
		const classification = (payload.classification ?? "public") as string;
		if (SENSITIVE_CLASSIFICATIONS.has(classification)) {
			const tokenized =
				payload.redaction === "tokenized" &&
				typeof payload.tokenRef === "string" &&
				payload.tokenRef.length > 0;
			const encrypted =
				payload.redaction === "encrypted" &&
				typeof payload.encryptedRef === "string" &&
				payload.encryptedRef.startsWith(`run://${runId}/`);
			if (!tokenized && !encrypted) {
				fail(
					path,
					"sensitive payload tokenized or run-scoped encrypted (ADR-0099)",
					payload.redaction,
				);
			}
		}
		payloads[name] = payload as TrajectoryPayload;
	}
	return deepFreeze(payloads);
}

export function parseTrajectory(value: unknown): Trajectory {
	const source = parseObject(value, "trajectory");
	if (source.schema !== TRAINING_TRAJECTORY_SCHEMA) {
		fail("trajectory.schema", TRAINING_TRAJECTORY_SCHEMA, source.schema);
	}
	const subject = parseObject(source.subject, "trajectory.subject");
	const run = parseRunCorrelation(source.run);
	return deepFreeze({
		schema: TRAINING_TRAJECTORY_SCHEMA,
		id: parseNonEmptyString(source.id, "trajectory.id") as TrajectoryId,
		traceparent: parseTraceparent(source.traceparent),
		run,
		subject: {
			method: parseNonEmptyString(subject.method, "trajectory.subject.method"),
			contractRef: parseNonEmptyString(
				subject.contractRef,
				"trajectory.subject.contractRef",
			),
			generatedRegion: parseGeneratedRegion(
				subject.generatedRegion,
				"trajectory.subject.generatedRegion",
			),
		},
		spans: parseSpans(source.spans),
		payloads: parsePayloads(source.payloads ?? {}, run.id),
		reward: parseReward(source.reward),
	});
}

export function parseOptimizeRequest(value: unknown): OptimizeRequest {
	const source = parseObject(value, "optimizeRequest");
	if (source.schema !== TRAINING_OPTIMIZE_REQUEST_SCHEMA) {
		fail(
			"optimizeRequest.schema",
			TRAINING_OPTIMIZE_REQUEST_SCHEMA,
			source.schema,
		);
	}
	const generatedRegion = parseGeneratedRegion(
		source.generatedRegion,
		"optimizeRequest.generatedRegion",
	);
	if (!Array.isArray(source.trajectories) || source.trajectories.length === 0) {
		fail(
			"optimizeRequest.trajectories",
			"non-empty array",
			source.trajectories,
		);
	}
	const rubric = parseObject(source.rubric, "optimizeRequest.rubric");
	const contract = parseObject(source.contract, "optimizeRequest.contract");
	const allowedRegionId = parseNonEmptyString(
		contract.allowedRegionId,
		"optimizeRequest.contract.allowedRegionId",
	);
	if (allowedRegionId !== generatedRegion.regionId) {
		fail(
			"optimizeRequest.contract.allowedRegionId",
			`generatedRegion.regionId (${generatedRegion.regionId})`,
			allowedRegionId,
		);
	}
	return deepFreeze({
		schema: TRAINING_OPTIMIZE_REQUEST_SCHEMA,
		requestId: parseNonEmptyString(
			source.requestId,
			"optimizeRequest.requestId",
		),
		generatedRegion,
		trajectories: source.trajectories.map((entry) => parseTrajectory(entry)),
		rubric: {
			id: parseNonEmptyString(rubric.id, "optimizeRequest.rubric.id"),
			objective: parseNonEmptyString(
				rubric.objective,
				"optimizeRequest.rubric.objective",
			),
			...(rubric.thresholds === undefined
				? {}
				: {
						thresholds: rubric.thresholds as Readonly<Record<string, number>>,
					}),
		},
		contract: {
			ref: parseNonEmptyString(contract.ref, "optimizeRequest.contract.ref"),
			method: parseNonEmptyString(
				contract.method,
				"optimizeRequest.contract.method",
			),
			allowedRegionId,
		},
	});
}

export function parseTrainingArtifact(value: unknown): TrainingArtifact {
	const source = parseObject(value, "trainingArtifact");
	if (source.schema !== TRAINING_ARTIFACT_SCHEMA) {
		fail("trainingArtifact.schema", TRAINING_ARTIFACT_SCHEMA, source.schema);
	}
	return deepFreeze({
		schema: TRAINING_ARTIFACT_SCHEMA,
		engineId: parseTrainingEngineId(source.engineId),
		engineVersion: parseNonEmptyString(
			source.engineVersion,
			"trainingArtifact.engineVersion",
		),
		methodRef: parseNonEmptyString(
			source.methodRef,
			"trainingArtifact.methodRef",
		),
		program: parseObject(
			source.program,
			"trainingArtifact.program",
		) as Readonly<Record<string, unknown>>,
	});
}

function parseProvenance(value: unknown): CandidateProvenance {
	const source = parseObject(value, "candidate.provenance");
	if (
		!Array.isArray(source.trajectoryHashes) ||
		source.trajectoryHashes.length === 0
	) {
		fail(
			"candidate.provenance.trajectoryHashes",
			"non-empty array",
			source.trajectoryHashes,
		);
	}
	return deepFreeze({
		trajectoryHashes: source.trajectoryHashes.map((hash) =>
			parseTrajectoryHash(hash),
		),
		rubricRef: parseNonEmptyString(
			source.rubricRef,
			"candidate.provenance.rubricRef",
		),
		contractRef: parseNonEmptyString(
			source.contractRef,
			"candidate.provenance.contractRef",
		),
	});
}

/**
 * Parses a candidate and, for the patch form, enforces the ADR-0048 rule
 * that every edit stays inside the generated region the request named.
 */
export function parseTrainingCandidate(
	value: unknown,
	expectedRegion?: GeneratedRegion,
): TrainingCandidate {
	const source = parseObject(value, "candidate");
	if (source.schema !== TRAINING_CANDIDATE_SCHEMA) {
		fail("candidate.schema", TRAINING_CANDIDATE_SCHEMA, source.schema);
	}
	const id = parseNonEmptyString(source.id, "candidate.id") as CandidateId;
	const engineId = parseTrainingEngineId(source.engineId);
	const provenance = parseProvenance(source.provenance);
	if (source.kind === "artifact") {
		return deepFreeze({
			schema: TRAINING_CANDIDATE_SCHEMA,
			kind: "artifact",
			id,
			engineId,
			artifact: parseTrainingArtifact(source.artifact),
			provenance,
		});
	}
	if (source.kind !== "patch") {
		fail("candidate.kind", '"patch" or "artifact"', source.kind);
	}
	const region = parseGeneratedRegion(source.region, "candidate.region");
	if (expectedRegion) {
		for (const key of [
			"regionId",
			"artifactRef",
			"startOffset",
			"endOffset",
		] as const) {
			if (region[key] !== expectedRegion[key]) {
				fail(
					`candidate.region.${key}`,
					String(expectedRegion[key]),
					region[key],
				);
			}
		}
	}
	if (!Array.isArray(source.edits) || source.edits.length === 0) {
		fail("candidate.edits", "non-empty array", source.edits);
	}
	const edits = source.edits.map((entry, index) => {
		const path = `candidate.edits.${index}`;
		const edit = parseObject(entry, path);
		if (
			!Number.isInteger(edit.startOffset) ||
			!Number.isInteger(edit.endOffset) ||
			(edit.endOffset as number) < (edit.startOffset as number)
		) {
			fail(path, "integer offsets with endOffset >= startOffset", edit);
		}
		if (
			(edit.startOffset as number) < region.startOffset ||
			(edit.endOffset as number) > region.endOffset
		) {
			fail(
				path,
				`edit within generated region [${region.startOffset}, ${region.endOffset}] (ADR-0048)`,
				edit,
			);
		}
		return {
			startOffset: edit.startOffset as number,
			endOffset: edit.endOffset as number,
			replacement: parseNonEmptyString(edit.replacement, `${path}.replacement`),
		};
	});
	return deepFreeze({
		schema: TRAINING_CANDIDATE_SCHEMA,
		kind: "patch",
		id,
		engineId,
		region,
		edits,
		provenance,
	});
}
