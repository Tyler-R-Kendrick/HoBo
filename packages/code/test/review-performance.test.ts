import { describe, expect, it } from "vitest";

import { projectReviewInboxItem } from "../src/review/review-inbox.js";
import {
	REVIEW_SNAPSHOT_SCHEMA,
	type ReviewSnapshot,
} from "../src/review/review-ports.js";

function snapshot(index: number): ReviewSnapshot {
	return {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId: `review-${index}`,
		revision: 1n,
		threadIds: [],
		coverageIds: [],
		inboxDisposition: "active",
		closed: false,
		updatedAt: "2026-08-12T00:00:00.000Z",
		target: {
			kind: "commit",
			repositoryId: "repo",
			repositoryRoot: "/tmp/repo",
			parentCommitOid: "a".repeat(40),
			commitOid: "b".repeat(40),
		},
	};
}

describe("review inbox performance", () => {
	it("projects a thousand inbox items without a full-scan callback", () => {
		const start = performance.now();
		const items = Array.from({ length: 1000 }, (_, index) =>
			projectReviewInboxItem({ snapshot: snapshot(index) }),
		);
		const elapsed = performance.now() - start;
		expect(items).toHaveLength(1000);
		expect(items[999]?.itemId).toBe("inbox:review-999");
		expect(elapsed).toBeLessThan(250);
	});
});
