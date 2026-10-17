/**
 * Readers for one node of an untrusted JSON report. Each takes the parent
 * object, the key and the parent's path, and on a value of the wrong kind
 * records an issue and returns a neutral value, so a parser can report every
 * problem in one pass instead of stopping at the first.
 */
import {
	isJsonArray,
	isJsonInteger,
	isJsonObject,
	type JsonObject,
	type JsonValue,
} from "./json.js";

/** `a.b` from a parent path and a key; the root has the empty path. */
export function pathOf(parent: string, key: string): string {
	return parent === "" ? key : `${parent}.${key}`;
}

/** Own fields only: a report key named like an Object.prototype member reads as absent. */
export function fieldOf(node: JsonObject, key: string): JsonValue | undefined {
	return Object.hasOwn(node, key) ? node[key] : undefined;
}

export function countOf(
	node: JsonObject,
	key: string,
	path: string,
	issues: string[],
): number {
	const value = fieldOf(node, key);
	if (isJsonInteger(value) && value >= 0) return value;
	issues.push(`${pathOf(path, key)}: expected a non-negative integer`);
	return 0;
}

export function objectOf(
	node: JsonObject,
	key: string,
	path: string,
	issues: string[],
): JsonObject {
	const value = fieldOf(node, key);
	if (isJsonObject(value)) return value;
	issues.push(`${pathOf(path, key)}: expected an object`);
	return {};
}

export function arrayOf(
	node: JsonObject,
	key: string,
	path: string,
	issues: string[],
): readonly JsonValue[] {
	const value = fieldOf(node, key);
	if (isJsonArray(value)) return value;
	issues.push(`${pathOf(path, key)}: expected an array`);
	return [];
}

export function memberOf<T extends string>(
	allowed: readonly T[],
	value: JsonValue | undefined,
): T | undefined {
	return allowed.find((entry) => entry === value);
}
