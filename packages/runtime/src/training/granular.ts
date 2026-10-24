import {
	composeOptions,
	finalizeTrainableClass as finalizeWithRegistry,
	granularOptionsFor as groundingOptionsFor,
} from "ts-autocode-grounding";
import type { JsonBag, JsonValue } from "../json.js";
import { getTrainable, resolveTrainable, training } from "./training.js";
import type { Trainable, TrainingOptions } from "./types.js";

// Granular grounding decorators (Plan 2 Syntax 0): @intent / @returns on
// methods, `description()` values for `params:` maps (TC39 stage-3 only,
// ADR-0125). The decorator implementations — pending-grounding
// accumulation and option composition — live upstream in
// ts-autocode-grounding (ADR-0128); this module wires them to HoBo's
// training registry. Ambient
// `export declare class` declarations erase at compile time, so no
// decorator runs for them at all — they are honored by source scanning
// instead (scan.ts, the `hobo stub` path).

export {
	description,
	intent,
	PENDING_GROUNDINGS,
	returns,
} from "ts-autocode-grounding";

export { composeOptions };

/**
 * Register every granular-declared method of a class (bare `@trainable`).
 * Methods with pending groundings are registered; when nothing was
 * annotated, every own prototype method is registered with fully inferred
 * groundings — the decorators are all optional. Baselines bind to a
 * lazily constructed instance (DI semantics; falls back to the prototype
 * for non-constructible classes).
 */
export function finalizeTrainableClass(
	cls: new () => object,
	metadata: JsonBag | undefined,
): void {
	finalizeWithRegistry(
		cls,
		// SAFETY: class decorator metadata is the grounding bag at this boundary.
		metadata as never,
		{
			has: (methodRef) => getTrainable(methodRef) !== undefined,
			register: (baseline, options) =>
				// SAFETY: ts-autocode-grounding composes HoBo's TrainingOptions here. Its contract
				// types declared shapes as ShapeDescriptor records, which are JSON, but an
				// interface has no index signature, so TypeScript cannot see them as JsonValue.
				training(baseline, options as never),
		},
		Symbol.for("hobo.trainable.metadata"),
	);
}

/** Resolve a bare-class-decorated method by `<Class>.<method>` ref. */
export function resolveDeclared<I, O>(classAndMethod: string): Trainable<I, O> {
	return resolveTrainable<I, O>(classAndMethod);
}

/** Compose options for a stage-3 bare `@trainable` method (granular or inferred). */
export function granularOptionsFor(
	methodRef: string,
	metadata: JsonBag | undefined,
	methodName: string,
): TrainingOptions {
	// SAFETY: the composed GroundingOptions are TrainingOptions; its ShapeDescriptor records are JSON (see finalizeTrainableClass above).
	return groundingOptionsFor(
		methodRef,
		// SAFETY: decorator metadata is the grounding options bag at this boundary.
		metadata as never,
		methodName,
	) as never;
}

/**
 * `defineGrounding(options)`: the callee of the registrations `hobo stub`
 * generates from an ambient `@trainable declare class`
 * (`generateDeclaredRegistrations` in scan.ts). ts-autocode-grounding's emitter
 * writes `import { defineGrounding } from "@hobo/runtime"`, so this is the name
 * HoBo answers to. It is `training.define`: the signature-only form, registered
 * in HoBo's training registry and served by the contract-derived stub baseline
 * (ADR-0125). ts-autocode-grounding exports a `defineGrounding` of its own that
 * only checks and freezes the options and registers nothing, so it is not the
 * one re-exported here (ADR-0128).
 */
export function defineGrounding<I = JsonValue, O = JsonValue>(
	options: TrainingOptions<I, O> & { readonly methodRef: string },
): Trainable<I, O> {
	return training.define(options);
}
