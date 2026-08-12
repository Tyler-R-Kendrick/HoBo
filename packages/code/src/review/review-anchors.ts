import { createHash } from "node:crypto";

import { reviewError } from "./review-errors.js";
import type {
	ReviewAnchor,
	ReviewDiffChunk,
	ReviewFileSummary,
	ReviewHunk,
	ReviewSide,
} from "./review-ports.js";

export const REVIEW_CONTEXT_RADIUS = 3;

export interface ReviewSideLine {
	readonly line: number;
	readonly displayText: string;
	readonly rawTextHash: string;
	readonly hunk: ReviewHunk;
}

export function normalizeReviewText(text: string): string {
	return text.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

export function hashReviewText(text: string): string {
	return createHash("sha256")
		.update(normalizeReviewText(text), "utf8")
		.digest("hex");
}

export function hashReviewParts(parts: readonly string[]): string {
	return createHash("sha256").update(parts.join("\0"), "utf8").digest("hex");
}

export function reviewIdentity(parts: readonly string[]): string {
	return hashReviewParts(parts).slice(0, 32);
}

export function splitReviewLines(text: string): string[] {
	const normalized = normalizeReviewText(text);
	if (normalized.length === 0) return [];
	const trimmed = normalized.endsWith("\n")
		? normalized.slice(0, -1)
		: normalized;
	return trimmed.split("\n");
}

export function reviewFilePath(file: ReviewFileSummary): string | undefined {
	return file.pathAfter ?? file.pathBefore;
}

export function fileContentIdentity(file: ReviewFileSummary): string {
	return (
		file.newContentHash ??
		file.oldContentHash ??
		file.newBlobOid ??
		file.oldBlobOid ??
		file.fileId
	);
}

export function hunkContentIdentity(hunk: ReviewHunk): string {
	return hunk.fingerprint;
}

export function selectedContentHashFor(
	lines: readonly Pick<ReviewSideLine, "displayText">[],
): string {
	return hashReviewText(lines.map((line) => line.displayText).join("\n"));
}

export function collectSideLines(
	chunk: ReviewDiffChunk,
	side: ReviewSide,
): readonly ReviewSideLine[] {
	if (side === "file") return [];
	const collected: ReviewSideLine[] = [];
	for (const hunk of chunk.hunks) {
		for (const line of hunk.lines) {
			if (line.kind === "no-newline-marker") continue;
			if (side === "old") {
				if (line.oldLine === undefined || line.kind === "addition") continue;
				collected.push({
					line: line.oldLine,
					displayText: line.displayText,
					rawTextHash: line.rawTextHash,
					hunk,
				});
				continue;
			}
			if (line.newLine === undefined || line.kind === "deletion") continue;
			collected.push({
				line: line.newLine,
				displayText: line.displayText,
				rawTextHash: line.rawTextHash,
				hunk,
			});
		}
	}
	collected.sort((left, right) => left.line - right.line);
	return collected;
}

export function contextHashesAround(
	lines: readonly ReviewSideLine[],
	startIndex: number,
	endIndex: number,
	radius = REVIEW_CONTEXT_RADIUS,
): {
	readonly before: readonly string[];
	readonly after: readonly string[];
} {
	return {
		before: lines
			.slice(Math.max(0, startIndex - radius), startIndex)
			.map((line) => line.rawTextHash),
		after: lines
			.slice(endIndex + 1, endIndex + 1 + radius)
			.map((line) => line.rawTextHash),
	};
}

export function findSelectedRange(
	lines: readonly ReviewSideLine[],
	startLine: number,
	endLine: number,
): { readonly startIndex: number; readonly endIndex: number } | undefined {
	const startIndex = lines.findIndex((line) => line.line === startLine);
	const endIndex = lines.findIndex((line) => line.line === endLine);
	if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return undefined;
	return { startIndex, endIndex };
}

export function windowsWithContentHash(
	lines: readonly ReviewSideLine[],
	selectedHash: string,
	lineCount: number,
): readonly { readonly startIndex: number; readonly endIndex: number }[] {
	if (lineCount <= 0 || lines.length < lineCount) return [];
	const matches: { startIndex: number; endIndex: number }[] = [];
	for (
		let startIndex = 0;
		startIndex + lineCount <= lines.length;
		startIndex += 1
	) {
		const endIndex = startIndex + lineCount - 1;
		const hash = selectedContentHashFor(lines.slice(startIndex, endIndex + 1));
		if (hash === selectedHash) matches.push({ startIndex, endIndex });
	}
	return matches;
}

export interface CreateReviewAnchorInput {
	readonly generationId: string;
	readonly file: ReviewFileSummary;
	readonly chunk: ReviewDiffChunk;
	readonly side: ReviewSide;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly contextRadius?: number;
}

export function createReviewAnchor(
	input: CreateReviewAnchorInput,
): ReviewAnchor {
	if (input.side === "file") {
		const selected =
			input.file.newContentHash ??
			input.file.oldContentHash ??
			input.file.newBlobOid ??
			input.file.oldBlobOid;
		if (selected === undefined) {
			throw reviewError(
				"malformed-input",
				"file-side review anchors require a blob or content identity",
			);
		}
		return finishAnchor({
			generationId: input.generationId,
			file: input.file,
			side: "file",
			selectedContentHash: selected,
			contextBeforeHashes: [],
			contextAfterHashes: [],
		});
	}

	if (input.file.binary) {
		throw reviewError(
			"malformed-input",
			"binary files only accept file-side review anchors",
		);
	}

	const startLine = input.startLine;
	const endLine = input.endLine;
	if (startLine === undefined || endLine === undefined) {
		throw reviewError(
			"malformed-input",
			"line review anchors require a start and end line plus content identity",
		);
	}

	const lines = collectSideLines(input.chunk, input.side);
	const range = findSelectedRange(lines, startLine, endLine);
	if (range === undefined) {
		throw reviewError(
			"anchor-stale",
			"selected review lines are not present on the requested side",
			{ startLine, endLine },
		);
	}
	const selected = lines.slice(range.startIndex, range.endIndex + 1);
	if (selected.length === 0) {
		throw reviewError(
			"malformed-input",
			"line number alone is not a review anchor",
		);
	}
	const context = contextHashesAround(
		lines,
		range.startIndex,
		range.endIndex,
		input.contextRadius ?? REVIEW_CONTEXT_RADIUS,
	);
	const hunk = selected[0]?.hunk;
	return finishAnchor({
		generationId: input.generationId,
		file: input.file,
		side: input.side,
		startLine,
		endLine,
		selectedContentHash: selectedContentHashFor(selected),
		contextBeforeHashes: context.before,
		contextAfterHashes: context.after,
		...(hunk === undefined
			? {}
			: { hunkId: hunk.hunkId, hunkFingerprint: hunk.fingerprint }),
	});
}

export function parseReviewAnchor(value: unknown): ReviewAnchor {
	const body = record(value, "review anchor");
	const side = requiredString(body.side, "side");
	if (side !== "old" && side !== "new" && side !== "file") {
		throw reviewError("malformed-input", `unknown review side: ${side}`);
	}
	const startLine = optionalLine(body.startLine, "startLine");
	const endLine = optionalLine(body.endLine, "endLine");
	const selectedContentHash = optionalString(
		body.selectedContentHash,
		"selectedContentHash",
	);
	const baseBlobOid = optionalString(body.baseBlobOid, "baseBlobOid");
	const headBlobOid = optionalString(body.headBlobOid, "headBlobOid");
	const baseContentHash = optionalString(
		body.baseContentHash,
		"baseContentHash",
	);
	const headContentHash = optionalString(
		body.headContentHash,
		"headContentHash",
	);
	const hasIdentity =
		selectedContentHash !== undefined ||
		baseBlobOid !== undefined ||
		headBlobOid !== undefined ||
		baseContentHash !== undefined ||
		headContentHash !== undefined;
	if (!hasIdentity) {
		throw reviewError(
			"malformed-input",
			"line number alone is not a review anchor",
		);
	}
	const hunkId = optionalString(body.hunkId, "hunkId");
	const hunkFingerprint = optionalString(
		body.hunkFingerprint,
		"hunkFingerprint",
	);
	const pathBefore = optionalString(body.pathBefore, "pathBefore");
	const pathAfter = optionalString(body.pathAfter, "pathAfter");
	return {
		anchorId: requiredString(body.anchorId, "anchorId"),
		generationId: requiredString(body.generationId, "generationId"),
		fileId: requiredString(body.fileId, "fileId"),
		side,
		contextBeforeHashes: strings(
			body.contextBeforeHashes,
			"contextBeforeHashes",
		),
		contextAfterHashes: strings(body.contextAfterHashes, "contextAfterHashes"),
		...(pathBefore === undefined ? {} : { pathBefore }),
		...(pathAfter === undefined ? {} : { pathAfter }),
		...(baseBlobOid === undefined ? {} : { baseBlobOid }),
		...(headBlobOid === undefined ? {} : { headBlobOid }),
		...(baseContentHash === undefined ? {} : { baseContentHash }),
		...(headContentHash === undefined ? {} : { headContentHash }),
		...(startLine === undefined ? {} : { startLine }),
		...(endLine === undefined ? {} : { endLine }),
		...(hunkId === undefined ? {} : { hunkId }),
		...(hunkFingerprint === undefined ? {} : { hunkFingerprint }),
		...(selectedContentHash === undefined ? {} : { selectedContentHash }),
	};
}

function finishAnchor(input: {
	readonly generationId: string;
	readonly file: ReviewFileSummary;
	readonly side: ReviewSide;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly selectedContentHash: string;
	readonly contextBeforeHashes: readonly string[];
	readonly contextAfterHashes: readonly string[];
	readonly hunkId?: string;
	readonly hunkFingerprint?: string;
}): ReviewAnchor {
	const pathBefore = input.file.pathBefore;
	const pathAfter = input.file.pathAfter;
	const baseBlobOid = input.file.oldBlobOid;
	const headBlobOid = input.file.newBlobOid;
	const baseContentHash = input.file.oldContentHash;
	const headContentHash = input.file.newContentHash;
	const startLine = input.startLine;
	const endLine = input.endLine;
	const hunkId = input.hunkId;
	const hunkFingerprint = input.hunkFingerprint;
	const identity = reviewIdentity([
		input.generationId,
		input.file.fileId,
		input.side,
		String(startLine ?? ""),
		String(endLine ?? ""),
		input.selectedContentHash,
		hunkFingerprint ?? "",
	]);
	return {
		anchorId: identity,
		generationId: input.generationId,
		fileId: input.file.fileId,
		side: input.side,
		selectedContentHash: input.selectedContentHash,
		contextBeforeHashes: input.contextBeforeHashes,
		contextAfterHashes: input.contextAfterHashes,
		...(pathBefore === undefined ? {} : { pathBefore }),
		...(pathAfter === undefined ? {} : { pathAfter }),
		...(baseBlobOid === undefined ? {} : { baseBlobOid }),
		...(headBlobOid === undefined ? {} : { headBlobOid }),
		...(baseContentHash === undefined ? {} : { baseContentHash }),
		...(headContentHash === undefined ? {} : { headContentHash }),
		...(startLine === undefined ? {} : { startLine }),
		...(endLine === undefined ? {} : { endLine }),
		...(hunkId === undefined ? {} : { hunkId }),
		...(hunkFingerprint === undefined ? {} : { hunkFingerprint }),
	};
}

function record(value: unknown, field: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw reviewError("malformed-input", `${field} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw reviewError("malformed-input", `${field} must be a nonempty string`);
	}
	return value;
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	return requiredString(value, field);
}

function optionalLine(value: unknown, field: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw reviewError("malformed-input", `${field} must be a positive integer`);
	}
	return value;
}

function strings(value: unknown, field: string): readonly string[] {
	if (value === undefined) return [];
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== "string" || item.length === 0)
	) {
		throw reviewError(
			"malformed-input",
			`${field} must be an array of nonempty strings`,
		);
	}
	return value;
}
