/**
 * SessionBlobStore + SessionIndex ports and local dual-fixture adapters.
 * Heavy rrweb blobs: content-addressed. Metadata: index. Offline-first.
 */
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
	REPLAY_SCHEMA_VERSION,
	parseSessionRecord,
	type RecordingChunk,
	type RrwebEvent,
	type SessionRecord,
} from "./types.js";

export type SessionBlobStore = {
	put(
		sessionId: string,
		seq: number,
		events: readonly RrwebEvent[],
	): Promise<RecordingChunk>;
	get(blobRef: string): Promise<readonly RrwebEvent[] | undefined>;
};

export type SessionIndex = {
	upsert(record: SessionRecord): Promise<void>;
	get(sessionId: string): Promise<SessionRecord | undefined>;
	list(query?: SessionListQuery): Promise<readonly SessionRecord[]>;
	listChunks(sessionId: string): Promise<readonly RecordingChunk[]>;
	appendChunkMeta(sessionId: string, chunk: RecordingChunk): Promise<void>;
};

export type SessionListQuery = Readonly<{
	stationId?: string;
	errorId?: string;
	trailId?: string;
	principalRef?: string;
	harnessFlagKey?: string;
	isolationClass?: string;
	status?: SessionRecord["status"];
	limit?: number;
}>;

export type DualFixtureStore = Readonly<{
	blobs: SessionBlobStore;
	index: SessionIndex;
	rootDir: string;
	label: "contract-asserted-replay-fixtures";
	fidelity: "simulated";
}>;

function sha256(payload: string): `sha256:${string}` {
	return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

/** In-memory dual fixtures (tests / schemaOnlyView). */
export function createMemoryDualFixtures(seed?: {
	readonly sessions?: readonly SessionRecord[];
}): DualFixtureStore {
	const blobMap = new Map<string, readonly RrwebEvent[]>();
	const indexMap = new Map<string, SessionRecord>();
	const chunkLists = new Map<string, RecordingChunk[]>();
	for (const s of seed?.sessions ?? []) {
		indexMap.set(s.id, s);
	}

	const blobs: SessionBlobStore = {
		async put(sessionId, seq, events) {
			const payload = JSON.stringify(events);
			const contentHash = sha256(payload);
			const blobRef = `mem:${sessionId}:${seq}:${contentHash.slice(7, 15)}`;
			blobMap.set(blobRef, Object.freeze([...events]));
			const chunk: RecordingChunk = Object.freeze({
				schemaVersion: REPLAY_SCHEMA_VERSION,
				sessionId,
				seq,
				contentHash,
				byteSize: Buffer.byteLength(payload, "utf8"),
				blobRef,
				createdAt: new Date().toISOString(),
			});
			const list = chunkLists.get(sessionId) ?? [];
			list.push(chunk);
			chunkLists.set(sessionId, list);
			return chunk;
		},
		async get(blobRef) {
			return blobMap.get(blobRef);
		},
	};

	const index: SessionIndex = {
		async upsert(record) {
			indexMap.set(record.id, parseSessionRecord(record));
		},
		async get(sessionId) {
			return indexMap.get(sessionId);
		},
		async list(query = {}) {
			let rows = [...indexMap.values()];
			if (query.stationId) {
				rows = rows.filter((r) => r.correlation.stationId === query.stationId);
			}
			if (query.errorId) {
				rows = rows.filter((r) => r.correlation.errorId === query.errorId);
			}
			if (query.trailId) {
				rows = rows.filter((r) => r.correlation.trailId === query.trailId);
			}
			if (query.principalRef) {
				rows = rows.filter(
					(r) => r.correlation.principalRef === query.principalRef,
				);
			}
			if (query.harnessFlagKey) {
				rows = rows.filter((r) =>
					r.correlation.harnessFlagKeys.includes(query.harnessFlagKey!),
				);
			}
			if (query.isolationClass) {
				rows = rows.filter(
					(r) => r.correlation.isolationClass === query.isolationClass,
				);
			}
			if (query.status) {
				rows = rows.filter((r) => r.status === query.status);
			}
			const limit = query.limit ?? 100;
			return Object.freeze(rows.slice(0, limit));
		},
		async listChunks(sessionId) {
			return Object.freeze([...(chunkLists.get(sessionId) ?? [])]);
		},
		async appendChunkMeta(sessionId, chunk) {
			const cur = indexMap.get(sessionId);
			if (!cur) return;
			indexMap.set(
				sessionId,
				Object.freeze({
					...cur,
					chunkCount: cur.chunkCount + 1,
					totalBytes: cur.totalBytes + chunk.byteSize,
				}),
			);
		},
	};

	return Object.freeze({
		blobs,
		index,
		rootDir: ":memory:",
		label: "contract-asserted-replay-fixtures",
		fidelity: "simulated",
	});
}

/**
 * Filesystem dual fixtures under a Station data dir (local / air-gap path).
 * Layout: `<root>/sessions/<id>.json` + `<root>/blobs/<hash>.json`
 */
export function createFilesystemDualFixtures(rootDir: string): DualFixtureStore {
	const sessionsDir = join(rootDir, "sessions");
	const blobsDir = join(rootDir, "blobs");
	const chunksDir = join(rootDir, "chunks");
	mkdirSync(sessionsDir, { recursive: true });
	mkdirSync(blobsDir, { recursive: true });
	mkdirSync(chunksDir, { recursive: true });
	const chunksPath = (sessionId: string) =>
		join(chunksDir, `${encodeURIComponent(sessionId)}.json`);

	const blobs: SessionBlobStore = {
		async put(sessionId, seq, events) {
			const payload = JSON.stringify(events);
			const contentHash = sha256(payload);
			const file = `${contentHash.slice(7)}.json`;
			const path = join(blobsDir, file);
			writeFileSync(path, payload, "utf8");
			const blobRef = `fs:${file}`;
			return Object.freeze({
				schemaVersion: REPLAY_SCHEMA_VERSION,
				sessionId,
				seq,
				contentHash,
				byteSize: Buffer.byteLength(payload, "utf8"),
				blobRef,
				createdAt: new Date().toISOString(),
			});
		},
		async get(blobRef) {
			if (!blobRef.startsWith("fs:")) return undefined;
			const path = join(blobsDir, blobRef.slice(3));
			if (!existsSync(path)) return undefined;
			const raw = JSON.parse(readFileSync(path, "utf8")) as RrwebEvent[];
			return Object.freeze(raw);
		},
	};

	const index: SessionIndex = {
		async upsert(record) {
			const parsed = parseSessionRecord(record);
			writeFileSync(
				join(sessionsDir, `${parsed.id}.json`),
				JSON.stringify(parsed, null, 2),
				"utf8",
			);
		},
		async get(sessionId) {
			const path = join(sessionsDir, `${sessionId}.json`);
			if (!existsSync(path)) return undefined;
			return parseSessionRecord(JSON.parse(readFileSync(path, "utf8")));
		},
		async list(query = {}) {
			const files = existsSync(sessionsDir)
				? readdirSync(sessionsDir).filter((f) => f.endsWith(".json"))
				: [];
			const mem = createMemoryDualFixtures({
				sessions: files.map((f) =>
					parseSessionRecord(
						JSON.parse(readFileSync(join(sessionsDir, f), "utf8")),
					),
				),
			});
			return mem.index.list(query);
		},
		async listChunks(sessionId) {
			const path = chunksPath(sessionId);
			if (!existsSync(path)) return Object.freeze([]);
			return Object.freeze(
				JSON.parse(readFileSync(path, "utf8")) as RecordingChunk[],
			);
		},
		async appendChunkMeta(sessionId, chunk) {
			const cur = await index.get(sessionId);
			if (!cur) return;
			writeFileSync(
				chunksPath(sessionId),
				JSON.stringify([...(await index.listChunks(sessionId)), chunk], null, 2),
				"utf8",
			);
			await index.upsert(
				Object.freeze({
					...cur,
					chunkCount: cur.chunkCount + 1,
					totalBytes: cur.totalBytes + chunk.byteSize,
				}),
			);
		},
	};

	return Object.freeze({
		blobs,
		index,
		rootDir,
		label: "contract-asserted-replay-fixtures",
		fidelity: "simulated",
	});
}

/**
 * Object-storage port shape (Junction / provider mediated). Not live in default path.
 */
export type ObjectStoragePort = {
	putObject(
		key: string,
		body: Uint8Array,
		meta?: Readonly<Record<string, string>>,
	): Promise<{ etag: string }>;
	getObject(key: string): Promise<Uint8Array | undefined>;
};

/** Adapter: SessionBlobStore over a secretless object-storage port. */
export function createObjectStorageBlobStore(
	port: ObjectStoragePort,
	prefix = "replay/",
): SessionBlobStore {
	return {
		async put(sessionId, seq, events) {
			const payload = JSON.stringify(events);
			const contentHash = sha256(payload);
			const key = `${prefix}${sessionId}/${seq}-${contentHash.slice(7, 23)}.json`;
			await port.putObject(key, Buffer.from(payload, "utf8"), {
				"content-hash": contentHash,
			});
			return Object.freeze({
				schemaVersion: REPLAY_SCHEMA_VERSION,
				sessionId,
				seq,
				contentHash,
				byteSize: Buffer.byteLength(payload, "utf8"),
				blobRef: `obj:${key}`,
				createdAt: new Date().toISOString(),
			});
		},
		async get(blobRef) {
			if (!blobRef.startsWith("obj:")) return undefined;
			const body = await port.getObject(blobRef.slice(4));
			if (!body) return undefined;
			return Object.freeze(
				JSON.parse(Buffer.from(body).toString("utf8")) as RrwebEvent[],
			);
		},
	};
}
