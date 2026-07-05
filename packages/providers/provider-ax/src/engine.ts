import { createHash } from "node:crypto";
import {
	type AxAIService,
	ax,
	optimize as axOptimize,
	axSerializeOptimizedProgram,
} from "@ax-llm/ax";
import {
	BUILT_IN_ENGINE_ID,
	type OptimizeRequest,
	parseOptimizeRequest,
	parseTrainingCandidate,
	TRAINING_ARTIFACT_SCHEMA,
	TRAINING_CANDIDATE_SCHEMA,
	type TrainingCandidate,
	type TrainingEngineId,
	type TrainingEnginePort,
	type Trajectory,
} from "@hobo/core";

// The built-in training engine (ADR-0025 "built-in-opto"), implemented on ax
// (ADR-0125): typed signatures + optimize() + serialized-optimized-program
// artifacts. This package is engine-internal — selected behind the
// hobo:training-engine port, never exported through the SDK surface.

export const AX_ENGINE_VERSION = "22.0.9";

/** Trajectories at or above this reward qualify as demonstration examples. */
const DEMO_REWARD_FLOOR = 0.9;

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
	readonly input: Record<string, unknown>;
	readonly output: Record<string, unknown>;
	readonly reward: number;
}

function rootSpanIo(trajectory: Trajectory): TrajectoryIo | null {
	const root = trajectory.spans.find((span) => span.parentId === null);
	if (!root?.inputs || !root.outputs) return null;
	return {
		input: { ...root.inputs },
		output: { ...root.outputs },
		reward: trajectory.reward.score,
	};
}

function canonicalJson(value: unknown): string {
	return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
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

export function hashTrajectory(trajectory: Trajectory): string {
	return `sha256:${createHash("sha256")
		.update(canonicalJson(trajectory))
		.digest("hex")}`;
}

/**
 * Lower the request's intent + recorded I/O shape to an ax signature: the
 * DSPy-style "the signature is the program" empty-implementation primitive.
 */
export function deriveSignature(request: OptimizeRequest): string {
	const ios = request.trajectories
		.map((trajectory) => rootSpanIo(trajectory))
		.filter((io): io is TrajectoryIo => io !== null);
	const first = ios[0];
	if (!first) {
		throw new Error(
			`optimize request ${request.requestId} has no trajectory with recorded root-span inputs/outputs`,
		);
	}
	const inputFields = Object.keys(first.input)
		.sort()
		.map((key) => `${key}:string`)
		.join(", ");
	const outputFields = Object.keys(first.output)
		.sort()
		.map((key) => `${key}:string`)
		.join(", ");
	const objective = request.rubric.objective.replaceAll('"', "'");
	return `"${objective}" ${inputFields} -> ${outputFields}`;
}

function toExample(io: TrajectoryIo): Record<string, string> {
	const example: Record<string, string> = {};
	for (const [key, value] of Object.entries(io.input)) {
		example[key] = typeof value === "string" ? value : JSON.stringify(value);
	}
	for (const [key, value] of Object.entries(io.output)) {
		example[key] = typeof value === "string" ? value : JSON.stringify(value);
	}
	return example;
}

/**
 * The reward-weighted metric: a prediction scores by exact-match against the
 * recorded output fields, scaled by the trajectory's live-eval reward — the
 * optimizer maximizes agreement with well-rewarded real executions.
 */
export function recordedOutputMetric(
	outputs: readonly TrajectoryIo[],
): (arg: {
	readonly prediction: unknown;
	readonly example: Record<string, unknown>;
}) => number {
	return ({ prediction, example }) => {
		const match = outputs.find(
			(io) =>
				canonicalJson(toExample({ ...io, output: {} })) ===
				canonicalJson(
					Object.fromEntries(
						Object.entries(example).filter(([key]) => key in io.input),
					),
				),
		);
		const expected = match ?? outputs[0];
		if (!expected) return 0;
		const predicted = prediction as Record<string, unknown>;
		const keys = Object.keys(expected.output);
		if (keys.length === 0) return 0;
		const agreement =
			keys.filter(
				(key) =>
					String(predicted?.[key] ?? "") ===
					String(toExample(expected)[key] ?? ""),
			).length / keys.length;
		return agreement * expected.reward;
	};
}

export function createAxTrainingEngine(
	options: AxTrainingEngineOptions,
): TrainingEnginePort {
	const engineId = (options.engineId ?? BUILT_IN_ENGINE_ID) as TrainingEngineId;

	return {
		engineId,
		async optimize(request: OptimizeRequest): Promise<TrainingCandidate> {
			// Parse, don't validate: the boundary re-parses even trusted callers.
			const parsed = parseOptimizeRequest(request);
			const ios = parsed.trajectories
				.map((trajectory) => rootSpanIo(trajectory))
				.filter((io): io is TrajectoryIo => io !== null);
			const program = ax(deriveSignature(parsed));
			const examples = ios.map((io) => toExample(io));
			const metric = recordedOutputMetric(ios);

			let axProgram: Record<string, unknown> | null = null;
			try {
				const result = await axOptimize(program, examples, metric, {
					studentAI: options.ai,
					...(options.teacherAI ? { teacherAI: options.teacherAI } : {}),
					maxMetricCalls: options.maxMetricCalls ?? 32,
					bootstrap: true,
					verbose: false,
				});
				if (result.optimizedProgram) {
					axProgram = axSerializeOptimizedProgram(
						result.optimizedProgram,
					) as unknown as Record<string, unknown>;
				}
			} catch {
				// Optimizer failure degrades to the deterministic floor below —
				// the candidate still passes or fails the same promotion gate.
			}

			// The artifact program is platform-normalized (ADR-0125): the tuned
			// instructions plus recorded high-reward executions as demos
			// (specification by example — always derived from real trajectories,
			// so the floor is deterministic), with ax's serialized optimized
			// program attached as the engine-internal payload for reload.
			const programJson: Record<string, unknown> = {
				instructions:
					(axProgram?.instruction as string | undefined) ??
					parsed.rubric.objective,
				demos: ios
					.filter((io) => io.reward >= DEMO_REWARD_FLOOR)
					.map((io) => ({ input: io.input, output: io.output })),
				axProgram,
			};

			const candidate = {
				schema: TRAINING_CANDIDATE_SCHEMA,
				kind: "artifact",
				id: `candidate-${parsed.requestId}`,
				engineId,
				artifact: {
					schema: TRAINING_ARTIFACT_SCHEMA,
					engineId,
					engineVersion: AX_ENGINE_VERSION,
					methodRef: parsed.contract.method,
					program: programJson,
				},
				provenance: {
					trajectoryHashes: parsed.trajectories.map((trajectory) =>
						hashTrajectory(trajectory),
					),
					rubricRef: parsed.rubric.id,
					contractRef: parsed.contract.ref,
				},
			};
			// Return through the port's own parser so an engine bug can never
			// emit an out-of-contract candidate.
			return parseTrainingCandidate(candidate);
		},
	};
}
