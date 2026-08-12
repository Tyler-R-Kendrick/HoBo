import type { ReviewDomainEvent } from "./review-events.js";
import { REVIEW_EVENT_INBOX_DISPOSITION_SET } from "./review-events.js";
import type {
	ReviewCoverageRecord,
	ReviewDerivedState,
	ReviewInboxDisposition,
	ReviewInboxItem,
	ReviewProgressSummary,
	ReviewSnapshot,
	ReviewStackSummary,
	ReviewTarget,
	ReviewThread,
} from "./review-ports.js";

export interface ReviewInboxTruth {
	readonly threads?: Readonly<Record<string, ReviewThread>>;
	readonly coverage?: Readonly<Record<string, ReviewCoverageRecord>>;
}

export interface ReviewInboxSignal {
	readonly conflicts?: boolean;
	readonly checksFailing?: boolean;
	readonly approved?: boolean;
	readonly mergeable?: boolean;
	readonly blockedBy?: string;
	readonly awaitingAgent?: boolean;
	readonly awaitingAuthor?: boolean;
	readonly changedSinceReview?: boolean;
	readonly memberClosed?: boolean;
	readonly inProgress?: boolean;
	readonly progress?: ReviewProgressSummary;
	readonly targetLabel?: string;
	readonly stack?: ReviewStackSummary;
}

export interface ReviewInboxProjectionInput {
	readonly snapshot: ReviewSnapshot;
	readonly signal?: ReviewInboxSignal;
	readonly truth?: ReviewInboxTruth;
}

const EMPTY_PROGRESS: ReviewProgressSummary = {
	reviewedFiles: 0,
	totalFiles: 0,
	reviewedHunks: 0,
	totalHunks: 0,
	staleUnits: 0,
	excludedUnits: 0,
};

const DERIVED_PRIORITY: readonly ReviewDerivedState[] = [
	"closed",
	"conflicts",
	"checks-failing",
	"approved-blocked",
	"changed-since-review",
	"awaiting-agent",
	"awaiting-author",
	"ready-to-merge",
	"in-progress",
	"needs-review",
];

export function reviewInboxItemId(reviewId: string): string {
	return `inbox:${reviewId}`;
}

export function reviewTargetLabel(target: ReviewTarget | undefined): string {
	if (target === undefined) return "review";
	switch (target.kind) {
		case "stack":
			return `stack:${target.stackId}`;
		case "pull-request":
			return `${target.host}/${target.repository}#${target.number}`;
		case "commit":
			return target.commitOid.slice(0, 12);
		case "range":
			return `${target.requestedBaseRef}..${target.requestedHeadRef}`;
		case "index":
			return `index:${target.repositoryId}`;
		case "working-tree":
			return `worktree:${target.repositoryId}`;
	}
}

export function deriveReviewState(
	input: ReviewInboxProjectionInput,
): ReviewDerivedState {
	return (
		attentionFlags(input).find((flag) => flag.active)?.state ?? "needs-review"
	);
}

export function projectReviewInboxItem(
	input: ReviewInboxProjectionInput,
): ReviewInboxItem {
	readTruth(input.truth);
	const flags = attentionFlags(input);
	const derivedState =
		flags.find((flag) => flag.active)?.state ?? "needs-review";
	const stack = stackSummary(input);
	const progress = input.signal?.progress ?? EMPTY_PROGRESS;
	return {
		itemId: reviewInboxItemId(input.snapshot.reviewId),
		reviewId: input.snapshot.reviewId,
		targetLabel:
			input.signal?.targetLabel ?? reviewTargetLabel(input.snapshot.target),
		manualDisposition: input.snapshot.inboxDisposition,
		derivedState,
		attentionReasons: flags
			.filter((flag) => flag.active)
			.map((flag) => flag.state),
		progress,
		lastUpdatedAt: input.snapshot.updatedAt,
		...(stack === undefined ? {} : { stack }),
	};
}

export function applyInboxDispositionEvent(
	item: ReviewInboxItem,
	disposition: ReviewInboxDisposition,
	input: { readonly at: string },
): ReviewInboxItem {
	return {
		...item,
		manualDisposition: disposition,
		lastUpdatedAt: input.at,
	};
}

export function projectInboxDispositionEvent(
	item: ReviewInboxItem,
	event: ReviewDomainEvent,
): ReviewInboxItem {
	if (event.type !== REVIEW_EVENT_INBOX_DISPOSITION_SET) return item;
	if (event.data.reviewId !== item.reviewId) return item;
	return applyInboxDispositionEvent(item, event.data.disposition, {
		at: event.data.at,
	});
}

function attentionFlags(
	input: ReviewInboxProjectionInput,
): readonly { readonly state: ReviewDerivedState; readonly active: boolean }[] {
	const signal = input.signal ?? {};
	const progress = signal.progress;
	const approved = signal.approved === true;
	const mergeable = signal.mergeable === true;
	const blocked = signal.blockedBy !== undefined;
	const inProgress =
		signal.inProgress === true ||
		(progress !== undefined &&
			(progress.reviewedFiles > 0 || progress.reviewedHunks > 0));
	const flags: Record<ReviewDerivedState, boolean> = {
		closed: input.snapshot.closed || signal.memberClosed === true,
		conflicts: signal.conflicts === true,
		"checks-failing": signal.checksFailing === true,
		"approved-blocked": approved && (blocked || signal.mergeable === false),
		"changed-since-review": signal.changedSinceReview === true,
		"awaiting-agent": signal.awaitingAgent === true,
		"awaiting-author": signal.awaitingAuthor === true,
		"ready-to-merge":
			approved &&
			mergeable &&
			signal.conflicts !== true &&
			signal.checksFailing !== true &&
			!blocked,
		"in-progress": inProgress,
		"needs-review": true,
	};
	return DERIVED_PRIORITY.map((state) => ({ state, active: flags[state] }));
}

function stackSummary(
	input: ReviewInboxProjectionInput,
): ReviewStackSummary | undefined {
	const signal = input.signal;
	if (signal?.stack !== undefined) {
		return signal.blockedBy === undefined
			? signal.stack
			: { ...signal.stack, blockedBy: signal.blockedBy };
	}
	const target = input.snapshot.target;
	if (target?.kind !== "stack") return undefined;
	return {
		stackId: target.stackId,
		memberCount: target.members.length,
		...(signal?.blockedBy === undefined ? {} : { blockedBy: signal.blockedBy }),
	};
}

function readTruth(truth: ReviewInboxTruth | undefined): void {
	if (truth === undefined) return;
	void truth.threads;
	void truth.coverage;
}
