import { createHash } from "node:crypto";
import type { JsonValue } from "@bufbuild/protobuf";
import { create, fromJson, isMessage, toJson } from "@bufbuild/protobuf";
import {
	type GeneratedRegion,
	OpenInferenceSpanKind,
	type OptimizeRequest,
	OptimizeRequestSchema,
	type TrainingArtifact,
	type TrainingArtifactProgram,
	TrainingArtifactProgramSchema,
	TrainingArtifactSchema,
	type TrainingCandidate,
	TrainingCandidateSchema,
	type Trajectory,
	TrajectorySchema,
} from "../_generated/training_engine_pb.js";
import { CoreParseError } from "../errors.js";
import { deepFreeze } from "../parse-utils.js";

// The hobo:training-engine port (ADR-0025 / ADR-0125). Record shapes are the
// generated protobuf types (data-models/training_engine.proto); this module
// adds only the port interface, branded ids, and parse-don't-validate
// constructors that enforce the CUE-mirrored invariants at the boundary.

// public-contract: the WIT port identity engines register under (ADR-0025).
export const TRAINING_ENGINE_PORT =
	"hobo:training-engine/training-engine@0.1.0";

export type {
	CandidateEdit,
	CandidatePatch,
	CandidateProvenance,
	ContractRef,
	GeneratedRegion,
	OpenInferenceSpan,
	OptimizeRequest,
	ProgramDemo,
	TrainingArtifact,
	TrainingArtifactProgram,
	TrainingCandidate,
	TrainingRubric,
	Trajectory,
	TrajectoryPayload,
	TrajectoryReward,
	TrajectoryRun,
} from "../_generated/training_engine_pb.js";
export { OpenInferenceSpanKind } from "../_generated/training_engine_pb.js";

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

/**
 * The port every training engine implements; engines are internal providers
 * selected per tenant/Camp and never part of the SDK surface (ADR-0025).
 */
export interface TrainingEnginePort {
	readonly engineId: TrainingEngineId;
	optimize(request: OptimizeRequest): Promise<TrainingCandidate>;
}

const TRACEPARENT_PATTERN = /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SENSITIVE_CLASSIFICATIONS = new Set([
	"pii",
	"secret",
	"confidential",
	"regulated",
]);

function fail(path: string, expected: string, received: unknown): never {
	throw new TrainingEngineParseError(path, expected, received);
}

function required<T>(value: T | undefined, path: string): T {
	if (value === undefined) fail(path, "present", value);
	return value;
}

function nonEmpty(value: string, path: string): string {
	if (value.trim().length === 0) fail(path, "non-empty string", value);
	return value;
}

function fromJsonOrFail<T>(
	schema: Parameters<typeof fromJson>[0],
	value: unknown,
	path: string,
): T {
	try {
		return fromJson(schema, value as JsonValue) as T;
	} catch (error) {
		fail(path, schema.typeName, error instanceof Error ? error.message : error);
	}
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
	if (typeof value !== "string" || value.trim().length === 0) {
		fail("engineId", "non-empty string", value);
	}
	return value as TrainingEngineId;
}

function assertRegionInvariants(region: GeneratedRegion, path: string): void {
	nonEmpty(region.regionId, `${path}.regionId`);
	nonEmpty(region.artifactRef, `${path}.artifactRef`);
	nonEmpty(region.owner, `${path}.owner`);
	if (region.endOffset <= region.startOffset) {
		fail(`${path}.endOffset`, "greater than startOffset", region.endOffset);
	}
}

function assertTrajectoryInvariants(trajectory: Trajectory): void {
	nonEmpty(trajectory.id, "trajectory.id");
	parseTraceparent(trajectory.traceparent);

	const run = required(trajectory.run, "trajectory.run");
	nonEmpty(run.id, "trajectory.run.id");
	nonEmpty(run.tenantId, "trajectory.run.tenantId");
	nonEmpty(run.bindle, "trajectory.run.bindle");
	const agent = required(run.agent, "trajectory.run.agent");
	nonEmpty(agent.id, "trajectory.run.agent.id");
	nonEmpty(agent.principalRef, "trajectory.run.agent.principalRef");

	const subject = required(trajectory.subject, "trajectory.subject");
	nonEmpty(subject.method, "trajectory.subject.method");
	nonEmpty(subject.contractRef, "trajectory.subject.contractRef");
	assertRegionInvariants(
		required(subject.generatedRegion, "trajectory.subject.generatedRegion"),
		"trajectory.subject.generatedRegion",
	);

	if (trajectory.spans.length === 0) {
		fail("trajectory.spans", "non-empty array", trajectory.spans);
	}
	const spanIds = new Set<string>();
	for (const [index, span] of trajectory.spans.entries()) {
		const path = `trajectory.spans.${index}`;
		nonEmpty(span.id, `${path}.id`);
		if (spanIds.has(span.id)) fail(`${path}.id`, "unique span id", span.id);
		spanIds.add(span.id);
		nonEmpty(span.name, `${path}.name`);
		if (span.kind === OpenInferenceSpanKind.UNSPECIFIED) {
			fail(`${path}.kind`, "a specified OpenInference span kind", span.kind);
		}
	}
	for (const [index, span] of trajectory.spans.entries()) {
		if (span.parentId !== "" && !spanIds.has(span.parentId)) {
			fail(
				`trajectory.spans.${index}.parentId`,
				"reference to another span",
				span.parentId,
			);
		}
	}

	const reward = required(trajectory.reward, "trajectory.reward");
	nonEmpty(reward.source, "trajectory.reward.source");
	nonEmpty(reward.rubricRef, "trajectory.reward.rubricRef");
	if (!Number.isFinite(reward.score) || reward.score < 0 || reward.score > 1) {
		fail("trajectory.reward.score", "number in [0, 1]", reward.score);
	}

	// ADR-0099 fail-closed: sensitive payloads are tokenized or run-scoped
	// encrypted references; cleartext never enters the trajectory store.
	for (const [name, payload] of Object.entries(trajectory.payloads)) {
		if (!SENSITIVE_CLASSIFICATIONS.has(payload.classification)) continue;
		const tokenized =
			payload.redaction === "tokenized" && payload.tokenRef.length > 0;
		const encrypted =
			payload.redaction === "encrypted" &&
			payload.encryptedRef.startsWith(`run://${run.id}/`);
		if (!tokenized && !encrypted) {
			fail(
				`trajectory.payloads.${name}`,
				"sensitive payload tokenized or run-scoped encrypted (ADR-0099)",
				payload.redaction,
			);
		}
	}
}

export function parseTrajectory(value: unknown): Trajectory {
	const trajectory = fromJsonOrFail<Trajectory>(
		TrajectorySchema,
		value,
		"trajectory",
	);
	assertTrajectoryInvariants(trajectory);
	return deepFreeze(trajectory);
}

export function parseOptimizeRequest(value: unknown): OptimizeRequest {
	const request = fromJsonOrFail<OptimizeRequest>(
		OptimizeRequestSchema,
		value,
		"optimizeRequest",
	);
	nonEmpty(request.requestId, "optimizeRequest.requestId");
	const region = required(
		request.generatedRegion,
		"optimizeRequest.generatedRegion",
	);
	assertRegionInvariants(region, "optimizeRequest.generatedRegion");
	if (request.trajectories.length === 0) {
		fail("optimizeRequest.trajectories", "non-empty array", []);
	}
	for (const trajectory of request.trajectories) {
		assertTrajectoryInvariants(trajectory);
	}
	const rubric = required(request.rubric, "optimizeRequest.rubric");
	nonEmpty(rubric.id, "optimizeRequest.rubric.id");
	nonEmpty(rubric.objective, "optimizeRequest.rubric.objective");
	const contract = required(request.contract, "optimizeRequest.contract");
	nonEmpty(contract.ref, "optimizeRequest.contract.ref");
	nonEmpty(contract.method, "optimizeRequest.contract.method");
	if (contract.allowedRegionId !== region.regionId) {
		fail(
			"optimizeRequest.contract.allowedRegionId",
			`generatedRegion.regionId (${region.regionId})`,
			contract.allowedRegionId,
		);
	}
	return deepFreeze(request);
}

function assertArtifactInvariants(artifact: TrainingArtifact): void {
	parseTrainingEngineId(artifact.engineId);
	nonEmpty(artifact.engineVersion, "trainingArtifact.engineVersion");
	nonEmpty(artifact.methodRef, "trainingArtifact.methodRef");
	nonEmpty(artifact.programJson, "trainingArtifact.programJson");
	parseTrainingArtifactProgram(artifact.programJson);
}

export function parseTrainingArtifact(value: unknown): TrainingArtifact {
	const artifact = isMessage(value, TrainingArtifactSchema)
		? value
		: fromJsonOrFail<TrainingArtifact>(
				TrainingArtifactSchema,
				typeof value === "string" ? JSON.parse(value) : value,
				"trainingArtifact",
			);
	assertArtifactInvariants(artifact);
	return deepFreeze(artifact);
}

/**
 * Serializes a platform-normalized artifact program to the `programJson`
 * string carried on a `TrainingArtifact` — the symmetric writer for
 * `parseTrainingArtifactProgram`, so engines build it through the generated
 * constructor instead of hand-shaping proto JSON (ADR-0125).
 */
export function serializeTrainingArtifactProgram(input: {
	readonly instructions: string;
	readonly demos?: readonly {
		readonly input: unknown;
		readonly output: unknown;
	}[];
	readonly enginePayloadJson?: string;
}): string {
	const program = create(TrainingArtifactProgramSchema, {
		instructions: input.instructions,
		demos: (input.demos ?? []).map((demo) => ({
			inputJson: JSON.stringify(demo.input),
			outputJson: JSON.stringify(demo.output),
		})),
		enginePayloadJson: input.enginePayloadJson ?? "",
	});
	return JSON.stringify(toJson(TrainingArtifactProgramSchema, program));
}

/** Parses the platform-normalized program carried in `programJson`. */
export function parseTrainingArtifactProgram(
	programJson: string,
): TrainingArtifactProgram {
	let parsed: unknown;
	try {
		parsed = JSON.parse(programJson);
	} catch (error) {
		fail(
			"trainingArtifact.programJson",
			"JSON",
			error instanceof Error ? error.message : error,
		);
	}
	const program = fromJsonOrFail<TrainingArtifactProgram>(
		TrainingArtifactProgramSchema,
		parsed,
		"trainingArtifact.programJson",
	);
	nonEmpty(program.instructions, "trainingArtifact.program.instructions");
	return deepFreeze(program);
}

/**
 * Parses a candidate; for the patch form, every edit must stay inside the
 * generated region the request named (ADR-0048).
 */
export function parseTrainingCandidate(
	value: unknown,
	expectedRegion?: GeneratedRegion,
): TrainingCandidate {
	const candidate = fromJsonOrFail<TrainingCandidate>(
		TrainingCandidateSchema,
		value,
		"candidate",
	);
	nonEmpty(candidate.id, "candidate.id");
	parseTrainingEngineId(candidate.engineId);

	const provenance = required(candidate.provenance, "candidate.provenance");
	if (provenance.trajectoryHashes.length === 0) {
		fail("candidate.provenance.trajectoryHashes", "non-empty array", []);
	}
	for (const hash of provenance.trajectoryHashes) {
		parseTrajectoryHash(hash);
	}
	nonEmpty(provenance.rubricRef, "candidate.provenance.rubricRef");
	nonEmpty(provenance.contractRef, "candidate.provenance.contractRef");

	if (candidate.body.case === "artifact") {
		assertArtifactInvariants(candidate.body.value);
		return deepFreeze(candidate);
	}
	if (candidate.body.case !== "patch") {
		fail("candidate.body", "patch or artifact", candidate.body.case);
	}
	const patch = candidate.body.value;
	const region = required(patch.region, "candidate.patch.region");
	assertRegionInvariants(region, "candidate.patch.region");
	if (expectedRegion) {
		for (const key of [
			"regionId",
			"artifactRef",
			"startOffset",
			"endOffset",
		] as const) {
			if (region[key] !== expectedRegion[key]) {
				fail(
					`candidate.patch.region.${key}`,
					String(expectedRegion[key]),
					region[key],
				);
			}
		}
	}
	if (patch.edits.length === 0) {
		fail("candidate.patch.edits", "non-empty array", []);
	}
	for (const [index, edit] of patch.edits.entries()) {
		const path = `candidate.patch.edits.${index}`;
		nonEmpty(edit.replacement, `${path}.replacement`);
		if (edit.endOffset < edit.startOffset) {
			fail(path, "endOffset >= startOffset", edit);
		}
		if (
			edit.startOffset < region.startOffset ||
			edit.endOffset > region.endOffset
		) {
			fail(
				path,
				`edit within generated region [${region.startOffset}, ${region.endOffset}] (ADR-0048)`,
				edit,
			);
		}
	}
	return deepFreeze(candidate);
}

/** Canonical provenance hash of a trajectory (ADR-0125 candidate lineage). */
export function hashTrajectory(trajectory: Trajectory): TrajectoryHash {
	const canonical = JSON.stringify(
		sortKeys(toJson(TrajectorySchema, trajectory)),
	);
	return `sha256:${createHash("sha256")
		.update(canonical)
		.digest("hex")}` as TrajectoryHash;
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.keys(value as Record<string, unknown>)
			.sort()
			.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
	);
}
