import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { clone, create } from "@bufbuild/protobuf";
import { Pool } from "pg";
import {
	ConfigurationSchema,
	JobSchema,
	OfferSchema,
	SandboxAllowanceSchema,
	SandboxMeasuredUsageSchema,
	SandboxPricingSchema,
} from "../src/_generated/ci_pb.js";
import { parseConfiguration } from "../src/config.js";
import { PostgresCiStore } from "../src/postgres-store.js";
import {
	sandboxProxyOnlyUsageQuote,
	sandboxUsageQuote,
} from "../src/sandbox-pricing.js";
import { LeaseStore } from "../src/store.js";

// Dedicated integration lane. Use a disposable local PostgreSQL, never production.
const connectionString = process.env.HOBO_CI_TEST_POSTGRES;
if (!connectionString)
	throw new Error(
		"HOBO_CI_TEST_POSTGRES must name a disposable PostgreSQL database",
	);
const partition = `test-${randomUUID()}`;
const migrationPartition = `test-${randomUUID()}`;
const isolationPartition = `test-${randomUUID()}`;
const isolatedOnlyPartition = `test-${randomUUID()}`;
const proxyPartition = `test-${randomUUID()}`;
const pool = new Pool({ connectionString, max: 12 });
const store = new PostgresCiStore(pool, partition);
const second = new PostgresCiStore(pool, partition);
const now = "2026-10-27T12:00:00Z";
try {
	const config = parseConfiguration(
		await readFile(
			new URL(
				"../data-models/fixtures/valid/configuration.json",
				import.meta.url,
			),
			"utf8",
		),
	);
	const account = config.accounts[0];
	const offer = account?.offers[0];
	if (!account || !offer) throw new Error("fixture missing");
	account.budgetMicros = 100000;
	account.maxRuntimeMinutes = 1;
	account.startupMinutes = 1;
	offer.enabled = true;
	offer.bridgeAcknowledged = true;
	offer.budgetMicros = 100000;
	offer.priceMicrosPerMinute = 1000;
	offer.freeMinutes = 2;
	offer.concurrency = 1;
	offer.observedAt = "2026-10-27T11:00:00Z";
	offer.validUntil = "2026-10-28T12:00:00Z";
	assert.equal((await store.configure(config, 0, now)).revision, 1);
	const job = (id: number) =>
		create(JobSchema, {
			id,
			runId: id + 100,
			runAttempt: 1,
			repositoryId: 1,
			installationId: 1,
			repository: "example/repository",
			labels: ["hobo"],
			action: "queued",
		});
	const results = await Promise.all(
		Array.from({ length: 20 }, (_, i) =>
			(i % 2 ? store : second).reserve(account, job(i + 1), now, 1),
		),
	);
	const leases = results.filter(Boolean);
	assert.equal(leases.length, 1);
	const lease = leases[0];
	if (!lease) throw new Error("reservation missing");
	assert.equal((await second.all()).length, 1);
	await assert.rejects(
		store.configureWithRecord(config, 1, now, "invalid space", "example", "{}"),
	);
	assert.equal((await second.configuration())?.revision, 1);
	offer.concurrency = 2;
	const desired = JSON.stringify({
		accountId: "example",
		tenantId: "example",
		pool: { label: "hobo", os: "linux", architecture: "x64" },
		providers: [
			{
				id: offer.id,
				kind: offer.provider,
				connectionRef: offer.providerAccountId,
				runsOn: offer.runsOn,
				enabled: false,
			},
		],
		budget: {
			scope: "ci-account",
			currency: "USD",
			limitMicros: 100000,
			period: "manual",
			timeZone: "UTC",
		},
		routing: {
			strategy: "lowest-total-incremental-cost",
			noEligibleProvider: "queue",
			unknownAllocation: "zero",
		},
		thresholds: [],
	});
	assert.equal(
		(
			await store.configureWithRecord(
				config,
				1,
				now,
				"ci-policy:example",
				"example",
				desired,
			)
		).revision,
		2,
	);
	assert.equal((await second.policySnapshot()).policies.length, 1);
	assert.equal(await second.reserve(account, job(1000), now, 2), undefined);
	await assert.rejects(
		store.reserve(account, job(999), now, 1),
		/revision conflict/,
	);
	await assert.rejects(
		second.transition(
			lease.id,
			["reserved"],
			(entry) => {
				entry.state = "dispatching";
			},
			"ci.DispatchRequested",
			now,
			1,
		),
		/revision conflict/,
	);
	assert.equal((await second.get(lease.id))?.state, "reserved");
	const claimed = await Promise.all([
		store.transition(
			lease.id,
			["reserved"],
			(entry) => {
				entry.state = "dispatching";
			},
			"ci.DispatchRequested",
			now,
			2,
		),
		second.transition(
			lease.id,
			["reserved"],
			(entry) => {
				entry.state = "dispatching";
			},
			"ci.DispatchRequested",
			now,
			2,
		),
	]);
	assert.equal(claimed.filter(Boolean).length, 1);
	const intents = await second.latestLeaseIntents([lease.id, "no-such-lease"]);
	assert.equal(intents.length, 1);
	assert.equal(intents[0]?.type, "ci.DispatchRequested");
	await store.transition(
		lease.id,
		["dispatching"],
		() => {},
		"ci.SandboxCreated",
		now,
		2,
	);
	assert.deepEqual(
		(await second.latestLeaseIntents([lease.id]))
			.map((event) => event.type)
			.sort(),
		["ci.DispatchRequested", "ci.SandboxCreated"],
	);
	assert.equal((await store.activeLeases()).length, 1);
	assert.equal((await store.accountLeases("other-account")).length, 0);
	const observed = await store.get(lease.id);
	if (!observed) throw new Error("lease missing");
	await second.transition(
		lease.id,
		["dispatching"],
		(entry) => {
			entry.state = "claiming";
			entry.hostRunId = 22;
		},
		"ci.RunnerClaimed",
		now,
		2,
	);
	assert.equal(
		await store.settleObserved(lease.id, 22, 1, now, undefined, now, observed),
		undefined,
	);
	assert.equal((await second.get(lease.id))?.state, "claiming");
	assert.deepEqual(
		(await store.latestLeaseIntents([lease.id]))
			.map((event) => event.type)
			.sort(),
		["ci.DispatchRequested", "ci.RunnerClaimed", "ci.SandboxCreated"],
	);
	assert.deepEqual(await store.latestLeaseIntents([]), []);
	const sandbox = await store.transition(
		lease.id,
		["claiming"],
		(entry) => {
			entry.state = "running";
			entry.provider = "vercel";
			entry.sandboxSessionId = "session-1";
			entry.sandboxCommandId = "command-1";
			entry.sandboxPricing = create(SandboxPricingSchema, {
				vcpus: 2,
				memoryMb: 4096,
				maxEgressBytes: 10,
			});
		},
		"ci.SandboxStarted",
		now,
		2,
	);
	if (!sandbox) throw new Error("sandbox test lease missing");
	await assert.rejects(
		store.configureSandboxEgress("wrong", lease.id, "session-1", 10, 2),
		/binding invalid/,
	);
	await assert.rejects(
		store.configureSandboxEgress(account.id, lease.id, "session-1", 10, 1),
		/revision conflict/,
	);
	await store.configureSandboxEgress(account.id, lease.id, "session-1", 10, 2);
	await store.configureSandboxEgress(account.id, lease.id, "session-1", 10, 2);
	await assert.rejects(
		store.configureSandboxEgress(account.id, lease.id, "session-1", 11, 2),
		/binding invalid/,
	);
	assert.equal(await store.reserveSandboxEgress("wrong", 1), false);
	await assert.rejects(
		store.reserveSandboxEgress("session-1", Number.MAX_SAFE_INTEGER + 1),
		/invalid egress/,
	);
	const quotas = await Promise.all(
		Array.from({ length: 20 }, () =>
			store.reserveSandboxEgress("session-1", 1),
		),
	);
	assert.equal(quotas.filter(Boolean).length, 10);
	assert.equal(await second.reserveSandboxEgress("session-1", 1), false);
	assert.equal(
		await store.sandboxEgressUsage(account.id, lease.id, "session-1"),
		10,
	);
	assert.equal(
		await store.sandboxEgressUsage("wrong", lease.id, "session-1"),
		undefined,
	);
	const fence = {
		state: sandbox.state,
		runnerId: sandbox.runnerId,
		sandboxSessionId: sandbox.sandboxSessionId,
		sandboxCommandId: sandbox.sandboxCommandId,
		sandboxStage: sandbox.sandboxStage,
	};
	assert.equal(
		await second.settleSandboxObserved(
			lease.id,
			now,
			now,
			{ ...fence, sandboxCommandId: "stale" },
			42,
		),
		undefined,
	);
	await assert.rejects(
		second.settleSandboxObserved(lease.id, now, now, fence, -1),
		/invalid sandbox settlement/,
	);
	await assert.rejects(
		second.settleSandboxObserved(lease.id, now, now, fence, 100),
		/sandbox free allocation accounting unavailable/,
	);
	await store.transition(
		lease.id,
		["running"],
		(entry) => {
			entry.reservedFreeMinutes = 0;
		},
		"ci.ReservationAdjustedForTest",
		now,
		2,
	);
	const settled = await second.settleSandboxObserved(
		lease.id,
		now,
		now,
		fence,
		110000,
	);
	assert.equal(settled?.paidMicros, 110000);
	assert.equal(await store.reserveSandboxEgress("session-1", 1), false);
	assert(
		(await store.events()).some((event) => event.type === "ci.BudgetOverrun"),
	);
	const input = {
		deliveryId: "test-delivery-1",
		event: "workflow_job",
		installationId: 1,
		repositoryId: 1,
		rawBody: new TextEncoder().encode('{"action":"queued"}'),
		receivedAt: now,
	};
	assert.equal(await store.hasWebhook(input.deliveryId), false);
	const inserted = await Promise.all(
		Array.from({ length: 10 }, () => store.acceptWebhook(input)),
	);
	assert.equal(inserted.filter((result) => !result.duplicate).length, 1);
	await assert.rejects(
		second.acceptWebhook({
			...input,
			rawBody: new TextEncoder().encode("different"),
		}),
		/conflicting/,
	);
	const first = await store.claimWebhook(now, 1000);
	assert(first);
	assert.equal(await second.claimWebhook(now, 1000), undefined);
	const next = await second.claimWebhook("2026-10-27T12:00:02Z", 1000);
	assert(next);
	assert.notEqual(first.token, next.token);
	assert.equal(await store.ackWebhook(first.deliveryId, first.token), false);
	assert.equal(await second.ackWebhook(next.deliveryId, next.token), true);
	const saved = await pool.query<{ size: number }>(
		"SELECT octet_length(raw_body) AS size FROM hobo_ci_inbox WHERE partition_id=$1 AND delivery_id=$2",
		[partition, input.deliveryId],
	);
	assert.equal(saved.rows[0]?.size, 0);
	assert.equal(await store.hasWebhook(input.deliveryId), true);
	const aliases = await Promise.all(
		Array.from({ length: 40 }, (_, i) =>
			store.acceptWebhook({ ...input, deliveryId: `forged-alias-${i}` }),
		),
	);
	assert(aliases.every((result) => result.duplicate));
	assert.equal(
		(
			await pool.query<{ n: string }>(
				"SELECT count(*)::text AS n FROM hobo_ci_inbox WHERE partition_id=$1 AND body_hash=$2",
				[
					partition,
					(
						await pool.query<{ body_hash: string }>(
							"SELECT body_hash FROM hobo_ci_inbox WHERE partition_id=$1 AND delivery_id=$2",
							[partition, input.deliveryId],
						)
					).rows[0]?.body_hash,
				],
			)
		).rows[0]?.n,
		"1",
	);
	assert.deepEqual(
		await store.acceptWebhook({
			...input,
			deliveryId: "expired-alias",
			receivedAt: "2026-10-28T12:00:01Z",
		}),
		{ duplicate: false },
	);
	const expiredClaim = await store.claimWebhook("2026-10-28T12:00:01Z", 1000);
	if (!expiredClaim) throw new Error("expired replay not accepted");
	assert(await store.ackWebhook(expiredClaim.deliveryId, expiredClaim.token));
	const ignored = {
		...input,
		deliveryId: "ignored",
		installationId: 77,
		rawBody: new TextEncoder().encode("ignored body"),
	};
	assert.deepEqual(await store.acceptIgnoredWebhook(ignored), {
		duplicate: false,
	});
	assert(await store.hasWebhook("ignored"));
	assert.equal(
		(
			await pool.query<{ n: number }>(
				"SELECT octet_length(raw_body) AS n FROM hobo_ci_inbox WHERE partition_id=$1 AND delivery_id=$2",
				[partition, "ignored"],
			)
		).rows[0]?.n,
		0,
	);
	assert.equal(await store.claimWebhook(now, 1000), undefined);
	assert.deepEqual(await store.acceptWebhook(input), { duplicate: true });
	await assert.rejects(
		second.acceptWebhook({
			...input,
			rawBody: new TextEncoder().encode("other"),
		}),
		/conflicting/,
	);
	assert.equal(
		await store.claimWebhook("2026-10-27T12:01:00Z", 1000),
		undefined,
	);
	const large = {
		...input,
		deliveryId: "test-large",
		rawBody: new Uint8Array(1024 * 1024).fill(88),
	};
	await store.acceptWebhook(large);
	const largeClaim = await store.claimWebhook("2026-10-27T12:02:00Z", 1000);
	if (!largeClaim) throw new Error("large delivery not claimed");
	assert(await store.ackWebhook(largeClaim.deliveryId, largeClaim.token));
	assert.equal(
		(
			await pool.query<{ size: number }>(
				"SELECT octet_length(raw_body) AS size FROM hobo_ci_inbox WHERE partition_id=$1 AND delivery_id=$2",
				[partition, large.deliveryId],
			)
		).rows[0]?.size,
		0,
	);
	assert.deepEqual(await store.acceptWebhook(large), { duplicate: true });
	const poison = {
		...input,
		deliveryId: "test-poison",
		rawBody: new TextEncoder().encode('{"action":"queued","job":1}'),
	};
	const good = {
		...input,
		deliveryId: "test-good",
		rawBody: new TextEncoder().encode('{"action":"queued","job":2}'),
	};
	await store.acceptWebhook(poison);
	await store.acceptWebhook(good);
	const poisoned = await store.claimWebhook(now, 1000);
	if (!poisoned) throw new Error("poison delivery not claimed");
	assert.equal(poisoned.deliveryId, poison.deliveryId);
	assert.equal(
		await store.failWebhook(poisoned.deliveryId, poisoned.token, now),
		"retry",
	);
	const goodClaim = await store.claimWebhook(now, 1000);
	if (!goodClaim) throw new Error("newer delivery blocked");
	assert.equal(goodClaim.deliveryId, good.deliveryId);
	assert(await store.ackWebhook(goodClaim.deliveryId, goodClaim.token));
	for (let attempt = 2; attempt <= 8; attempt++) {
		const time = new Date(Date.parse(now) + attempt * 3600000).toISOString();
		const retry = await store.claimWebhook(time, 1000);
		if (!retry) throw new Error("due retry missing");
		assert.equal(retry.deliveryId, poison.deliveryId);
		assert.equal(
			await store.failWebhook(retry.deliveryId, retry.token, time),
			attempt === 8 ? "quarantined" : "retry",
		);
	}
	assert.equal(
		(await store.quarantinedWebhooks(account.id, 2))[0]?.deliveryId,
		poison.deliveryId,
	);
	assert.deepEqual(await store.quarantinedWebhooks("other-account", 2), []);
	assert.equal(
		await store.retryQuarantinedWebhook("other-account", 2, poison.deliveryId),
		false,
	);
	await assert.rejects(
		store.retryQuarantinedWebhook(account.id, 1, poison.deliveryId),
		/revision conflict/,
	);
	await assert.rejects(
		store.quarantinedWebhooks(account.id, 1),
		/revision conflict/,
	);
	assert(
		await second.retryQuarantinedWebhook(account.id, 2, poison.deliveryId),
	);
	const replay = await store.claimWebhook("2026-10-28T00:00:00Z", 1000);
	if (!replay) throw new Error("quarantined delivery not replayed");
	assert.deepEqual(replay.rawBody, poison.rawBody);
	assert(await store.ackWebhook(replay.deliveryId, replay.token));
	await store.putControlRecordMonotonic(
		"setup:test",
		"example",
		'{"status":"ready"}',
		now,
		"ready",
	);
	await second.putControlRecordMonotonic(
		"setup:test",
		"example",
		'{"status":"pending"}',
		now,
		"ready",
	);
	assert.match(
		(await store.controlRecord("setup:test"))?.bodyJson ?? "",
		/ready/,
	);
	const revived = new PostgresCiStore(pool, partition);
	assert.equal((await revived.configuration())?.revision, 2);
	assert.equal((await revived.all()).length, 1);
	assert(await revived.ready());
	assert.equal((await revived.activeLeases()).length, 0);
	const enabledDesired = JSON.parse(desired);
	enabledDesired.providers[0].enabled = true;
	await store.configureWithRecord(
		config,
		2,
		now,
		"ci-policy:example",
		"example",
		JSON.stringify(enabledDesired),
	);
	assert.equal(
		await store.reserve(account, job(1001), now, 3),
		undefined,
		"confirmed overrun must block later admission",
	);
	// Import a previously durable SQLite snapshot exactly once, preserving records,
	// queued jobs, raw inbox bytes, deduplication and append order.
	const sqlite = new DatabaseSync(":memory:");
	if (!("serialize" in sqlite))
		throw new Error("Node SQLite snapshot support required");
	// SAFETY: Node 24 supplies serialize and the runtime capability is checked above.
	const legacyDb = sqlite as DatabaseSync & { serialize(): Uint8Array };
	const legacy = new LeaseStore(":memory:", legacyDb);
	legacy.configure(config, 0, now);
	legacy.queue(job(9000), now);
	const legacyLease = legacy.reserve(account, job(9001), now);
	if (!legacyLease) throw new Error("legacy reservation missing");
	legacyDb
		.prepare("INSERT INTO assigned_jobs(job_key,lease_id) VALUES (?,?)")
		.run("1:9999:1", legacyLease.id);
	const terminalJob = job(9002);
	terminalJob.action = "completed";
	legacy.observe(terminalJob, now);
	legacy.putControlRecord("legacy:test", "example", '{"status":"ok"}', now);
	legacyDb.exec(
		`CREATE TABLE ci_host_inbox (delivery_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, event TEXT NOT NULL, installation_id INTEGER NOT NULL, repository_id INTEGER NOT NULL, raw_body BLOB NOT NULL, received_at TEXT NOT NULL, claim_token TEXT, claim_until INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0)`,
	);
	legacyDb
		.prepare(
			"INSERT INTO ci_host_inbox(delivery_id,fingerprint,event,installation_id,repository_id,raw_body,received_at) VALUES (?,?,?,?,?,?,?)",
		)
		.run(
			"legacy-delivery",
			"legacy-fingerprint",
			"workflow_job",
			1,
			1,
			new Uint8Array([1, 2, 3]),
			now,
		);
	const legacyBytes = Buffer.from(legacyDb.serialize());
	legacy.close();
	await pool.query(
		"INSERT INTO hobo_ci_partitions(id,snapshot,storage_version) VALUES($1,$2,0)",
		[migrationPartition, legacyBytes],
	);
	const migrating = new PostgresCiStore(pool, migrationPartition);
	await Promise.all([
		migrating.initialize(),
		new PostgresCiStore(pool, migrationPartition).initialize(),
	]);
	assert.equal((await migrating.configuration())?.revision, 1);
	assert.equal((await migrating.pendingJobs())[0]?.id, 9000);
	assert.equal(
		(await migrating.controlRecord("legacy:test"))?.accountId,
		"example",
	);
	assert.deepEqual(
		(await migrating.events()).map((event) => event.type),
		[
			"ci.ConfigurationChanged",
			"ci.JobQueued",
			"ci.LeaseReserved",
			"ci.JobCompleted",
			"ci.ControlRecordUpdated",
		],
	);
	assert.equal((await migrating.get(legacyLease.id))?.state, "reserved");
	assert.equal(
		(await migrating.assignedJob(job(9999)))?.leaseId,
		legacyLease.id,
	);
	await migrating.transition(
		legacyLease.id,
		["reserved"],
		(entry) => {
			entry.state = "running";
		},
		"ci.RunnerStarted",
		now,
		1,
	);
	const other = await migrating.reserve(account, job(9003), now, 1);
	if (!other) throw new Error("other reservation missing");
	const actual = job(9003);
	actual.action = "in_progress";
	actual.runnerName = legacyLease.runnerName;
	await migrating.observe(actual, now, 1);
	assert.equal((await migrating.get(other.id))?.state, "cancelled");
	const beforeAssignment = await migrating.assignedJob(actual);
	assert.equal(beforeAssignment?.leaseId, legacyLease.id);
	assert.equal(
		await migrating.clearAssignedJob(
			actual,
			legacyLease.id,
			beforeAssignment?.version ?? "",
			now,
			1,
		),
		false,
	);
	await migrating.observe(actual, now, 1);
	const assignment = await migrating.assignedJob(actual);
	assert.notEqual(assignment?.version, beforeAssignment?.version);
	assert.equal(await migrating.reserve(account, job(9003), now, 1), undefined);
	await migrating.queue(job(9003), now, 1);
	assert.equal(
		(await migrating.pendingJobs()).some((entry) => entry.id === 9003),
		false,
	);
	const contradictory = job(9004);
	contradictory.action = "in_progress";
	contradictory.runnerName = legacyLease.runnerName;
	await assert.rejects(
		migrating.observe(contradictory, now, 1),
		/assignment conflict/,
	);
	await assert.rejects(
		migrating.clearAssignedJob(
			actual,
			legacyLease.id,
			assignment?.version ?? "",
			now,
			0,
		),
		/revision conflict/,
	);
	await migrating.settle(legacyLease.id, 0, 1, now);
	assert.equal(
		await migrating.clearAssignedJob(
			actual,
			legacyLease.id,
			beforeAssignment?.version ?? "",
			now,
			1,
		),
		false,
	);
	assert.equal(
		await migrating.clearAssignedJob(
			actual,
			"wrong",
			assignment?.version ?? "",
			now,
			1,
		),
		false,
	);
	assert.equal(
		await migrating.clearAssignedJob(
			actual,
			legacyLease.id,
			assignment?.version ?? "",
			now,
			1,
		),
		true,
	);
	await migrating.queue(job(9002), now, 1);
	assert.equal(
		(await migrating.pendingJobs()).some((entry) => entry.id === 9002),
		false,
	);
	assert.deepEqual(
		await migrating.acceptWebhook({
			...input,
			deliveryId: "legacy-replay-alias",
			rawBody: new Uint8Array([1, 2, 3]),
		}),
		{ duplicate: true },
	);
	const migratedDelivery = await migrating.claimWebhook(now, 1000);
	assert.deepEqual(migratedDelivery?.rawBody, new Uint8Array([1, 2, 3]));
	assert(
		await migrating.ackWebhook(
			"legacy-delivery",
			migratedDelivery?.token ?? "",
		),
	);
	await assert.rejects(
		pool.query("UPDATE hobo_ci_partitions SET snapshot=$2 WHERE id=$1", [
			migrationPartition,
			legacyBytes,
		]),
	);
	assert(
		(
			await pool.query(
				"SELECT 1 FROM hobo_ci_snapshot_backups WHERE partition_id=$1",
				[migrationPartition],
			)
		).rowCount,
	);
	// Isolated jobs may never select an unsafe GitHub bridge, including an
	// earlier reservation created before repository trust became narrower.
	const isolatedStore = new PostgresCiStore(pool, isolationPartition);
	const isolatedConfig = clone(ConfigurationSchema, config);
	const isolatedAccount = isolatedConfig.accounts[0];
	if (!isolatedAccount) throw new Error("missing isolation account");
	const isolatedOffer = create(OfferSchema, {
		...offer,
		id: "sandbox",
		provider: "vercel",
		providerAccountId: "vercel-account",
		backend: "sandbox",
		freeMinutes: 0,
		sandboxAllowance: create(SandboxAllowanceSchema, {
			cpuVcpuMs: 240000,
			memoryMbMs: 491520000,
			egressBytes: 11,
			creations: 1,
			proxyBytes: 10,
			proxySessions: 1,
		}),
		sandboxPricing: create(SandboxPricingSchema, {
			vcpus: 2,
			memoryMb: 4096,
			cpuMicrosPerVcpuHour: 1,
			memoryMicrosPerGbHour: 1,
			creationMicros: 100,
			maxEgressBytes: 10,
			egressMicrosPerGb: 1,
			proxyMicrosPerGb: 1,
			proxyFixedMicros: 1,
			bootstrapFixedMicros: 1,
			networkHeadroomBytes: 1,
		}),
	});
	isolatedAccount.offers.push(isolatedOffer);
	// Even if a caller forgets to mark a private push as isolated, the stored
	// connection policy prevents this repository from selecting a bridge.
	const isolatedOnlyStore = new PostgresCiStore(pool, isolatedOnlyPartition);
	const isolatedOnlyConfig = clone(ConfigurationSchema, isolatedConfig);
	const isolatedOnlyConnection = isolatedOnlyConfig.connections[0];
	const isolatedOnlyAccount = isolatedOnlyConfig.accounts[0];
	if (!isolatedOnlyConnection || !isolatedOnlyAccount)
		throw new Error("missing isolated-only connection");
	isolatedOnlyConnection.isolatedOnly = true;
	isolatedOnlyConnection.acceptAllMatchingRepositoryJobs = true;
	isolatedOnlyConnection.publicRepositoryAcknowledged = true;
	isolatedOnlyConnection.allowedEvents = [];
	isolatedOnlyConnection.allowedRefs = [];
	isolatedOnlyConnection.bridgeWorkflow = "";
	isolatedOnlyConnection.bridgeSha = "";
	isolatedOnlyConnection.bridgeRef = "";
	isolatedOnlyConnection.dispatcherActorId = 0;
	await isolatedOnlyStore.configure(isolatedOnlyConfig, 0, now);
	const privateIsolated = await isolatedOnlyStore.reserve(
		isolatedOnlyAccount,
		job(5010),
		now,
		1,
	);
	assert.equal(privateIsolated?.provider, "vercel");
	const widened = clone(ConfigurationSchema, isolatedOnlyConfig);
	const widenedConnection = widened.connections[0];
	const originalConnection = isolatedConfig.connections[0];
	if (!widenedConnection || !originalConnection) throw new Error("fixture");
	Object.assign(widenedConnection, {
		isolatedOnly: false,
		acceptAllMatchingRepositoryJobs: false,
		allowedEvents: originalConnection.allowedEvents,
		allowedRefs: originalConnection.allowedRefs,
		bridgeWorkflow: originalConnection.bridgeWorkflow,
		bridgeSha: originalConnection.bridgeSha,
		bridgeRef: originalConnection.bridgeRef,
		dispatcherActorId: originalConnection.dispatcherActorId,
	});
	await assert.rejects(
		isolatedOnlyStore.configure(widened, 1, now),
		/active lease/,
	);
	await isolatedStore.configure(isolatedConfig, 0, now);
	const privateJob = job(5000);
	const bridgeLease = await isolatedStore.reserve(
		isolatedAccount,
		privateJob,
		now,
		1,
	);
	assert(bridgeLease);
	assert.notEqual(bridgeLease.provider, "vercel");
	const publicJob = job(5000);
	publicJob.isolatedRequired = true;
	assert.equal(
		await isolatedStore.reserve(isolatedAccount, publicJob, now, 1),
		undefined,
	);
	assert.equal((await isolatedStore.get(bridgeLease.id))?.state, "cancelled");
	const native = await isolatedStore.reserve(
		isolatedAccount,
		publicJob,
		now,
		1,
	);
	if (!native) throw new Error("sandbox reservation missing");
	assert.equal(native.provider, "vercel");
	assert.equal(native.reservedFreeMinutes, 0);
	assert(native.reservedPaidMicros > 0);
	assert.equal(native.sandboxPricing?.vcpus, 2);
	assert.equal(native.sandboxReservedAllowance?.creations, 1);
	for (const field of [
		"cpuVcpuMs",
		"memoryMbMs",
		"egressBytes",
		"creations",
		"proxyBytes",
		"proxySessions",
	] as const)
		assert.equal(
			native.sandboxReservedAllowance?.[field],
			isolatedOffer.sandboxAllowance?.[field],
		);
	const concurrentJob = job(5002);
	concurrentJob.isolatedRequired = true;
	const concurrent = await isolatedStore.reserve(
		isolatedAccount,
		concurrentJob,
		now,
		1,
	);
	if (!concurrent) throw new Error("concurrent sandbox missing");
	for (const field of [
		"cpuVcpuMs",
		"memoryMbMs",
		"egressBytes",
		"creations",
		"proxyBytes",
		"proxySessions",
	] as const)
		assert.equal(concurrent.sandboxReservedAllowance?.[field], 0);
	const running = await isolatedStore.transition(
		native.id,
		["reserved"],
		(entry) => {
			entry.state = "running";
			entry.sandboxSessionId = "sandbox-test";
			entry.sandboxCommandId = "cmd";
			entry.sandboxStage = "running";
		},
		"ci.SandboxStarted",
		now,
		1,
	);
	if (!running) throw new Error("sandbox transition missing");
	await assert.rejects(
		isolatedStore.settle(native.id, 0, 1, now),
		/native cost settlement/,
	);
	const nativeFence = {
		state: running.state,
		runnerId: running.runnerId,
		sandboxSessionId: running.sandboxSessionId,
		sandboxCommandId: running.sandboxCommandId,
		sandboxStage: running.sandboxStage,
	};
	await assert.rejects(
		isolatedStore.settleSandboxObserved(native.id, now, now, nativeFence, 1),
		/allowance missing/,
	);
	await assert.rejects(
		isolatedStore.settleSandboxObserved(
			native.id,
			now,
			now,
			nativeFence,
			1,
			undefined,
			create(SandboxAllowanceSchema, { creations: 2 }),
		),
		/invalid sandbox usage/,
	);
	await assert.rejects(
		isolatedStore.settleSandboxObserved(
			native.id,
			now,
			"2026-10-29T12:00:00Z",
			nativeFence,
			1,
			undefined,
			create(SandboxAllowanceSchema, { creations: 1 }),
		),
		/allowance expired/,
	);
	await isolatedStore.settleSandboxObserved(
		native.id,
		now,
		now,
		nativeFence,
		1,
		undefined,
		create(SandboxAllowanceSchema, {
			cpuVcpuMs: 240000,
			memoryMbMs: 491520000,
			egressBytes: 11,
			creations: 1,
			proxyBytes: 10,
			proxySessions: 1,
		}),
	);

	const nextPublic = job(5001);
	nextPublic.isolatedRequired = true;
	const nextNative = await isolatedStore.reserve(
		isolatedAccount,
		nextPublic,
		now,
		1,
	);
	assert(nextNative);
	assert.equal(nextNative.reservedFreeMinutes, 0);
	assert.equal(nextNative.sandboxReservedAllowance?.creations, 0);
	for (const field of [
		"cpuVcpuMs",
		"memoryMbMs",
		"egressBytes",
		"creations",
		"proxyBytes",
		"proxySessions",
	] as const)
		assert.equal(nextNative.sandboxReservedAllowance?.[field], 0);
	assert(nextNative.reservedPaidMicros > 0);
	// Two-VM quota, cleanup and settlement are tested against an actual PG lock.
	const proxyStore = new PostgresCiStore(pool, proxyPartition);
	const proxyConfig = clone(ConfigurationSchema, isolatedConfig);
	const proxyAccount = proxyConfig.accounts[0];
	if (!proxyAccount) throw new Error("missing proxy account");
	const proxyOffer = proxyAccount.offers.find(
		(entry) => entry.id === "sandbox",
	);
	if (!proxyOffer?.sandboxPricing) throw new Error("missing proxy offer");
	proxyOffer.priceMicrosPerMinute = 0;
	proxyOffer.sandboxAllowance = undefined;
	Object.assign(proxyOffer.sandboxPricing, {
		proxyVmRequired: true,
		proxyVmVcpus: 1,
		proxyVmMemoryMb: 2048,
		proxyVmExtraMs: 60000,
		proxyVmNetworkBytes: 20,
		proxyVmNetworkHeadroomBytes: 1,
		region: "iad1",
		plan: "hobby",
		proxyControlMaxCalls: 3,
		proxyControlCallMicros: 1,
	});
	await proxyStore.configure(proxyConfig, 0, now);
	const proxyJob = job(7000);
	proxyJob.isolatedRequired = true;
	const twoLease = await proxyStore.reserve(proxyAccount, proxyJob, now, 1);
	if (!twoLease) throw new Error("two VM reservation missing");
	const token = "a".repeat(64);
	const created = await proxyStore.transition(
		twoLease.id,
		["reserved"],
		(entry) => {
			entry.state = "dispatching";
			entry.sandboxStage = "pending";
			entry.proxySandboxName = "proxy-test";
			entry.proxySandboxSessionId = "proxy-session";
			entry.proxySandboxStage = "created";
		},
		"ci.ProxyCreated",
		now,
		1,
	);
	if (!created) throw new Error("proxy state missing");
	await proxyStore.configureSandboxProxy(
		proxyAccount.id,
		twoLease.id,
		"proxy-session",
		token,
		1,
	);
	assert.equal(await proxyStore.authenticateSandboxProxy(token), undefined);
	const live = await proxyStore.transition(
		twoLease.id,
		["dispatching"],
		(entry) => {
			entry.state = "running";
			entry.sandboxName = "guest-test";
			entry.sandboxSessionId = "guest-session";
			entry.sandboxStage = "created";
			entry.proxySandboxCommandId = "proxy-command";
			entry.proxySandboxStage = "running";
		},
		"ci.SandboxStarted",
		now,
		1,
	);
	if (!live) throw new Error("guest state missing");
	await proxyStore.configureSandboxEgress(
		proxyAccount.id,
		twoLease.id,
		"guest-session",
		10,
		1,
	);
	const lock = await pool.connect();
	await lock.query("BEGIN");
	await lock.query("SELECT 1 FROM hobo_ci_partitions WHERE id=$1 FOR UPDATE", [
		proxyPartition,
	]);
	try {
		const probe = await Promise.race([
			proxyStore.authenticateSandboxProxy("b".repeat(64)),
			new Promise<"timed-out">((resolve) =>
				setTimeout(() => resolve("timed-out"), 500),
			),
		]);
		assert.equal(probe, undefined, "invalid token acquired global lock");
	} finally {
		await lock.query("ROLLBACK");
		lock.release();
	}
	assert(await proxyStore.authenticateSandboxProxy(token));
	const requestId = randomUUID();
	assert(
		await proxyStore.reserveSandboxProxyEgress(
			twoLease.id,
			"proxy-session",
			token,
			"guest-session",
			4,
			requestId,
		),
	);
	assert(await proxyStore.authenticateSandboxProxy(token));
	assert.equal(
		await proxyStore.reserveSandboxProxyEgress(
			twoLease.id,
			"proxy-session",
			token,
			"guest-session",
			4,
			requestId,
		),
		false,
	);
	assert(await proxyStore.authenticateSandboxProxy(token));
	assert(
		await proxyStore.reserveSandboxProxyEgress(
			twoLease.id,
			"proxy-session",
			token,
			"guest-session",
			6,
			randomUUID(),
		),
	);
	assert.equal(await proxyStore.authenticateSandboxProxy(token), undefined);
	const stopping = await proxyStore.transition(
		twoLease.id,
		["running"],
		(entry) => {
			entry.sandboxStopFromStage = entry.sandboxStage;
			entry.sandboxStage = "stopping";
		},
		"ci.SandboxStopping",
		now,
		1,
	);
	if (!stopping) throw new Error("cleanup intent missing");
	assert.equal(await proxyStore.authenticateSandboxProxy(token), undefined);
	assert.equal(
		await proxyStore.reserveSandboxProxyEgress(
			twoLease.id,
			"proxy-session",
			token,
			"guest-session",
			1,
			randomUUID(),
		),
		false,
	);
	const stopped = await proxyStore.transition(
		twoLease.id,
		["running"],
		(entry) => {
			entry.sandboxStage = "stopped";
			entry.sandboxStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "guest-session",
				durationMs: 60000,
				memoryMb: 4096,
				vcpus: 2,
				egressBytes: 2,
				stoppedAt: now,
			});
			entry.proxySandboxStage = "stopped";
			entry.proxyStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "proxy-session",
				durationMs: 70000,
				memoryMb: 2048,
				vcpus: 1,
				ingressBytes: 3,
				egressBytes: 4,
				stoppedAt: now,
			});
		},
		"ci.SandboxesStopped",
		now,
		1,
	);
	if (!stopped) throw new Error("stop proof missing");
	assert.deepEqual(
		await proxyStore.sandboxProxyUsage(
			proxyAccount.id,
			twoLease.id,
			"proxy-session",
			"guest-session",
		),
		{ bytes: 10, calls: 4 },
	);
	const fence2 = {
		state: stopped.state,
		runnerId: 0,
		sandboxSessionId: stopped.sandboxSessionId,
		sandboxCommandId: stopped.sandboxCommandId,
		sandboxStage: stopped.sandboxStage,
		proxySandboxSessionId: stopped.proxySandboxSessionId,
		proxySandboxCommandId: stopped.proxySandboxCommandId,
		proxySandboxStage: stopped.proxySandboxStage,
	};
	const quote2 = sandboxUsageQuote(
		stopped.sandboxPricing ?? proxyOffer.sandboxPricing,
		{
			cpuVcpuMs: 120000,
			memoryMb: 4096,
			durationMs: 60000,
			egressBytes: 2,
			proxyBytes: 10,
			proxyControlCalls: 4,
			proxyVm: {
				cpuVcpuMs: 70000,
				memoryMb: 2048,
				durationMs: 70000,
				ingressBytes: 3,
				egressBytes: 4,
			},
			hostMicros: 0,
		},
		stopped.sandboxReservedAllowance,
	);
	await assert.rejects(
		proxyStore.settleSandboxObserved(
			twoLease.id,
			now,
			now,
			{ ...fence2, proxySandboxSessionId: "stale" },
			quote2.paidMicros,
			undefined,
			quote2.usedAllowance,
		),
		/proxy stop fence/,
	);
	await assert.rejects(
		proxyStore.settleSandboxObserved(
			twoLease.id,
			now,
			now,
			fence2,
			quote2.paidMicros - 1,
			undefined,
			quote2.usedAllowance,
		),
		/differs from verified usage/,
	);
	assert(
		await proxyStore.settleSandboxObserved(
			twoLease.id,
			now,
			now,
			fence2,
			quote2.paidMicros,
			undefined,
			quote2.usedAllowance,
		),
	);
	assert.equal(await proxyStore.authenticateSandboxProxy(token), undefined);
	const partialJob = job(7001);
	partialJob.isolatedRequired = true;
	const partial = await proxyStore.reserve(proxyAccount, partialJob, now, 1);
	if (!partial) throw new Error("partial reservation missing");
	const proxyOnly = await proxyStore.transition(
		partial.id,
		["reserved"],
		(entry) => {
			entry.state = "uncertain";
			entry.sandboxStage = "pending";
			entry.proxySandboxName = "proxy-only";
			entry.proxySandboxSessionId = "proxy-only-session";
			entry.proxySandboxStage = "stopped";
			entry.proxyStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "proxy-only-session",
				durationMs: 60000,
				memoryMb: 2048,
				vcpus: 1,
				egressBytes: 1,
				stoppedAt: now,
			});
		},
		"ci.ProxyStopped",
		now,
		1,
	);
	if (!proxyOnly) throw new Error("proxy only missing");
	const partialQuote = sandboxProxyOnlyUsageQuote(
		proxyOnly.sandboxPricing ?? proxyOffer.sandboxPricing,
		{
			proxyVm: {
				cpuVcpuMs: 60000,
				memoryMb: 2048,
				durationMs: 60000,
				ingressBytes: 0,
				egressBytes: 1,
			},
			proxyBytes: 0,
			proxyControlCalls: 0,
			hostMicros: 0,
		},
		proxyOnly.sandboxReservedAllowance,
	);
	const partialFence = {
		state: proxyOnly.state,
		runnerId: 0,
		sandboxSessionId: "",
		sandboxCommandId: "",
		sandboxStage: "pending",
		proxySandboxSessionId: proxyOnly.proxySandboxSessionId,
		proxySandboxCommandId: "",
		proxySandboxStage: "stopped",
	};
	assert(
		await proxyStore.settleSandboxObserved(
			partial.id,
			now,
			now,
			partialFence,
			partialQuote.paidMicros,
			undefined,
			partialQuote.usedAllowance,
		),
	);
	const preJitJob = job(7002);
	preJitJob.isolatedRequired = true;
	const preJitLease = await proxyStore.reserve(proxyAccount, preJitJob, now, 1);
	if (!preJitLease) throw new Error("pre-JIT reservation missing");
	const preJit = await proxyStore.transition(
		preJitLease.id,
		["reserved"],
		(entry) => {
			entry.state = "uncertain";
			entry.sandboxName = "pre-jit";
			entry.sandboxSessionId = "pre-jit-session";
			entry.sandboxStage = "stopped";
			entry.sandboxStopFromStage = "created";
			entry.sandboxStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "pre-jit-session",
				durationMs: 60000,
				memoryMb: 4096,
				vcpus: 2,
				stoppedAt: now,
			});
			entry.proxySandboxName = "pre-jit-proxy";
			entry.proxySandboxSessionId = "pre-jit-proxy-session";
			entry.proxySandboxStage = "stopped";
			entry.proxyStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "pre-jit-proxy-session",
				durationMs: 60000,
				memoryMb: 2048,
				vcpus: 1,
				stoppedAt: now,
			});
		},
		"ci.SandboxesStopped",
		now,
		1,
	);
	if (!preJit) throw new Error("pre-JIT stop proof missing");
	assert.deepEqual(
		await proxyStore.sandboxProxyUsage(
			proxyAccount.id,
			preJit.id,
			preJit.proxySandboxSessionId,
			preJit.sandboxSessionId,
		),
		{ bytes: 0, calls: 0 },
	);
	const preFence = {
		state: preJit.state,
		runnerId: 0,
		sandboxSessionId: preJit.sandboxSessionId,
		sandboxCommandId: "",
		sandboxStage: "stopped",
		proxySandboxSessionId: preJit.proxySandboxSessionId,
		proxySandboxCommandId: "",
		proxySandboxStage: "stopped",
	};
	const preQuote = sandboxUsageQuote(
		preJit.sandboxPricing ?? proxyOffer.sandboxPricing,
		{
			cpuVcpuMs: 120000,
			memoryMb: 4096,
			durationMs: 60000,
			egressBytes: 0,
			proxyBytes: 0,
			proxyControlCalls: 0,
			proxyVm: {
				cpuVcpuMs: 60000,
				memoryMb: 2048,
				durationMs: 60000,
				ingressBytes: 0,
				egressBytes: 0,
			},
			hostMicros: 0,
		},
		preJit.sandboxReservedAllowance,
	);
	assert(
		await proxyStore.settleSandboxObserved(
			preJit.id,
			now,
			now,
			preFence,
			preQuote.paidMicros,
			undefined,
			preQuote.usedAllowance,
		),
	);
	const unknownJob = job(7003);
	unknownJob.isolatedRequired = true;
	const unknownLease = await proxyStore.reserve(
		proxyAccount,
		unknownJob,
		now,
		1,
	);
	if (!unknownLease) throw new Error("unknown-JIT reservation missing");
	const unknown = await proxyStore.transition(
		unknownLease.id,
		["reserved"],
		(entry) => {
			entry.state = "uncertain";
			entry.sandboxSessionId = "unknown-session";
			entry.sandboxStage = "stopped";
			entry.sandboxStopFromStage = "registering";
			entry.sandboxStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "unknown-session",
				durationMs: 60000,
				memoryMb: 4096,
				vcpus: 2,
				stoppedAt: now,
			});
			entry.proxySandboxSessionId = "unknown-proxy-session";
			entry.proxySandboxStage = "stopped";
			entry.proxyStoppedUsage = create(SandboxMeasuredUsageSchema, {
				sessionId: "unknown-proxy-session",
				durationMs: 60000,
				memoryMb: 2048,
				vcpus: 1,
				stoppedAt: now,
			});
		},
		"ci.SandboxesStopped",
		now,
		1,
	);
	if (!unknown) throw new Error("unknown stop proof missing");
	await assert.rejects(
		proxyStore.settleSandboxObserved(
			unknown.id,
			now,
			now,
			{
				state: unknown.state,
				runnerId: 0,
				sandboxSessionId: unknown.sandboxSessionId,
				sandboxCommandId: "",
				sandboxStage: "stopped",
				proxySandboxSessionId: unknown.proxySandboxSessionId,
				proxySandboxCommandId: "",
				proxySandboxStage: "stopped",
			},
			preQuote.paidMicros,
			undefined,
			preQuote.usedAllowance,
		),
		/registration unresolved/,
	);
	// Rate-limit unique signed bodies per installation without affecting others.
	await pool.query(
		`INSERT INTO hobo_ci_inbox(partition_id,delivery_id,fingerprint,event,installation_id,repository_id,raw_body,received_at,body_hash,received_ms,completed)
	SELECT $1, 'rate-' || n, 'f-' || n, 'workflow_job', 88, 1, ''::bytea, $2, 'h-' || n, $3, true FROM generate_series(1,600) n`,
		[partition, now, Date.parse(now)],
	);
	const limited = {
		...input,
		deliveryId: "rate-over",
		installationId: 88,
		rawBody: new TextEncoder().encode("new unique"),
	};
	await assert.rejects(store.acceptWebhook(limited), /admission limit/);
	assert.deepEqual(
		await store.acceptWebhook({
			...limited,
			receivedAt: "2026-10-27T12:01:01Z",
		}),
		{ duplicate: false },
	);
	await pool.query(
		`INSERT INTO hobo_ci_inbox(partition_id,delivery_id,fingerprint,event,installation_id,repository_id,raw_body,received_at,body_hash,received_ms,completed)
	SELECT $1,'pending-' || n,'f-' || n,'workflow_job',89,1,''::bytea,$2,'h-' || n,$3,false FROM generate_series(1,10000) n`,
		[partition, "2026-10-26T00:00:00Z", Date.parse("2026-10-26T00:00:00Z")],
	);
	await assert.rejects(
		store.acceptWebhook({
			...limited,
			deliveryId: "pending-over",
			installationId: 89,
		}),
		/admission limit/,
	);
	await pool.query(
		"DELETE FROM hobo_ci_inbox WHERE partition_id=$1 AND installation_id=89",
		[partition],
	);
	await pool.query(
		`INSERT INTO hobo_ci_inbox(partition_id,delivery_id,fingerprint,event,installation_id,repository_id,raw_body,received_at,body_hash,received_ms,completed)
	SELECT $1,'bytes-' || n,'f-' || n,'workflow_job',90,1,repeat('x',1048576)::bytea,$2,'h-' || n,$3,false FROM generate_series(1,64) n`,
		[partition, "2026-10-26T00:00:00Z", Date.parse("2026-10-26T00:00:00Z")],
	);
	await assert.rejects(
		store.acceptWebhook({
			...limited,
			deliveryId: "bytes-over",
			installationId: 90,
		}),
		/admission limit/,
	);
	await pool.query(
		"DELETE FROM hobo_ci_inbox WHERE partition_id=$1 AND installation_id=90",
		[partition],
	);
	// The live relational ledger remains writable after the old 32 MiB ceiling.
	for (let i = 0; i < 33; i++) {
		const body = new Uint8Array(large.rawBody);
		body[0] = i;
		await store.acceptWebhook({
			...large,
			deliveryId: `bulk-${i}`,
			rawBody: body,
		});
	}
	assert(await store.ready());
	const retained = Number(
		(
			await pool.query<{ size: string }>(
				"SELECT SUM(octet_length(raw_body))::text AS size FROM hobo_ci_inbox WHERE partition_id=$1",
				[partition],
			)
		).rows[0]?.size,
	);
	assert(retained >= 33 * 1024 * 1024);
	assert.deepEqual(
		await store.acceptWebhook({
			...input,
			deliveryId: "after-32-mib",
			rawBody: new TextEncoder().encode("after-size"),
		}),
		{ duplicate: false },
	);
	console.log(
		"PostgreSQL CI contract: concurrency, CAS, atomic config, fencing, inbox replay, migration, 32 MiB and reopen passed",
	);
} finally {
	for (const table of [
		"hobo_ci_sandbox_proxy_requests",
		"hobo_ci_sandbox_proxies",
		"hobo_ci_assigned_jobs",
		"hobo_ci_sandbox_egress",
		"hobo_ci_inbox",
		"hobo_ci_events",
		"hobo_ci_leases",
		"hobo_ci_terminal_jobs",
		"hobo_ci_pending_jobs",
		"hobo_ci_configuration",
		"hobo_ci_control_records",
		"hobo_ci_snapshot_backups",
		"hobo_ci_partitions",
	]) {
		const column = table === "hobo_ci_partitions" ? "id" : "partition_id";
		await pool.query(`DELETE FROM ${table} WHERE ${column}=ANY($1)`, [
			[
				partition,
				migrationPartition,
				isolationPartition,
				isolatedOnlyPartition,
				proxyPartition,
			],
		]);
	}
	await pool.end();
}
