/**
 * Live data-dual port: two real SQLite stores behind the Trail runner's dual
 * oracle (replaces the simulated `DataDualFixture` — vision-gap Phase 7).
 *
 * CDC dual-write per ADR-0032: business writes land on the SOURCE store and a
 * change journal in the same transaction; `replicate()` tails the journal and
 * applies un-replicated changes to the TARGET with a seq watermark —
 * at-least-once delivery, exactly-once effect. The oracle (`snapshot()`)
 * reads both stores ordered by key so `evaluateDataDual` can assert checksum
 * equivalence and zero loss against live data.
 *
 * Pooled → siloed: when `tenant` is set, the source is treated as a pooled
 * store (rows carry `tenant_id`) and the target as that tenant's silo —
 * replication and the oracle are tenant-scoped, so divergence in another
 * tenant's rows never masks or fails this tenant's migration.
 */
import { DatabaseSync } from "node:sqlite";

import type { DataDualView } from "./data-steps.js";

export interface DataDualPort {
	readonly fidelity: "live";
	/** Ordered oracle view over both stores (tenant-scoped when configured). */
	snapshot(): DataDualView;
}

export interface SqliteDataDualWrite {
	readonly id: string;
	readonly doc: Readonly<Record<string, unknown>>;
	/** Pooled-store tenant; defaults to the port's tenant (or "default"). */
	readonly tenant?: string;
	readonly deleted?: boolean;
}

export interface SqliteDataDualPort extends DataDualPort {
	/** Dual-write entry: apply business writes to source + CDC journal atomically. */
	writeSource(writes: readonly SqliteDataDualWrite[]): void;
	/** Tail the CDC journal onto the target; returns changes applied. */
	replicate(): number;
	/** CDC lag: journal entries not yet applied to the target. */
	lag(): number;
	close(): void;
}

export interface CreateSqliteDataDualPortOptions {
	/** Source store path ("file" | ":memory:"). Pooled store in tenant mode. */
	readonly sourcePath: string;
	/** Target store path. The tenant silo in tenant mode. */
	readonly targetPath: string;
	readonly table?: string;
	/** Scope replication + oracle to one tenant (pooled → siloed protocol). */
	readonly tenant?: string;
}

export function createSqliteDataDualPort(
	options: CreateSqliteDataDualPortOptions,
): SqliteDataDualPort {
	const table = validIdentifier(options.table ?? "records");
	const tenant = options.tenant;
	const source = new DatabaseSync(options.sourcePath);
	const target = new DatabaseSync(options.targetPath);

	source.exec(`
		CREATE TABLE IF NOT EXISTS ${table} (
			tenant_id TEXT NOT NULL,
			id TEXT NOT NULL,
			doc TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id)
		);
		CREATE TABLE IF NOT EXISTS ${table}_cdc_log (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			tenant_id TEXT NOT NULL,
			id TEXT NOT NULL,
			op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
			doc TEXT
		);
	`);
	target.exec(`
		CREATE TABLE IF NOT EXISTS ${table} (
			tenant_id TEXT NOT NULL,
			id TEXT NOT NULL,
			doc TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id)
		);
		CREATE TABLE IF NOT EXISTS ${table}_cdc_applied (
			table_name TEXT PRIMARY KEY,
			watermark INTEGER NOT NULL
		);
	`);

	const insertRow = source.prepare(
		`INSERT INTO ${table} (tenant_id, id, doc) VALUES (?, ?, ?)
		 ON CONFLICT (tenant_id, id) DO UPDATE SET doc = excluded.doc`,
	);
	const deleteRow = source.prepare(
		`DELETE FROM ${table} WHERE tenant_id = ? AND id = ?`,
	);
	const appendCdc = source.prepare(
		`INSERT INTO ${table}_cdc_log (tenant_id, id, op, doc) VALUES (?, ?, ?, ?)`,
	);
	const applyUpsert = target.prepare(
		`INSERT INTO ${table} (tenant_id, id, doc) VALUES (?, ?, ?)
		 ON CONFLICT (tenant_id, id) DO UPDATE SET doc = excluded.doc`,
	);
	const applyDelete = target.prepare(
		`DELETE FROM ${table} WHERE tenant_id = ? AND id = ?`,
	);

	function watermark(): number {
		const row = target
			.prepare(
				`SELECT watermark FROM ${table}_cdc_applied WHERE table_name = ?`,
			)
			.get(table) as { watermark?: number | bigint } | undefined;
		return Number(row?.watermark ?? 0);
	}

	function pendingChanges(): readonly {
		seq: number;
		tenant_id: string;
		id: string;
		op: string;
		doc: string | null;
	}[] {
		const after = watermark();
		const rows = tenant
			? source
					.prepare(
						`SELECT seq, tenant_id, id, op, doc FROM ${table}_cdc_log
						 WHERE seq > ? AND tenant_id = ? ORDER BY seq`,
					)
					.all(after, tenant)
			: source
					.prepare(
						`SELECT seq, tenant_id, id, op, doc FROM ${table}_cdc_log
						 WHERE seq > ? ORDER BY seq`,
					)
					.all(after);
		return rows as unknown as readonly {
			seq: number;
			tenant_id: string;
			id: string;
			op: string;
			doc: string | null;
		}[];
	}

	function readRows(
		db: DatabaseSync,
	): readonly Readonly<Record<string, unknown>>[] {
		const rows = tenant
			? db
					.prepare(
						`SELECT id, doc FROM ${table} WHERE tenant_id = ? ORDER BY id`,
					)
					.all(tenant)
			: db
					.prepare(
						`SELECT tenant_id, id, doc FROM ${table} ORDER BY tenant_id, id`,
					)
					.all();
		return Object.freeze(
			(rows as { tenant_id?: string; id: string; doc: string }[]).map((row) =>
				Object.freeze({
					...(row.tenant_id !== undefined ? { tenant: row.tenant_id } : {}),
					id: row.id,
					...(JSON.parse(row.doc) as Record<string, unknown>),
				}),
			),
		);
	}

	return {
		fidelity: "live",
		writeSource(writes) {
			source.exec("BEGIN IMMEDIATE");
			try {
				for (const write of writes) {
					const rowTenant = write.tenant ?? tenant ?? "default";
					const doc = JSON.stringify(write.doc);
					if (write.deleted) {
						deleteRow.run(rowTenant, write.id);
						appendCdc.run(rowTenant, write.id, "delete", null);
					} else {
						insertRow.run(rowTenant, write.id, doc);
						appendCdc.run(rowTenant, write.id, "upsert", doc);
					}
				}
				source.exec("COMMIT");
			} catch (error) {
				source.exec("ROLLBACK");
				throw error;
			}
		},
		replicate() {
			const changes = pendingChanges();
			if (changes.length === 0) return 0;
			target.exec("BEGIN IMMEDIATE");
			try {
				for (const change of changes) {
					if (change.op === "delete") {
						applyDelete.run(change.tenant_id, change.id);
					} else {
						applyUpsert.run(change.tenant_id, change.id, change.doc ?? "{}");
					}
				}
				const top = changes[changes.length - 1]?.seq ?? 0;
				target
					.prepare(
						`INSERT INTO ${table}_cdc_applied (table_name, watermark) VALUES (?, ?)
						 ON CONFLICT (table_name) DO UPDATE SET watermark = excluded.watermark`,
					)
					.run(table, top);
				target.exec("COMMIT");
			} catch (error) {
				target.exec("ROLLBACK");
				throw error;
			}
			return changes.length;
		},
		lag() {
			return pendingChanges().length;
		},
		snapshot() {
			return Object.freeze({
				sourceRows: readRows(source),
				targetRows: readRows(target),
				fidelity: "live" as const,
			});
		},
		close() {
			source.close();
			target.close();
		},
	};
}

function validIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
		throw new Error(`invalid SQL identifier: ${value}`);
	}
	return value;
}
