import type { TrainingArtifact } from "@hobo/core";

// The trainable-method authoring surface (ADR-0025 / ADR-0125). All four
// authoring forms — the "use training" directive, the training() wrapper,
// the signature-only training.define(), and the @trainable decorator —
// lower to the same TrainableManifestFact; the optimizer stays behind the
// training-engine port and is never reachable from here.

export const TRAINABLE = Symbol.for("hobo.trainable");

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

export interface FieldMetadata {
	readonly description: string;
	readonly example?: unknown;
}

export interface TrainingOptions<I = unknown, O = unknown> {
	readonly intent: string;
	readonly contract: TrainingContract<I, O>;
	readonly rubric: Readonly<Record<string, number>>;
	/** Per-parameter trainable metadata — rides the contract (ADR-0125). */
	readonly params?: Readonly<Record<string, FieldMetadata>>;
	/** Per-output trainable metadata — rides the contract (ADR-0125). */
	readonly output?: Readonly<Record<string, FieldMetadata>>;
	/** Stable method reference; defaults to the function/member name. */
	readonly methodRef?: string;
}

/** What every authoring form lowers to — the unit the manifest collects. */
export interface TrainableManifestFact {
	readonly methodRef: string;
	readonly intent: string;
	readonly contractRef: string;
	readonly rubric: Readonly<Record<string, number>>;
	readonly params: Readonly<Record<string, FieldMetadata>>;
	readonly output: Readonly<Record<string, FieldMetadata>>;
	readonly invariants: readonly string[];
	readonly forbiddenOutputs: readonly string[];
	readonly baseline: "body" | "stub";
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
