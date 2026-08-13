import { DatabaseSync } from "node:sqlite";

/**
 * One partition, one active writer (ADR-0135).
 * Preferred replica target: NATS JetStream Object Store via Litestream.
 * Offline fallback: file:// under HOBO_HOME.
 */
export function open{{name}}Store(path: string): DatabaseSync {
	const db = new DatabaseSync(path);
	db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
	return db;
}
