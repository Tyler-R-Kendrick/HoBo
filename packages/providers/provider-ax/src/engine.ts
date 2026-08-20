import {
	type AxAIService,
	ax,
	optimize as axOptimize,
	axSerializeOptimizedProgram,
} from "@ax-llm/ax";
import { create, toJson } from "@bufbuild/protobuf";
import {
	hashTrajectory,
	type OptimizeRequest,
	parseOptimizeRequest,
	parseTrainingCandidate,
	serializeTrainingArtifactProgram,
	type TrainingCandidate,
	type TrainingEngineId,
	type TrainingEnginePort,
	type Trajectory,
} from "@hobo/core";
import { AxEnginePayloadSchema } from "./_generated/ax_engine_payload_pb.js";
import {
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
} from "./json.js";

// The built-in training engine (ADR-0025 "built-in-opto"), implemented on ax
// (ADR-0125). Engine-internal: selected behind the hobo:training-engine
// port, never exported through the SDK surface. Record shapes come from
// @hobo/core's generated proto types; the only local record is the
// engine-payload proto in this package's data-models.

const BUILT_IN_ENGINE_ID = "hobo.training-engine/built-in-opto@0.1.0";

// Matches the exact dependency pin; asserted against the installed package
// by test/engine.test.ts so it cannot drift silently.
const AX_ENGINE_VERSION = "22.0.9";

/** Trajectories at or above this reward qualify as demonstration examples. */
const DEMO_REWARD_FLOOR = 0.9;

const DEFAULT_MAX_METRIC_CALLS = 32;

export interface AxTrainingEngineOptions {
	/**
	 * The AI service ax optimizes against — per-tenant configured in a Camp;
	 * an AxMockAIService in conformance runs. Never defaulted: the engine has
	 * no ambient credentials by design (secretless-first).
	 */
	readonly ai: AxAIService;
	readonly teacherAI?: AxAIService;
	/** Hard cost ceiling for the optimizer run (metric evaluations). */
	readonly maxMetricCalls?: number;
	readonly engineId?: string;
}

interface TrajectoryIo {
	readonly input: JsonObject;
	readonly output: JsonObject;
	readonly reward: number;
}

function parseJsonRecord(value: string): JsonObject | null {
	if (value.length === 0) return null;
	try {
		// SAFETY: JSON.parse yields a JSON value at the recorded span I/O boundary.
		const parsed = JSON.parse(value) as JsonValue;
		return isJsonObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function rootSpanIo(trajectory: Trajectory): TrajectoryIo | null {
	const root = trajectory.spans.find((span) => span.parentId === "");
	if (!root) return null;
	const input = parseJsonRecord(root.inputsJson);
	const output = parseJsonRecord(root.outputsJson);
	if (!input || !output) return null;
	return { input, output, reward: trajectory.reward?.score ?? 0 };
}

/**
 * Lower the request's objective + recorded I/O shape to an ax signature:
 * the DSPy-style "the signature is the program" primitive.
 */
function deriveSignature(
	request: OptimizeRequest,
	ios: readonly TrajectoryIo[],
): string {
	const first = ios[0];
	if (!first) {
		throw new Error(
			`optimize request ${request.requestId} has no trajectory with recorded root-span inputs/outputs`,
		);
	}
	const fields = (record: JsonObject) =>
		Object.keys(record)
			.sort()
			.map((key) => `${key}:string`)
			.join(", ");
	const objective = (request.rubric?.objective ?? "").replaceAll('"', "'");
	return `"${objective}" ${fields(first.input)} -> ${fields(first.output)}`;
}

function jsonFieldString(value: JsonValue): string {
	return isJsonString(value) ? value : JSON.stringify(value);
}

function toExample(io: TrajectoryIo) {
	const example: { [key: string]: string } = {};
	for (const [key, value] of Object.entries({ ...io.input, ...io.output })) {
		example[key] = jsonFieldString(value);
	}
	return example;
}

/**
 * The reward-weighted metric: a prediction scores by exact-match against the
 * recorded output fields, scaled by the trajectory's live-eval reward — the
 * optimizer maximizes agreement with well-rewarded real executions.
 */
function jsonValueFromWire(value: string): JsonValue {
	// SAFETY: JSON.parse of a JSON.stringify round-trip is a JSON value.
	return JSON.parse(value) as JsonValue;
}

function scorePrediction(
	outputs: readonly TrajectoryIo[],
	prediction: JsonValue,
	example: JsonObject,
): number {
	const match = outputs.find((io) =>
		Object.entries(io.input).every(
			([key, value]) => String(example[key] ?? "") === jsonFieldString(value),
		),
	);
	const expected = match ?? outputs[0];
	if (!expected) return 0;
	const predicted = isJsonObject(prediction) ? prediction : {};
	const keys = Object.keys(expected.output);
	if (keys.length === 0) return 0;
	const expectedExample = toExample(expected);
	const agreement =
		keys.filter(
			(key) => String(predicted[key] ?? "") === (expectedExample[key] ?? ""),
		).length / keys.length;
	return agreement * expected.reward;
}

function instructionOf(value: JsonValue | null): string | undefined {
	if (!isJsonObject(value)) return undefined;
	const instruction = value.instruction;
	return isJsonString(instruction) ? instruction : undefined;
}

export function createAxTrainingEngine(
	options: AxTrainingEngineOptions,
): TrainingEnginePort {
	// SAFETY: engine ids are opaque branded strings at this provider boundary.
	const engineId = (options.engineId ?? BUILT_IN_ENGINE_ID) as TrainingEngineId;

	return {
		engineId,
		async optimize(request: OptimizeRequest): Promise<TrainingCandidate> {
			// Parse, don't validate: the boundary re-parses even trusted callers.
			const parsed = parseOptimizeRequest(request);
			const ios = parsed.trajectories
				.map((trajectory) => rootSpanIo(trajectory))
				.filter((io): io is TrajectoryIo => io !== null);
			const program = ax(deriveSignature(parsed, ios));
			const examples = ios.map((io) => toExample(io));

			let axSerialized: JsonValue | null = null;
			try {
				const result = await axOptimize(
					program,
					examples,
					({ prediction, example }) => {
						const predicted = jsonValueFromWire(JSON.stringify(prediction));
						const exampleJson = jsonValueFromWire(JSON.stringify(example));
						return scorePrediction(
							ios,
							predicted,
							isJsonObject(exampleJson) ? exampleJson : {},
						);
					},
					{
						studentAI: options.ai,
						...(options.teacherAI
							? { teacherAI: options.teacherAI }
							: undefined),
						maxMetricCalls: options.maxMetricCalls ?? DEFAULT_MAX_METRIC_CALLS,
						bootstrap: true,
						verbose: false,
					},
				);
				if (result.optimizedProgram) {
					axSerialized = jsonValueFromWire(
						JSON.stringify(
							axSerializeOptimizedProgram(result.optimizedProgram),
						),
					);
				}
			} catch {
				// Optimizer failure degrades to the deterministic floor below —
				// the candidate still passes or fails the same promotion gate.
			}

			// The artifact program is the platform-normalized TrainingArtifactProgram
			// (core proto): tuned instructions + recorded high-reward executions as
			// demos (deterministic floor), with ax's serialized optimized program as
			// this engine's payload. Core owns the serializer so the proto shape is
			// never hand-built here.
			const enginePayloadJson = axSerialized
				? JSON.stringify(
						toJson(
							AxEnginePayloadSchema,
							create(AxEnginePayloadSchema, {
								serializedProgramJson: JSON.stringify(axSerialized),
							}),
						),
					)
				: "";
			const programJson = serializeTrainingArtifactProgram({
				instructions:
					(instructionOf(axSerialized) ?? parsed.rubric?.objective) || "",
				demos: ios
					.filter((io) => io.reward >= DEMO_REWARD_FLOOR)
					.map((io) => ({ input: io.input, output: io.output })),
				enginePayloadJson,
			});

			// Return through the port's own parser so an engine bug can never
			// emit an out-of-contract candidate.
			return parseTrainingCandidate({
				id: `candidate-${parsed.requestId}`,
				engineId,
				provenance: {
					trajectoryHashes: parsed.trajectories.map((trajectory) =>
						hashTrajectory(trajectory),
					),
					rubricRef: parsed.rubric?.id ?? "",
					contractRef: parsed.contract?.ref ?? "",
				},
				artifact: {
					engineId,
					engineVersion: AX_ENGINE_VERSION,
					methodRef: parsed.contract?.method ?? "",
					programJson,
				},
			});
		},
	};
}
