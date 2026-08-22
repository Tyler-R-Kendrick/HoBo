const tagOf = Object.prototype.toString;

export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| JsonObject;

export function isJsonString<T>(value: T): value is T & string {
	return tagOf.call(value) === "[object String]";
}

export function isJsonBigInt<T>(value: T): value is T & bigint {
	return tagOf.call(value) === "[object BigInt]";
}

export function isJsonNumber<T>(value: T): value is T & number {
	return tagOf.call(value) === "[object Number]";
}

export function isJsonBoolean<T>(value: T): value is T & boolean {
	return value === true || value === false;
}

export function isJsonObject<T>(value: T): value is T & JsonObject {
	return (
		value !== undefined &&
		value !== null &&
		!Array.isArray(value) &&
		tagOf.call(value) === "[object Object]"
	);
}

export function isJsonArray<T>(value: T): value is T & JsonValue[] {
	return tagOf.call(value) === "[object Array]";
}

/**
 * Clone a domain value across the JSON document boundary.
 *
 * Bigints become strings. `JSON.stringify` throws a bare
 * `TypeError: Do not know how to serialize a BigInt` on one, and this helper
 * sits on the path from a domain result to a CLI payload — so a single bigint
 * anywhere in that result turned into an unhandled crash rather than an
 * answer. `hobo-code review start` did exactly that: the review runtime
 * returns a revision, and the verb died with a stack trace instead of a
 * refusal a reader could act on.
 *
 * A string is the right shape rather than a lossy `Number` cast: revisions and
 * sequence numbers are the usual bigints here, and they are compared for
 * equality and round-tripped, not arithmetic'd. Three call sites already
 * carried this exact replacer inline — `session-orchestrator` twice and
 * `session-control-server` once — which is what a missing default looks like
 * from the outside.
 */
export function cloneAsJson<T>(value: T): JsonValue {
	return parseJsonValue(
		JSON.stringify(value ?? null, (_key, entry) =>
			isJsonBigInt(entry) ? entry.toString() : entry,
		),
	);
}

export function parseJsonObject(text: string): JsonObject {
	let value: JsonValue;
	try {
		// SAFETY: JSON.parse yields a JSON value at this document boundary.
		value = JSON.parse(text) as JsonValue;
	} catch {
		return {};
	}
	return isJsonObject(value) ? value : {};
}

export function parseJsonValue(text: string): JsonValue {
	try {
		// SAFETY: JSON.parse yields a JSON value at this document boundary.
		return JSON.parse(text) as JsonValue;
	} catch {
		return null;
	}
}
