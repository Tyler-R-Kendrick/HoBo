import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createResidentReviewRuntime } from "../src/review/resident-review-runtime.js";
import { ReviewError } from "../src/review/review-errors.js";
import {
	REVIEW_COMMAND_SCHEMA,
	type ReviewCommandEnvelope,
	type ReviewTarget,
} from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-code-review-conc-"));
	roots.push(root);
	return root;
}

function commitTarget(): ReviewTarget {
	return {
		kind: "commit",
		repositoryId: "repo-1",
		repositoryRoot: "/tmp/repo",
		parentCommitOid: "a".repeat(40),
		commitOid: "b".repeat(40),
	};
}

function envelope(
	reviewId: string,
	commandId: string,
	expectedRevision: bigint,
	command: ReviewCommandEnvelope["command"],
): ReviewCommandEnvelope {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId,
		actorId: "actor-1",
		reviewId,
		expectedRevision,
		command,
	};
}

describe("review concurrency", () => {
	it("lets unrelated reviews mutate at the same time", async () => {
		const dataDir = tempRoot();
		const left = createResidentReviewRuntime({ dataDir });
		const right = createResidentReviewRuntime({ dataDir });
		const results = await Promise.all([
			left.execute(
				envelope("review-a", "start-a", 0n, {
					kind: "start-review",
					target: commitTarget(),
				}),
			),
			right.execute(
				envelope("review-b", "start-b", 0n, {
					kind: "start-review",
					target: commitTarget(),
				}),
			),
		]);
		expect(results.map((result) => result.reviewId).sort()).toEqual([
			"review-a",
			"review-b",
		]);
		expect(results.every((result) => result.revision === 3n)).toBe(true);
		left.close();
		right.close();
	});

	it("gives one success and one typed conflict when one review is contended", async () => {
		const dataDir = tempRoot();
		const first = createResidentReviewRuntime({ dataDir });
		const created = await first.execute(
			envelope("review-race", "start", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const second = createResidentReviewRuntime({ dataDir });
		const results = await Promise.allSettled([
			first.execute(
				envelope("review-race", "close-1", created.revision, {
					kind: "close-review",
				}),
			),
			second.execute(
				envelope("review-race", "close-2", created.revision, {
					kind: "close-review",
				}),
			),
		]);
		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter((result) => result.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		const error = (rejected[0] as PromiseRejectedResult).reason;
		expect(error).toBeInstanceOf(ReviewError);
		expect(error).toMatchObject({ code: "stale-revision" });
		first.close();
		second.close();
	});

	it("does not take a global review lock", async () => {
		const dataDir = tempRoot();
		const held = createResidentReviewRuntime({ dataDir });
		await held.execute(
			envelope("review-held", "start-held", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		const lock = join(
			dataDir,
			"review-locks",
			`${createHash("sha256").update("review-held").digest("hex")}.lock`,
		);
		writeFileSync(lock, `hobo:${process.pid}-liveowner\n`);
		const other = createResidentReviewRuntime({ dataDir });
		const started = await other.execute(
			envelope("review-free", "start-free", 0n, {
				kind: "start-review",
				target: commitTarget(),
			}),
		);
		expect(started.reviewId).toBe("review-free");
		await expect(
			held.execute(
				envelope("review-held", "close-held", 3n, { kind: "close-review" }),
			),
		).rejects.toThrow("busy");
		other.close();
		held.close();
	});
});
