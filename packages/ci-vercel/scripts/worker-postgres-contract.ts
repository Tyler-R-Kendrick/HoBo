import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
	PostgresQueuedJobRepairClaims,
	PostgresWebhookRepairClaims,
} from "@hobo/ci-gh-actions";
import pg from "pg";
import { runRepairs } from "../src/worker.js";
import { PostgresWorkerHealth } from "../src/worker-health.js";

// This lane creates and deletes a randomly named schema in a disposable DB.
const connectionString = process.env.HOBO_CI_TEST_POSTGRES;
if (!connectionString)
	throw new Error("HOBO_CI_TEST_POSTGRES must name a disposable database");
const schema = `ci_${randomBytes(8).toString("hex")}`;
const admin = new pg.Pool({ connectionString });
await admin.query(`CREATE SCHEMA ${schema}`);
const pool = new pg.Pool({
	connectionString,
	options: `-c search_path=${schema}`,
	max: 2,
});
try {
	const claims = new PostgresWebhookRepairClaims(pool);
	const health = new PostgresWorkerHealth(pool);
	await Promise.all([claims.initialize(), health.initialize()]);
	assert.equal(await health.ready(), false);
	await Promise.all([
		health.mark("queue", true),
		health.mark("schedule", true),
		health.mark("repair", true),
	]);
	assert.equal(await health.ready(), true);
	await health.mark("repair", false);
	assert.equal(await health.ready(), false);
	const scan = await claims.startScan("123");
	assert.ok(scan);
	assert.equal(await claims.startScan("123"), undefined);
	await scan.checkpoint(
		"https://api.github.com/app/hook/deliveries?cursor=next",
	);
	await scan.close();
	const resumed = await claims.startScan("123");
	assert.equal(
		resumed?.cursor,
		"https://api.github.com/app/hook/deliveries?cursor=next",
	);
	await resumed?.close();
	const now = Date.now();
	await claims.recordSuccesses("123", ["ok", "ok"], now);
	assert.equal(await claims.wasSuccessful("123", "ok"), true);
	assert.equal(await claims.wasSuccessful("124", "ok"), false);
	const duplicate = await Promise.all(
		Array.from({ length: 10 }, () => claims.claim("123", "same", now)),
	);
	assert.equal(duplicate.filter(Boolean).length, 1);
	const batch = await Promise.all(
		Array.from({ length: 30 }, (_, index) =>
			claims.claim("123", `unique-${index}`, now),
		),
	);
	assert.equal(batch.filter(Boolean).length, 19);
	assert.equal(await claims.limited("123", now), true);
	const queued = new PostgresQueuedJobRepairClaims(pool, "123");
	await queued.initialize();
	const sequential = await Promise.race([
		runRepairs([
			async () => {
				const lock = await claims.startScan("123");
				assert.ok(lock);
				try {
					await claims.wasSuccessful("123", "ok");
					throw new Error("simulated failure");
				} finally {
					await lock.close();
				}
			},
			async () => {
				const lock = await queued.start(["example"]);
				assert.ok(lock);
				try {
					await pool.query("SELECT 1");
					assert.equal(await lock.take(1), true);
					return { more: false, truncated: false };
				} finally {
					await lock.close();
				}
			},
		]),
		new Promise<never>((_resolve, reject) =>
			setTimeout(() => reject(new Error("repair scanners deadlocked")), 5000),
		),
	]);
	assert.equal(sequential.failed, true);
	assert.ok(
		await claims.startScan("123").then(async (lock) => {
			await lock?.close();
			return lock;
		}),
	);
	console.log(
		"Postgres worker health, scan fencing, cursor persistence, success isolation and rate limits passed",
	);
} finally {
	await pool.end();
	await admin.query(`DROP SCHEMA ${schema} CASCADE`);
	await admin.end();
}
