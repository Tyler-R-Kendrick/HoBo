import type { TrainingArtifact } from "@hobo/core";
import type { TrainableManifestFact } from "../_generated/trainable_manifest_fact_pb.js";

// The trainable-method authoring surface (ADR-0025 / ADR-0125). All four
// authoring forms — the "use training" directive, the training() wrapper,
// the signature-only training.define(), and the @trainable decorator —
// lower to the same generated TrainableManifestFact record
// (data-models/trainable_manifest_fact.proto); the optimizer stays behind
// the training-engine port and is never reachable from here.

export type {
	FieldMetadata,
	TrainableManifestFact,
} from "../_generated/trainable_manifest_fact_pb.js";

export const TRAINABLE = Symbol.for("hobo.trainable");

// The types below are the authoring-time surface, deliberately hand-written
// (parallel-type-allowed): they carry functions, validators, and arbitrary
// example values that never cross a wire — the wire record they lower to is
// the generated TrainableManifestFact.

export interface TrainingExample<I = unknown, O = unknown> {
	readonly input: I;
	readonly output: O;
}

/**
 * The hard boundary of a trainable method (Plan 29 four-lens Contract).
 * `input`/`output` accept any Standard-Schema-compatible validator (Zod,
 * Valibot, ArkType) or a plain descriptor — the runtime treats them as
 * opaque facts and lowers them to the manifest; enforcement happens at the
 * conformance gate, not here.
 */
export interface TrainingContract<I = unknown, O = unknown> {
	readonly ref: string;
	readonly input?: unknown;
	readonly output?: unknown;
	readonly invariants?: readonly string[];
	readonly forbiddenOutputs?: readonly string[];
	readonly examples?: readonly TrainingExample<I, O>[];
}

/** Authoring input for per-param/output metadata; lowers to FieldMetadata. */
export interface FieldDescription {
	readonly description: string;
	readonly example?: unknown;
}

export interface TrainingOptions<I = unknown, O = unknown> {
	readonly intent: string;
	readonly contract: TrainingContract<I, O>;
	readonly rubric: Readonly<Record<string, number>>;
	/** Per-parameter trainable metadata — rides the contract (ADR-0125). */
	readonly params?: Readonly<Record<string, FieldDescription>>;
	/** Per-output trainable metadata — rides the contract (ADR-0125). */
	readonly output?: Readonly<Record<string, FieldDescription>>;
	/** Stable method reference; defaults to the function/member name. */
	readonly methodRef?: string;
}

export interface RecordedTrainableCall<I = unknown, O = unknown> {
	readonly input: I;
	readonly output: O;
	/** How the stub baseline served the call ("body" for real baselines). */
	readonly served: "body" | "matched-example" | "matched-demo" | "canned";
	readonly order: number;
}

export interface Trainable<I = unknown, O = unknown> {
	(input: I): Promise<O>;
	readonly [TRAINABLE]: true;
	readonly methodRef: string;
}

export interface TrainableRecord<I = unknown, O = unknown> {
	readonly fact: TrainableManifestFact;
	readonly options: TrainingOptions<I, O>;
	readonly calls: readonly RecordedTrainableCall<I, O>[];
	readonly artifact: TrainingArtifact | null;
}

export class TrainingGroundingError extends Error {
	readonly code = "hobo.training.grounding" as const;
	readonly missing: readonly string[];

	constructor(methodRef: string, missing: readonly string[]) {
		super(
			`trainable method "${methodRef}" is missing required grounding: ${missing.join(
				", ",
			)} (ADR-0025: intent + contract + rubric make code rewritable)`,
		);
		this.name = "TrainingGroundingError";
		this.missing = missing;
	}
}

export class TrainingArtifactError extends Error {
	readonly code = "hobo.training.artifact" as const;

	constructor(message: string) {
		super(message);
		this.name = "TrainingArtifactError";
	}
}
