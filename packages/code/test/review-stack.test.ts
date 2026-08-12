import { describe, expect, it } from "vitest";

import {
	createReviewCoverageRecord,
	fileCoverageUnit,
	summarizeReviewProgress,
} from "../src/review/review-coverage.js";
import { ReviewError } from "../src/review/review-errors.js";
import { buildReviewManifest } from "../src/review/review-generations.js";
import type { ReviewStackMemberTarget } from "../src/review/review-ports.js";
import {
	closeReviewStackMember,
	createReviewStack,
	membersFromSessionStackView,
	planReviewStackSubmissions,
	type ReviewStackMemberDiff,
	restackReviewStackMember,
	stackFileCount,
} from "../src/review/review-stack.js";
import {
	collectStackLineProvenance,
	mapAggregateComment,
	requireCommentDestination,
} from "../src/review/review-stack-provenance.js";

const oid = (char: string) => char.repeat(40);

function member(
	memberId: string,
	base: string,
	head: string,
	number: number,
): ReviewStackMemberTarget {
	return {
		memberId,
		baseCommitOid: oid(base),
		headCommitOid: oid(head),
		mergeBaseOid: oid(base),
		provider: "github",
		host: "github.com",
		repository: "acme/widgets",
		number,
	};
}

function diff(
	target: ReviewStackMemberTarget,
	files: ReviewStackMemberDiff["files"],
): ReviewStackMemberDiff {
	return { member: target, files };
}

function twoMemberDiffs(): readonly ReviewStackMemberDiff[] {
	return [
		diff(member("feat-base", "1", "2", 11), [
			{ path: "src/shared.ts", oldText: "keep\n", newText: "keep\nbase\n" },
			{ path: "src/one.ts", oldText: "a\n", newText: "a\n1\n" },
		]),
		diff(member("feat-top", "2", "3", 12), [
			{
				path: "src/shared.ts",
				oldText: "keep\nbase\n",
				newText: "keep\nbase\ntop\n",
			},
			{ path: "src/two.ts", oldText: "b\n", newText: "b\n2\n" },
		]),
	];
}

function threeMemberDiffs(): readonly ReviewStackMemberDiff[] {
	return [
		...twoMemberDiffs(),
		diff(member("feat-tip", "3", "4", 13), [
			{ path: "src/three.ts", oldText: "c\n", newText: "c\n3\n" },
		]),
	];
}

describe("review stack", () => {
	it("keeps the session stack id and member order for two members", () => {
		const adopted = membersFromSessionStackView({
			stackId: "stack-session-1",
			view: {
				branches: [
					{ name: "feat-base", head: oid("2"), pr: { number: 11 } },
					{ name: "feat-top", head: oid("3"), pr: { number: 12 } },
				],
			},
			oids: {
				"feat-base": { baseCommitOid: oid("1"), mergeBaseOid: oid("1") },
				"feat-top": { baseCommitOid: oid("2"), mergeBaseOid: oid("2") },
			},
		});
		expect(adopted.stackId).toBe("stack-session-1");
		expect(adopted.members.map((item) => item.memberId)).toEqual([
			"feat-base",
			"feat-top",
		]);

		const stack = createReviewStack({
			reviewId: "review-stack-2",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: adopted.stackId,
			repositoryId: "repo-1",
			members: twoMemberDiffs(),
		});
		expect(stack.stackId).toBe("stack-session-1");
		expect(stack.members.map((item) => item.member.memberId)).toEqual([
			"feat-base",
			"feat-top",
		]);
		expect(stack.aggregate.target.kind).toBe("stack");
		expect(stack.members).toHaveLength(2);
		expect(stack.members[0]?.generation.id).not.toBe(stack.aggregate.id);
		expect(stack.members[1]?.generation.id).not.toBe(stack.aggregate.id);
		expect(stack.members[0]?.generation.id).not.toBe(
			stack.members[1]?.generation.id,
		);
	});

	it("opens a three-member stack with member and aggregate generations", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-3",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-3",
			repositoryId: "repo-1",
			members: threeMemberDiffs(),
		});
		expect(stack.members).toHaveLength(3);
		expect(new Set(stack.members.map((item) => item.generation.id)).size).toBe(
			3,
		);
		expect(stack.aggregate.target).toMatchObject({
			kind: "stack",
			stackId: "stack-session-3",
		});
		expect(stack.historicalGenerations).toEqual([]);
	});

	it("counts the same path once per member, not once for the stack", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-dup",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-dup",
			repositoryId: "repo-1",
			members: twoMemberDiffs(),
		});
		expect(stackFileCount(stack)).toBe(4);
		const shared = stack.aggregateFiles.filter(
			(file) => (file.pathAfter ?? file.pathBefore) === "src/shared.ts",
		);
		expect(shared).toHaveLength(2);
		expect(shared[0]?.fileId).not.toBe(shared[1]?.fileId);

		const first = shared[0];
		if (first === undefined) throw new Error("missing shared file");
		const manifest = buildReviewManifest(stack.aggregate, stack.aggregateFiles);
		const progress = summarizeReviewProgress(
			[
				createReviewCoverageRecord({
					reviewId: stack.reviewId,
					actorId: "human-1",
					actorKind: "human",
					generationId: stack.aggregate.id,
					unit: fileCoverageUnit(first),
					state: "reviewed",
					reviewedAt: "2026-08-12T00:00:00.000Z",
				}),
			],
			manifest,
		);
		expect(progress.reviewedFiles).toBe(1);
		expect(progress.totalFiles).toBe(4);
	});

	it("recomputes descendants on a lower-member restack and keeps history", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-restack",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-restack",
			repositoryId: "repo-1",
			members: threeMemberDiffs(),
		});
		const before = {
			aggregate: stack.aggregate.id,
			members: stack.members.map((item) => item.generation.id),
		};
		const restacked = restackReviewStackMember(stack, {
			actorId: "human-1",
			createdAt: "2026-08-12T01:00:00.000Z",
			memberId: "feat-base",
			members: [
				diff(member("feat-base", "5", "6", 11), [
					{
						path: "src/shared.ts",
						oldText: "keep\n",
						newText: "keep\nbase-v2\n",
					},
					{ path: "src/one.ts", oldText: "a\n", newText: "a\n1b\n" },
				]),
				diff(member("feat-top", "6", "7", 12), [
					{
						path: "src/shared.ts",
						oldText: "keep\nbase-v2\n",
						newText: "keep\nbase-v2\ntop-v2\n",
					},
					{ path: "src/two.ts", oldText: "b\n", newText: "b\n2b\n" },
				]),
				diff(member("feat-tip", "7", "8", 13), [
					{ path: "src/three.ts", oldText: "c\n", newText: "c\n3b\n" },
				]),
			],
		});
		expect(restacked.members.map((item) => item.generation.id)).not.toEqual(
			before.members,
		);
		expect(restacked.aggregate.id).not.toBe(before.aggregate);
		expect(restacked.historicalGenerations.map((item) => item.id)).toEqual(
			expect.arrayContaining([before.aggregate, ...before.members]),
		);
		expect(restacked.historicalGenerations.map((item) => item.id)).not.toEqual(
			expect.arrayContaining(
				restacked.members.map((item) => item.generation.id),
			),
		);
	});

	it("maps an aggregate comment to one member and requires a pick when ambiguous", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-comment",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-comment",
			repositoryId: "repo-1",
			members: twoMemberDiffs(),
		});
		const unique = mapAggregateComment(stack, {
			messageId: "msg-one",
			path: "src/one.ts",
		});
		expect(unique).toEqual({
			kind: "unique",
			memberId: "feat-base",
			number: 11,
		});
		const ambiguous = mapAggregateComment(stack, {
			messageId: "msg-shared",
			path: "src/shared.ts",
		});
		expect(ambiguous.kind).toBe("ambiguous");
		if (ambiguous.kind !== "ambiguous") throw new Error("expected ambiguous");
		expect(ambiguous.candidates.map((item) => item.memberId)).toEqual([
			"feat-base",
			"feat-top",
		]);
		expect(() => requireCommentDestination(ambiguous)).toThrow(ReviewError);
		const selected = mapAggregateComment(stack, {
			messageId: "msg-shared",
			path: "src/shared.ts",
			memberId: "feat-top",
		});
		expect(selected).toEqual({
			kind: "unique",
			memberId: "feat-top",
			number: 12,
		});
	});

	it("plans a separate GitHub submission per PR", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-submit",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-submit",
			repositoryId: "repo-1",
			members: twoMemberDiffs(),
		});
		const plans = planReviewStackSubmissions({
			stack,
			comments: [
				{ messageId: "msg-1", path: "src/one.ts" },
				{ messageId: "msg-2", path: "src/two.ts" },
			],
		});
		expect(plans).toHaveLength(2);
		expect(plans.map((item) => item.number)).toEqual([11, 12]);
		expect(plans.every((item) => item.messageIds.length === 1)).toBe(true);
		expect(() =>
			planReviewStackSubmissions({
				stack,
				comments: [{ messageId: "msg-shared", path: "src/shared.ts" }],
			}),
		).toThrow(ReviewError);
	});

	it("keeps closed member generations in history", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-closed",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-closed",
			repositoryId: "repo-1",
			members: twoMemberDiffs(),
		});
		const closed = closeReviewStackMember(stack, "feat-base");
		expect(closed.members[0]?.closed).toBe(true);
		expect(closed.members[1]?.closed).toBe(false);
		expect(closed.members[0]?.generation.id).toBe(
			stack.members[0]?.generation.id,
		);
		expect(closed.historicalGenerations.map((item) => item.id)).toContain(
			stack.members[0]?.generation.id,
		);
	});

	it("attaches line and hunk provenance to the owning member", () => {
		const stack = createReviewStack({
			reviewId: "review-stack-prov",
			actorId: "human-1",
			createdAt: "2026-08-12T00:00:00.000Z",
			stackId: "stack-session-prov",
			repositoryId: "repo-1",
			members: twoMemberDiffs(),
		});
		const rows = collectStackLineProvenance(stack);
		expect(rows.length).toBeGreaterThan(0);
		const shared = rows.filter((row) => row.path === "src/shared.ts");
		expect(new Set(shared.map((row) => row.memberId))).toEqual(
			new Set(["feat-base", "feat-top"]),
		);
		expect(shared.every((row) => row.hunkId.length > 0)).toBe(true);
		expect(shared.every((row) => row.lineId.length > 0)).toBe(true);
	});
});
