import {
	fileContentIdentity,
	hunkContentIdentity,
	reviewFilePath,
} from "./review-anchors.js";
import type {
	ReviewDiffChunk,
	ReviewDiffManifest,
	ReviewFileSummary,
	ReviewHunk,
} from "./review-ports.js";

export type ReviewInterdiffFileKind =
	| "unchanged"
	| "added"
	| "deleted"
	| "modified"
	| "renamed"
	| "copied"
	| "binary";

export type ReviewInterdiffHunkKind =
	| "unchanged"
	| "added"
	| "deleted"
	| "modified";

export interface ReviewInterdiffHunk {
	readonly fromHunkId?: string;
	readonly toHunkId?: string;
	readonly kind: ReviewInterdiffHunkKind;
	readonly fromIdentity?: string;
	readonly toIdentity?: string;
}

export interface ReviewInterdiffFile {
	readonly fromFileId?: string;
	readonly toFileId?: string;
	readonly kind: ReviewInterdiffFileKind;
	readonly pathBefore?: string;
	readonly pathAfter?: string;
	readonly hunks: readonly ReviewInterdiffHunk[];
}

export interface ReviewInterdiff {
	readonly fromGenerationId: string;
	readonly toGenerationId: string;
	readonly files: readonly ReviewInterdiffFile[];
}

export function interdiffGenerations(
	from: ReviewDiffManifest,
	to: ReviewDiffManifest,
	fromChunks: readonly ReviewDiffChunk[] = [],
	toChunks: readonly ReviewDiffChunk[] = [],
): ReviewInterdiff {
	const toById = new Map(to.files.map((file) => [file.fileId, file]));
	const unmatchedTo = new Set(to.files.map((file) => file.fileId));
	const fromChunkByFile = new Map(
		fromChunks.map((chunk) => [chunk.fileId, chunk]),
	);
	const toChunkByFile = new Map(toChunks.map((chunk) => [chunk.fileId, chunk]));
	const files: ReviewInterdiffFile[] = [];

	for (const source of from.files) {
		const sameId = toById.get(source.fileId);
		const renamed =
			sameId === undefined
				? findRenameTarget(source, to.files, unmatchedTo)
				: undefined;
		const target = sameId ?? renamed;
		if (target === undefined) {
			files.push({
				fromFileId: source.fileId,
				kind: "deleted",
				...(source.pathBefore === undefined
					? {}
					: { pathBefore: source.pathBefore }),
				...(source.pathAfter === undefined
					? {}
					: { pathAfter: source.pathAfter }),
				hunks: hunksFor(fromChunkByFile.get(source.fileId), undefined).map(
					(hunk) => ({
						kind: "deleted" as const,
						fromHunkId: hunk.hunkId,
						fromIdentity: hunkContentIdentity(hunk),
					}),
				),
			});
			continue;
		}
		unmatchedTo.delete(target.fileId);
		files.push(
			describeFilePair(
				source,
				target,
				fromChunkByFile.get(source.fileId),
				toChunkByFile.get(target.fileId),
			),
		);
	}

	for (const target of to.files) {
		if (!unmatchedTo.has(target.fileId)) continue;
		files.push({
			toFileId: target.fileId,
			kind: target.status === "copied" ? "copied" : "added",
			...(target.pathBefore === undefined
				? {}
				: { pathBefore: target.pathBefore }),
			...(target.pathAfter === undefined
				? {}
				: { pathAfter: target.pathAfter }),
			hunks: hunksFor(undefined, toChunkByFile.get(target.fileId)).map(
				(hunk) => ({
					kind: "added" as const,
					toHunkId: hunk.hunkId,
					toIdentity: hunkContentIdentity(hunk),
				}),
			),
		});
	}

	return {
		fromGenerationId: from.generationId,
		toGenerationId: to.generationId,
		files,
	};
}

export function interdiffChunks(
	from: ReviewDiffChunk | undefined,
	to: ReviewDiffChunk | undefined,
): readonly ReviewInterdiffHunk[] {
	return describeHunks(hunksFor(from, undefined), hunksFor(undefined, to));
}

function describeFilePair(
	from: ReviewFileSummary,
	to: ReviewFileSummary,
	fromChunk: ReviewDiffChunk | undefined,
	toChunk: ReviewDiffChunk | undefined,
): ReviewInterdiffFile {
	const renamed =
		from.status === "renamed" ||
		to.status === "renamed" ||
		(reviewFilePath(from) !== undefined &&
			reviewFilePath(to) !== undefined &&
			reviewFilePath(from) !== reviewFilePath(to));
	const binary = from.binary || to.binary;
	const sameIdentity = fileContentIdentity(from) === fileContentIdentity(to);
	const kind: ReviewInterdiffFileKind = binary
		? sameIdentity
			? renamed
				? "renamed"
				: "unchanged"
			: "binary"
		: sameIdentity
			? renamed
				? "renamed"
				: "unchanged"
			: renamed
				? "renamed"
				: "modified";
	return {
		fromFileId: from.fileId,
		toFileId: to.fileId,
		kind,
		...(to.pathBefore === undefined
			? from.pathBefore === undefined
				? {}
				: { pathBefore: from.pathBefore }
			: { pathBefore: to.pathBefore }),
		...(to.pathAfter === undefined
			? from.pathAfter === undefined
				? {}
				: { pathAfter: from.pathAfter }
			: { pathAfter: to.pathAfter }),
		hunks: describeHunks(
			hunksFor(fromChunk, undefined),
			hunksFor(undefined, toChunk),
		),
	};
}

function describeHunks(
	fromHunks: readonly ReviewHunk[],
	toHunks: readonly ReviewHunk[],
): readonly ReviewInterdiffHunk[] {
	const unmatched = new Set(toHunks.map((hunk) => hunk.hunkId));
	const used = new Set<string>();
	const result: ReviewInterdiffHunk[] = [];
	for (const source of fromHunks) {
		const exact = toHunks.find(
			(hunk) =>
				!used.has(hunk.hunkId) &&
				hunkContentIdentity(hunk) === hunkContentIdentity(source),
		);
		if (exact !== undefined) {
			used.add(exact.hunkId);
			unmatched.delete(exact.hunkId);
			result.push({
				kind: "unchanged",
				fromHunkId: source.hunkId,
				toHunkId: exact.hunkId,
				fromIdentity: hunkContentIdentity(source),
				toIdentity: hunkContentIdentity(exact),
			});
			continue;
		}
		result.push({
			kind: "modified",
			fromHunkId: source.hunkId,
			fromIdentity: hunkContentIdentity(source),
		});
	}
	for (const target of toHunks) {
		if (!unmatched.has(target.hunkId)) continue;
		result.push({
			kind: "added",
			toHunkId: target.hunkId,
			toIdentity: hunkContentIdentity(target),
		});
	}
	return result;
}

function findRenameTarget(
	source: ReviewFileSummary,
	targets: readonly ReviewFileSummary[],
	unmatched: ReadonlySet<string>,
): ReviewFileSummary | undefined {
	const sourcePath = reviewFilePath(source);
	const blobMatches = targets.filter((target) => {
		if (!unmatched.has(target.fileId)) return false;
		if (target.status === "deleted") return false;
		const sameBlob =
			(source.newBlobOid !== undefined &&
				source.newBlobOid === target.newBlobOid) ||
			(source.newContentHash !== undefined &&
				source.newContentHash === target.newContentHash);
		const lineage =
			target.pathBefore !== undefined &&
			(target.pathBefore === sourcePath ||
				target.pathBefore === source.pathAfter);
		return (
			(lineage &&
				(sameBlob ||
					target.status === "renamed" ||
					target.status === "copied")) ||
			(sameBlob && reviewFilePath(target) !== sourcePath)
		);
	});
	if (blobMatches.length === 1) return blobMatches[0];
	return undefined;
}

function hunksFor(
	from: ReviewDiffChunk | undefined,
	to: ReviewDiffChunk | undefined,
): readonly ReviewHunk[] {
	return from?.hunks ?? to?.hunks ?? [];
}
