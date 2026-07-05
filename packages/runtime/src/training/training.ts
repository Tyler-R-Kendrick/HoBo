import { create } from "@bufbuild/protobuf";
import {
	parseTrainingArtifact,
	parseTrainingArtifactProgram,
	type TrainingArtifact,
} from "@hobo/core";
import { TrainableManifestFactSchema } from "../_generated/trainable_manifest_fact_pb.js";
import {
	type FieldDescription,
	type RecordedTrainableCall,
	TRAINABLE,
	type Trainable,
	type TrainableManifestFact,
	type TrainableRecord,
	TrainingArtifactError,
	type TrainingExample,
	TrainingGroundingError,
	type TrainingOptions,
} from "./types.js";

const MAX_RECORDED_CALLS = 1_000;

const STUB_BASELINE = Symbol.for("hobo.trainable.stub");

interface MutableRecord {
	fact: TrainableManifestFact;
	options: TrainingOptions;
	calls: RecordedTrainableCall[];
	artifact: TrainingArtifact | null;
	baseline: ((input: unknown) => Promise<unknown>) | null;
}

const registry = new Map<string, MutableRecord>();
const trainableToRef = new WeakMap<object, string>();

function canonical(value: unknown): string {
	return JSON.stringify(sortKeys(value));
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

function requireGrounding(
	methodRef: string,
	options: TrainingOptions,
): asserts options is TrainingOptions {
	const missing: string[] = [];
	if (
		typeof options.intent !== "string" ||
		options.intent.trim().length === 0
	) {
		missing.push("intent");
	}
	if (
		!options.contract ||
		typeof options.contract.ref !== "string" ||
		options.contract.ref.trim().length === 0
	) {
		missing.push("contract");
	}
	if (!options.rubric || Object.keys(options.rubric).length === 0) {
		missing.push("rubric");
	}
	if (missing.length > 0) {
		throw new TrainingGroundingError(methodRef, missing);
	}
}

function lowerToFact(
	methodRef: string,
	options: TrainingOptions,
	baseline: "body" | "stub",
): TrainableManifestFact {
	return Object.freeze(
		create(TrainableManifestFactSchema, {
			methodRef,
			intent: options.intent,
			contractRef: options.contract.ref,
			rubric: { ...options.rubric },
			params: lowerFields(options.params),
			output: lowerFields(options.output),
			invariants: [...(options.contract.invariants ?? [])],
			forbiddenOutputs: [...(options.contract.forbiddenOutputs ?? [])],
			baseline,
		}),
	);
}

function lowerFields(
	fields: Readonly<Record<string, FieldDescription>> | undefined,
): Record<string, { description: string; exampleJson: string }> {
	return Object.fromEntries(
		Object.entries(fields ?? {}).map(([name, field]) => [
			name,
			{
				description: field.description,
				exampleJson:
					field.example === undefined ? "" : JSON.stringify(field.example),
			},
		]),
	);
}

function record(
	entry: MutableRecord,
	call: Omit<RecordedTrainableCall, "order">,
): void {
	if (entry.calls.length >= MAX_RECORDED_CALLS) entry.calls.shift();
	entry.calls.push(Object.freeze({ ...call, order: entry.calls.length }));
}

/** Demos from an applied artifact's platform-normalized program. */
function artifactDemos(
	artifact: TrainingArtifact | null,
): readonly TrainingExample[] {
	if (!artifact) return [];
	const program = parseTrainingArtifactProgram(artifact.programJson);
	return program.demos.map((demo) => ({
		input: JSON.parse(demo.inputJson),
		output: JSON.parse(demo.outputJson),
	}));
}

/**
 * The stub baseline (ADR-0076 mock mode): serve applied-artifact demos
 * first, then the recorded contract examples — exact input match, falling
 * back to the first example as the canned typed response. Every call is
 * recorded as specification-by-example for the training loop.
 */
async function serveStub(
	entry: MutableRecord,
	input: unknown,
): Promise<unknown> {
	const key = canonical(input);
	const demos = artifactDemos(entry.artifact);
	for (const demo of demos) {
		if (canonical(demo.input) === key) {
			record(entry, { input, output: demo.output, served: "matched-demo" });
			return demo.output;
		}
	}
	const examples = entry.options.contract.examples ?? [];
	for (const example of examples) {
		if (canonical(example.input) === key) {
			record(entry, {
				input,
				output: example.output,
				served: "matched-example",
			});
			return example.output;
		}
	}
	const canned = demos[0] ?? examples[0];
	if (!canned) {
		throw new TrainingArtifactError(
			`stub baseline for "${entry.fact.methodRef}" has no contract examples or applied demos to serve`,
		);
	}
	record(entry, { input, output: canned.output, served: "canned" });
	return canned.output;
}

function register(
	methodRef: string,
	options: TrainingOptions,
	baseline: ((input: unknown) => Promise<unknown>) | null,
): Trainable {
	requireGrounding(methodRef, options);
	if (baseline === null) {
		const examples = options.contract.examples ?? [];
		if (examples.length === 0) {
			throw new TrainingGroundingError(methodRef, ["contract.examples"]);
		}
	}
	const entry: MutableRecord = {
		fact: lowerToFact(methodRef, options, baseline === null ? "stub" : "body"),
		options,
		calls: [],
		artifact: null,
		baseline,
	};
	registry.set(methodRef, entry);

	const callable = async (input: unknown): Promise<unknown> => {
		if (entry.baseline === null) {
			return serveStub(entry, input);
		}
		const output = await entry.baseline(input);
		record(entry, { input, output, served: "body" });
		return output;
	};
	Object.defineProperty(callable, TRAINABLE, { value: true });
	Object.defineProperty(callable, "methodRef", { value: methodRef });
	trainableToRef.set(callable, methodRef);
	return callable as Trainable;
}

function resolveMethodRef(options: TrainingOptions, fn?: unknown): string {
	const ref = options.methodRef ?? (fn as { name?: string } | undefined)?.name;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new TrainingGroundingError("<anonymous>", ["methodRef"]);
	}
	return ref;
}

/** `training(fn, opts)` — the canonical wrapper form (ADR-0025). */
export function training<I, O>(
	fn: (input: I) => O | Promise<O>,
	options: TrainingOptions<I, O>,
): Trainable<I, O> {
	const methodRef = resolveMethodRef(options as TrainingOptions, fn);
	const baseline = (
		STUB_BASELINE in fn && fn[STUB_BASELINE] === true
			? null
			: async (input: unknown) => await fn(input as I)
	) as ((input: unknown) => Promise<unknown>) | null;
	return register(methodRef, options as TrainingOptions, baseline) as Trainable<
		I,
		O
	>;
}

/**
 * `training.define(opts)` — the signature-only, empty-implementation form
 * (ADR-0125): no body; served by the contract-derived stub baseline until
 * the training engine synthesizes an implementation (ADR-0010 cold start).
 */
training.define = function define<I, O>(
	options: TrainingOptions<I, O> & { readonly methodRef: string },
): Trainable<I, O> {
	return register(
		options.methodRef,
		options as TrainingOptions,
		null,
	) as Trainable<I, O>;
};

/**
 * Explicit stub baseline marker: `training(stub(), opts)` is the spelled-out
 * form of `training.define(opts)`.
 */
export function stub<I = unknown, O = unknown>(): (input: I) => Promise<O> {
	const marker = async (): Promise<O> => {
		throw new TrainingArtifactError(
			"stub() baseline is served by the runtime, never called directly",
		);
	};
	Object.defineProperty(marker, STUB_BASELINE, { value: true });
	return marker;
}

export function isTrainable(value: unknown): value is Trainable {
	return (
		typeof value === "function" &&
		(value as { [TRAINABLE]?: unknown })[TRAINABLE] === true
	);
}

/** Manifest lowering: the facts every authoring form produces. */
export function listTrainables(): readonly TrainableManifestFact[] {
	return [...registry.values()].map((entry) => entry.fact);
}

export function getTrainable(
	ref: string | Trainable,
): TrainableRecord | undefined {
	const methodRef =
		typeof ref === "string" ? ref : (trainableToRef.get(ref) ?? ref.methodRef);
	const entry = registry.get(methodRef);
	if (!entry) return undefined;
	return {
		fact: entry.fact,
		options: entry.options,
		calls: [...entry.calls],
		artifact: entry.artifact,
	};
}

/** Test/build-time helper: clears the module registry. */
export function resetTrainables(): void {
	registry.clear();
}

/**
 * Apply a training artifact (ADR-0125 apply-at-load promotion): parses the
 * serialized optimized program, checks it targets this method, and attaches
 * it so the runtime serves it (stub baselines serve its demos immediately).
 * Reversible by applying `null`.
 */
export function applyTrainingArtifact(
	trainable: Trainable | string,
	artifact: unknown | null,
): TrainingArtifact | null {
	const methodRef =
		typeof trainable === "string" ? trainable : trainable.methodRef;
	const entry = registry.get(methodRef);
	if (!entry) {
		throw new TrainingArtifactError(
			`no trainable method registered as "${methodRef}"`,
		);
	}
	if (artifact === null) {
		entry.artifact = null;
		return null;
	}
	const parsed = parseTrainingArtifact(artifact);
	if (parsed.methodRef !== methodRef) {
		throw new TrainingArtifactError(
			`artifact targets "${parsed.methodRef}", not "${methodRef}"`,
		);
	}
	entry.artifact = parsed;
	return parsed;
}

export function getAppliedArtifact(
	trainable: Trainable | string,
): TrainingArtifact | null {
	const methodRef =
		typeof trainable === "string" ? trainable : trainable.methodRef;
	return registry.get(methodRef)?.artifact ?? null;
}
