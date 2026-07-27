// Durable ActorHost backed by @hobo/storage-sqlite actor_leases table.
// In-memory host remains the deterministic default for pure unit tests.

import type { SqliteJournal } from "@hobo/storage-sqlite";

import {
	type ActorHost,
	type AggregateLease,
	LeaseConflictError,
} from "./actor-host.js";

export interface DurableActorHostOptions {
	journal: SqliteJournal;
	leaseTtlMs?: number;
}

export function createDurableActorHost(
	options: DurableActorHostOptions,
): ActorHost {
	const leaseTtlMs = options.leaseTtlMs ?? 30_000;
	const journal = options.journal;

	return Object.freeze({
		acquire(key: string, request: { holderId: string }): AggregateLease {
			if (typeof key !== "string" || key.length === 0) {
				throw new TypeError("key must be a non-empty string");
			}
			const holderId = request?.holderId;
			if (typeof holderId !== "string" || holderId.length === 0) {
				throw new TypeError("request.holderId must be a non-empty string");
			}
			try {
				const lease = journal.acquireActorLease({
					key,
					holderId,
					leaseTtlMs,
				});
				return Object.freeze({
					key: lease.key,
					holderId: lease.holderId,
					fenceToken: lease.fenceToken,
					expiresAt: lease.expiresAt,
					release() {
						journal.releaseActorLease(lease.key, lease.holderId, lease.fenceToken);
					},
				});
			} catch (error) {
				const name = (error as { name?: string })?.name;
				const code = (error as { code?: string })?.code;
				if (name === "StaleFenceError" || code === "STALE_FENCE") {
					throw new LeaseConflictError(
						`lease conflict for ${key}: ${(error as Error).message}`,
					);
				}
				throw error;
			}
		},
	});
}
