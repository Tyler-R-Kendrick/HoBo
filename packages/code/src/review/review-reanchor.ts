import {
	collectSideLines,
	contextHashesAround,
	createReviewAnchor,
	fileContentIdentity,
	type ReviewSideLine,
	reviewFilePath,
	windowsWithContentHash,
} from "./review-anchors.js";
import { remapCoverageRecords } from "./review-coverage.js";
import { reviewError } from "./review-errors.js";
import type { MemoryReviewDiffSource } from "./review-generations.js";
import { interdiffGenerations } from "./review-interdiff.js";
import type {
	ReanchorCandidate,
	ReanchorOutcome,
	ReviewAnchor,
	ReviewCoverageRecord,
	ReviewDiffChunk,
	ReviewDiffManifest,
	ReviewDiffSource,
	ReviewFileSummary,
	ReviewGeneration,
	ReviewHunk,
	ReviewReanchorEngine,
} from "./review-ports.js";

/** Last-resort remap requires exact selected content and this ordered-context overlap. */
export const REANCHOR_FUZZY_THRESHOLD = 0.5;

/** Fail-closed ceiling for index inserts, lookups, and candidate visits per call. */
export const REANCHOR_INDEXED_OPERATION_BOUND = 65_536;

export interface ReviewReanchorEngineOptions {
	readonly operationBound?: number;
	readonly fuzzyThreshold?: number;
	readonly now?: () => string;
}

export interface ReviewReanchorEngineHandle extends ReviewReanchorEngine {
	readonly lastIndexedOperations: number;
}

export function createReviewReanchorEngine(
	source: ReviewDiffSource,
	options: ReviewReanchorEngineOptions = {},
): ReviewReanchorEngineHandle {
	const operationBound =
		options.operationBound ?? REANCHOR_INDEXED_OPERATION_BOUND;
	const fuzzyThreshold = options.fuzzyThreshold ?? REANCHOR_FUZZY_THRESHOLD;
	const now = options.now ?? (() => new Date().toISOString());
	let lastIndexedOperations = 0;

	return {
		get lastIndexedOperations() {
			return lastIndexedOperations;
		},
		async reanchor(anchor, generation) {
			const index = new ReanchorIndex(operationBound);
			try {
				const outcome = await reanchorWithIndex(
					source,
					anchor,
					generation,
					index,
					fuzzyThreshold,
				);
				lastIndexedOperations = index.operations;
				return outcome;
			} catch (error) {
				lastIndexedOperations = index.operations;
				throw error;
			}
		},
		async invalidateCoverage(records, generation) {
			const toManifest = await source.loadManifest(generation.id);
			const toChunks = await loadChunks(source, toManifest);
			const grouped = new Map<string, ReviewCoverageRecord[]>();
			for (const record of records) {
				const list = grouped.get(record.generationId) ?? [];
				list.push(record);
				grouped.set(record.generationId, list);
			}
			const remapped: ReviewCoverageRecord[] = [];
			for (const [fromGenerationId, group] of grouped) {
				if (fromGenerationId === generation.id) {
					remapped.push(...group);
					continue;
				}
				const fromManifest = await source.loadManifest(fromGenerationId);
				const fromChunks = await loadChunks(source, fromManifest);
				remapped.push(
					...remapCoverageRecords(group, {
						from: fromManifest,
						to: toManifest,
						fromChunks,
						toChunks,
						toGenerationId: generation.id,
						at: now(),
					}),
				);
			}
			return remapped;
		},
	};
}

async function reanchorWithIndex(
	source: ReviewDiffSource,
	anchor: ReviewAnchor,
	generation: ReviewGeneration,
	index: ReanchorIndex,
	fuzzyThreshold: number,
): Promise<ReanchorOutcome> {
	const manifest = await source.loadManifest(generation.id);
	const chunks = await loadChunks(source, manifest);
	index.build(manifest, chunks);

	if (anchor.generationId === generation.id) {
		return sameGenerationOutcome(anchor, manifest, chunks, index);
	}

	const pathMatches = filesForPath(anchor, index);
	const blobMatches = filesForBlob(anchor, index).filter((file) =>
		pathMatches.some((candidate) => candidate.fileId === file.fileId),
	);
	if (blobMatches.length === 1) {
		const file = blobMatches[0];
		if (file !== undefined) {
			const next = locateOnFile(
				anchor,
				file,
				index.chunkFor(file.fileId),
				"same-blob",
			);
			if (next !== undefined) {
				return exactOutcome(next, "same-blob", [
					"same-path-and-content-identity",
					reviewFilePath(file) ?? file.fileId,
				]);
			}
		}
	}
	if (blobMatches.length > 1) {
		return ambiguousOutcome(
			"multiple-matches",
			blobMatches.map((file) =>
				candidateFromFile(
					anchor,
					file,
					index.chunkFor(file.fileId),
					"same-blob",
				),
			),
			["multiple files share path and blob identity"],
		);
	}

	const renameMatches = filesForRename(anchor, index);
	if (renameMatches.length === 1) {
		const file = renameMatches[0];
		if (file !== undefined) {
			const next = locateOnFile(
				anchor,
				file,
				index.chunkFor(file.fileId),
				"rename-same-blob",
			);
			if (next !== undefined) {
				return exactOutcome(next, "rename-same-blob", [
					"rename-lineage-same-blob",
					file.pathBefore ?? "",
					reviewFilePath(file) ?? "",
				]);
			}
		}
	}
	if (renameMatches.length > 1) {
		return ambiguousOutcome(
			"multiple-matches",
			renameMatches.map((file) =>
				candidateFromFile(
					anchor,
					file,
					index.chunkFor(file.fileId),
					"rename-same-blob",
				),
			),
			["multiple rename-lineage blob matches"],
		);
	}

	if (anchor.side !== "file") {
		const selected = collectSelectedWindows(anchor, manifest, index);
		if (selected.length === 1) {
			const match = selected[0];
			if (match !== undefined) {
				if (contextsEqual(anchor, match)) {
					return uniqueOutcome(
						anchorFromWindow(anchor, match),
						"selected-content-and-context",
						contextScore(anchor, match),
						["unique-selected-content", "ordered-context-hashes"],
					);
				}
			}
		}
		if (selected.length > 1) {
			const withContext = selected.filter((match) =>
				contextsEqual(anchor, match),
			);
			if (withContext.length === 1 && withContext[0] !== undefined) {
				return uniqueOutcome(
					anchorFromWindow(anchor, withContext[0]),
					"selected-content-and-context",
					1,
					["unique-selected-content-and-context"],
				);
			}
			if (withContext.length > 1) {
				return ambiguousOutcome(
					"multiple-matches",
					withContext.map((match) => ({
						anchor: anchorFromWindow(anchor, match),
						reason: "selected-content-and-context",
					})),
					["duplicate selected content and context"],
				);
			}
		}

		const uniqueHunks = uniqueHunkMatches(anchor, index);
		if (uniqueHunks.length === 1 && uniqueHunks[0] !== undefined) {
			const selectedInHunk = selected.filter(
				(match) => match.hunk.hunkId === uniqueHunks[0]?.hunk.hunkId,
			);
			const chosen = selectedInHunk[0] ?? uniqueHunks[0];
			if (chosen !== undefined && selectedInHunk.length <= 1) {
				return uniqueOutcome(
					anchorFromWindow(anchor, chosen),
					"unique-hunk",
					1,
					["unique-hunk-fingerprint", "exact-selected-content"],
				);
			}
			return ambiguousOutcome(
				"multiple-matches",
				selectedInHunk.map((match) => ({
					anchor: anchorFromWindow(anchor, match),
					reason: "unique-hunk",
				})),
				["hunk fingerprint unique but selected content repeats"],
			);
		}
		if (uniqueHunks.length > 1) {
			return ambiguousOutcome(
				"multiple-matches",
				uniqueHunks.map((match) => ({
					anchor: anchorFromWindow(anchor, match),
					reason: "unique-hunk",
				})),
				["multiple hunks share fingerprint and selected content"],
			);
		}

		if (selected.length === 1 && selected[0] !== undefined) {
			const score = contextScore(anchor, selected[0]);
			if (score >= fuzzyThreshold) {
				return uniqueOutcome(
					anchorFromWindow(anchor, selected[0]),
					"selected-content-and-context",
					score,
					[
						"bounded-fuzzy",
						`threshold=${fuzzyThreshold}`,
						`score=${score.toFixed(3)}`,
					],
				);
			}
			return ambiguousOutcome(
				"fuzzy-below-threshold",
				[
					{
						anchor: anchorFromWindow(anchor, selected[0]),
						reason: "fuzzy-below-threshold",
					},
				],
				[
					"bounded-fuzzy",
					`threshold=${fuzzyThreshold}`,
					`score=${score.toFixed(3)}`,
				],
			);
		}
		if (selected.length > 1) {
			return ambiguousOutcome(
				"multiple-matches",
				selected.map((match) => ({
					anchor: anchorFromWindow(anchor, match),
					reason: "duplicate-selected-content",
				})),
				["never first-match duplicate selected content"],
			);
		}
	}

	return staleFromMissing(source, anchor, generation, manifest, chunks);
}

async function staleFromMissing(
	source: ReviewDiffSource,
	anchor: ReviewAnchor,
	generation: ReviewGeneration,
	manifest: ReviewDiffManifest,
	chunks: readonly ReviewDiffChunk[],
): Promise<ReanchorOutcome> {
	const predecessorId =
		generation.predecessorGenerationId ??
		(source as MemoryReviewDiffSource).generation?.(generation.id)
			?.predecessorGenerationId;
	if (predecessorId !== undefined && predecessorId !== generation.id) {
		try {
			const fromManifest = await source.loadManifest(predecessorId);
			const fromChunks = await loadChunks(source, fromManifest);
			const diff = interdiffGenerations(
				fromManifest,
				manifest,
				fromChunks,
				chunks,
			);
			const deleted = diff.files.some(
				(file) =>
					file.kind === "deleted" &&
					(file.fromFileId === anchor.fileId ||
						file.pathAfter === anchor.pathAfter ||
						file.pathBefore === anchor.pathBefore),
			);
			if (deleted) {
				return {
					kind: "stale",
					reason: "deleted",
					candidates: [],
					evidence: ["file-deleted"],
				};
			}
			const changed = diff.files.some(
				(file) =>
					(file.kind === "modified" || file.kind === "binary") &&
					(file.fromFileId === anchor.fileId ||
						file.toFileId === anchor.fileId),
			);
			if (changed) {
				return {
					kind: "stale",
					reason: "content-changed",
					candidates: [],
					evidence: ["selected-content-changed"],
				};
			}
		} catch {
			// predecessor may be cancelled; fall through to no-match
		}
	}

	const samePath = manifest.files.find(
		(file) =>
			file.fileId === anchor.fileId ||
			reviewFilePath(file) === (anchor.pathAfter ?? anchor.pathBefore),
	);
	if (samePath === undefined) {
		return {
			kind: "stale",
			reason: "deleted",
			candidates: [],
			evidence: ["file-not-in-generation"],
		};
	}
	if (samePath.binary || samePath.status === "deleted") {
		return {
			kind: "stale",
			reason: samePath.status === "deleted" ? "deleted" : "content-changed",
			candidates: [],
			evidence: [samePath.binary ? "binary-file" : "file-deleted"],
		};
	}
	if (anchor.side === "old" && samePath.status === "added") {
		return {
			kind: "stale",
			reason: "deleted",
			candidates: [],
			evidence: ["old-side-deletion-absent"],
		};
	}
	return {
		kind: "stale",
		reason: "no-match",
		candidates: [],
		evidence: ["zero-reanchor-matches"],
	};
}

function sameGenerationOutcome(
	anchor: ReviewAnchor,
	manifest: ReviewDiffManifest,
	chunks: readonly ReviewDiffChunk[],
	index: ReanchorIndex,
): ReanchorOutcome {
	const file = manifest.files.find((item) => item.fileId === anchor.fileId);
	if (file === undefined) {
		return {
			kind: "stale",
			reason: "deleted",
			candidates: [],
			evidence: ["same-generation-file-missing"],
		};
	}
	const chunk =
		chunks.find((item) => item.fileId === file.fileId) ??
		index.chunkFor(file.fileId);
	const next = locateOnFile(anchor, file, chunk, "same-generation");
	if (next === undefined) {
		return {
			kind: "stale",
			reason: "no-match",
			candidates: [],
			evidence: ["same-generation-range-missing"],
		};
	}
	return exactOutcome(next, "same-generation", [
		"same-generation-file-side-range",
	]);
}

function locateOnFile(
	anchor: ReviewAnchor,
	file: ReviewFileSummary,
	chunk: ReviewDiffChunk | undefined,
	reason: string,
): ReviewAnchor | undefined {
	if (anchor.side === "file") {
		return createReviewAnchor({
			generationId: chunk?.generationId ?? file.fileId,
			file,
			chunk: chunk ?? emptyChunk(file.fileId),
			side: "file",
		});
	}
	if (chunk === undefined) return undefined;
	if (anchor.startLine === undefined || anchor.endLine === undefined) {
		return undefined;
	}
	const lines = collectSideLines(chunk, anchor.side);
	if (anchor.selectedContentHash === undefined) return undefined;
	const count = anchor.endLine - anchor.startLine + 1;
	const windows = windowsWithContentHash(
		lines,
		anchor.selectedContentHash,
		count,
	);
	if (windows.length === 1 && windows[0] !== undefined) {
		return anchorFromWindow(anchor, {
			file,
			chunk,
			lines,
			hunk: lines[windows[0].startIndex]?.hunk ?? emptyHunk(),
			startIndex: windows[0].startIndex,
			endIndex: windows[0].endIndex,
			reason,
		});
	}
	if (
		windows.length === 0 &&
		lines.some(
			(line) =>
				line.line >= (anchor.startLine ?? 0) &&
				line.line <= (anchor.endLine ?? 0),
		)
	) {
		try {
			return createReviewAnchor({
				generationId: chunk.generationId,
				file,
				chunk,
				side: anchor.side,
				startLine: anchor.startLine,
				endLine: anchor.endLine,
			});
		} catch {
			return undefined;
		}
	}
	if (windows.length === 1 && windows[0] !== undefined) {
		return anchorFromWindow(anchor, {
			file,
			chunk,
			lines,
			hunk: lines[windows[0].startIndex]?.hunk ?? emptyHunk(),
			startIndex: windows[0].startIndex,
			endIndex: windows[0].endIndex,
			reason,
		});
	}
	return undefined;
}

interface SelectedWindow {
	readonly file: ReviewFileSummary;
	readonly chunk: ReviewDiffChunk;
	readonly lines: readonly ReviewSideLine[];
	readonly hunk: ReviewHunk;
	readonly startIndex: number;
	readonly endIndex: number;
	readonly reason: string;
}

function collectSelectedWindows(
	anchor: ReviewAnchor,
	manifest: ReviewDiffManifest,
	index: ReanchorIndex,
): readonly SelectedWindow[] {
	if (anchor.selectedContentHash === undefined) return [];
	if (anchor.startLine === undefined || anchor.endLine === undefined) return [];
	const count = anchor.endLine - anchor.startLine + 1;
	const matches: SelectedWindow[] = [];
	for (const file of manifest.files) {
		if (file.binary) continue;
		const chunk = index.chunkFor(file.fileId);
		if (chunk === undefined) continue;
		const lines = collectSideLines(chunk, anchor.side);
		index.touch();
		for (const window of windowsWithContentHash(
			lines,
			anchor.selectedContentHash,
			count,
		)) {
			index.touch();
			const hunk = lines[window.startIndex]?.hunk;
			if (hunk === undefined) continue;
			matches.push({
				file,
				chunk,
				lines,
				hunk,
				startIndex: window.startIndex,
				endIndex: window.endIndex,
				reason: "selected-content",
			});
		}
	}
	return matches;
}

function uniqueHunkMatches(
	anchor: ReviewAnchor,
	index: ReanchorIndex,
): readonly SelectedWindow[] {
	if (anchor.hunkFingerprint === undefined) return [];
	if (anchor.selectedContentHash === undefined) return [];
	const hunks = index.hunksForFingerprint(anchor.hunkFingerprint);
	const matches: SelectedWindow[] = [];
	for (const entry of hunks) {
		index.touch();
		const lines = collectSideLines(entry.chunk, anchor.side);
		const count =
			anchor.startLine !== undefined && anchor.endLine !== undefined
				? anchor.endLine - anchor.startLine + 1
				: 1;
		for (const window of windowsWithContentHash(
			lines,
			anchor.selectedContentHash,
			count,
		)) {
			const hunk = lines[window.startIndex]?.hunk;
			if (hunk === undefined || hunk.fingerprint !== anchor.hunkFingerprint) {
				continue;
			}
			matches.push({
				file: entry.file,
				chunk: entry.chunk,
				lines,
				hunk,
				startIndex: window.startIndex,
				endIndex: window.endIndex,
				reason: "unique-hunk",
			});
		}
	}
	return matches;
}

function contextsEqual(anchor: ReviewAnchor, match: SelectedWindow): boolean {
	const context = contextHashesAround(
		match.lines,
		match.startIndex,
		match.endIndex,
		anchor.contextBeforeHashes.length || anchor.contextAfterHashes.length
			? Math.max(
					anchor.contextBeforeHashes.length,
					anchor.contextAfterHashes.length,
				)
			: 3,
	);
	return (
		sameHashSequence(anchor.contextBeforeHashes, context.before) &&
		sameHashSequence(anchor.contextAfterHashes, context.after)
	);
}

function contextScore(anchor: ReviewAnchor, match: SelectedWindow): number {
	const expectedBefore = anchor.contextBeforeHashes;
	const expectedAfter = anchor.contextAfterHashes;
	if (expectedBefore.length === 0 && expectedAfter.length === 0) return 1;
	const context = contextHashesAround(
		match.lines,
		match.startIndex,
		match.endIndex,
		Math.max(expectedBefore.length, expectedAfter.length, 3),
	);
	const before = overlap(expectedBefore, context.before);
	const after = overlap(expectedAfter, context.after);
	const available =
		Math.min(expectedBefore.length, context.before.length) +
		Math.min(expectedAfter.length, context.after.length);
	if (available === 0) return 1;
	if (before + after === available) return 1;
	const expected = expectedBefore.length + expectedAfter.length;
	return expected === 0 ? 1 : (before + after) / expected;
}

function overlap(
	expected: readonly string[],
	actual: readonly string[],
): number {
	const n = expected.length;
	const m = actual.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		Array.from({ length: m + 1 }, () => 0),
	);
	for (let i = n - 1; i >= 0; i -= 1) {
		const row = dp[i];
		const next = dp[i + 1];
		if (row === undefined || next === undefined) continue;
		for (let j = m - 1; j >= 0; j -= 1) {
			row[j] =
				expected[i] === actual[j]
					? (next[j + 1] ?? 0) + 1
					: Math.max(next[j] ?? 0, row[j + 1] ?? 0);
		}
	}
	return dp[0]?.[0] ?? 0;
}

function sameHashSequence(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function anchorFromWindow(
	anchor: ReviewAnchor,
	match: SelectedWindow,
): ReviewAnchor {
	const start = match.lines[match.startIndex];
	const end = match.lines[match.endIndex];
	if (start === undefined || end === undefined) {
		return createReviewAnchor({
			generationId: match.chunk.generationId,
			file: match.file,
			chunk: match.chunk,
			side: "file",
		});
	}
	return createReviewAnchor({
		generationId: match.chunk.generationId,
		file: match.file,
		chunk: match.chunk,
		side: anchor.side,
		startLine: start.line,
		endLine: end.line,
	});
}

function candidateFromFile(
	anchor: ReviewAnchor,
	file: ReviewFileSummary,
	chunk: ReviewDiffChunk | undefined,
	reason: string,
): ReanchorCandidate {
	const located = locateOnFile(anchor, file, chunk, reason);
	return {
		anchor:
			located ??
			createReviewAnchor({
				generationId: chunk?.generationId ?? file.fileId,
				file,
				chunk: chunk ?? emptyChunk(file.fileId),
				side: "file",
			}),
		reason,
	};
}

function filesForPath(
	anchor: ReviewAnchor,
	index: ReanchorIndex,
): readonly ReviewFileSummary[] {
	const wanted =
		anchor.side === "old"
			? (anchor.pathBefore ?? anchor.pathAfter)
			: (anchor.pathAfter ?? anchor.pathBefore);
	if (wanted === undefined) {
		const byId = index.fileById(anchor.fileId);
		return byId === undefined ? [] : [byId];
	}
	return index.filesForPath(wanted).filter((file) => {
		index.touch();
		if (anchor.side === "old") return file.pathBefore === wanted;
		return file.pathAfter === wanted;
	});
}

function filesForBlob(
	anchor: ReviewAnchor,
	index: ReanchorIndex,
): readonly ReviewFileSummary[] {
	const keys = blobKeys(anchor);
	const found = new Map<string, ReviewFileSummary>();
	for (const key of keys) {
		for (const file of index.filesForIdentity(key))
			found.set(file.fileId, file);
	}
	return [...found.values()];
}

function filesForRename(
	anchor: ReviewAnchor,
	index: ReanchorIndex,
): readonly ReviewFileSummary[] {
	const origin = anchor.pathAfter ?? anchor.pathBefore;
	if (origin === undefined) return [];
	const blobOk = (file: ReviewFileSummary) =>
		blobKeys(anchor).some((key) => identityKeys(file).includes(key));
	return index.allFiles().filter((file) => {
		index.touch();
		if (!blobOk(file)) return false;
		if (file.pathBefore === origin) return true;
		return (
			reviewFilePath(file) !== origin &&
			(file.status === "renamed" || file.status === "copied")
		);
	});
}

function blobKeys(anchor: ReviewAnchor): readonly string[] {
	if (anchor.side === "old") {
		return [anchor.baseBlobOid, anchor.baseContentHash].filter(
			(value): value is string => value !== undefined,
		);
	}
	return [anchor.headBlobOid, anchor.headContentHash].filter(
		(value): value is string => value !== undefined,
	);
}

function identityKeys(file: ReviewFileSummary): readonly string[] {
	return [
		file.newBlobOid,
		file.oldBlobOid,
		file.newContentHash,
		file.oldContentHash,
		fileContentIdentity(file),
	].filter((value): value is string => value !== undefined);
}

function exactOutcome(
	anchor: ReviewAnchor,
	method: "same-generation" | "same-blob" | "rename-same-blob",
	evidence: readonly string[],
): ReanchorOutcome {
	return { kind: "exact", newAnchor: anchor, method, confidence: 1, evidence };
}

function uniqueOutcome(
	anchor: ReviewAnchor,
	method: "selected-content-and-context" | "unique-hunk",
	confidence: number,
	evidence: readonly string[],
): ReanchorOutcome {
	return {
		kind: "unique-context",
		newAnchor: anchor,
		method,
		confidence,
		evidence,
	};
}

function ambiguousOutcome(
	reason: "multiple-matches" | "fuzzy-below-threshold",
	candidates: readonly ReanchorCandidate[],
	evidence: readonly string[],
): ReanchorOutcome {
	return { kind: "ambiguous", reason, candidates, evidence };
}

async function loadChunks(
	source: ReviewDiffSource,
	manifest: ReviewDiffManifest,
): Promise<readonly ReviewDiffChunk[]> {
	const chunks: ReviewDiffChunk[] = [];
	for (const file of manifest.files) {
		chunks.push(await source.loadChunk(manifest.generationId, file.fileId));
	}
	return chunks;
}

function emptyChunk(fileId: string): ReviewDiffChunk {
	return {
		generationId: fileId,
		fileId,
		chunkId: `${fileId}:empty`,
		hunks: [],
	};
}

function emptyHunk(): ReviewHunk {
	return {
		hunkId: "empty",
		header: "@@ -0,0 +0,0 @@",
		oldStart: 0,
		oldCount: 0,
		newStart: 0,
		newCount: 0,
		fingerprint: "empty",
		lines: [],
	};
}

class ReanchorIndex {
	operations = 0;
	private readonly bound: number;
	private readonly files = new Map<string, ReviewFileSummary>();
	private readonly byPath = new Map<string, ReviewFileSummary[]>();
	private readonly byIdentity = new Map<string, ReviewFileSummary[]>();
	private readonly chunks = new Map<string, ReviewDiffChunk>();
	private readonly hunks = new Map<
		string,
		{ file: ReviewFileSummary; hunk: ReviewHunk; chunk: ReviewDiffChunk }[]
	>();

	constructor(bound: number) {
		this.bound = bound;
	}

	touch(): void {
		this.operations += 1;
		if (this.operations > this.bound) {
			throw reviewError(
				"page-limit",
				"reanchor exceeded indexed operation bound",
				{ operations: this.operations, bound: this.bound },
			);
		}
	}

	build(
		manifest: ReviewDiffManifest,
		chunks: readonly ReviewDiffChunk[],
	): void {
		for (const file of manifest.files) {
			this.touch();
			this.files.set(file.fileId, file);
			const path = reviewFilePath(file);
			if (path !== undefined) this.push(this.byPath, path, file);
			if (file.pathBefore !== undefined)
				this.push(this.byPath, file.pathBefore, file);
			if (file.pathAfter !== undefined)
				this.push(this.byPath, file.pathAfter, file);
			for (const key of identityKeys(file))
				this.push(this.byIdentity, key, file);
		}
		for (const chunk of chunks) {
			this.touch();
			this.chunks.set(chunk.fileId, chunk);
			const file = this.files.get(chunk.fileId);
			if (file === undefined) continue;
			for (const hunk of chunk.hunks) {
				this.touch();
				this.push(this.hunks, hunk.fingerprint, { file, hunk, chunk });
			}
		}
	}

	fileById(fileId: string): ReviewFileSummary | undefined {
		this.touch();
		return this.files.get(fileId);
	}

	filesForPath(path: string): readonly ReviewFileSummary[] {
		this.touch();
		return this.byPath.get(path) ?? [];
	}

	filesForIdentity(key: string): readonly ReviewFileSummary[] {
		this.touch();
		return this.byIdentity.get(key) ?? [];
	}

	hunksForFingerprint(fingerprint: string): readonly {
		file: ReviewFileSummary;
		hunk: ReviewHunk;
		chunk: ReviewDiffChunk;
	}[] {
		this.touch();
		return this.hunks.get(fingerprint) ?? [];
	}

	chunkFor(fileId: string): ReviewDiffChunk | undefined {
		this.touch();
		return this.chunks.get(fileId);
	}

	allFiles(): readonly ReviewFileSummary[] {
		return [...this.files.values()];
	}

	private push<T>(map: Map<string, T[]>, key: string, value: T): void {
		this.touch();
		const list = map.get(key);
		if (list === undefined) map.set(key, [value]);
		else list.push(value);
	}
}
