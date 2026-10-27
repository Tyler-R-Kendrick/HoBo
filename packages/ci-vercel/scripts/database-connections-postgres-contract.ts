import assert from "node:assert/strict";
import {
	PostgresQueuedJobRepairClaims,
	PostgresWebhookRepairClaims,
} from "@hobo/ci-gh-actions";
import pg from "pg";
import { verifyRepairDatabase } from "../src/database-connections.js";

const url = process.env.HOBO_CI_TEST_POSTGRES;
const otherUrl = process.env.HOBO_CI_TEST_POSTGRES_OTHER;
if (!url || !otherUrl)
	throw new Error("two disposable PostgreSQL databases are required");

const primary = new pg.Pool({ connectionString: url, max: 2 });
const same = new pg.Pool({
	connectionString: url,
	max: 2,
	connectionTimeoutMillis: 1000,
});
const other = new pg.Pool({ connectionString: otherUrl, max: 2 });
try {
	// The second server has the same database and role names; its missing marker
	// must still reject it, even when both pools return the same SQL identity.
	await other.query(`CREATE TABLE IF NOT EXISTS hobo_ci_database_probes (
		id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
	)`);
	await Promise.all([
		verifyRepairDatabase(primary, same),
		verifyRepairDatabase(primary, same),
	]);
	await assert.rejects(verifyRepairDatabase(primary, other));
	const remaining = await primary.query<{ count: string }>(
		"SELECT count(*) AS count FROM hobo_ci_database_probes",
	);
	assert.equal(remaining.rows[0]?.count, "0");
	const webhook = new PostgresWebhookRepairClaims(primary, same);
	const queued = new PostgresQueuedJobRepairClaims(primary, "42", same);
	await webhook.initialize();
	await queued.initialize();
	const first = await webhook.startScan("42");
	const second = await queued.start(["repository-42"]);
	assert.ok(first);
	assert.ok(second);
	try {
		// Both direct sessions are occupied by scan locks. These operations must
		// use the primary pool, rather than waiting for a third direct session.
		await webhook.recordSuccesses("42", ["delivery-42"], Date.now());
		assert.equal(await webhook.claim("42", "delivery-43", Date.now()), true);
	} finally {
		await Promise.all([first.close(), second.close()]);
	}
	process.stdout.write(
		"repair connection identity and cleanup contract passed\n",
	);
} finally {
	await Promise.all([primary.end(), same.end(), other.end()]);
}
