type SessionClient = {
	query(
		sql: string,
		values: string[],
	): Promise<{ rows: { unlocked: boolean }[] }>;
	release(error?: Error | boolean): void;
};

/** A client whose unlock failed must never return a possibly locked session to
 * the pool: advisory locks are reentrant on that same PostgreSQL session. */
export async function unlockAndRelease(client: SessionClient, key: string) {
	let failure: Error | undefined;
	try {
		const result = await client.query(
			"SELECT pg_advisory_unlock(hashtext($1)) AS unlocked",
			[key],
		);
		if (result.rows[0]?.unlocked !== true)
			throw new Error("PostgreSQL session lock was not held");
	} catch (error) {
		failure =
			error instanceof Error ? error : new Error("PostgreSQL unlock failed");
		throw failure;
	} finally {
		client.release(failure);
	}
}
