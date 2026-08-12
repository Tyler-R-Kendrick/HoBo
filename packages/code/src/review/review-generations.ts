import {
	hashReviewParts,
	hashReviewText,
	normalizeReviewText,
	reviewIdentity,
	splitReviewLines,
} from "./review-anchors.js";
import { reviewError } from "./review-errors.js";
import type {
	ReviewDiffChunk,
	ReviewDiffLine,
	ReviewDiffManifest,
	ReviewDiffSource,
	ReviewFileStatus,
	ReviewFileSummary,
	ReviewGeneration,
	ReviewHunk,
	ReviewLineKind,
	ReviewTarget,
} from "./review-ports.js";

export interface ReviewDiffOptions {
	readonly contextLines?: number;
	readonly ignoreWhitespace?: boolean;
}

export const DEFAULT_REVIEW_DIFF_CONTEXT = 3;

export interface MemoryReviewFileInput {
	readonly path: string;
	readonly pathBefore?: string;
	readonly status?: ReviewFileStatus;
	readonly oldText?: string;
	readonly newText?: string;
	readonly oldBlobOid?: string;
	readonly newBlobOid?: string;
	readonly oldMode?: string;
	readonly newMode?: string;
	readonly binary?: boolean;
	readonly tooLargeForInline?: boolean;
	readonly generatedHint?: boolean;
	readonly dependencyHint?: boolean;
}

export interface MemoryReviewDiffSource extends ReviewDiffSource {
	stageFiles(files: readonly MemoryReviewFileInput[]): void;
	generation(id: string): ReviewGeneration | undefined;
}

export function hashReviewDiffOptions(options: ReviewDiffOptions = {}): string {
	return hashReviewParts([
		"diff-options",
		String(options.contextLines ?? DEFAULT_REVIEW_DIFF_CONTEXT),
		options.ignoreWhitespace === true ? "ignore-ws" : "exact-ws",
	]);
}

export function hashReviewTarget(target: ReviewTarget): string {
	return hashReviewText(canonicalizeTarget(target));
}

export function hashReviewManifestFiles(
	files: readonly ReviewFileSummary[],
): string {
	return hashReviewText(
		files
			.map((file) =>
				[
					file.fileId,
					file.pathBefore ?? "",
					file.pathAfter ?? "",
					file.status,
					file.oldBlobOid ?? "",
					file.newBlobOid ?? "",
					file.oldContentHash ?? "",
					file.newContentHash ?? "",
					file.binary ? "1" : "0",
				].join(":"),
			)
			.join("\n"),
	);
}

export function createReviewGeneration(input: {
	readonly reviewId: string;
	readonly actorId: string;
	readonly target: ReviewTarget;
	readonly files: readonly ReviewFileSummary[];
	readonly createdAt: string;
	readonly predecessor?: ReviewGeneration;
	readonly diffOptions?: ReviewDiffOptions;
	readonly providerSnapshotHash?: string;
}): ReviewGeneration {
	const ordinal = (input.predecessor?.ordinal ?? 0) + 1;
	const manifestHash = hashReviewManifestFiles(input.files);
	const diffOptionsHash = hashReviewDiffOptions(input.diffOptions);
	const predecessorGenerationId = input.predecessor?.id;
	const providerSnapshotHash = input.providerSnapshotHash;
	return {
		id: reviewIdentity([
			"generation",
			input.reviewId,
			String(ordinal),
			hashReviewTarget(input.target),
			manifestHash,
			diffOptionsHash,
			predecessorGenerationId ?? "",
		]),
		reviewId: input.reviewId,
		ordinal,
		target: input.target,
		createdAt: input.createdAt,
		createdBy: input.actorId,
		manifestHash,
		diffOptionsHash,
		...(providerSnapshotHash === undefined ? {} : { providerSnapshotHash }),
		...(predecessorGenerationId === undefined
			? {}
			: { predecessorGenerationId }),
	};
}

export function materializeReviewFiles(
	generationId: string,
	files: readonly MemoryReviewFileInput[],
	options: ReviewDiffOptions = {},
): {
	readonly summaries: readonly ReviewFileSummary[];
	readonly chunks: readonly ReviewDiffChunk[];
} {
	const summaries: ReviewFileSummary[] = [];
	const chunks: ReviewDiffChunk[] = [];
	for (const file of files) {
		const materialized = materializeReviewFile(generationId, file, options);
		summaries.push(materialized.summary);
		chunks.push(materialized.chunk);
	}
	return { summaries, chunks };
}

export function buildReviewManifest(
	generation: ReviewGeneration,
	files: readonly ReviewFileSummary[],
): ReviewDiffManifest {
	return {
		generationId: generation.id,
		manifestHash: generation.manifestHash,
		files,
		totalFiles: files.length,
		totalAdditions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
		totalDeletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
		binaryFiles: files.filter((file) => file.binary).length,
		pages: { limit: files.length, truncated: false },
	};
}

export function createMemoryReviewDiffSource(
	options: {
		readonly now?: () => string;
		readonly diffOptions?: ReviewDiffOptions;
	} = {},
): MemoryReviewDiffSource {
	const now = options.now ?? (() => new Date().toISOString());
	let staged: readonly MemoryReviewFileInput[] = [];
	const generations = new Map<string, ReviewGeneration>();
	const manifests = new Map<string, ReviewDiffManifest>();
	const chunks = new Map<string, ReviewDiffChunk>();
	const cancelled = new Set<string>();

	const chunkKey = (generationId: string, fileId: string) =>
		`${generationId}:${fileId}`;

	return {
		stageFiles(files) {
			staged = files;
		},
		generation(id) {
			return generations.get(id);
		},
		async resolveTarget(input) {
			return input;
		},
		async createGeneration(input) {
			const predecessor =
				input.predecessorGenerationId === undefined
					? undefined
					: generations.get(input.predecessorGenerationId);
			if (
				input.predecessorGenerationId !== undefined &&
				predecessor === undefined
			) {
				throw reviewError(
					"not-found",
					"predecessor review generation does not exist",
				);
			}
			const provisional = materializeReviewFiles(
				"pending",
				staged,
				options.diffOptions,
			);
			const generation = createReviewGeneration({
				reviewId: input.reviewId,
				actorId: input.actorId,
				target: input.target,
				files: provisional.summaries,
				createdAt: now(),
				...(predecessor === undefined ? {} : { predecessor }),
				...(options.diffOptions === undefined
					? {}
					: { diffOptions: options.diffOptions }),
			});
			const stamped = materializeReviewFiles(
				generation.id,
				staged,
				options.diffOptions,
			);
			generations.set(generation.id, generation);
			manifests.set(
				generation.id,
				buildReviewManifest(generation, stamped.summaries),
			);
			for (const chunk of stamped.chunks) {
				chunks.set(chunkKey(generation.id, chunk.fileId), chunk);
			}
			return generation;
		},
		async loadManifest(generationId) {
			assertAvailable(generationId, cancelled, manifests.has(generationId));
			const manifest = manifests.get(generationId);
			if (manifest === undefined) {
				throw reviewError("not-found", "review generation manifest not found");
			}
			return manifest;
		},
		async loadChunk(generationId, fileId) {
			assertAvailable(
				generationId,
				cancelled,
				chunks.has(chunkKey(generationId, fileId)),
			);
			const chunk = chunks.get(chunkKey(generationId, fileId));
			if (chunk === undefined) {
				throw reviewError("not-found", "review generation chunk not found");
			}
			return chunk;
		},
		cancel(generationId) {
			cancelled.add(generationId);
		},
	};
}

function assertAvailable(
	generationId: string,
	cancelled: ReadonlySet<string>,
	present: boolean,
): void {
	if (cancelled.has(generationId) || !present) {
		throw reviewError("not-found", "review generation is not available", {
			generationId,
		});
	}
}

function materializeReviewFile(
	generationId: string,
	file: MemoryReviewFileInput,
	options: ReviewDiffOptions,
): { readonly summary: ReviewFileSummary; readonly chunk: ReviewDiffChunk } {
	const pathAfter = file.status === "deleted" ? undefined : file.path;
	const pathBefore =
		file.pathBefore ?? (file.status === "added" ? undefined : file.path);
	const oldContentHash =
		file.oldText === undefined ? undefined : hashReviewText(file.oldText);
	const newContentHash =
		file.newText === undefined ? undefined : hashReviewText(file.newText);
	const oldBlobOid = file.oldBlobOid ?? oldContentHash;
	const newBlobOid = file.newBlobOid ?? newContentHash;
	const status = file.status ?? inferStatus(file, pathBefore, pathAfter);
	const binary = file.binary === true || status === "binary";
	const tooLargeForInline = file.tooLargeForInline === true;
	const fileId = reviewIdentity([
		"file",
		pathBefore ?? "",
		pathAfter ?? file.path,
		status,
	]);
	const hunks =
		binary || tooLargeForInline
			? []
			: buildHunks(
					fileId,
					splitReviewLines(file.oldText ?? ""),
					splitReviewLines(file.newText ?? ""),
					options,
				);
	const additions = hunks.reduce(
		(sum, hunk) =>
			sum + hunk.lines.filter((line) => line.kind === "addition").length,
		0,
	);
	const deletions = hunks.reduce(
		(sum, hunk) =>
			sum + hunk.lines.filter((line) => line.kind === "deletion").length,
		0,
	);
	const summary: ReviewFileSummary = {
		fileId,
		status: binary ? "binary" : status,
		binary,
		tooLargeForInline,
		hunkCount: hunks.length,
		additions,
		deletions,
		...(pathBefore === undefined ? {} : { pathBefore }),
		...(pathAfter === undefined ? {} : { pathAfter }),
		...(oldBlobOid === undefined ? {} : { oldBlobOid }),
		...(newBlobOid === undefined ? {} : { newBlobOid }),
		...(oldContentHash === undefined ? {} : { oldContentHash }),
		...(newContentHash === undefined ? {} : { newContentHash }),
		...(file.oldMode === undefined ? {} : { oldMode: file.oldMode }),
		...(file.newMode === undefined ? {} : { newMode: file.newMode }),
		...(file.generatedHint === undefined
			? {}
			: { generatedHint: file.generatedHint }),
		...(file.dependencyHint === undefined
			? {}
			: { dependencyHint: file.dependencyHint }),
	};
	return {
		summary,
		chunk: {
			generationId,
			fileId,
			chunkId: reviewIdentity(["chunk", generationId, fileId]),
			hunks,
		},
	};
}

function inferStatus(
	file: MemoryReviewFileInput,
	pathBefore: string | undefined,
	pathAfter: string | undefined,
): ReviewFileStatus {
	if (file.binary === true) return "binary";
	if (file.oldText === undefined && file.newText !== undefined) return "added";
	if (file.oldText !== undefined && file.newText === undefined)
		return "deleted";
	if (
		pathBefore !== undefined &&
		pathAfter !== undefined &&
		pathBefore !== pathAfter
	) {
		return "renamed";
	}
	return "modified";
}

function buildHunks(
	fileId: string,
	oldLines: readonly string[],
	newLines: readonly string[],
	options: ReviewDiffOptions,
): readonly ReviewHunk[] {
	const contextLines = options.contextLines ?? DEFAULT_REVIEW_DIFF_CONTEXT;
	const ops = diffOperations(
		oldLines,
		newLines,
		options.ignoreWhitespace === true,
	);
	if (ops.every((op) => op.kind === "context")) return [];

	const hunks: ReviewHunk[] = [];
	let index = 0;
	while (index < ops.length) {
		while (index < ops.length && ops[index]?.kind === "context") index += 1;
		if (index >= ops.length) break;
		let start = index;
		while (
			start > 0 &&
			start > index - contextLines &&
			ops[start - 1]?.kind === "context"
		) {
			start -= 1;
		}
		let end = index;
		let pendingContext = 0;
		while (end < ops.length) {
			const kind = ops[end]?.kind;
			if (kind === undefined) break;
			if (kind !== "context") {
				pendingContext = 0;
				end += 1;
				continue;
			}
			pendingContext += 1;
			if (pendingContext > contextLines) break;
			end += 1;
		}
		hunks.push(makeHunk(fileId, hunks.length, ops.slice(start, end)));
		index = end;
	}
	return hunks;
}

interface DiffOp {
	readonly kind: Exclude<ReviewLineKind, "no-newline-marker">;
	readonly text: string;
	readonly oldLine?: number;
	readonly newLine?: number;
}

function diffOperations(
	oldLines: readonly string[],
	newLines: readonly string[],
	ignoreWhitespace: boolean,
): readonly DiffOp[] {
	const comparable = (text: string) =>
		ignoreWhitespace
			? normalizeReviewText(text)
					.replace(/[ \t]+/gu, " ")
					.trim()
			: text;
	const oldKeys = oldLines.map(comparable);
	const newKeys = newLines.map(comparable);
	const n = oldKeys.length;
	const m = newKeys.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		Array.from({ length: m + 1 }, () => 0),
	);
	for (let i = n - 1; i >= 0; i -= 1) {
		const row = dp[i];
		const nextRow = dp[i + 1];
		if (row === undefined || nextRow === undefined) continue;
		for (let j = m - 1; j >= 0; j -= 1) {
			if (oldKeys[i] === newKeys[j]) {
				row[j] = (nextRow[j + 1] ?? 0) + 1;
			} else {
				row[j] = Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
			}
		}
	}

	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < n || j < m) {
		if (i < n && j < m && oldKeys[i] === newKeys[j]) {
			ops.push({
				kind: "context",
				text: newLines[j] ?? oldLines[i] ?? "",
				oldLine: i + 1,
				newLine: j + 1,
			});
			i += 1;
			j += 1;
			continue;
		}
		const down = i < n ? (dp[i + 1]?.[j] ?? 0) : -1;
		const right = j < m ? (dp[i]?.[j + 1] ?? 0) : -1;
		if (i < n && (j >= m || down >= right)) {
			ops.push({
				kind: "deletion",
				text: oldLines[i] ?? "",
				oldLine: i + 1,
			});
			i += 1;
		} else {
			ops.push({
				kind: "addition",
				text: newLines[j] ?? "",
				newLine: j + 1,
			});
			j += 1;
		}
	}
	return ops;
}

function makeHunk(
	fileId: string,
	ordinal: number,
	ops: readonly DiffOp[],
): ReviewHunk {
	const firstOld = ops.find((op) => op.oldLine !== undefined)?.oldLine ?? 0;
	const firstNew = ops.find((op) => op.newLine !== undefined)?.newLine ?? 0;
	const oldCount = ops.filter((op) => op.oldLine !== undefined).length;
	const newCount = ops.filter((op) => op.newLine !== undefined).length;
	const header = `@@ -${firstOld},${oldCount} +${firstNew},${newCount} @@`;
	const lines: ReviewDiffLine[] = ops.map((op, index) => {
		const rawTextHash = hashReviewText(op.text);
		const oldLine = op.oldLine;
		const newLine = op.newLine;
		return {
			lineId: reviewIdentity([
				"line",
				fileId,
				header,
				String(index),
				op.kind,
				rawTextHash,
			]),
			kind: op.kind,
			rawTextHash,
			displayText: op.text,
			...(oldLine === undefined ? {} : { oldLine }),
			...(newLine === undefined ? {} : { newLine }),
		};
	});
	const fingerprint = hashReviewParts(
		lines.map((line) => `${line.kind}:${line.rawTextHash}`),
	);
	return {
		hunkId: reviewIdentity(["hunk", fileId, fingerprint, String(ordinal)]),
		header,
		oldStart: firstOld,
		oldCount,
		newStart: firstNew,
		newCount,
		fingerprint,
		lines,
	};
}

function canonicalizeTarget(target: ReviewTarget): string {
	switch (target.kind) {
		case "working-tree":
			return [
				"working-tree",
				target.repositoryId,
				target.baseCommitOid,
				target.indexTreeOid,
				target.worktreeManifestHash,
			].join("\n");
		case "index":
			return [
				"index",
				target.repositoryId,
				target.baseCommitOid,
				target.indexTreeOid,
			].join("\n");
		case "commit":
			return [
				"commit",
				target.repositoryId,
				target.parentCommitOid,
				target.commitOid,
				target.stablePatchEvidence ?? "",
			].join("\n");
		case "range":
			return [
				"range",
				target.repositoryId,
				target.requestedBaseRef,
				target.requestedHeadRef,
				target.mergeBaseOid,
				target.baseCommitOid,
				target.headCommitOid,
			].join("\n");
		case "pull-request":
			return [
				"pull-request",
				target.host,
				target.repository,
				String(target.number),
				target.mergeBaseOid,
				target.baseCommitOid,
				target.headCommitOid,
			].join("\n");
		case "stack":
			return [
				"stack",
				target.stackId,
				target.repositoryId,
				target.aggregateBaseOid,
				target.aggregateHeadOid,
				...target.members.map(
					(member) =>
						`${member.memberId}:${member.mergeBaseOid}:${member.baseCommitOid}:${member.headCommitOid}`,
				),
			].join("\n");
	}
}
