import { getTrainable, resolveTrainable, training } from "./training.js";
import type { Trainable, TrainingOptions } from "./types.js";

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

export function trainable<This, I, O>(
	options: TrainingOptions<I, O>,
): (
	method: (this: This, input: I) => O | Promise<O>,
	context: ClassMethodDecoratorContext<
		This,
		(this: This, input: I) => O | Promise<O>
	>,
) => (this: This, input: I) => Promise<O> {
	return (method, context) => {
		const methodRef =
			options.methodRef ?? options.token?.description ?? String(context.name);
		const facts = { ...options, methodRef };
		if (context.metadata) {
			const registered =
				(context.metadata[TRAINABLE_METADATA] as string[] | undefined) ?? [];
			context.metadata[TRAINABLE_METADATA] = [...registered, methodRef];
		}

		const registerFor = (self: This): Trainable<I, O> =>
			getTrainable(methodRef)
				? // Container semantics: first registration wins (singleton
					// provider); later instances resolve the registered one.
					resolveTrainable<I, O>(methodRef)
				: training<I, O>((value: I) => method.call(self, value), facts);

		let bound: Trainable<I, O> | undefined;
		// DI-style eager registration: the trainable enters the registry when
		// the class is constructed, before any call, so resolveTrainable()/
		// listTrainables() see it immediately.
		context.addInitializer?.(function (this: This) {
			bound ??= registerFor(this);
		});
		return function (this: This, input: I): Promise<O> {
			// Fallback for hosts/tests that invoke the decorator without running
			// initializers: registration defers to the first call.
			bound ??= registerFor(this);
			return bound(input);
		};
	};
}
