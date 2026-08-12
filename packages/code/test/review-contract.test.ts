import { describe, expect, it } from "vitest";
import {
	parseReviewCommand,
	parseReviewSnapshot,
	parseReviewTarget,
} from "../src/review/review-contract.js";
import { ReviewError } from "../src/review/review-errors.js";
import {
	REVIEW_COMMAND_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
} from "../src/review/review-ports.js";

describe("review contract", () => {
	it("parses a start-review command", () => {
		const command = parseReviewCommand({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "cmd-1",
			actorId: "actor-1",
			reviewId: "review-1",
			expectedRevision: "0",
			command: {
				kind: "start-review",
				target: {
					kind: "commit",
					repositoryId: "repo-1",
					repositoryRoot: "/tmp/repo",
					parentCommitOid: "a".repeat(40),
					commitOid: "b".repeat(40),
				},
			},
		});
		expect(command.expectedRevision).toBe(0n);
		expect(command.command.kind).toBe("start-review");
	});

	it("rejects unknown target kinds", () => {
		expect(() => parseReviewTarget({ kind: "gitlab" })).toThrow(ReviewError);
	});

	it("rejects unknown command schemas", () => {
		expect(() =>
			parseReviewCommand({
				schemaVersion: "hobo.code.review-command/v0",
				commandId: "c",
				actorId: "a",
				reviewId: "r",
				expectedRevision: 0,
				command: { kind: "refresh-review" },
			}),
		).toThrow(/unsupported review command schema/u);
	});

	it("parses a snapshot without embedding diff bodies", () => {
		const snapshot = parseReviewSnapshot({
			schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
			reviewId: "review-1",
			revision: 3,
			threadIds: ["t1"],
			coverageIds: [],
			inboxDisposition: "active",
			closed: false,
			updatedAt: "2026-08-12T00:00:00.000Z",
		});
		expect(snapshot.revision).toBe(3n);
		expect("diff" in snapshot).toBe(false);
		expect(Object.keys(snapshot).join(",")).not.toMatch(/diff|patch/u);
	});
});
