/**
 * Minimal SQLite driver surface shared by Node (`node:sqlite`) and browser
 * (SQLite WASM). Semantic logic never imports Node or browser APIs.
 */

export type SqliteValue =
	| null
	| number
	| bigint
	| string
	| Uint8Array
	| boolean;

export interface SqliteRunResult {
	readonly changes: number;
	readonly lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
	run(...params: SqliteValue[]): SqliteRunResult;
	get(...params: SqliteValue[]): Record<string, unknown> | undefined;
	all(...params: SqliteValue[]): Record<string, unknown>[];
}

export interface SqliteDriver {
	readonly kind: "node" | "browser" | "memory" | "test";
	exec(sql: string): void;
	prepare(sql: string): SqliteStatement;
	/**
	 * Prefer BEGIN IMMEDIATE on native single-owner partitions.
	 * Browser VFS may map this to BEGIN.
	 */
	beginImmediate(): void;
	commit(): void;
	rollback(): void;
	pragma(name: string, value?: string | number): string | number | null;
	close(): void;
}

export function asBigInt(value: unknown, field: string): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isSafeInteger(value)) {
		return BigInt(value);
	}
	if (typeof value === "string" && /^-?\d+$/.test(value)) {
		return BigInt(value);
	}
	throw new TypeError(`${field} must be integer/bigint, got ${typeof value}`);
}

export function asNumber(value: unknown, field: string): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "bigint") {
		if (
			value > BigInt(Number.MAX_SAFE_INTEGER) ||
			value < BigInt(Number.MIN_SAFE_INTEGER)
		) {
			throw new TypeError(`${field} bigint out of safe number range`);
		}
		return Number(value);
	}
	if (
		typeof value === "string" &&
		value !== "" &&
		Number.isFinite(Number(value))
	) {
		return Number(value);
	}
	throw new TypeError(`${field} must be a number`);
}

export function asText(value: unknown, field: string): string {
	if (typeof value === "string") return value;
	throw new TypeError(`${field} must be a string`);
}

export function asNullableText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value;
	throw new TypeError("expected string or null");
}

export function asBytes(value: unknown, field: string): Uint8Array {
	if (value instanceof Uint8Array) return value;
	if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
		return new Uint8Array(value);
	}
	if (typeof value === "string") {
		return new TextEncoder().encode(value);
	}
	throw new TypeError(`${field} must be bytes`);
}
