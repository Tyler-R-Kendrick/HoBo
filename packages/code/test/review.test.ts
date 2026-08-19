import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { first, must } from "@hobo/core/total-access";
import { describe, expect, it } from "vitest";
import { reanchor } from "../src/review/review-anchors.js";
import { createReviewContentStore } from "../src/review/review-content-store.js";
import {
	parseReviewCommand,
	REVIEW_COMMAND_SCHEMA,
} from "../src/review/review-contract.js";
import {
	decodeReviewCursor,
	encodeReviewCursor,
} from "../src/review/review-cursors.js";
import { REVIEW_ERROR, ReviewError } from "../src/review/review-errors.js";
import { createReviewRuntime } from "../src/review/review-runtime.js";
import { renderReviewPane } from "../src/review/review-terminal.js";
import { parseUnifiedDiff } from "../src/review/unified-diff-parser.js";
import { sessionProcessRunner } from "../src/session-orchestrator.js";

async function gitRepo(): Promise<string> {
	const root = mkdtempSync(join(tmpdir(), "hobo-review-"));
	const runner = sessionProcessRunner();
	await runner.run("git", ["init"], root);
	await runner.run("git", ["config", "user.email", "dev@hobo.test"], root);
	await runner.run("git", ["config", "user.name", "HoBo"], root);
	writeFileSync(join(root, "src.ts"), "export const a = 1;\n");
	await runner.run("git", ["add", "src.ts"], root);
	await runner.run("git", ["commit", "-m", "base"], root);
	writeFileSync(join(root, "src.ts"), "export const a = 2;\n");
	await runner.run("git", ["add", "src.ts"], root);
	await runner.run("git", ["commit", "-m", "change"], root);
	return root;
}

describe("hobo-code review", () => {
	it("parses a review command and rejects empty ids", () => {
		expect(() => parseReviewCommand({})).toThrow(ReviewError);
		const parsed = parseReviewCommand({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "c1",
			actorId: "human",
			reviewId: "r1",
			refreshReview: {},
		});
		expect(parsed.command.case).toBe("refreshReview");
	});

	it("parses unified diffs and reanchors exact hunks", () => {
		const hunks = parseUnifiedDiff(
			"@@ -1,1 +1,1 @@\n-export const a = 1;\n+export const a = 2;\n",
		);
		expect(hunks).toHaveLength(1);
		const outcome = reanchor(
			{
				anchorId: "a",
				generationId: "g1",
				fileId: "f",
				hunkId: first(hunks).hunkId,
				hunkFingerprint: first(hunks).fingerprint,
				selectedContentHash: first(hunks).lines[1]?.rawTextHash ?? "",
				side: 2,
				contextBeforeHashes: [],
				contextAfterHashes: [],
			},
			hunks,
			"g2",
			"f",
		);
		expect(outcome.kind === "exact" || outcome.kind === "unique-context").toBe(
			true,
		);
	});

	it("stores content-addressed blobs and signed cursors", () => {
		const root = mkdtempSync(join(tmpdir(), "hobo-cas-"));
		const store = createReviewContentStore(root);
		const digest = store.put("hello review");
		expect(store.getText(digest)).toBe("hello review");
		expect(() => store.get("0".repeat(64))).toThrow(/missing/);
		const cursor = encodeReviewCursor(
			{ generationId: "g", fileId: "f", offset: 2 },
			"secret",
		);
		expect(decodeReviewCursor(cursor, "secret", "g").offset).toBe(2);
		expect(() => decodeReviewCursor(cursor, "secret", "other")).toThrow(
			ReviewError,
		);
	});

	it("starts a durable review over a real git repository", async () => {
		const repo = await gitRepo();
		const dataDir = mkdtempSync(join(tmpdir(), "hobo-review-data-"));
		mkdirSync(dataDir, { recursive: true });
		const runtime = createReviewRuntime({ dataDir, authorize: () => true });
		const started = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "start-1",
			actorId: "human",
			reviewId: "rev-1",
			startReview: {
				target: {
					kind: "REVIEW_TARGET_KIND_RANGE",
					repositoryId: repo,
					repositoryRoot: repo,
					baseCommitOid: "HEAD^",
					headCommitOid: "HEAD",
				},
			},
		});
		expect(started.accepted).toBe(true);
		expect(started.snapshot?.manifest?.totalFiles).toBeGreaterThan(0);
		const fileId = started.snapshot?.manifest?.files[0]?.fileId ?? "";
		const marked = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "mark-1",
			actorId: "human",
			reviewId: "rev-1",
			expectedRevision: String(started.snapshot?.revision ?? 0n),
			markReviewCoverage: {
				state: "REVIEW_COVERAGE_STATE_REVIEWED",
				unit: {
					kind: "file",
					fileId,
					contentIdentity: started.snapshot?.manifest?.files[0]?.newContentHash,
				},
			},
		});
		expect(marked.accepted).toBe(true);
		const threaded = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "thread-1",
			actorId: "human",
			reviewId: "rev-1",
			expectedRevision: String(marked.snapshot?.revision ?? 0n),
			createReviewThread: { body: "please name this constant" },
		});
		expect(threaded.accepted).toBe(true);
		const prepared = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "prep-1",
			actorId: "human",
			reviewId: "rev-1",
			expectedRevision: String(threaded.snapshot?.revision ?? 0n),
			prepareReviewSubmission: {
				decision: "REVIEW_DECISION_COMMENT",
				summaryBody: "looks good with one note",
				selectedMessageIds: [threaded.snapshot?.messages[0]?.messageId ?? ""],
			},
		});
		expect(prepared.snapshot?.pending?.effectDigest).toMatch(/^[a-f0-9]{64}$/);
		const published = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "pub-1",
			actorId: "human",
			reviewId: "rev-1",
			expectedRevision: String(prepared.snapshot?.revision ?? 0n),
			publishReviewSubmission: {
				pendingReviewId: prepared.snapshot?.pending?.pendingReviewId,
				authorizationDigest: prepared.snapshot?.pending?.effectDigest,
			},
		});
		expect(published.accepted).toBe(true);
		expect(published.snapshot?.submission?.providerReviewId).toBeTruthy();
		const replayed = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "pub-1",
			actorId: "human",
			reviewId: "rev-1",
			publishReviewSubmission: {
				pendingReviewId: prepared.snapshot?.pending?.pendingReviewId,
			},
		});
		expect(replayed.snapshot?.submission?.providerReviewId).toBe(
			published.snapshot?.submission?.providerReviewId,
		);
		expect(renderReviewPane(must(published.snapshot)).length).toBeGreaterThan(
			10,
		);
		const stale = await runtime.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "stale-1",
			actorId: "human",
			reviewId: "rev-1",
			expectedRevision: "1",
			refreshReview: {},
		});
		expect(stale.accepted).toBe(false);
		expect(stale.code).toBe(REVIEW_ERROR.STALE_REVISION);
		runtime.close();
	});

	it("does not treat malformed JSON as a review command", () => {
		expect(() => parseReviewCommand("start")).toThrow(/object/);
	});
});
