import {
	composeOptions,
	finalizeTrainableClass as finalizeWithRegistry,
	type FieldDescription as GroundingField,
	type GroundingOptions,
	granularOptionsFor as groundingOptionsFor,
} from "ts-autocode-grounding";
import type { JsonObject, JsonValue } from "../json.js";
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

/** A declared parameter or output type on a grounding contract. */
type Declared = NonNullable<GroundingOptions["contract"]["output"]>;

/** What the registry registers: TrainingOptions with the methodRef it requires. */
type RegisteredOptions = TrainingOptions & { readonly methodRef: string };

/** A TrainingContract as trainingOptionsOf assembles it, one field at a time. */
interface AssembledContract {
	ref: string;
	input?: JsonValue;
	output?: JsonValue;
}

/** RegisteredOptions as trainingOptionsOf assembles them, one field at a time. */
interface AssembledOptions {
	methodRef: string;
	intent: string;
	contract: AssembledContract;
	params?: Readonly<Record<string, FieldDescription>>;
	output?: Readonly<Record<string, FieldDescription>>;
}

/**
 * What destructuring a grounding value leaves once every field it carries has
 * been named: nothing. A field upstream adds lands in the rest, which then no
 * longer satisfies this, so it cannot be dropped without a compile error.
 */
type NothingLeft = Readonly<Record<string, never>>;

/**
 * ts-autocode-grounding composes HoBo's TrainingOptions; copy them field by
 * field. Each field is named, and assigned where TrainingOptions (and the
 * registry's required `methodRef`) types it, with no assertion; what is not
 * named must be nothing. So a ts-autocode bump that renames a field, adds one,
 * makes `methodRef` or `intent` optional, retypes one, or gives a declared
 * type a field that is not JSON stops this compiling
 * (scripts/test/ts-autocode-grounding-drift.test.ts). A cast here would let
 * that drift through, and `training()` would then register the method under
 * its function name, with no intent, or without the added field.
 */
function trainingOptionsOf(options: GroundingOptions): RegisteredOptions {
	const { methodRef, intent, contract, params, output, ...uncopied } = options;
	uncopied satisfies NothingLeft;
	const { ref, input, output: declaredOutput, ...uncopiedContract } = contract;
	uncopiedContract satisfies NothingLeft;
	const trainingContract: AssembledContract = { ref };
	if (input !== undefined) {
		trainingContract.input = declaredJsonByName(input);
	}
	if (declaredOutput !== undefined) {
		trainingContract.output = declaredJson(declaredOutput);
	}
	const registered: AssembledOptions = {
		methodRef,
		intent,
		contract: trainingContract,
	};
	if (params !== undefined) {
		registered.params = fieldsOf(params);
	}
	if (output !== undefined) {
		registered.output = fieldsOf(output);
	}
	return registered;
}

/** A declared type as JSON: its own fields, each of which must be JSON. */
function declaredJson(declared: Declared): JsonObject {
	return { ...declared };
}

function declaredJsonByName(
	byName: Readonly<Record<string, Declared>>,
): JsonObject {
	const json: Record<string, JsonValue> = {};
	for (const [name, declared] of Object.entries(byName)) {
		json[name] = declaredJson(declared);
	}
	return json;
}

/**
 * A field's description and example, the example kept as given: the manifest
 * lowers it with `JSON.stringify` when the method registers (training.ts
 * `lowerFields`), as it always has, so a function inside it is dropped there
 * and a BigInt or circular value throws there, at registration, not when the
 * class is decorated.
 */
function fieldsOf(fields: Readonly<Record<string, GroundingField>>) {
	const described: Record<string, FieldDescription> = {};
	for (const [name, field] of Object.entries(fields)) {
		const { description, example, ...uncopied } = field;
		uncopied satisfies NothingLeft;
		described[name] =
			example === undefined
				? { description }
				: {
						description,
						// SAFETY: grounding types a field's example `unknown`, and the
						// registry has always held it as given and lowered it at
						// registration; converting it here would change both.
						example: example as JsonValue,
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
