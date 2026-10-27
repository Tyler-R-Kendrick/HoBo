import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import pg from "pg";
import { PostgresQueuedJobRepairClaims } from "../src/queued-job-repair.js";

// Run only with a disposable PostgreSQL instance.
const connectionString = process.env.HOBO_CI_TEST_POSTGRES;
if (!connectionString)
	throw new Error(
		"HOBO_CI_TEST_POSTGRES must name a disposable PostgreSQL database",
	);
const pool = new pg.Pool({ connectionString, max: 4 });
const appId = `${Date.now()}${randomInt(100_000, 999_999)}`;
try {
	const firstStore = new PostgresQueuedJobRepairClaims(pool, appId);
	const secondStore = new PostgresQueuedJobRepairClaims(pool, appId);
	const keys = ["account-a:1:1:queued", "account-b:2:2:queued"];
	const first = await firstStore.start(keys);
	assert.ok(first);
	assert.equal(first.key, keys[0]);
	// A second worker cannot scan while the first owns the app-wide lock.
	assert.equal(await secondStore.start(keys), undefined);
	assert.equal(await first.take(10), true);
	assert.equal(await first.take(1), false);
	await first.checkpoint(first.cursor, 60_000);
	await first.close();
	// A backlogged or failed repo yields to the next account; its calls share
	// the same durable app-wide rate budget.
	const second = await secondStore.start(keys);
	assert.ok(second);
	assert.equal(second.key, keys[1]);
	assert.equal(await second.take(1), false);
	await second.close();
	console.log(
		"Queued-job scan exclusion, account fairness and rate cap passed",
	);
} finally {
	await pool.query("DELETE FROM hobo_ci_queued_scans WHERE app_id=$1", [appId]);
	await pool.query("DELETE FROM hobo_ci_queued_api_budget WHERE app_id=$1", [
		appId,
	]);
	await pool.end();
}
