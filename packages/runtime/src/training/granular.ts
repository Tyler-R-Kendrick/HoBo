import { getTrainable, resolveTrainable, training } from "./training.js";
import type { FieldDescription, Trainable, TrainingOptions } from "./types.js";

// Granular grounding decorators (Plan 2 Syntax 0): @intent / @returns on
// methods and @description on parameters annotate an implementation one
// fact at a time — every decorator optional, every missing grounding
// inferred. A bare `@trainable` class decorator composes whatever was
// declared into TrainingOptions and registers each method.
//
// Every decorator here is DUAL-MODE: it detects at call time whether it
// was invoked with TC39 stage-3 semantics (value, context) or legacy
// `experimentalDecorators` semantics (target, key, descriptor/index).
// Stage-3 is this repo's compilation mode (ADR-0125) and has no parameter
// decorators — @description in parameter position only compiles in
// downstream projects that opt into legacy decorators; stage-3 users pass
// the same object through `params:` maps. Ambient `export declare class`
// declarations erase at compile time, so no decorator runs for them at
// all — they are honored by source scanning instead (scan.ts, the
// `hobo stub` path).

interface PendingGrounding {
	intent?: string;
	returns?: string;
	params?: Record<string, FieldDescription>;
}

type PendingMap = Map<string, PendingGrounding>;

/** Stage-3: pending groundings ride the class's `Symbol.metadata` record. */
export const PENDING_GROUNDINGS = Symbol.for("hobo.trainable.pending");

/** Legacy: pending groundings keyed by the class prototype. */
const legacyPending = new WeakMap<object, PendingMap>();

function stage3Pending(metadata: Record<PropertyKey, unknown>): PendingMap {
	const existing = metadata[PENDING_GROUNDINGS] as PendingMap | undefined;
	if (existing) return existing;
	const created: PendingMap = new Map();
	metadata[PENDING_GROUNDINGS] = created;
	return created;
}

function pendingEntry(map: PendingMap, method: string): PendingGrounding {
	const existing = map.get(method);
	if (existing) return existing;
	const created: PendingGrounding = {};
	map.set(method, created);
	return created;
}

interface Stage3MethodContext {
	readonly kind: string;
	readonly name: string | symbol;
	readonly metadata?: Record<PropertyKey, unknown>;
}

function isStage3MethodContext(value: unknown): value is Stage3MethodContext {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		"name" in value
	);
}

function methodPending(
	args: readonly unknown[],
): { entry: PendingGrounding; passthrough: unknown } | undefined {
	const [first, second, third] = args;
	if (isStage3MethodContext(second)) {
		// Stage-3: (method, context). Metadata may be absent in exotic hosts.
		if (!second.metadata) return undefined;
		return {
			entry: pendingEntry(stage3Pending(second.metadata), String(second.name)),
			passthrough: first,
		};
	}
	if (
		(typeof second === "string" || typeof second === "symbol") &&
		typeof first === "object" &&
		first !== null
	) {
		// Legacy: (prototype, propertyKey, descriptor).
		let map = legacyPending.get(first);
		if (!map) {
			map = new Map();
			legacyPending.set(first, map);
		}
		return {
			entry: pendingEntry(map, String(second)),
			passthrough: third,
		};
	}
	return undefined;
}

/** `@intent("…")` — the method's generation intent. Optional; inferred when absent. */
export function intent(text: string) {
	return (...args: unknown[]): unknown => {
		const pending = methodPending(args);
		if (pending) pending.entry.intent = text;
		return pending?.passthrough;
	};
}

/** `@returns("…")` — describes the output. Optional; lowers to output field metadata. */
export function returns(text: string) {
	return (...args: unknown[]): unknown => {
		const pending = methodPending(args);
		if (pending) pending.entry.returns = text;
		return pending?.passthrough;
	};
}

/**
 * `@description("…")` — per-parameter annotation. In legacy
 * `experimentalDecorators` projects this is a real parameter decorator
 * (the parameter's name is recovered from the method source, falling back
 * to `arg<index>`); under stage-3 (no parameter decorators in TC39) the
 * SAME call doubles as a `FieldDescription` value for `params:` maps —
 * `params: { name: description("…") }`.
 */
export function description(
	text: string,
	example?: unknown,
): FieldDescription & ((...args: unknown[]) => void) {
	const legacyParamDecorator = (...args: unknown[]): void => {
		const [target, key, index] = args;
		if (
			typeof target !== "object" ||
			target === null ||
			(typeof key !== "string" && typeof key !== "symbol") ||
			typeof index !== "number"
		) {
			return;
		}
		let map = legacyPending.get(target);
		if (!map) {
			map = new Map();
			legacyPending.set(target, map);
		}
		const entry = pendingEntry(map, String(key));
		const method = (target as Record<string, unknown>)[String(key)];
		const name = parameterName(method, index) ?? `arg${index}`;
		entry.params = {
			...entry.params,
			[name]:
				example === undefined
					? { description: text }
					: { description: text, example },
		};
	};
	Object.defineProperty(legacyParamDecorator, "description", { value: text });
	if (example !== undefined) {
		Object.defineProperty(legacyParamDecorator, "example", { value: example });
	}
	return legacyParamDecorator as FieldDescription &
		((...args: unknown[]) => void);
}

/** Best-effort parameter-name recovery from the method source. */
function parameterName(method: unknown, index: number): string | undefined {
	if (typeof method !== "function") return undefined;
	const source = String(method);
	const open = source.indexOf("(");
	if (open < 0) return undefined;
	let depth = 0;
	let end = open;
	for (let i = open; i < source.length; i += 1) {
		if (source[i] === "(") depth += 1;
		if (source[i] === ")") {
			depth -= 1;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	const params = source
		.slice(open + 1, end)
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	const param = params[index];
	if (!param) return undefined;
	const match = param.match(/^[{[]?\s*(\w+)/);
	return match?.[1];
}

/** Inferred intent for a method that declared none (all decorators optional). */
function inferredIntent(methodRef: string): string {
	return `Inferred: implement ${methodRef} to satisfy its declared signature and descriptions.`;
}

function composeOptions(
	methodRef: string,
	pending: PendingGrounding | undefined,
): TrainingOptions {
	return {
		methodRef,
		intent: pending?.intent ?? inferredIntent(methodRef),
		contract: { ref: `decl://${methodRef}` },
		...(pending?.params ? { params: pending.params } : {}),
		...(pending?.returns
			? { output: { returns: { description: pending.returns } } }
			: {}),
	};
}

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
	metadata: Record<PropertyKey, unknown> | undefined,
): void {
	const pending =
		(metadata?.[PENDING_GROUNDINGS] as PendingMap | undefined) ??
		legacyPending.get(cls.prototype) ??
		new Map<string, PendingGrounding>();

	const names =
		pending.size > 0
			? [...pending.keys()]
			: Object.getOwnPropertyNames(cls.prototype).filter(
					(name) =>
						name !== "constructor" &&
						typeof (cls.prototype as Record<string, unknown>)[name] ===
							"function",
				);

	let instance: object | undefined;
	const self = (): object => {
		if (!instance) {
			try {
				instance = new cls();
			} catch {
				instance = cls.prototype as object;
			}
		}
		return instance;
	};

	for (const name of names) {
		const methodRef = `${cls.name}.${name}`;
		if (getTrainable(methodRef)) continue;
		const method = (cls.prototype as Record<string, unknown>)[name];
		if (typeof method !== "function") continue;
		const registered = training(
			(input: unknown) =>
				(method as (this: object, input: unknown) => unknown).call(
					self(),
					input,
				),
			composeOptions(methodRef, pending.get(name)),
		);
		if (metadata) {
			const refs =
				(metadata[Symbol.for("hobo.trainable.metadata")] as
					| string[]
					| undefined) ?? [];
			metadata[Symbol.for("hobo.trainable.metadata")] = [
				...refs,
				registered.methodRef,
			];
		}
	}
}

/** Resolve a bare-class-decorated method by `<Class>.<method>` ref. */
export function resolveDeclared<I, O>(classAndMethod: string): Trainable<I, O> {
	return resolveTrainable<I, O>(classAndMethod);
}

/** Compose options for a stage-3 bare `@trainable` method (granular or inferred). */
export function granularOptionsFor(
	methodRef: string,
	metadata: Record<PropertyKey, unknown> | undefined,
	methodName: string,
): TrainingOptions {
	const pending = (
		metadata?.[PENDING_GROUNDINGS] as PendingMap | undefined
	)?.get(methodName);
	return composeOptions(methodRef, pending);
}

/** Compose options for a legacy bare `@trainable` method. */
export function granularLegacyOptions(
	prototype: object,
	methodName: string,
): TrainingOptions {
	const owner = (prototype as { constructor?: { name?: string } }).constructor
		?.name;
	const methodRef =
		owner && owner !== "Object" ? `${owner}.${methodName}` : methodName;
	return composeOptions(
		methodRef,
		legacyPending.get(prototype)?.get(methodName),
	);
}
