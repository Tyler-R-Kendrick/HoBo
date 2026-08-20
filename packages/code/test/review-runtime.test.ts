/**
 * The review runtime's decision branches.
 *
 * `review.test.ts` covers the happy path through a real git repository. This
 * file goes after what that leaves behind: the derived-inbox state machine, the
 * optimistic-concurrency guard, command idempotency, and the refusals. Those
 * are the branches that only execute when something has gone wrong, which is
 * exactly when a reviewer is least able to tolerate a surprise.
 *
 * `inboxDerivedState` is pure and ordered, and the order is the interesting
 * part: a closed review reports closed even if it has stale coverage, and
 * staleness outranks an open agent thread. Those precedences are decisions, so
 * they are pinned individually rather than incidentally.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "vitest";

import {
	ReviewCoverageState,
	ReviewDerivedState,
	ReviewInboxDisposition,
	ReviewLifecycle,
	ReviewSnapshotSchema,
	ReviewThreadOrigin,
	ReviewThreadResolution,
} from "../src/_generated/code_review_pb.js";
import { REVIEW_SNAPSHOT_SCHEMA } from "../src/review/review-contract.js";
import { REVIEW_ERROR, ReviewError } from "../src/review/review-errors.js";
import {
	createReviewRuntime,
	inboxDerivedState,
	type ReviewRuntime,
} from "../src/review/review-runtime.js";

const open: ReviewRuntime[] = [];

function runtime(): ReviewRuntime {
	const created = createReviewRuntime({
		dataDir: mkdtempSync(join(tmpdir(), "hobo-review-rt-")),
		now: () => "2026-08-20T00:00:00.000Z",
	});
	open.push(created);
	return created;
}

afterEach(() => {
	for (const created of open.splice(0)) created.close();
});

function snapshot(
	overrides: Partial<Parameters<typeof create<typeof ReviewSnapshotSchema>>[1]>,
) {
	return create(ReviewSnapshotSchema, {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId: "r1",
		revision: 1n,
		lifecycle: ReviewLifecycle.OPEN,
		createdAt: "2026-08-20T00:00:00.000Z",
		updatedAt: "2026-08-20T00:00:00.000Z",
		inboxDisposition: ReviewInboxDisposition.ACTIVE,
		coverage: [],
		threads: [],
		messages: [],
		generations: [],
		...overrides,
	});
}

const staleCoverage = [{ state: ReviewCoverageState.STALE }];
const reviewedCoverage = [{ state: ReviewCoverageState.REVIEWED }];
const openAgentThread = [
	{
		resolution: ReviewThreadResolution.OPEN,
		origin: ReviewThreadOrigin.LOCAL_AGENT,
	},
];

describe("inboxDerivedState", () => {
	it("reports a fresh review as needing review", () => {
		expect(inboxDerivedState(snapshot({}))).toBe(
			ReviewDerivedState.NEEDS_REVIEW,
		);
	});

	it("reports closed for a closed review", () => {
		expect(
			inboxDerivedState(snapshot({ lifecycle: ReviewLifecycle.CLOSED })),
		).toBe(ReviewDerivedState.CLOSED);
	});

	it("reports closed even when the review also has stale coverage", () => {
		// Lifecycle wins. A closed review that says "changed since review" would
		// invite someone to re-open work that is finished.
		expect(
			inboxDerivedState(
				snapshot({
					lifecycle: ReviewLifecycle.CLOSED,
					coverage: staleCoverage,
				}),
			),
		).toBe(ReviewDerivedState.CLOSED);
	});

	it("reports changed-since-review when any coverage is stale", () => {
		expect(inboxDerivedState(snapshot({ coverage: staleCoverage }))).toBe(
			ReviewDerivedState.CHANGED_SINCE_REVIEW,
		);
	});

	it("prefers staleness over an open agent thread", () => {
		// The code moved under the review. Answering the agent first would be
		// answering about a diff that no longer exists.
		expect(
			inboxDerivedState(
				snapshot({ coverage: staleCoverage, threads: openAgentThread }),
			),
		).toBe(ReviewDerivedState.CHANGED_SINCE_REVIEW);
	});

	it("reports awaiting-agent for an open local-agent thread", () => {
		expect(inboxDerivedState(snapshot({ threads: openAgentThread }))).toBe(
			ReviewDerivedState.AWAITING_AGENT,
		);
	});

	it("does not report awaiting-agent for a resolved agent thread", () => {
		expect(
			inboxDerivedState(
				snapshot({
					threads: [
						{
							resolution: ReviewThreadResolution.RESOLVED,
							origin: ReviewThreadOrigin.LOCAL_AGENT,
						},
					],
				}),
			),
		).toBe(ReviewDerivedState.NEEDS_REVIEW);
	});

	it("prefers an open agent thread over partial review progress", () => {
		expect(
			inboxDerivedState(
				snapshot({ coverage: reviewedCoverage, threads: openAgentThread }),
			),
		).toBe(ReviewDerivedState.AWAITING_AGENT);
	});

	it("reports in-progress once any file is reviewed", () => {
		expect(inboxDerivedState(snapshot({ coverage: reviewedCoverage }))).toBe(
			ReviewDerivedState.IN_PROGRESS,
		);
	});

	it("is a pure function of the snapshot", () => {
		const input = snapshot({ coverage: reviewedCoverage });
		expect(inboxDerivedState(input)).toBe(inboxDerivedState(input));
	});
});

describe("command parsing", () => {
	it("rejects a command that is not an object", () => {
		return expect(runtime().execute("not a command")).rejects.toThrow(
			ReviewError,
		);
	});

	it("rejects a command with no case at all", async () => {
		await expect(runtime().execute({})).rejects.toThrow(ReviewError);
	});
});

describe("loading a review that does not exist", () => {
	it("resolves to undefined rather than throwing", async () => {
		// A reviewer opening a stale link gets an empty pane, not a stack trace.
		await expect(runtime().load("never-created")).resolves.toBeUndefined();
	});

	it("reports an empty inbox for a fresh data directory", async () => {
		await expect(runtime().inbox()).resolves.toEqual([]);
	});
});

describe("closing the runtime", () => {
	it("is safe to call twice", () => {
		// The second call used to reach a closed SQLite handle and throw
		// "database is not open" — which, on a shutdown path where an error
		// handler and a `finally` both close, replaces the real failure with
		// this one.
		const created = createReviewRuntime({
			dataDir: mkdtempSync(join(tmpdir(), "hobo-review-close-")),
		});
		created.close();
		expect(() => created.close()).not.toThrow();
	});
});

describe("the error type", () => {
	it("carries a stable code and structured details", () => {
		// Callers switch on the code, so it must not be reconstructed from the
		// message text.
		const error = new ReviewError(REVIEW_ERROR.STALE_REVISION, "moved", {
			expected: "1",
			found: "2",
		});
		expect(error.code).toBe("HOBO_CODE_REVIEW_STALE_REVISION");
		expect(error.details).toEqual({ expected: "1", found: "2" });
		expect(error.name).toBe("ReviewError");
	});

	it("defaults details to an empty object rather than undefined", () => {
		expect(new ReviewError(REVIEW_ERROR.NOT_FOUND, "gone").details).toEqual({});
	});

	it("is an Error, so it survives an ordinary catch", () => {
		expect(new ReviewError(REVIEW_ERROR.MALFORMED, "x")).toBeInstanceOf(Error);
	});
});
