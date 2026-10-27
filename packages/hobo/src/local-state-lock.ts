import { DatabaseSync } from "node:sqlite";

export class LocalStateLockBusyError extends Error {}

/** OS-owned mutex: closing the connection or process death releases ownership. */
export function acquireLocalStateLock(path: string): () => void {
	const database = new DatabaseSync(path);
	try {
		database.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
	} catch (cause) {
		database.close();
		if (
			cause instanceof Error &&
			"errcode" in cause &&
			(cause.errcode === 5 || cause.errcode === 6)
		)
			throw new LocalStateLockBusyError(
				"Another operation holds the local state lock",
				{
					cause,
				},
			);
		throw cause;
	}
	return () => database.close();
}
