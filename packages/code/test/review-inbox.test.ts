import { describe, expect, it } from "vitest";

import {
	REVIEW_EVENT_INBOX_DISPOSITION_SET,
	type ReviewDomainEvent,
} from "../src/review/review-events.js";
import {
	applyInboxDispositionEvent,
	deriveReviewState,
	projectReviewInboxItem,
	reviewInboxItemId,
	reviewTargetLabel,
} from "../src/review/review-inbox.js";
import { createReviewInboxQuery } from "../src/review/review-inbox-query.js";
import {
	REVIEW_SNAPSHOT_SCHEMA,
	type ReviewCoverageRecord,
	type ReviewDerivedState,
	type ReviewInboxDisposition,
	type ReviewSnapshot,
	type ReviewThread,
} from "../src/review/review-ports.js";

function snapshot(
	reviewId: string,
	overrides: Partial<ReviewSnapshot> = {},
): ReviewSnapshot {
	return {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId,
		revision: 1n,
		threadIds: ["thread-1"],
		coverageIds: ["cov-1"],
		inboxDisposition: "active",
		closed: false,
		updatedAt: "2026-08-12T00:00:00.000Z",
		target: {
			kind: "pull-request",
			provider: "github",
			host: "github.com",
			repository: "acme/widgets",
			number: 42,
			baseRef: "main",
			headRef: "feat",
			mergeBaseOid: "1".repeat(40),
			baseCommitOid: "2".repeat(40),
			headCommitOid: "3".repeat(40),
		},
		...overrides,
	};
}

const emptyProgress = {
	reviewedFiles: 0,
	totalFiles: 2,
	reviewedHunks: 0,
	totalHunks: 4,
	staleUnits: 0,
	excludedUnits: 0,
};

function frozenTruth(): {
	readonly threads: Record<string, ReviewThread>;
	readonly coverage: Record<string, ReviewCoverageRecord>;
} {
	return {
		threads: Object.freeze({
			"thread-1": Object.freeze({
				threadId: "thread-1",
				reviewId: "review-1",
				origin: "local-human",
				visibility: "session",
				resolution: "open",
				anchorHealth: "current",
				messageIds: Object.freeze(["msg-1"]) as readonly string[],
				createdAt: "2026-08-12T00:00:00.000Z",
				updatedAt: "2026-08-12T00:00:00.000Z",
			}),
		}),
		coverage: Object.freeze({
			"cov-1": Object.freeze({
				coverageId: "cov-1",
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: "gen-1",
				unit: Object.freeze({
					kind: "file",
					fileId: "file-1",
					contentIdentity: "blob-1",
				}),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
		}),
	};
}

describe("review inbox projection", () => {
	it("derives each inbox state from signals without writing the aggregate", () => {
		const cases: ReadonlyArray<{
			readonly derived: ReviewDerivedState;
			readonly snapshot?: Partial<ReviewSnapshot>;
			readonly signal?: Parameters<typeof deriveReviewState>[0]["signal"];
		}> = [
			{ derived: "needs-review" },
			{
				derived: "in-progress",
				signal: {
					progress: { ...emptyProgress, reviewedFiles: 1 },
				},
			},
			{ derived: "awaiting-agent", signal: { awaitingAgent: true } },
			{ derived: "awaiting-author", signal: { awaitingAuthor: true } },
			{
				derived: "changed-since-review",
				signal: { changedSinceReview: true },
			},
			{ derived: "conflicts", signal: { conflicts: true } },
			{ derived: "checks-failing", signal: { checksFailing: true } },
			{
				derived: "approved-blocked",
				signal: { approved: true, blockedBy: "feat-base" },
			},
			{
				derived: "ready-to-merge",
				signal: { approved: true, mergeable: true },
			},
			{ derived: "closed", snapshot: { closed: true } },
		];
		for (const item of cases) {
			expect(
				deriveReviewState({
					snapshot: snapshot("review-state", item.snapshot),
					signal: item.signal,
				}),
			).toBe(item.derived);
		}
	});

	it("projects inbox items from set-inbox-disposition without a full scan", () => {
		let scans = 0;
		const query = createReviewInboxQuery({
			scanAll: () => {
				scans += 1;
			},
		});
		const first = query.apply(snapshot("review-a"), {
			progress: emptyProgress,
		});
		query.apply(snapshot("review-b", { revision: 2n }), {
			progress: emptyProgress,
			checksFailing: true,
		});
		expect(first.itemId).toBe(reviewInboxItemId("review-a"));
		expect(first.manualDisposition).toBe("active");
		expect(query.get("review-b")?.derivedState).toBe("checks-failing");
		expect(scans).toBe(0);

		const event: ReviewDomainEvent = {
			type: REVIEW_EVENT_INBOX_DISPOSITION_SET,
			data: {
				commandId: "cmd-ignore",
				actorId: "human-1",
				reviewId: "review-a",
				at: "2026-08-12T02:00:00.000Z",
				disposition: "ignored",
			},
		};
		const ignored = query.applyDispositionEvent(event);
		expect(ignored.manualDisposition).toBe("ignored");
		expect(ignored.derivedState).toBe("needs-review");
		expect(query.get("review-b")?.derivedState).toBe("checks-failing");
		expect(scans).toBe(0);

		const restored = query.applyDisposition(
			"review-a",
			"active",
			"2026-08-12T03:00:00.000Z",
		);
		expect(restored.manualDisposition).toBe("active");
		expect(restored.derivedState).toBe("needs-review");
		expect(scans).toBe(0);
		expect(
			query
				.list()
				.map((item) => item.reviewId)
				.sort(),
		).toEqual(["review-a", "review-b"]);
	});

	it("restores ignored items and keeps closed member history", () => {
		const query = createReviewInboxQuery();
		query.apply(snapshot("review-closed", { closed: true }), {
			progress: emptyProgress,
			memberClosed: true,
			stack: { stackId: "stack-session-1", memberCount: 2 },
			targetLabel: "stack:stack-session-1",
		});
		const ignored = query.applyDisposition(
			"review-closed",
			"ignored",
			"2026-08-12T04:00:00.000Z",
		);
		expect(ignored.manualDisposition).toBe("ignored");
		expect(ignored.derivedState).toBe("closed");
		const restored = applyInboxDispositionEvent(ignored, "active", {
			at: "2026-08-12T05:00:00.000Z",
		});
		expect(restored.manualDisposition).toBe("active");
		expect(restored.derivedState).toBe("closed");
		expect(restored.stack).toEqual({
			stackId: "stack-session-1",
			memberCount: 2,
		});
	});

	it("rebuilds the inbox projection without mutating threads or coverage", () => {
		const truth = frozenTruth();
		const threadsBefore = structuredClone(truth.threads);
		const coverageBefore = structuredClone(truth.coverage);
		const query = createReviewInboxQuery();
		const items = query.rebuild(
			[
				{
					snapshot: snapshot("review-1"),
					signal: { progress: { ...emptyProgress, reviewedFiles: 1 } },
				},
			],
			truth,
		);
		expect(items).toHaveLength(1);
		expect(items[0]?.derivedState).toBe("in-progress");
		expect(items[0]?.targetLabel).toBe(
			reviewTargetLabel(snapshot("review-1").target),
		);
		expect(truth.threads).toEqual(threadsBefore);
		expect(truth.coverage).toEqual(coverageBefore);
		expect(truth.threads["thread-1"]?.messageIds).toEqual(["msg-1"]);
		expect(truth.coverage["cov-1"]?.state).toBe("reviewed");

		const next = projectReviewInboxItem({
			snapshot: snapshot("review-1", {
				inboxDisposition: "deferred" satisfies ReviewInboxDisposition,
			}),
			signal: { progress: emptyProgress, conflicts: true },
			truth,
		});
		expect(next.manualDisposition).toBe("deferred");
		expect(next.derivedState).toBe("conflicts");
		expect(next.attentionReasons).toContain("conflicts");
		expect(truth.threads).toEqual(threadsBefore);
		expect(truth.coverage).toEqual(coverageBefore);
	});
});
