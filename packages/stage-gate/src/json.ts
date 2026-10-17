/**
 * A JSON document as it arrives at a parser boundary, and the guards that
 * narrow one node of it. The guards read the value's own tag, so a parser
 * branches on what a node is without trusting what it claims to be.
 */
const tagOf = Object.prototype.toString;

export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| JsonObject;

export function isJsonString<T>(value: T): value is T & string {
	return tagOf.call(value) === "[object String]";
}

export function isJsonNumber<T>(value: T): value is T & number {
	return tagOf.call(value) === "[object Number]";
}

export function isJsonInteger<T>(value: T): value is T & number {
	return isJsonNumber(value) && Number.isInteger(value);
}

export function isJsonBoolean<T>(value: T): value is T & boolean {
	return tagOf.call(value) === "[object Boolean]";
}

export function isJsonArray<T>(value: T): value is T & readonly JsonValue[] {
	return Array.isArray(value);
}

export function isJsonObject<T>(value: T): value is T & JsonObject {
	return (
		value !== undefined &&
		value !== null &&
		!Array.isArray(value) &&
		tagOf.call(value) === "[object Object]"
	);
}

/** Read a JSON document; text that is not JSON is `undefined`. */
export function parseJsonText(text: string): JsonValue | undefined {
	try {
		// SAFETY: JSON.parse returns a JSON value; every node is narrowed by the guards above before use.
		return JSON.parse(text) as JsonValue;
	} catch {
		return undefined;
	}
}
