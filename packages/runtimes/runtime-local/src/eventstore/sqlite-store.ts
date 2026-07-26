import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { EventEnvelope, SnapshotRecord } from "@hobo/core";

import {
	type ParsedAppendContext,
	type ParsedEventInput,
	parseStoredEnvelope,
} from "./parse.js";

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
CREATE TABLE IF NOT EXISTS events (
  stream_id TEXT NOT NULL,
  seq INTEGER NOT NULL CHECK (seq > 0),
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  v INTEGER NOT NULL DEFAULT 1,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  tenant TEXT NOT NULL,
  project TEXT,
  causation_id TEXT,
  correlation_id TEXT,
  lane TEXT,
  data TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  PRIMARY KEY (stream_id, seq),
  UNIQUE (stream_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS snapshots (
  stream_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  state TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
`;

export interface PersistedEnvelopeInput {
	readonly envelope: EventEnvelope;
	readonly idempotencyKey?: string;
}

export class SqliteEventStore {
	private readonly db: DatabaseSync;

	constructor(dbPath: string) {
		mkdirSync(dirname(dbPath), { recursive: true });
		this.db = new DatabaseSync(dbPath);
		this.db.exec(SCHEMA_SQL);
	}

	close(): void {
		this.db.close();
	}

	getStreamLength(streamId: string): number {
		const row = this.db
			.prepare("SELECT COUNT(*) AS count FROM events WHERE stream_id = ?")
			.get(streamId) as { count: number };
		return row.count;
	}

	findByIdempotencyKey(
		streamId: string,
		idempotencyKey: string,
	): EventEnvelope | undefined {
		const row = this.db
			.prepare(
				`SELECT id, type, v, stream_id, seq, ts, actor, tenant, project,
            causation_id, correlation_id, lane, data, meta
         FROM events
         WHERE stream_id = ? AND idempotency_key = ?`,
			)
			.get(streamId, idempotencyKey) as EventRow | undefined;
		return row ? parseStoredEnvelope(row) : undefined;
	}

	readStream(streamId: string, fromSeq = 1): EventEnvelope[] {
		const rows = this.db
			.prepare(
				`SELECT id, type, v, stream_id, seq, ts, actor, tenant, project,
            causation_id, correlation_id, lane, data, meta
         FROM events
         WHERE stream_id = ? AND seq >= ?
         ORDER BY seq ASC`,
			)
			.all(streamId, fromSeq) as unknown as EventRow[];
		return rows.map((row) => parseStoredEnvelope(row));
	}

	readAllStreams(): EventEnvelope[] {
		const rows = this.db
			.prepare(
				`SELECT id, type, v, stream_id, seq, ts, actor, tenant, project,
            causation_id, correlation_id, lane, data, meta
         FROM events
         ORDER BY stream_id ASC, seq ASC`,
			)
			.all() as unknown as EventRow[];
		return rows.map((row) => parseStoredEnvelope(row));
	}

	appendBatch(
		context: ParsedAppendContext,
		pending: ParsedEventInput[],
		createEnvelope: (
			input: ParsedEventInput,
			seq: number,
			context: ParsedAppendContext,
		) => EventEnvelope,
	): { appended: EventEnvelope[]; deduped: EventEnvelope[] } {
		const deduped: EventEnvelope[] = [];
		const toWrite: ParsedEventInput[] = [];

		for (const input of pending) {
			if (input.idempotencyKey) {
				const existing = this.findByIdempotencyKey(
					context.streamId,
					input.idempotencyKey,
				);
				if (existing) {
					deduped.push(existing);
					continue;
				}
			}
			toWrite.push(input);
		}

		if (toWrite.length === 0) {
			return { appended: [], deduped };
		}

		const currentLength = this.getStreamLength(context.streamId);
		if (currentLength !== context.expectedSeq) {
			throw new StaleSequenceError(
				context.streamId,
				context.expectedSeq,
				currentLength,
			);
		}

		const appended: EventEnvelope[] = [];
		this.db.exec("BEGIN IMMEDIATE");
		try {
			let nextSeq = currentLength + 1;
			const insert = this.db.prepare(
				`INSERT INTO events (
          stream_id, seq, id, type, v, ts, actor, tenant, project,
          causation_id, correlation_id, lane, data, meta, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			);

			for (const input of toWrite) {
				const envelope = createEnvelope(input, nextSeq, context);
				insert.run(
					envelope.streamId,
					envelope.seq,
					envelope.id,
					envelope.type,
					envelope.v,
					envelope.ts,
					JSON.stringify(envelope.actor),
					envelope.tenant,
					envelope.project ?? null,
					envelope.causationId ?? null,
					envelope.correlationId ?? null,
					envelope.lane ?? null,
					JSON.stringify(envelope.data),
					JSON.stringify(envelope.meta ?? {}),
					input.idempotencyKey ?? null,
				);
				appended.push(envelope);
				nextSeq += 1;
			}

			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}

		return { appended, deduped };
	}

	appendSingle(
		context: ParsedAppendContext,
		input: ParsedEventInput,
		createEnvelope: (
			input: ParsedEventInput,
			seq: number,
			context: ParsedAppendContext,
		) => EventEnvelope,
	): EventEnvelope {
		return this.appendBatch(context, [input], createEnvelope)
			.appended[0] as EventEnvelope;
	}

	saveSnapshot<S>(record: SnapshotRecord<S>): SnapshotRecord<S> {
		const currentLength = this.getStreamLength(record.streamId);
		if (record.seq > currentLength) {
			throw new SnapshotAheadError(record.streamId, record.seq, currentLength);
		}

		this.db
			.prepare(
				`INSERT INTO snapshots (stream_id, seq, state, saved_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(stream_id) DO UPDATE SET
           seq = excluded.seq,
           state = excluded.state,
           saved_at = excluded.saved_at`,
			)
			.run(
				record.streamId,
				record.seq,
				JSON.stringify(record.state),
				record.savedAt,
			);

		return record;
	}

	loadSnapshot<S>(streamId: string): SnapshotRecord<S> | undefined {
		const row = this.db
			.prepare(
				"SELECT stream_id, seq, state, saved_at FROM snapshots WHERE stream_id = ?",
			)
			.get(streamId) as SnapshotRow | undefined;
		if (!row) {
			return undefined;
		}
		return {
			streamId: row.stream_id,
			seq: row.seq,
			state: JSON.parse(row.state) as S,
			savedAt: row.saved_at,
		};
	}
}

export function defaultDbPath(dataDir: string): string {
	return join(dataDir, "eventstore.sqlite");
}

export class StaleSequenceError extends Error {
	constructor(
		readonly streamId: string,
		readonly expectedSeq: number,
		readonly actualSeq: number,
	) {
		super(
			`stale expectedSeq for ${streamId}: expected ${expectedSeq}, actual ${actualSeq}`,
		);
		this.name = "StaleSequenceError";
	}
}

export class SnapshotAheadError extends Error {
	constructor(
		readonly streamId: string,
		readonly snapshotSeq: number,
		readonly headSeq: number,
	) {
		super(`snapshot seq ${snapshotSeq} is ahead of ${streamId}@${headSeq}`);
		this.name = "SnapshotAheadError";
	}
}

interface EventRow {
	id: string;
	type: string;
	v: number;
	stream_id: string;
	seq: number;
	ts: string;
	actor: string;
	tenant: string;
	project: string | null;
	causation_id: string | null;
	correlation_id: string | null;
	lane: string | null;
	data: string;
	meta: string;
}

interface SnapshotRow {
	stream_id: string;
	seq: number;
	state: string;
	saved_at: string;
}
