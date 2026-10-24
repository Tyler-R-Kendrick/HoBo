import {
	composeOptions,
	finalizeTrainableClass as finalizeWithRegistry,
	type FieldDescription as GroundingField,
	type GroundingOptions,
	granularOptionsFor as groundingOptionsFor,
	type ShapeDescriptor,
} from "ts-autocode-grounding";
import { cloneAsJson, type JsonObject, type JsonValue } from "../json.js";
import { getTrainable, resolveTrainable, training } from "./training.js";
import type { FieldDescription, Trainable, TrainingOptions } from "./types.js";

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
	metadata: DecoratorMetadataObject | undefined,
): void {
	finalizeWithRegistry(
		cls,
		metadata,
		{
			has: (methodRef) => getTrainable(methodRef) !== undefined,
			register: (baseline, options) =>
				training(baseline, trainingOptionsOf(options)),
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
	metadata: DecoratorMetadataObject | undefined,
	methodName: string,
): TrainingOptions {
	return trainingOptionsOf(
		groundingOptionsFor(methodRef, metadata, methodName),
	);
}

/**
 * ts-autocode-grounding composes HoBo's TrainingOptions; copy them field by
 * field. Each field is read by name and assigned where TrainingOptions (and
 * the registry's required `methodRef`) types it, with no assertion, so a
 * ts-autocode bump that renames a field, makes `methodRef` or `intent`
 * optional, retypes one, or gives a shape a field that is not JSON stops this
 * compiling (scripts/test/ts-autocode-grounding-drift.test.ts). A cast here
 * would let that drift through, and `training()` would then register the
 * method under its function name or with no intent.
 */
function trainingOptionsOf(
	options: GroundingOptions,
): TrainingOptions & { readonly methodRef: string } {
	const { contract } = options;
	return {
		methodRef: options.methodRef,
		intent: options.intent,
		contract: {
			ref: contract.ref,
			...(contract.input === undefined
				? {}
				: { input: shapesJson(contract.input) }),
			...(contract.output === undefined
				? {}
				: { output: shapeJson(contract.output) }),
		},
		...(options.params === undefined
			? {}
			: { params: fieldsOf(options.params) }),
		...(options.output === undefined
			? {}
			: { output: fieldsOf(options.output) }),
	};
}

/** A declared shape as JSON: its own fields, each of which must be JSON. */
function shapeJson(shape: ShapeDescriptor): JsonObject {
	return { ...shape };
}

function shapesJson(
	shapes: Readonly<Record<string, ShapeDescriptor>>,
): JsonObject {
	const json: Record<string, JsonValue> = {};
	for (const [name, shape] of Object.entries(shapes)) {
		json[name] = shapeJson(shape);
	}
	return json;
}

/**
 * Grounding types a field's example as `unknown`; the manifest lowers it with
 * `JSON.stringify` (training.ts), so it crosses here as that JSON value.
 */
function fieldsOf(
	fields: Readonly<Record<string, GroundingField>>,
): Readonly<Record<string, FieldDescription>> {
	const described: Record<string, FieldDescription> = {};
	for (const [name, field] of Object.entries(fields)) {
		described[name] =
			field.example === undefined
				? { description: field.description }
				: {
						description: field.description,
						example: cloneAsJson(field.example),
					};
	}
	return described;
}

/**
 * `defineGrounding(options)`: the callee of the registrations `hobo stub`
 * generates from an ambient `@trainable declare class` into
 * `src/_generated/declared/<Class>.ts` (ts-autocode-grounding's
 * `generateDeclaredRegistrations`, wrapped in scan.ts). The emitter
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
