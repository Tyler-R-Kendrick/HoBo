import { describe, expect, it } from "vitest";

import {
	collectSideLines,
	createReviewAnchor,
	hashReviewText,
} from "../src/review/review-anchors.js";
import {
	createMemoryReviewDiffSource,
	type MemoryReviewFileInput,
} from "../src/review/review-generations.js";
import { interdiffGenerations } from "../src/review/review-interdiff.js";
import type {
	ReviewAnchor,
	ReviewGeneration,
	ReviewTarget,
} from "../src/review/review-ports.js";
import {
	createReviewReanchorEngine,
	REANCHOR_FUZZY_THRESHOLD,
	REANCHOR_INDEXED_OPERATION_BOUND,
} from "../src/review/review-reanchor.js";

const origin: ReviewTarget = {
	kind: "range",
	repositoryId: "repo-1",
	repositoryRoot: "/tmp/repo",
	requestedBaseRef: "main",
	requestedHeadRef: "feature",
	mergeBaseOid: "a".repeat(40),
	baseCommitOid: "b".repeat(40),
	headCommitOid: "c".repeat(40),
};

function retarget(
	headCommitOid: string,
	mergeBaseOid = origin.kind === "range" ? origin.mergeBaseOid : "a".repeat(40),
): ReviewTarget {
	return { ...origin, headCommitOid, mergeBaseOid };
}

function memory() {
	return createMemoryReviewDiffSource({
		now: () => "2026-08-12T00:00:00.000Z",
	});
}

async function makeGeneration(
	diff: ReturnType<typeof memory>,
	files: readonly MemoryReviewFileInput[],
	target: ReviewTarget = origin,
	predecessor?: ReviewGeneration,
) {
	diff.stageFiles(files);
	return diff.createGeneration({
		reviewId: "review-1",
		actorId: "human-1",
		target,
		...(predecessor === undefined
			? {}
			: { predecessorGenerationId: predecessor.id }),
	});
}

async function anchorOn(
	diff: ReturnType<typeof memory>,
	generation: ReviewGeneration,
	path: string,
	text: string,
	side: "old" | "new" = "new",
): Promise<ReviewAnchor> {
	const manifest = await diff.loadManifest(generation.id);
	const file = manifest.files.find(
		(item) => item.pathAfter === path || item.pathBefore === path,
	);
	if (file === undefined) throw new Error(`missing file ${path}`);
	const chunk = await diff.loadChunk(generation.id, file.fileId);
	const line = collectSideLines(chunk, side).find(
		(item) => item.displayText === text,
	);
	if (line === undefined) throw new Error(`missing ${side} line ${text}`);
	return createReviewAnchor({
		generationId: generation.id,
		file,
		chunk,
		side,
		startLine: line.line,
		endLine: line.line,
	});
}

describe("review reanchor properties", () => {
	it("remaps after inserts and deletes before the selected line", async () => {
		for (let inserted = 1; inserted <= 8; inserted += 1) {
			const diff = memory();
			const first = await makeGeneration(diff, [
				{
					path: "src/a.ts",
					oldText: "alpha\nbeta\n",
					newText: "alpha\nbeta\nTARGET\n",
				},
			]);
			const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
			const prefix = Array.from(
				{ length: inserted },
				(_, index) => `ins-${index}`,
			).join("\n");
			const second = await makeGeneration(
				diff,
				[
					{
						path: "src/a.ts",
						oldText: "alpha\nbeta\n",
						newText: `${prefix}\nalpha\nbeta\nTARGET\n`,
					},
				],
				origin,
				first,
			);
			const engine = createReviewReanchorEngine(diff);
			const outcome = await engine.reanchor(anchor, second);
			expect(outcome.kind, `insert ${inserted}`).toBe("unique-context");
			if (outcome.kind !== "unique-context") throw new Error("expected remap");
			expect(outcome.newAnchor.startLine).toBe(
				(anchor.startLine ?? 0) + inserted,
			);
			expect(outcome.newAnchor.selectedContentHash).toBe(
				anchor.selectedContentHash,
			);
		}

		for (let removed = 1; removed <= 3; removed += 1) {
			const prefix = Array.from({ length: 3 }, (_, index) => `pre-${index}`);
			const diff = memory();
			const first = await makeGeneration(diff, [
				{
					path: "src/a.ts",
					oldText: "base\n",
					newText: `${prefix.join("\n")}\nTARGET\n`,
				},
			]);
			const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
			const nextPrefix = prefix.slice(removed);
			const nextBody =
				nextPrefix.length === 0
					? "TARGET\n"
					: `${nextPrefix.join("\n")}\nTARGET\n`;
			const second = await makeGeneration(
				diff,
				[
					{
						path: "src/a.ts",
						oldText: "base\n",
						newText: nextBody,
					},
				],
				origin,
				first,
			);
			const outcome = await createReviewReanchorEngine(diff).reanchor(
				anchor,
				second,
			);
			expect(outcome.kind, `delete ${removed}`).not.toBe("ambiguous");
			if (outcome.kind === "exact" || outcome.kind === "unique-context") {
				expect(outcome.newAnchor.startLine).toBe(
					(anchor.startLine ?? 0) - removed,
				);
			}
		}
	});

	it("marks an in-place edit of the selected content stale", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
		const second = await makeGeneration(
			diff,
			[{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nCHANGED\n" }],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(outcome).toMatchObject({ kind: "stale", reason: "content-changed" });
	});

	it("follows a rename of the same blob", async () => {
		const diff = memory();
		const body = "keep\nTARGET\n";
		const first = await makeGeneration(diff, [
			{ path: "src/old.ts", oldText: "keep\n", newText: body },
		]);
		const anchor = await anchorOn(diff, first, "src/old.ts", "TARGET");
		const second = await makeGeneration(
			diff,
			[
				{
					path: "src/new.ts",
					pathBefore: "src/old.ts",
					status: "renamed",
					oldText: "keep\n",
					newText: body,
					newBlobOid: anchor.headBlobOid,
				},
			],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(outcome.kind).toBe("exact");
		if (outcome.kind !== "exact") throw new Error("expected exact");
		expect(outcome.method).toBe("rename-same-blob");
		expect(outcome.newAnchor.pathAfter).toBe("src/new.ts");
	});

	it("remaps a rename plus nearby edit via unique selected content", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{
				path: "src/old.ts",
				oldText: "keep\n",
				newText: "keep\nTARGET\ntrail\n",
			},
		]);
		const anchor = await anchorOn(diff, first, "src/old.ts", "TARGET");
		const second = await makeGeneration(
			diff,
			[
				{
					path: "src/new.ts",
					pathBefore: "src/old.ts",
					status: "renamed",
					oldText: "keep\n",
					newText: "keep\nTARGET\ntrail-edited\n",
				},
			],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(["unique-context", "exact"]).toContain(outcome.kind);
		if (outcome.kind !== "unique-context" && outcome.kind !== "exact") {
			throw new Error("expected remap");
		}
		expect(outcome.newAnchor.pathAfter).toBe("src/new.ts");
		expect(outcome.newAnchor.selectedContentHash).toBe(
			anchor.selectedContentHash,
		);
	});

	it("never first-matches duplicate selected blocks", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{
				path: "src/a.ts",
				oldText: "keep\n",
				newText: "keep\nTARGET\nctx-a\nkeep\nTARGET\nctx-a\n",
			},
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
		const second = await makeGeneration(
			diff,
			[
				{
					path: "src/a.ts",
					oldText: "keep\n",
					newText: "INSERTED\nkeep\nTARGET\nctx-a\nkeep\nTARGET\nctx-a\n",
				},
			],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(outcome.kind).toBe("ambiguous");
		if (outcome.kind !== "ambiguous") throw new Error("expected ambiguous");
		expect(outcome.reason).toBe("multiple-matches");
		expect(outcome.candidates.length).toBeGreaterThan(1);
	});

	it("treats amend, clean rebase, and same-content force-push as identity remaps", async () => {
		const files: MemoryReviewFileInput[] = [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		];
		const diff = memory();
		const first = await makeGeneration(diff, files, origin);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");

		const amended = await makeGeneration(
			diff,
			files,
			retarget("d".repeat(40)),
			first,
		);
		const rebased = await makeGeneration(
			diff,
			files,
			retarget("e".repeat(40), "f".repeat(40)),
			amended,
		);
		const forced = await makeGeneration(
			diff,
			files,
			retarget("0".repeat(40)),
			rebased,
		);

		for (const generation of [amended, rebased, forced]) {
			const outcome = await createReviewReanchorEngine(diff).reanchor(
				anchor,
				generation,
			);
			expect(outcome.kind, generation.target.kind).toBe("exact");
			if (outcome.kind !== "exact") throw new Error("expected exact");
			expect(outcome.method).toBe("same-blob");
		}
	});

	it("stales a force-push that rewrites the selected content", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
		const forced = await makeGeneration(
			diff,
			[{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nOTHER\n" }],
			retarget("9".repeat(40)),
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			forced,
		);
		expect(outcome).toMatchObject({ kind: "stale" });
	});

	it("normalizes CRLF so line-ending-only refreshes rematch", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
		const second = await makeGeneration(
			diff,
			[
				{
					path: "src/a.ts",
					oldText: "keep\r\n",
					newText: "keep\r\nTARGET\r\n",
				},
			],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(outcome.kind).toBe("exact");
		expect(hashReviewText("keep\r\nTARGET\r\n")).toBe(
			hashReviewText("keep\nTARGET\n"),
		);
	});

	it("preserves unicode selected content across remaps", async () => {
		const samples = ["café", "日本語", "🙂👍", "a\u0301", "שלום"];
		for (const sample of samples) {
			const diff = memory();
			const first = await makeGeneration(diff, [
				{ path: "src/a.ts", oldText: "keep\n", newText: `keep\n${sample}\n` },
			]);
			const anchor = await anchorOn(diff, first, "src/a.ts", sample);
			const second = await makeGeneration(
				diff,
				[
					{
						path: "src/a.ts",
						oldText: "keep\n",
						newText: `pad\nkeep\n${sample}\n`,
					},
				],
				origin,
				first,
			);
			const outcome = await createReviewReanchorEngine(diff).reanchor(
				anchor,
				second,
			);
			expect(outcome.kind, sample).not.toBe("stale");
			if (outcome.kind === "exact" || outcome.kind === "unique-context") {
				expect(outcome.newAnchor.selectedContentHash).toBe(
					anchor.selectedContentHash,
				);
			}
		}
	});

	it("stales an old-side deletion that disappears", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\nGONE\n", newText: "keep\n" },
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "GONE", "old");
		const second = await makeGeneration(
			diff,
			[{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nadded\n" }],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(outcome.kind).toBe("stale");
		if (outcome.kind !== "stale") throw new Error("expected stale");
		expect(["deleted", "content-changed", "no-match"]).toContain(
			outcome.reason,
		);
	});

	it("stales anchors when the file is deleted", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
		const second = await makeGeneration(
			diff,
			[{ path: "src/a.ts", status: "deleted", oldText: "keep\nTARGET\n" }],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			second,
		);
		expect(outcome).toMatchObject({ kind: "stale", reason: "deleted" });
	});

	it("reanchors binary files only by file identity", async () => {
		const bytes = "not-a-line";
		const diff = memory();
		const first = await makeGeneration(diff, [
			{
				path: "img.bin",
				oldText: bytes,
				newText: bytes,
				binary: true,
				newBlobOid: "blob-1",
			},
		]);
		const manifest = await diff.loadManifest(first.id);
		const file = manifest.files[0];
		if (file === undefined) throw new Error("missing binary");
		const chunk = await diff.loadChunk(first.id, file.fileId);
		const anchor = createReviewAnchor({
			generationId: first.id,
			file,
			chunk,
			side: "file",
		});
		const moved = await makeGeneration(
			diff,
			[
				{
					path: "assets/img.bin",
					pathBefore: "img.bin",
					status: "renamed",
					oldText: bytes,
					newText: bytes,
					binary: true,
					newBlobOid: "blob-1",
				},
			],
			origin,
			first,
		);
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			moved,
		);
		expect(outcome.kind).toBe("exact");
		if (outcome.kind !== "exact") throw new Error("expected exact");
		expect(outcome.method).toBe("rename-same-blob");

		const rewritten = await makeGeneration(
			diff,
			[
				{
					path: "assets/img.bin",
					binary: true,
					oldText: bytes,
					newText: "other",
					newBlobOid: "blob-2",
				},
			],
			origin,
			moved,
		);
		const stale = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			rewritten,
		);
		expect(stale.kind).toBe("stale");
	});

	it("fails closed when indexed operations exceed the bound", async () => {
		const diff = memory();
		const files = Array.from({ length: 12 }, (_, index) => ({
			path: `src/f${index}.ts`,
			oldText: "keep\n",
			newText: `keep\nTARGET-${index}\n`,
		}));
		const first = await makeGeneration(diff, files);
		const anchor = await anchorOn(diff, first, "src/f0.ts", "TARGET-0");
		const second = await makeGeneration(
			diff,
			files,
			retarget("d".repeat(40)),
			first,
		);
		const engine = createReviewReanchorEngine(diff, { operationBound: 4 });
		await expect(engine.reanchor(anchor, second)).rejects.toMatchObject({
			code: "page-limit",
		});
		expect(REANCHOR_INDEXED_OPERATION_BOUND).toBeGreaterThan(4);
		expect(REANCHOR_FUZZY_THRESHOLD).toBeGreaterThan(0);
		expect(REANCHOR_FUZZY_THRESHOLD).toBeLessThanOrEqual(1);

		const unbounded = createReviewReanchorEngine(diff);
		const outcome = await unbounded.reanchor(anchor, second);
		expect(outcome.kind).toBe("exact");
		expect(unbounded.lastIndexedOperations).toBeLessThanOrEqual(
			REANCHOR_INDEXED_OPERATION_BOUND,
		);
		expect(unbounded.lastIndexedOperations).toBeLessThan(files.length * 80);
	});

	it("uses same-generation identity when the generation did not change", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const anchor = await anchorOn(diff, first, "src/a.ts", "TARGET");
		const outcome = await createReviewReanchorEngine(diff).reanchor(
			anchor,
			first,
		);
		expect(outcome).toMatchObject({ kind: "exact", method: "same-generation" });
	});

	it("classifies interdiff for amend versus content rewrite", async () => {
		const diff = memory();
		const first = await makeGeneration(diff, [
			{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" },
		]);
		const same = await makeGeneration(
			diff,
			[{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nTARGET\n" }],
			retarget("d".repeat(40)),
			first,
		);
		const changed = await makeGeneration(
			diff,
			[{ path: "src/a.ts", oldText: "keep\n", newText: "keep\nNEW\n" }],
			retarget("e".repeat(40)),
			same,
		);
		const from = await diff.loadManifest(first.id);
		const toSame = await diff.loadManifest(same.id);
		const toChanged = await diff.loadManifest(changed.id);
		expect(interdiffGenerations(from, toSame).files[0]?.kind).toBe("unchanged");
		expect(interdiffGenerations(from, toChanged).files[0]?.kind).toBe(
			"modified",
		);
	});
});
