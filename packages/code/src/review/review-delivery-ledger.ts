// Durable review delivery ledger: pending → applied|failed|ambiguous → complete.
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { reviewError } from "./review-errors.js";
import type {
	ReviewExactEffect,
	ReviewLedgerState,
	ReviewSubmission,
} from "./review-ports.js";

// public-contract: durable review ledger records share one on-disk schema token.
export const REVIEW_LEDGER_SCHEMA = "hobo.code.review-ledger/v1" as const;

export type ReviewDeliveryLedgerStatus =
	| "pending"
	| "applied"
	| "failed"
	| "complete"
	| "ambiguous";

export interface ReviewDeliveryLedgerRecord {
	readonly schemaVersion: typeof REVIEW_LEDGER_SCHEMA;
	readonly commandId: string;
	readonly digest: string;
	readonly status: ReviewDeliveryLedgerStatus;
	readonly effect: ReviewExactEffect;
	readonly correlationMarker: string;
	readonly pendingReviewId?: string;
	readonly receiptHash?: string;
	readonly providerReviewId?: string;
	readonly failureCode?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export function reviewLedgerPath(rootDir: string, commandId: string): string {
	const hash = createHash("sha256").update(commandId).digest("hex");
	return join(rootDir, `${hash}.json`);
}

function ensureDirectoryDurable(directory: string): void {
	if (existsSync(directory)) return;
	const parent = dirname(directory);
	if (parent !== directory) ensureDirectoryDurable(parent);
	try {
		mkdirSync(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
}

function fsyncDirectory(directory: string): void {
	const descriptor = openSync(directory, "r");
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function writeJsonAtomic(path: string, value: unknown): void {
	ensureDirectoryDurable(dirname(path));
	const temporary = `${path}.${process.pid}.${randomUUID()}`;
	const descriptor = openSync(temporary, "wx", 0o600);
	try {
		writeFileSync(
			descriptor,
			`${JSON.stringify(value, (_key, item) =>
				typeof item === "bigint" ? item.toString() : item,
			)}\n`,
		);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	renameSync(temporary, path);
	fsyncDirectory(dirname(path));
}

function parseRecord(raw: string): ReviewDeliveryLedgerRecord {
	const parsed = JSON.parse(raw) as Omit<
		ReviewDeliveryLedgerRecord,
		"effect"
	> & {
		readonly effect: Omit<ReviewExactEffect, "expectedRevision"> & {
			readonly expectedRevision: string;
		};
	};
	return {
		...parsed,
		effect: {
			...parsed.effect,
			expectedRevision: BigInt(parsed.effect.expectedRevision),
		},
	};
}

export function reviewApprovalPath(rootDir: string, digest: string): string {
	return join(rootDir, "approvals", `${digest}.json`);
}

export async function writeReviewApproval(
	rootDir: string,
	effect: ReviewExactEffect,
): Promise<void> {
	writeJsonAtomic(reviewApprovalPath(rootDir, effect.digest), effect);
}

export async function readReviewApproval(
	rootDir: string,
	digest: string,
): Promise<ReviewExactEffect | undefined> {
	const path = reviewApprovalPath(rootDir, digest);
	if (!existsSync(path)) return undefined;
	const parsed = JSON.parse(readFileSync(path, "utf8")) as Omit<
		ReviewExactEffect,
		"expectedRevision"
	> & { readonly expectedRevision: string };
	return {
		...parsed,
		expectedRevision: BigInt(parsed.expectedRevision),
	};
}

export async function loadReviewDeliveryLedger(
	rootDir: string,
	commandId: string,
): Promise<ReviewDeliveryLedgerRecord | undefined> {
	const path = reviewLedgerPath(rootDir, commandId);
	if (!existsSync(path)) return undefined;
	return parseRecord(readFileSync(path, "utf8"));
}

export async function persistReviewDeliveryPending(
	rootDir: string,
	input: {
		readonly commandId: string;
		readonly effect: ReviewExactEffect;
		readonly correlationMarker: string;
		readonly pendingReviewId?: string;
		readonly now?: string;
	},
): Promise<ReviewDeliveryLedgerRecord> {
	const now = input.now ?? new Date().toISOString();
	const existing = await loadReviewDeliveryLedger(rootDir, input.commandId);
	if (existing && existing.digest !== input.effect.digest) {
		throw reviewError(
			"malformed-input",
			"command ID was reused for a different review action",
			{ commandId: input.commandId },
		);
	}
	if (existing && existing.status !== "failed") return existing;
	const record: ReviewDeliveryLedgerRecord = {
		schemaVersion: REVIEW_LEDGER_SCHEMA,
		commandId: input.commandId,
		digest: input.effect.digest,
		status: "pending",
		effect: input.effect,
		correlationMarker: input.correlationMarker,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		...(input.pendingReviewId === undefined
			? {}
			: { pendingReviewId: input.pendingReviewId }),
	};
	writeJsonAtomic(reviewLedgerPath(rootDir, input.commandId), record);
	return record;
}

export async function markReviewDeliveryLedger(
	rootDir: string,
	commandId: string,
	status: ReviewDeliveryLedgerStatus,
	extra: {
		readonly receiptHash?: string;
		readonly providerReviewId?: string;
		readonly failureCode?: string;
		readonly now?: string;
	} = {},
): Promise<ReviewDeliveryLedgerRecord> {
	const existing = await loadReviewDeliveryLedger(rootDir, commandId);
	if (!existing) {
		throw reviewError("not-found", `review ledger ${commandId} does not exist`);
	}
	const record: ReviewDeliveryLedgerRecord = {
		...existing,
		status,
		updatedAt: extra.now ?? new Date().toISOString(),
		...(extra.receiptHash === undefined
			? {}
			: { receiptHash: extra.receiptHash }),
		...(extra.providerReviewId === undefined
			? {}
			: { providerReviewId: extra.providerReviewId }),
		...(extra.failureCode === undefined
			? {}
			: { failureCode: extra.failureCode }),
	};
	writeJsonAtomic(reviewLedgerPath(rootDir, commandId), record);
	return record;
}

export function reviewLedgerStateFromStatus(
	status: ReviewDeliveryLedgerStatus,
): ReviewLedgerState {
	return status === "complete" ? "reconciled" : status;
}

export function reviewSubmissionFromLedger(
	record: ReviewDeliveryLedgerRecord,
	providerHeadOid: string,
): ReviewSubmission {
	return {
		submissionId: record.providerReviewId ?? record.commandId,
		pendingReviewId: record.pendingReviewId ?? "",
		commandId: record.commandId,
		effectDigest: record.digest,
		provider: "github",
		state: reviewLedgerStateFromStatus(record.status),
		providerHeadOid,
		...(record.providerReviewId === undefined
			? {}
			: { providerReviewId: record.providerReviewId }),
		...(record.receiptHash === undefined
			? {}
			: { receiptHash: record.receiptHash }),
		...(record.failureCode === undefined
			? {}
			: { failureCode: record.failureCode }),
	};
}
