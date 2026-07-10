import { training } from "./training.js";
import type { Trainable, TrainingOptions } from "./types.js";

// Optional sugar (ADR-0125): a TC39 stage-3 class-method decorator that
// lowers to the exact training() wrapper — byte-identical manifest facts.
// The wrapper/directive stay canonical; decorators cannot annotate free
// functions, so this exists only for OO-styled codebases. Never compiled
// with experimentalDecorators.

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
		const methodRef = options.methodRef ?? String(context.name);
		let bound: Trainable<I, O> | undefined;
		const facts = { ...options, methodRef };
		if (context.metadata) {
			const registered =
				(context.metadata[TRAINABLE_METADATA] as string[] | undefined) ?? [];
			context.metadata[TRAINABLE_METADATA] = [...registered, methodRef];
		}
		return function (this: This, input: I): Promise<O> {
			// Registration is deferred to first call so `this` binds correctly;
			// the lowering itself (training(fn, opts)) is identical to the
			// wrapper form and asserted equivalent by the conformance tests.
			bound ??= training<I, O>((value: I) => method.call(this, value), facts);
			return bound(input);
		};
	};
}
