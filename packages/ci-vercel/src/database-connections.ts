import { randomUUID } from "node:crypto";

/** Session advisory locks must use a direct PostgreSQL connection, not Neon's
 * transaction-mode PgBouncer endpoint. Other direct endpoints are supplied by
 * the operator and cannot be identified reliably from a URL. */
export function validateDirectDatabaseUrl(value: string | undefined): string {
	if (!value) throw new Error("DATABASE_URL_UNPOOLED is required for repair");
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error("invalid unpooled database URL");
	}
	const host = parsed.hostname.toLowerCase();
	if (
		(parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
		!host ||
		host.includes("%") ||
		host.endsWith(".") ||
		!parsed.pathname ||
		parsed.searchParams.has("host") ||
		parsed.searchParams.has("hostaddr") ||
		parsed.searchParams.has("service") ||
		(host.endsWith(".neon.tech") && host.split(".")[0]?.endsWith("-pooler"))
	)
		throw new Error("repair requires a direct PostgreSQL URL");
	return value;
}

type Result = {
	rows: { database?: string; username?: string }[];
	rowCount: number | null;
};
type Client = {
	query(sql: string, values?: unknown[]): Promise<Result>;
	release(error?: Error | boolean): void;
};
type PrimaryPool = { connect(): Promise<Client> };
type DirectPool = { query(sql: string, values?: unknown[]): Promise<Result> };

/** Direct connections are scoped to one repair invocation, including failures. */
export async function withRepairPool<T extends { end(): Promise<void> }, R>(
	pool: T,
	run: (pool: T) => Promise<R>,
): Promise<R> {
	try {
		return await run(pool);
	} finally {
		await pool.end();
	}
}

/** Verify two endpoints reach the same database and role. A random committed
 * marker prevents separate servers with matching database names and roles from
 * passing. Old markers are bounded after an interrupted startup. */
export async function verifyRepairDatabase(
	primary: PrimaryPool,
	direct: DirectPool,
) {
	const marker = randomUUID();
	const client = await primary.connect();
	let inserted = false;
	let transactionOpen = false;
	let discard = false;
	let cleanupFailure: unknown;
	let cleanupFailed = false;
	try {
		await client.query("BEGIN");
		transactionOpen = true;
		await client.query(
			"SELECT pg_advisory_xact_lock(hashtext('hobo-ci-database-probe-v1'))",
		);
		await client.query(`CREATE TABLE IF NOT EXISTS hobo_ci_database_probes (
			id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
		)`);
		await client.query(
			"DELETE FROM hobo_ci_database_probes WHERE created_at < now() - interval '1 day'",
		);
		const identity = await client.query(
			"SELECT current_database() AS database, current_user AS username",
		);
		await client.query("INSERT INTO hobo_ci_database_probes (id) VALUES ($1)", [
			marker,
		]);
		await client.query("COMMIT");
		transactionOpen = false;
		inserted = true;
		const found = await direct.query(
			"SELECT current_database() AS database, current_user AS username FROM hobo_ci_database_probes WHERE id = $1",
			[marker],
		);
		if (
			found.rowCount !== 1 ||
			!identity.rows[0] ||
			found.rows[0]?.database !== identity.rows[0].database ||
			found.rows[0]?.username !== identity.rows[0].username
		)
			throw new Error(
				"repair database does not match the primary database and role",
			);
	} catch (error) {
		if (transactionOpen) {
			try {
				await client.query("ROLLBACK");
				transactionOpen = false;
			} catch {
				discard = true;
			}
		} else if (!inserted) {
			// A failed BEGIN can leave the transaction state unknown.
			discard = true;
		}
		throw error;
	} finally {
		try {
			if (inserted)
				await client.query(
					"DELETE FROM hobo_ci_database_probes WHERE id = $1",
					[marker],
				);
		} catch (error) {
			discard = true;
			cleanupFailed = true;
			cleanupFailure = error;
		} finally {
			client.release(discard);
		}
	}
	if (cleanupFailed) throw cleanupFailure;
}
