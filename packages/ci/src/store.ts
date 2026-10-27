import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import { z } from "zod";
import {
	ACTIVE_STATES,
	type Account,
	CiEventSchema,
	type Configuration,
	ConfigurationSchema,
	type ConfigurationState,
	ConfigurationStateSchema,
	type ControlRecord,
	ControlRecordSchema,
	type Job,
	JobSchema,
	type Lease,
	LeaseSchema,
	type Pipeline,
	type PipelineResult,
	parseConfiguration,
	route,
} from "./index.js";

/** Single-writer partition. Events and their materialized lease view commit together. */
export class LeaseStore {
	private readonly db: DatabaseSync;
	constructor(path: string) {
		this.db = new DatabaseSync(path);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, job_key TEXT NOT NULL, body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS terminal_jobs (job_key TEXT PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS pending_jobs (job_key TEXT PRIMARY KEY, body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS configuration_state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS control_records (key TEXT PRIMARY KEY, body TEXT NOT NULL);`);
	}
	close(): void {
		this.db.close();
	}
	private transaction<T>(fn: () => T): T {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const result = fn();
			this.db.exec("COMMIT");
			return result;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	all(): Lease[] {
		return this.db
			.prepare("SELECT body FROM leases ORDER BY id")
			.all()
			.map((row) => fromJsonString(LeaseSchema, z.string().parse(row.body)));
	}
	get(id: string): Lease | undefined {
		return this.all().find((lease) => lease.id === id);
	}
	events() {
		return this.db
			.prepare("SELECT body FROM events ORDER BY seq")
			.all()
			.map((row) => fromJsonString(CiEventSchema, z.string().parse(row.body)));
	}
	configuration(): ConfigurationState | undefined {
		const row = this.db
			.prepare("SELECT body FROM configuration_state WHERE id=1")
			.get();
		return row
			? fromJsonString(ConfigurationStateSchema, z.string().parse(row.body))
			: undefined;
	}
	/** Compare-and-swap platform policy, with its audit event in the lease partition. */
	configure(
		configuration: Configuration,
		expectedRevision: number,
		at: string,
	): ConfigurationState {
		return this.transaction(() => {
			const previous = this.configuration();
			if ((previous?.revision ?? 0) !== expectedRevision)
				throw new Error("configuration revision conflict");
			if (
				!Number.isSafeInteger(expectedRevision) ||
				expectedRevision < 0 ||
				expectedRevision >= 4294967295
			)
				throw new Error("invalid configuration revision");
			const parsed = parseConfiguration(
				toJsonString(ConfigurationSchema, configuration),
			);
			for (const account of parsed.accounts) {
				if (
					account.usageObservedAt &&
					Date.parse(account.usageObservedAt) > Date.parse(at)
				)
					throw new Error("future account usage snapshot");
				const old = previous?.configuration?.accounts.find(
					(entry) => entry.id === account.id,
				);
				if (
					old?.usageObservedAt &&
					(!account.usageObservedAt ||
						Date.parse(account.usageObservedAt) <
							Date.parse(old.usageObservedAt))
				)
					throw new Error("account usage snapshot cannot move backwards");
				for (const offer of account.offers) {
					const oldOffer = old?.offers.find((entry) => entry.id === offer.id);
					if (
						oldOffer &&
						Date.parse(offer.observedAt) < Date.parse(oldOffer.observedAt)
					)
						throw new Error("provider usage snapshot cannot move backwards");
				}
			}
			for (const lease of this.all().filter((entry) =>
				ACTIVE_STATES.has(entry.state),
			)) {
				const oldAccount = previous?.configuration?.accounts.find(
					(entry) => entry.id === lease.accountId,
				);
				const nextAccount = parsed.accounts.find(
					(entry) => entry.id === lease.accountId,
				);
				const oldOffer = oldAccount?.offers.find(
					(entry) => entry.id === lease.offerId,
				);
				const nextOffer = nextAccount?.offers.find(
					(entry) => entry.id === lease.offerId,
				);
				if (
					!nextAccount ||
					!nextOffer ||
					nextOffer.provider !== lease.provider ||
					(oldOffer &&
						(oldOffer.providerAccountId !== nextOffer.providerAccountId ||
							oldOffer.runsOn !== nextOffer.runsOn ||
							oldOffer.backend !== nextOffer.backend))
				)
					throw new Error("active lease prevents provider identity change");
				if (!lease.pipelineId) {
					const old = previous?.configuration?.connections.find(
						(entry) => entry.repositoryId === lease.repositoryId,
					);
					const next = parsed.connections.find(
						(entry) => entry.repositoryId === lease.repositoryId,
					);
					if (
						!next ||
						next.accountId !== lease.accountId ||
						next.repository !== lease.repository ||
						next.installationId !== lease.installationId ||
						(old &&
							(old.bridgeWorkflow !== next.bridgeWorkflow ||
								old.bridgeSha !== next.bridgeSha ||
								old.bridgeRef !== next.bridgeRef ||
								old.runnerGroupId !== next.runnerGroupId ||
								old.dispatcherActorId !== next.dispatcherActorId ||
								old.publicRepositoryAcknowledged !==
									next.publicRepositoryAcknowledged))
					)
						throw new Error("active lease prevents repository binding change");
				}
			}
			const state = create(ConfigurationStateSchema, {
				revision: expectedRevision + 1,
				configuration: parsed,
				updatedAt: at,
			});
			const detail = toJsonString(ConfigurationStateSchema, state);
			this.db.prepare("INSERT INTO events(body) VALUES (?)").run(
				toJsonString(
					CiEventSchema,
					create(CiEventSchema, {
						type: "ci.ConfigurationChanged",
						at,
						detail,
					}),
				),
			);
			this.db
				.prepare(
					"INSERT INTO configuration_state(id,body) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
				)
				.run(detail);
			return state;
		});
	}
	controlRecord(key: string): ControlRecord | undefined {
		const row = this.db
			.prepare("SELECT body FROM control_records WHERE key=?")
			.get(key);
		return row
			? fromJsonString(ControlRecordSchema, z.string().parse(row.body))
			: undefined;
	}
	putControlRecord(
		key: string,
		accountId: string,
		bodyJson: string,
		at: string,
	): void {
		if (
			!/^[A-Za-z0-9:_-]{1,200}$/.test(key) ||
			!/^[A-Za-z0-9_-]{1,80}$/.test(accountId) ||
			Buffer.byteLength(bodyJson) > 1024 * 1024
		)
			throw new Error("invalid control record");
		z.record(z.string(), z.json()).parse(JSON.parse(bodyJson));
		this.transaction(() => {
			const old = this.controlRecord(key);
			if (old && old.accountId !== accountId)
				throw new Error("control record belongs to another account");
			const detail = toJsonString(
				ControlRecordSchema,
				create(ControlRecordSchema, {
					key,
					accountId,
					bodyJson,
					updatedAt: at,
				}),
			);
			this.db.prepare("INSERT INTO events(body) VALUES (?)").run(
				toJsonString(
					CiEventSchema,
					create(CiEventSchema, {
						type: "ci.ControlRecordUpdated",
						at,
						accountId,
						detail,
					}),
				),
			);
			this.db
				.prepare(
					"INSERT INTO control_records(key,body) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
				)
				.run(key, detail);
		});
	}
	private leaseKey(lease: Lease): string {
		return lease.pipelineId
			? `pipeline:${lease.accountId}:${lease.pipelineId}`
			: `${lease.repositoryId}:${lease.jobId}:${lease.runAttempt}`;
	}
	reservePipeline(
		account: Account,
		pipeline: Pipeline,
		digest: string,
		offerIds: readonly string[],
		at: string,
	): Lease | undefined {
		return this.transaction(() => {
			if (
				pipeline.accountId !== account.id ||
				pipeline.timeoutSeconds > account.maxRuntimeMinutes * 60
			)
				throw new Error("pipeline scope or timeout exceeds account policy");
			const leases = this.all();
			const previous = leases.filter(
				(lease) =>
					lease.accountId === account.id && lease.pipelineId === pipeline.id,
			);
			if (previous.some((lease) => lease.pipelineDigest !== digest))
				throw new Error("pipeline id already used for different input");
			const existing = previous.find(
				(lease) =>
					ACTIVE_STATES.has(lease.state) || lease.state === "completed",
			);
			if (existing) return existing;
			const selected = route(
				{
					...account,
					maxRuntimeMinutes: Math.ceil(pipeline.timeoutSeconds / 60),
					offers: account.offers.filter((offer) => offerIds.includes(offer.id)),
				},
				leases,
				at,
			);
			if (!selected) return undefined;
			const lease = create(LeaseSchema, {
				id: randomUUID(),
				accountId: account.id,
				pipelineId: pipeline.id,
				pipelineDigest: digest,
				offerId: selected.offer.id,
				provider: selected.offer.provider,
				state: "reserved",
				reservedMinutes: selected.minutes,
				reservedFreeMinutes: selected.freeMinutes,
				reservedPaidMicros: selected.paidMicros,
				priceMicrosPerMinute: selected.offer.priceMicrosPerMinute,
				freeValidUntil: selected.offer.validUntil,
				createdAt: at,
			});
			this.append(lease, "ci.LeaseReserved", at);
			return lease;
		});
	}
	private append(lease: Lease, type: string, at: string): void {
		const body = toJsonString(LeaseSchema, lease);
		this.db.prepare("INSERT INTO events(body) VALUES (?)").run(
			toJsonString(
				CiEventSchema,
				create(CiEventSchema, {
					type,
					at,
					accountId: lease.accountId,
					leaseId: lease.id,
					detail: body,
				}),
			),
		);
		this.db
			.prepare(
				"INSERT INTO leases(id, job_key, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
			)
			.run(lease.id, this.leaseKey(lease), body);
	}
	reserve(account: Account, job: Job, at: string): Lease | undefined {
		return this.transaction(() => {
			const key = `${job.repositoryId}:${job.id}:${job.runAttempt}`;
			if (
				this.db.prepare("SELECT 1 FROM terminal_jobs WHERE job_key=?").get(key)
			)
				return undefined;
			const leases = this.all();
			const existing = leases.find(
				(lease) =>
					lease.repositoryId === job.repositoryId &&
					lease.jobId === job.id &&
					lease.runAttempt === job.runAttempt &&
					ACTIVE_STATES.has(lease.state),
			);
			if (existing) {
				this.db.prepare("DELETE FROM pending_jobs WHERE job_key=?").run(key);
				return existing;
			}
			const selected = route(
				{
					...account,
					offers: account.offers.filter(
						(offer) => !offer.backend || offer.backend === "gh-actions",
					),
				},
				leases,
				at,
			);
			if (!selected) return undefined;
			const id = randomUUID();
			const lease = create(LeaseSchema, {
				id,
				accountId: account.id,
				offerId: selected.offer.id,
				provider: selected.offer.provider,
				jobId: job.id,
				originalRunId: job.runId,
				runAttempt: job.runAttempt,
				repositoryId: job.repositoryId,
				repository: job.repository,
				installationId: job.installationId,
				state: "reserved",
				priceMicrosPerMinute: selected.offer.priceMicrosPerMinute,
				freeValidUntil: selected.offer.validUntil,
				reservedMinutes: selected.minutes,
				reservedFreeMinutes: selected.freeMinutes,
				reservedPaidMicros: selected.paidMicros,
				runnerName: `hobo-${id}`,
				createdAt: at,
			});
			this.append(lease, "ci.LeaseReserved", at);
			this.db.prepare("DELETE FROM pending_jobs WHERE job_key=?").run(key);
			return lease;
		});
	}
	transition(
		id: string,
		expected: readonly string[],
		update: (lease: Lease) => void,
		type: string,
		at: string,
	): Lease | undefined {
		return this.transaction(() => {
			const lease = this.get(id);
			if (!lease || !expected.includes(lease.state)) return undefined;
			update(lease);
			this.append(lease, type, at);
			return lease;
		});
	}
	queue(job: Job, at: string): void {
		this.transaction(() => this.queueInside(job, at));
	}
	private queueInside(job: Job, at: string): void {
		const key = `${job.repositoryId}:${job.id}:${job.runAttempt}`;
		if (
			this.db.prepare("SELECT 1 FROM terminal_jobs WHERE job_key=?").get(key) ||
			this.db.prepare("SELECT 1 FROM pending_jobs WHERE job_key=?").get(key) ||
			this.all().some(
				(lease) =>
					lease.repositoryId === job.repositoryId &&
					lease.jobId === job.id &&
					lease.runAttempt === job.runAttempt &&
					ACTIVE_STATES.has(lease.state),
			)
		)
			return;
		const detail = toJsonString(JobSchema, job);
		this.db
			.prepare("INSERT INTO events(body) VALUES (?)")
			.run(
				toJsonString(
					CiEventSchema,
					create(CiEventSchema, { type: "ci.JobQueued", at, detail }),
				),
			);
		this.db
			.prepare("INSERT INTO pending_jobs(job_key,body) VALUES (?,?)")
			.run(key, detail);
	}
	pendingJobs(): Job[] {
		return this.db
			.prepare("SELECT body FROM pending_jobs ORDER BY rowid")
			.all()
			.map((row) => fromJsonString(JobSchema, z.string().parse(row.body)));
	}
	observe(job: Job, at: string): void {
		this.transaction(() => {
			if (job.action === "completed") {
				const key = `${job.repositoryId}:${job.id}:${job.runAttempt}`;
				this.db
					.prepare("INSERT OR IGNORE INTO terminal_jobs(job_key) VALUES (?)")
					.run(key);
				this.db.prepare("DELETE FROM pending_jobs WHERE job_key=?").run(key);
				this.db.prepare("INSERT INTO events(body) VALUES (?)").run(
					toJsonString(
						CiEventSchema,
						create(CiEventSchema, {
							type: "ci.JobCompleted",
							at,
							detail: toJsonString(JobSchema, job),
						}),
					),
				);
			}
			if (job.runnerName) {
				const lease = this.all().find(
					(candidate) =>
						candidate.repositoryId === job.repositoryId &&
						candidate.runnerName === job.runnerName,
				);
				if (lease && ACTIVE_STATES.has(lease.state)) {
					lease.actualJobId = job.id;
					this.append(lease, "ci.JobObserved", at);
				}
			}
			// Original-job completion NEVER releases a host reservation.
		});
	}
	settle(
		id: string,
		hostRunId: number,
		billedMinutes: number,
		at: string,
		unmet?: Job,
		completedAt = at,
		result?: PipelineResult,
	): Lease | undefined {
		return this.transaction(() => {
			const lease = this.get(id);
			if (!lease || !ACTIVE_STATES.has(lease.state)) return undefined;
			if (lease.hostRunId !== 0 && lease.hostRunId !== hostRunId)
				throw new Error("host run mismatch");
			if (!Number.isFinite(billedMinutes) || billedMinutes < 0)
				throw new Error("invalid settlement");
			lease.hostRunId = hostRunId;
			lease.state = "completed";
			lease.billedMinutes = billedMinutes;
			lease.billedFreeMinutes =
				Date.parse(completedAt) <= Date.parse(lease.freeValidUntil)
					? Math.min(billedMinutes, lease.reservedFreeMinutes)
					: 0;
			lease.paidMicros = Math.ceil(
				Math.max(0, billedMinutes - lease.billedFreeMinutes) *
					lease.priceMicrosPerMinute,
			);
			lease.settledAt = at;
			lease.usageCompletedAt = completedAt;
			if (result) lease.result = result;
			this.append(lease, "ci.HostSettled", at);
			if (unmet) this.queueInside(unmet, at);
			return lease;
		});
	}
	cancelAndRequeue(id: string, job: Job, at: string): void {
		this.transaction(() => {
			const lease = this.get(id);
			if (lease?.state !== "reserved") return;
			lease.state = "cancelled";
			this.append(lease, "ci.LeaseCancelled", at);
			this.queueInside(job, at);
		});
	}
	recover(at: string): void {
		for (const lease of this.all()) {
			if (lease.pipelineId && lease.state === "reserved") {
				// No backend call can precede PipelineStarted. Release untouched
				// reservations so a restarted coordinator can re-admit current policy.
				this.transition(
					lease.id,
					["reserved"],
					(entry) => {
						entry.state = "cancelled";
					},
					"ci.LeaseCancelled",
					at,
				);
				continue;
			}
			this.transition(
				lease.id,
				lease.pipelineId
					? ["dispatching", "claiming", "running"]
					: ["dispatching", "claiming"],
				(entry) => {
					entry.state = "uncertain";
				},
				"ci.LeaseUncertain",
				at,
			);
		}
	}
	/** Rebuild query state from the append-only event log; terminal tombstones are separate intake state. */
	rebuild(): void {
		this.transaction(() => {
			this.db.exec(
				"DELETE FROM leases; DELETE FROM pending_jobs; DELETE FROM terminal_jobs; DELETE FROM configuration_state; DELETE FROM control_records;",
			);
			for (const event of this.events()) {
				if (event.type === "ci.ConfigurationChanged") {
					fromJsonString(ConfigurationStateSchema, event.detail);
					this.db
						.prepare(
							"INSERT INTO configuration_state(id,body) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
						)
						.run(event.detail);
					continue;
				}
				if (event.type === "ci.ControlRecordUpdated") {
					const record = fromJsonString(ControlRecordSchema, event.detail);
					this.db
						.prepare(
							"INSERT INTO control_records(key,body) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
						)
						.run(record.key, event.detail);
					continue;
				}
				if (["ci.JobQueued", "ci.JobCompleted"].includes(event.type)) {
					const job = fromJsonString(JobSchema, event.detail);
					const key = `${job.repositoryId}:${job.id}:${job.runAttempt}`;
					if (event.type === "ci.JobCompleted") {
						this.db
							.prepare(
								"INSERT OR IGNORE INTO terminal_jobs(job_key) VALUES (?)",
							)
							.run(key);
						this.db
							.prepare("DELETE FROM pending_jobs WHERE job_key=?")
							.run(key);
					} else if (
						!this.db
							.prepare("SELECT 1 FROM terminal_jobs WHERE job_key=?")
							.get(key)
					) {
						this.db
							.prepare(
								"INSERT OR IGNORE INTO pending_jobs(job_key,body) VALUES (?,?)",
							)
							.run(key, event.detail);
					}
					continue;
				}
				const lease = fromJsonString(LeaseSchema, event.detail);
				this.db
					.prepare("DELETE FROM pending_jobs WHERE job_key=?")
					.run(this.leaseKey(lease));
				this.db
					.prepare(
						"INSERT INTO leases(id,job_key,body) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
					)
					.run(lease.id, this.leaseKey(lease), event.detail);
			}
		});
	}
}
