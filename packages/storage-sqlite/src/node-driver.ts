/**
 * Node.js node:sqlite DatabaseSync adapter.
 * Production callers should use this only behind a serialized storage worker.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
	SqliteDriver,
	SqliteRunResult,
	SqliteStatement,
	SqliteValue,
} from "./driver.js";

export interface NodeSqliteDriverOptions {
	readonly path: string;
	/** Disable extension loading (default true). */
	readonly disableExtensions?: boolean;
}

export function createNodeSqliteDriver(
	options: NodeSqliteDriverOptions,
): SqliteDriver {
	mkdirSync(dirname(options.path), { recursive: true });
	// readBigInts: preserve full 64-bit fence/position values past Number.MAX_SAFE_INTEGER
	const db = new DatabaseSync(options.path, { readBigInts: true } as {
		readBigInts?: boolean;
	});

	// Best-effort: newer node:sqlite may expose enableLoadExtension
	const maybe = db as unknown as {
		enableLoadExtension?: (enabled: boolean) => void;
	};
	if (
		options.disableExtensions !== false &&
		typeof maybe.enableLoadExtension === "function"
	) {
		maybe.enableLoadExtension(false);
	}

	return wrapDatabaseSync(db, "node");
}

export function createMemoryNodeSqliteDriver(
	options: { readonly disableExtensions?: boolean } = {},
): SqliteDriver {
	const db = new DatabaseSync(":memory:", { readBigInts: true } as {
		readBigInts?: boolean;
	});
	const maybe = db as unknown as {
		enableLoadExtension?: (enabled: boolean) => void;
	};
	if (
		options.disableExtensions !== false &&
		typeof maybe.enableLoadExtension === "function"
	) {
		maybe.enableLoadExtension(false);
	}
	return wrapDatabaseSync(db, "memory");
}

function wrapDatabaseSync(
	db: DatabaseSync,
	kind: SqliteDriver["kind"],
): SqliteDriver {
	return {
		kind,
		exec(sql: string) {
			db.exec(sql);
		},
		prepare(sql: string): SqliteStatement {
			const stmt = db.prepare(sql);
			return {
				run(...params: SqliteValue[]): SqliteRunResult {
					const normalized = normalizeParams(params) as never[];
					const result = stmt.run(...normalized) as {
						changes: number | bigint;
						lastInsertRowid: number | bigint;
					};
					const changes =
						typeof result.changes === "bigint"
							? Number(result.changes)
							: result.changes;
					return {
						changes,
						lastInsertRowid: result.lastInsertRowid,
					};
				},
				get(...params: SqliteValue[]) {
					const normalized = normalizeParams(params) as never[];
					return stmt.get(...normalized) as Record<string, unknown> | undefined;
				},
				all(...params: SqliteValue[]) {
					const normalized = normalizeParams(params) as never[];
					return stmt.all(...normalized) as Record<string, unknown>[];
				},
			};
		},
		beginImmediate() {
			db.exec("BEGIN IMMEDIATE");
		},
		commit() {
			db.exec("COMMIT");
		},
		rollback() {
			db.exec("ROLLBACK");
		},
		pragma(name: string, value?: string | number) {
			if (value === undefined) {
				const row = db.prepare(`PRAGMA ${name}`).get() as
					| Record<string, unknown>
					| undefined;
				if (!row) return null;
				const v = Object.values(row)[0];
				if (typeof v === "string" || typeof v === "number") return v;
				return v === null || v === undefined ? null : String(v);
			}
			db.exec(`PRAGMA ${name} = ${value}`);
			return value;
		},
		close() {
			db.close();
		},
	};
}

function normalizeParams(params: SqliteValue[]): unknown[] {
	return params.map((p) => {
		if (p instanceof Uint8Array) {
			return Buffer.from(p);
		}
		return p;
	});
}
