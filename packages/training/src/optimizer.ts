import { createHash } from "node:crypto";
import type {
	JsonValue,
	OptimizeRequest,
	TrainingCandidate,
	TrainingEngineId,
	TrainingEnginePort,
	Trajectory,
} from "@hobo/core";
import {
	CoreParseError,
	diagnosticJson,
	hashTrajectory,
	parseTrainingCandidate,
	parseTrainingEngineId,
	serializeTrainingArtifactProgram,
} from "@hobo/core";
import { createSeededPrng, type SeededPrng } from "./prng.js";
import {
	createTraceSink,
	OPENINFERENCE_SPAN_KIND_ATTRIBUTE,
	type OptimizerStepDecision,
	type OptimizerTraceSpan,
} from "./trace-sink.js";

// The built-in OPTO-style optimizer behind core's hobo:training-engine port
// (ADR-0025, docs/plans/0017 F26). Propose -> score -> keep-best over
// candidate parameter sets (instruction variant + demo subset drawn from the
// request's recorded trajectories), deterministic given the required seed.
// Parse, don't validate: the raw config lowers onto parsed derived types
// (`OptimizerConfig`) or throws a typed `TrainingOptimizerParseError`; no
// unchecked shape crosses this boundary. Internal-only per ADR-0025 — this
// engine is selected per tenant/Camp and never surfaces in the app SDK.

// public-contract: engine identity the built-in optimizer registers under.
export const BUILTIN_TRAINING_ENGINE_ID = "hobo-builtin-opto";
// public-contract: engine version pinned into every emitted TrainingArtifact.
export const BUILTIN_TRAINING_ENGINE_VERSION = "0.1.0";

const MAX_SEED = 0xff_ff_ff_ff;
const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_DEMOS_PER_CANDIDATE = 2;

// Deterministic instruction framings the proposer cycles through; the PRNG
// picks one per step, so the candidate space is (framing x demo subset).
const INSTRUCTION_FRAMINGS = [
	"Objective: %s",
	"Objective: %s Ground every answer in the recorded demonstrations.",
	"Objective: %s Prefer the strategy of the highest-reward demonstration.",
	"Objective: %s Stay strictly inside the contract's typed boundary.",
] as const;

/** Typed parse failure raised at the optimizer's config/request boundary. */
export class TrainingOptimizerParseError extends CoreParseError {
	constructor(
		path: string,
		expected: string,
		received: JsonValue | undefined,
		message?: string,
	) {
		super("HOBO_TRAINING_OPTIMIZER_PARSE", path, expected, received, message);
		this.name = "TrainingOptimizerParseError";
	}
}

// domain-view: parse-produced optimizer config; wire form is OptimizerConfig in data-models/training_optimizer.proto.
export interface OptimizerConfig {
	readonly engineId: TrainingEngineId;
	/** 32-bit unsigned PRNG seed. Required — determinism is the contract. */
	readonly seed: number;
	readonly maxIterations: number;
	readonly demosPerCandidate: number;
}

/**
 * The built-in engine: core's TrainingEnginePort plus the drainable
 * in-memory trace sink capturing one OpenInference-aligned span per step.
 */
export interface BuiltinTrainingEngine extends TrainingEnginePort {
	drainTraceSpans(): readonly OptimizerTraceSpan[];
}

function fail(path: string, expected: string, received: unknown): never {
	throw new TrainingOptimizerParseError(
		path,
		expected,
		diagnosticJson(received),
	);
}

function parsePositiveInt(
	value: unknown,
	path: string,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		fail(path, "integer >= 1", value);
	}
	return value;
}

/**
 * Parses a raw optimizer config (proto-JSON camelCase form of
 * `OptimizerConfig` in data-models/training_optimizer.proto) into the
 * derived type, or throws `TrainingOptimizerParseError`.
 */
export function parseOptimizerConfig(value: unknown): OptimizerConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail("config", "OptimizerConfig object", value);
	}
	const record = value as Record<string, unknown>;
	const seed = record.seed;
	if (
		typeof seed !== "number" ||
		!Number.isInteger(seed) ||
		seed < 0 ||
		seed > MAX_SEED
	) {
		fail("config.seed", "integer in [0, 4294967295]", seed);
	}
	const rawEngineId = record.engineId ?? BUILTIN_TRAINING_ENGINE_ID;
	let engineId: TrainingEngineId;
	try {
		// SAFETY: unchecked config value handed to the parse that checks it —
		// `parseTrainingEngineId` refuses anything that is not a non-empty JSON
		// string, and the catch below turns that refusal into this boundary's own
		// typed error. Narrowing here first would duplicate the parser's rule in
		// the caller, which is the arrangement parse-don't-validate exists to
		// avoid.
		engineId = parseTrainingEngineId(rawEngineId as JsonValue | undefined);
	} catch {
		fail("config.engineId", "non-empty string", rawEngineId);
	}
	return Object.freeze({
		engineId,
		seed,
		maxIterations: parsePositiveInt(
			record.maxIterations,
			"config.maxIterations",
			DEFAULT_MAX_ITERATIONS,
		),
		demosPerCandidate: parsePositiveInt(
			record.demosPerCandidate,
			"config.demosPerCandidate",
			DEFAULT_DEMOS_PER_CANDIDATE,
		),
	});
}

interface DemoExample {
	readonly index: number;
	readonly input: JsonValue;
	readonly output: JsonValue;
	readonly reward: number;
}

interface Proposal {
	readonly instructions: string;
	readonly demoIndexes: readonly number[];
	readonly digest: string;
	readonly score: number;
}

function sha256Digest(value: unknown): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")}`;
}

/**
 * Decode a span's stored JSON, falling back when it is absent or malformed.
 *
 * Returns `JsonValue` rather than `unknown` because that is what it can only
 * ever produce: `JSON.parse` yields a JSON value or throws, and the fallback is
 * a JSON value by the signature. Typing it `unknown` pushed a cast onto every
 * caller, including the one that hands demos to
 * `serializeTrainingArtifactProgram` — which wants exactly this type.
 */
function parseJsonOr(value: string, fallback: JsonValue): JsonValue {
	if (value.length === 0) return fallback;
	try {
		// SAFETY: JSON.parse yields a JsonValue or throws.
		return JSON.parse(value) as JsonValue;
	} catch {
		return fallback;
	}
}

function demoPool(trajectories: readonly Trajectory[]): DemoExample[] {
	return trajectories.map((trajectory, index) => {
		const reward = trajectory.reward;
		if (reward === undefined) {
			fail(`request.trajectories.${index}.reward`, "present", reward);
		}
		const span =
			trajectory.spans.find(
				(candidate) =>
					candidate.inputsJson.length > 0 || candidate.outputsJson.length > 0,
			) ?? trajectory.spans[0];
		return {
			index,
			input: span === undefined ? null : parseJsonOr(span.inputsJson, null),
			output: span === undefined ? null : parseJsonOr(span.outputsJson, null),
			reward: reward.score,
		};
	});
}

/** Distinct indices drawn via a partial Fisher-Yates over the pool. */
function sampleIndexes(
	prng: SeededPrng,
	poolSize: number,
	count: number,
): number[] {
	const indexes = Array.from({ length: poolSize }, (_, i) => i);
	const taken = Math.min(count, poolSize);
	for (let i = 0; i < taken; i += 1) {
		const j = i + prng.nextInt(poolSize - i);
		const a = indexes[i] as number;
		indexes[i] = indexes[j] as number;
		indexes[j] = a;
	}
	return indexes.slice(0, taken);
}

function propose(
	prng: SeededPrng,
	pool: readonly DemoExample[],
	objective: string,
	demosPerCandidate: number,
): Proposal {
	const framing = INSTRUCTION_FRAMINGS[
		prng.nextInt(INSTRUCTION_FRAMINGS.length)
	] as string;
	const instructions = framing.replace("%s", objective);
	const demoIndexes = sampleIndexes(prng, pool.length, demosPerCandidate);
	// Deterministic pure scoring: the mean recorded reward of the selected
	// demonstrations — the rubric-attached reward is the training signal
	// (ADR-0025 point 5); the PRNG only drives proposals, never scores.
	const score =
		demoIndexes.reduce(
			(sum, index) => sum + (pool[index] as DemoExample).reward,
			0,
		) / Math.max(demoIndexes.length, 1);
	return {
		instructions,
		demoIndexes,
		digest: sha256Digest({ instructions, demoIndexes }),
		score,
	};
}

function stepSpan(
	iteration: number,
	proposal: Proposal,
	decision: OptimizerStepDecision,
): OptimizerTraceSpan {
	return Object.freeze({
		id: `opto-step-${iteration}`,
		parentId: "",
		kind: "CHAIN" as const,
		name: `opto.step.${iteration}`,
		inputDigest: proposal.digest,
		score: proposal.score,
		decision,
		attributes: Object.freeze({
			[OPENINFERENCE_SPAN_KIND_ATTRIBUTE]: "CHAIN",
			"optimizer.iteration": String(iteration),
			"optimizer.input_digest": proposal.digest,
			"optimizer.score": proposal.score.toFixed(6),
			"optimizer.decision": decision,
		}),
	});
}

/**
 * Creates the built-in OPTO-style engine from a raw config. The returned
 * object satisfies core's `TrainingEnginePort` (the port-conformance
 * contract) and additionally exposes `drainTraceSpans()` over the in-memory
 * OpenInference-aligned sink.
 */
export function createBuiltinTrainingEngine(
	config: unknown,
): BuiltinTrainingEngine {
	const parsed = parseOptimizerConfig(config);
	const sink = createTraceSink();

	async function optimize(
		request: OptimizeRequest,
	): Promise<TrainingCandidate> {
		if (request.trajectories.length === 0) {
			fail("request.trajectories", "non-empty array", request.trajectories);
		}
		const rubric = request.rubric;
		const contract = request.contract;
		if (rubric === undefined) fail("request.rubric", "present", rubric);
		if (contract === undefined) fail("request.contract", "present", contract);

		const pool = demoPool(request.trajectories);
		const prng = createSeededPrng(parsed.seed);

		// OPTO loop: propose -> score -> keep-best. Best score never regresses;
		// a proposal only replaces the incumbent on a strict improvement.
		let best: Proposal | undefined;
		for (let iteration = 0; iteration < parsed.maxIterations; iteration += 1) {
			const proposal = propose(
				prng,
				pool,
				rubric.objective,
				parsed.demosPerCandidate,
			);
			const kept = best === undefined || proposal.score > best.score;
			if (kept) best = proposal;
			sink.record(stepSpan(iteration, proposal, kept ? "kept" : "rejected"));
		}
		const winner = best as Proposal;

		const programJson = serializeTrainingArtifactProgram({
			instructions: winner.instructions,
			demos: winner.demoIndexes.map((index) => {
				const demo = pool[index] as DemoExample;
				return { input: demo.input, output: demo.output };
			}),
			enginePayloadJson: JSON.stringify({
				seed: parsed.seed,
				iterations: parsed.maxIterations,
				winnerDigest: winner.digest,
				winnerScore: winner.score,
			}),
		});

		// Lower onto the wire candidate through core's parse-don't-validate
		// constructor so every invariant (provenance hashes, program shape)
		// holds before the candidate leaves the engine.
		return parseTrainingCandidate({
			id: `opto-${winner.digest.slice("sha256:".length, "sha256:".length + 16)}`,
			engineId: parsed.engineId,
			provenance: {
				trajectoryHashes: request.trajectories.map((trajectory) =>
					hashTrajectory(trajectory),
				),
				rubricRef: rubric.id,
				contractRef: contract.ref,
			},
			artifact: {
				engineId: parsed.engineId,
				engineVersion: BUILTIN_TRAINING_ENGINE_VERSION,
				methodRef: `${contract.ref}#${contract.method}`,
				programJson,
			},
		});
	}

	return {
		engineId: parsed.engineId,
		optimize,
		drainTraceSpans(): readonly OptimizerTraceSpan[] {
			return sink.drain();
		},
	};
}
