import { describe, expect, it } from "vitest";

import {
	createReviewAnchor,
	parseReviewAnchor,
} from "../src/review/review-anchors.js";
import {
	createReviewCoverageRecord,
	fileCoverageUnit,
	hunkCoverageUnit,
	invalidateCoverageForHunkEdit,
	summarizeReviewProgress,
} from "../src/review/review-coverage.js";
import { ReviewError } from "../src/review/review-errors.js";
import {
	createMemoryReviewDiffSource,
	type MemoryReviewFileInput,
} from "../src/review/review-generations.js";
import type { ReviewTarget } from "../src/review/review-ports.js";
import { createReviewReanchorEngine } from "../src/review/review-reanchor.js";

const baseTarget: ReviewTarget = {
	kind: "range",
	repositoryId: "repo-1",
	repositoryRoot: "/tmp/repo",
	requestedBaseRef: "main",
	requestedHeadRef: "feature",
	mergeBaseOid: "1".repeat(40),
	baseCommitOid: "2".repeat(40),
	headCommitOid: "3".repeat(40),
};

function source() {
	return createMemoryReviewDiffSource({
		now: () => "2026-08-12T00:00:00.000Z",
	});
}

async function generation(
	diff: ReturnType<typeof source>,
	files: readonly MemoryReviewFileInput[],
	target: ReviewTarget = baseTarget,
	predecessorGenerationId?: string,
) {
	diff.stageFiles(files);
	return diff.createGeneration({
		reviewId: "review-1",
		actorId: "human-1",
		target,
		...(predecessorGenerationId === undefined
			? {}
			: { predecessorGenerationId }),
	});
}

describe("review coverage", () => {
	it("does not interchange human and agent coverage", async () => {
		const diff = source();
		const gen = await generation(diff, [
			{ path: "a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
			{ path: "b.ts", oldText: "keep\n", newText: "keep\nOTHER\n" },
		]);
		const manifest = await diff.loadManifest(gen.id);
		const fileA = manifest.files.find((file) => file.pathAfter === "a.ts");
		const fileB = manifest.files.find((file) => file.pathAfter === "b.ts");
		if (fileA === undefined || fileB === undefined)
			throw new Error("missing files");
		const hunkA = (await diff.loadChunk(gen.id, fileA.fileId)).hunks[0];
		if (hunkA === undefined) throw new Error("missing hunk");

		const records = [
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: gen.id,
				unit: fileCoverageUnit(fileA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "agent-1",
				actorKind: "agent",
				generationId: gen.id,
				unit: fileCoverageUnit(fileA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "agent-1",
				actorKind: "agent",
				generationId: gen.id,
				unit: hunkCoverageUnit(fileA, hunkA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "system-1",
				actorKind: "system",
				generationId: gen.id,
				unit: fileCoverageUnit(fileB),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
		];

		const human = summarizeReviewProgress(records, manifest);
		const namedHuman = summarizeReviewProgress(records, manifest, {
			actorId: "human-1",
			actorKind: "human",
		});
		const agent = summarizeReviewProgress(records, manifest, {
			actorKind: "agent",
			actorId: "agent-1",
		});

		expect(human.reviewedFiles).toBe(1);
		expect(human.reviewedHunks).toBe(0);
		expect(namedHuman).toEqual(human);
		expect(agent.reviewedFiles).toBe(1);
		expect(agent.reviewedHunks).toBe(1);
		expect(human.totalFiles).toBe(2);
	});

	it("does not count excluded units as reviewed", async () => {
		const diff = source();
		const gen = await generation(diff, [
			{
				path: "gen.ts",
				oldText: "a\n",
				newText: "a\nb\n",
				generatedHint: true,
			},
		]);
		const manifest = await diff.loadManifest(gen.id);
		const file = manifest.files[0];
		if (file === undefined) throw new Error("missing file");
		const records = [
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: gen.id,
				unit: fileCoverageUnit(file),
				state: "excluded",
				exclusionReason: "generated",
			}),
		];
		const progress = summarizeReviewProgress(records, manifest);
		expect(progress.reviewedFiles).toBe(0);
		expect(progress.excludedUnits).toBe(1);
		expect(progress.staleUnits).toBe(0);
	});

	it("invalidates only the edited hunk and its file summary", async () => {
		const diff = source();
		const gen = await generation(diff, [
			{
				path: "a.ts",
				oldText: "keep\none\ntwo\n",
				newText: "keep\nONE\nTWO\n",
			},
			{ path: "b.ts", oldText: "keep\n", newText: "keep\nB\n" },
		]);
		const manifest = await diff.loadManifest(gen.id);
		const fileA = manifest.files.find((file) => file.pathAfter === "a.ts");
		const fileB = manifest.files.find((file) => file.pathAfter === "b.ts");
		if (fileA === undefined || fileB === undefined)
			throw new Error("missing files");
		const hunksA = (await diff.loadChunk(gen.id, fileA.fileId)).hunks;
		const hunkB = (await diff.loadChunk(gen.id, fileB.fileId)).hunks[0];
		const hunkA = hunksA[0];
		if (hunkA === undefined || hunkB === undefined)
			throw new Error("missing hunks");

		const records = [
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: gen.id,
				unit: fileCoverageUnit(fileA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "agent-1",
				actorKind: "agent",
				generationId: gen.id,
				unit: hunkCoverageUnit(fileA, hunkA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: gen.id,
				unit: fileCoverageUnit(fileB),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: gen.id,
				unit: hunkCoverageUnit(fileB, hunkB),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
		];

		const next = invalidateCoverageForHunkEdit(records, {
			fileId: fileA.fileId,
			hunkId: hunkA.hunkId,
			at: "2026-08-12T01:00:00.000Z",
		});
		expect(
			next.find(
				(record) =>
					record.unit.kind === "file" && record.unit.fileId === fileA.fileId,
			)?.state,
		).toBe("stale");
		expect(
			next.find(
				(record) =>
					record.unit.kind === "hunk" && record.unit.hunkId === hunkA.hunkId,
			)?.state,
		).toBe("stale");
		expect(
			next.find(
				(record) =>
					record.unit.kind === "file" && record.unit.fileId === fileB.fileId,
			)?.state,
		).toBe("reviewed");
		expect(
			next.find(
				(record) =>
					record.unit.kind === "hunk" && record.unit.hunkId === hunkB.hunkId,
			)?.state,
		).toBe("reviewed");
	});

	it("marks coverage stale after an agent edit in a later generation", async () => {
		const diff = source();
		const first = await generation(diff, [
			{ path: "a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
			{ path: "b.ts", oldText: "keep\n", newText: "keep\nSAFE\n" },
		]);
		const firstManifest = await diff.loadManifest(first.id);
		const fileA = firstManifest.files.find((file) => file.pathAfter === "a.ts");
		const fileB = firstManifest.files.find((file) => file.pathAfter === "b.ts");
		if (fileA === undefined || fileB === undefined)
			throw new Error("missing files");
		const hunkA = (await diff.loadChunk(first.id, fileA.fileId)).hunks[0];
		const hunkB = (await diff.loadChunk(first.id, fileB.fileId)).hunks[0];
		if (hunkA === undefined || hunkB === undefined)
			throw new Error("missing hunks");

		const records = [
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: first.id,
				unit: fileCoverageUnit(fileA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: first.id,
				unit: hunkCoverageUnit(fileA, hunkA),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: first.id,
				unit: fileCoverageUnit(fileB),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
			createReviewCoverageRecord({
				reviewId: "review-1",
				actorId: "human-1",
				actorKind: "human",
				generationId: first.id,
				unit: hunkCoverageUnit(fileB, hunkB),
				state: "reviewed",
				reviewedAt: "2026-08-12T00:00:00.000Z",
			}),
		];

		const second = await generation(
			diff,
			[
				{ path: "a.ts", oldText: "keep\n", newText: "keep\nCHANGED\n" },
				{ path: "b.ts", oldText: "keep\n", newText: "keep\nSAFE\n" },
			],
			baseTarget,
			first.id,
		);
		const engine = createReviewReanchorEngine(diff, {
			now: () => "2026-08-12T02:00:00.000Z",
		});
		const next = await engine.invalidateCoverage(records, second);
		expect(
			next.filter(
				(record) => record.unit.kind === "file" && record.state === "stale",
			),
		).toHaveLength(1);
		expect(
			next.filter(
				(record) => record.unit.kind === "hunk" && record.state === "stale",
			),
		).toHaveLength(1);
		expect(
			next.find(
				(record) => record.unit.kind === "file" && record.state === "reviewed",
			)?.unit,
		).toMatchObject({ kind: "file" });
		const liveFile = next.find(
			(record) => record.unit.kind === "file" && record.state === "reviewed",
		);
		expect(liveFile?.generationId).toBe(second.id);
	});

	it("rejects a line-number-only anchor", () => {
		expect(() =>
			parseReviewAnchor({
				anchorId: "a1",
				generationId: "g1",
				fileId: "f1",
				side: "new",
				startLine: 4,
				endLine: 4,
				contextBeforeHashes: [],
				contextAfterHashes: [],
			}),
		).toThrow(ReviewError);
		expect(() =>
			parseReviewAnchor({
				anchorId: "a1",
				generationId: "g1",
				fileId: "f1",
				side: "new",
				startLine: 4,
				endLine: 4,
				contextBeforeHashes: [],
				contextAfterHashes: [],
			}),
		).toThrow(/line number alone/u);
	});

	it("builds a content-backed line anchor from a chunk", async () => {
		const diff = source();
		const gen = await generation(diff, [
			{ path: "a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const manifest = await diff.loadManifest(gen.id);
		const file = manifest.files[0];
		if (file === undefined) throw new Error("missing file");
		const chunk = await diff.loadChunk(gen.id, file.fileId);
		const anchor = createReviewAnchor({
			generationId: gen.id,
			file,
			chunk,
			side: "new",
			startLine: 2,
			endLine: 2,
		});
		expect(anchor.selectedContentHash).toBeDefined();
		expect(anchor.hunkFingerprint).toBeDefined();
		expect(parseReviewAnchor(anchor).anchorId).toBe(anchor.anchorId);
	});
});
