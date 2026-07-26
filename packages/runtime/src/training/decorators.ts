import { getTrainable, resolveTrainable, stub, training } from "./training.js";
import type { FieldDescription, Trainable, TrainingOptions } from "./types.js";

// The DI-style declaration form (ADR-0125): a TC39 stage-3 class-method
// decorator that lowers to the exact training() wrapper — byte-identical
// manifest facts. Like a DI container, decorating registers the trainable
// eagerly at instance construction (addInitializer), and the instance is
// resolvable from the registry by methodRef or injection token
// (resolveTrainable) — so a test/eval suite binds to the same instance via
// the token and its example table doubles as the live-training eval suite.
// The method body is the initial implementation the optimizer improves.
// Never compiled with experimentalDecorators.

// Symbol.metadata shims until the host runtime ships it (TS 5.2+ emits
// decorator metadata only when the symbol exists).
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for("Symbol.metadata");

export const TRAINABLE_METADATA = Symbol.for("hobo.trainable.metadata");

type TrainableMethod<This, I, O> = (this: This, input: I) => O | Promise<O>;
type TrainableField<I, O> = ((input: I) => O | Promise<O>) | Trainable<I, O>;

export interface TrainableDecorator<This, I, O> {
	/** Method form: the body is the baseline the optimizer improves. */
	(
		method: TrainableMethod<This, I, O>,
		context: ClassMethodDecoratorContext<This, TrainableMethod<This, I, O>>,
	): (this: This, input: I) => Promise<O>;
	/**
	 * Field form: the initializer is the baseline — `stub()` (or no
	 * initializer at all) declares code to be generated; a function value is
	 * a hand-written baseline. The field's value becomes the registered
	 * trainable.
	 */
	(
		value: undefined,
		context: ClassFieldDecoratorContext<This, TrainableField<I, O>>,
	): (
		this: This,
		initial: ((input: I) => O | Promise<O>) | undefined,
	) => Trainable<I, O>;
}

export function trainable<This, I, O>(
	options: TrainingOptions<I, O>,
): TrainableDecorator<This, I, O> {
	function decorate(
		value: TrainableMethod<This, I, O> | undefined,
		context:
			| ClassMethodDecoratorContext<This, TrainableMethod<This, I, O>>
			| ClassFieldDecoratorContext<This, TrainableField<I, O>>,
	): unknown {
		const methodRef =
			options.methodRef ?? options.token?.description ?? String(context.name);
		const facts = { ...options, methodRef };
		if (context.metadata) {
			const registered =
				(context.metadata[TRAINABLE_METADATA] as string[] | undefined) ?? [];
			context.metadata[TRAINABLE_METADATA] = [...registered, methodRef];
		}

		// Container semantics: first registration wins (singleton provider);
		// later instances resolve the registered one.
		const registerWith = (
			baseline: (input: I) => O | Promise<O>,
		): Trainable<I, O> =>
			getTrainable(methodRef)
				? resolveTrainable<I, O>(methodRef)
				: training<I, O>(baseline, facts);

		if (context.kind === "field") {
			// `@operation(...) rankFeed = stub<I, O>();` — the initializer is
			// the baseline; omitting it entirely also declares generation.
			return function (
				this: This,
				initial: ((input: I) => O | Promise<O>) | undefined,
			): Trainable<I, O> {
				return registerWith(initial ?? stub<I, O>());
			};
		}

		const method = value as TrainableMethod<This, I, O>;
		const registerFor = (self: This): Trainable<I, O> =>
			registerWith((input: I) => method.call(self, input));

		let bound: Trainable<I, O> | undefined;
		// DI-style eager registration: the trainable enters the registry when
		// the class is constructed, before any call, so resolveTrainable()/
		// listTrainables() see it immediately.
		context.addInitializer?.(function (this: This) {
			bound ??= registerFor(this as This);
		});
		return function (this: This, input: I): Promise<O> {
			// Fallback for hosts/tests that invoke the decorator without running
			// initializers: registration defers to the first call.
			bound ??= registerFor(this);
			return bound(input);
		};
	}
	return decorate as TrainableDecorator<This, I, O>;
}

// ---------------------------------------------------------------------------
// Component-level declarative surface (Plan 2 Syntax 0): a class IS a
// declared component; its @operation methods ARE the declared operations.
// Both lower to the exact trainable machinery above — the sugar never has
// its own semantics.
// ---------------------------------------------------------------------------

export const COMPONENT_METADATA = Symbol.for("hobo.component.metadata");

export interface ComponentOptions {
	/** What the component is for — the component-level generation intent. */
	readonly intent: string;
}

export interface ComponentMetadata {
	readonly intent: string;
	readonly name: string;
	/** methodRefs of the component's @operation/@trainable methods. */
	readonly operations: readonly string[];
}

/**
 * `@component({ intent })` — TC39 stage-3 class decorator marking a class
 * as a declared component. Its `@operation` methods accumulate in the same
 * `Symbol.metadata` record (method decorators evaluate before the class
 * decorator), so the finished metadata is the component's full declaration:
 * intent + operation refs. `b.api(Component)` / `b.web(...)` /
 * `b.service(...)` accept the decorated class directly; instantiation
 * registers every operation's trainable (DI semantics, same as @trainable).
 */
export function component(options: ComponentOptions): <
	C extends abstract new (
		// biome-ignore lint/suspicious/noExplicitAny: decorator constructor variance
		...args: any[]
	) => object,
>(
	cls: C,
	context: ClassDecoratorContext<C>,
) => void {
	return (cls, context) => {
		if (!context.metadata) return;
		const operations =
			(context.metadata[TRAINABLE_METADATA] as string[] | undefined) ?? [];
		context.metadata[COMPONENT_METADATA] = Object.freeze({
			intent: options.intent,
			name: String(context.name ?? cls.name),
			operations: Object.freeze([...operations]),
		}) satisfies ComponentMetadata;
	};
}

/**
 * `@operation(opts)` — the method decorator for a declared component's
 * operations. Identical lowering to `@trainable` (byte-identical manifest
 * facts); the distinct name is the component-domain vocabulary: an
 * operation declares its SHAPE (contract `input` + `output`, or a contract
 * `ref`) and intent; the rubric is optional. A body is the baseline the
 * optimizer improves; `stub()` (or an empty body via `training.define`)
 * declares code to be generated.
 */
export const operation = trainable;

/**
 * `param(description, example?)` — per-parameter annotation for the
 * `params`/`output` maps of @operation/@trainable options. TC39 stage-3
 * decorators (the only kind this repo compiles — never
 * `experimentalDecorators`, ADR-0125) do not include parameter decorators,
 * so parameter metadata rides the options object; this helper keeps the
 * declaration one expression per parameter.
 */
export function param(
	description: string,
	example?: unknown,
): FieldDescription {
	return example === undefined
		? Object.freeze({ description })
		: Object.freeze({ description, example });
}

/** Read a decorated class's component metadata (undefined when not one). */
export function componentMetadataOf(
	// biome-ignore lint/suspicious/noExplicitAny: introspects arbitrary classes
	cls: any,
): ComponentMetadata | undefined {
	const metadata = cls?.[(Symbol as { metadata?: symbol }).metadata as symbol];
	return metadata?.[COMPONENT_METADATA] as ComponentMetadata | undefined;
}
