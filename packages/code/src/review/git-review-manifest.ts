import { createHash } from "node:crypto";

import { decodeReviewCursor, encodeReviewCursor } from "./review-cursors.js";
import type {
	ReviewDiffManifest,
	ReviewFileStatus,
	ReviewFileSummary,
} from "./review-ports.js";

export const DEFAULT_MANIFEST_PAGE_SIZE = 200;

export interface ParsedRawFile {
	readonly oldMode: string;
	readonly newMode: string;
	readonly oldBlobOid: string;
	readonly newBlobOid: string;
	readonly statusCode: string;
	readonly score?: string | undefined;
	readonly pathBefore?: string | undefined;
	readonly pathAfter?: string | undefined;
}

export interface ParsedNumstat {
	readonly pathBefore?: string | undefined;
	readonly pathAfter?: string | undefined;
	readonly additions?: number | undefined;
	readonly deletions?: number | undefined;
	readonly binary: boolean;
}

export interface ParsedPorcelainFile {
	readonly untracked: boolean;
	readonly pathAfter: string;
	readonly pathBefore?: string;
}

export interface ReviewFileLocator {
	readonly fileId: string;
	readonly pathBefore?: string | undefined;
	readonly pathAfter?: string | undefined;
	readonly oldRev?: string | undefined;
	readonly newRev?: string | undefined;
	readonly worktree?: boolean | undefined;
	readonly cached?: boolean | undefined;
	readonly untracked?: boolean | undefined;
	readonly gitDir?: string | undefined;
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function reviewFileId(input: {
	readonly memberId?: string;
	readonly status: ReviewFileStatus;
	readonly pathBefore?: string;
	readonly pathAfter?: string;
	readonly oldBlobOid?: string;
	readonly newBlobOid?: string;
}): string {
	const digest = sha256Hex(
		[
			input.status,
			input.pathBefore ?? "",
			input.pathAfter ?? "",
			input.oldBlobOid ?? "",
			input.newBlobOid ?? "",
		].join("\0"),
	);
	return input.memberId === undefined ? digest : `${input.memberId}:${digest}`;
}

export function parseGitRawZ(output: string): readonly ParsedRawFile[] {
	const parts = output.split("\0");
	const files: ParsedRawFile[] = [];
	for (let index = 0; index < parts.length; ) {
		const header = parts[index] ?? "";
		index += 1;
		if (!header) continue;
		const match = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/u.exec(
			header,
		);
		if (!match) continue;
		const statusCode = match[5] ?? "M";
		const score = match[6] || undefined;
		const first = parts[index] ?? "";
		index += 1;
		const renamed = statusCode === "R" || statusCode === "C";
		const second = renamed ? (parts[index] ?? "") : undefined;
		if (renamed) index += 1;
		files.push({
			oldMode: match[1] ?? "000000",
			newMode: match[2] ?? "000000",
			oldBlobOid: match[3] ?? "",
			newBlobOid: match[4] ?? "",
			statusCode,
			...(score === undefined ? {} : { score }),
			...(statusCode === "D"
				? { pathBefore: first }
				: statusCode === "A"
					? { pathAfter: first }
					: renamed
						? { pathBefore: first, pathAfter: second }
						: { pathBefore: first, pathAfter: first }),
		});
	}
	return files;
}

export function parseGitNumstatZ(output: string): readonly ParsedNumstat[] {
	const parts = output.split("\0");
	const rows: ParsedNumstat[] = [];
	for (let index = 0; index < parts.length; ) {
		const record = parts[index] ?? "";
		index += 1;
		if (!record) continue;
		const match = /^(\d+|-)\t(\d+|-)(?:\t(.*))?$/u.exec(record);
		if (!match) continue;
		const binary = match[1] === "-" || match[2] === "-";
		const additions = binary ? undefined : Number(match[1]);
		const deletions = binary ? undefined : Number(match[2]);
		const inlinePath = match[3];
		if (inlinePath !== undefined && inlinePath.length > 0) {
			rows.push({
				pathAfter: inlinePath,
				pathBefore: inlinePath,
				binary,
				...(additions === undefined ? {} : { additions }),
				...(deletions === undefined ? {} : { deletions }),
			});
			continue;
		}
		const pathBefore = parts[index] ?? "";
		index += 1;
		const pathAfter = parts[index] ?? "";
		index += 1;
		rows.push({
			pathBefore,
			pathAfter,
			binary,
			...(additions === undefined ? {} : { additions }),
			...(deletions === undefined ? {} : { deletions }),
		});
	}
	return rows;
}

export function parseGitPorcelainV2Z(
	output: string,
): readonly ParsedPorcelainFile[] {
	const parts = output.split("\0");
	const files: ParsedPorcelainFile[] = [];
	for (let index = 0; index < parts.length; ) {
		const record = parts[index] ?? "";
		index += 1;
		if (!record) continue;
		if (record.startsWith("? ")) {
			files.push({ untracked: true, pathAfter: record.slice(2) });
			continue;
		}
		if (record.startsWith("2 ")) {
			const pathAfter = record.slice(record.lastIndexOf(" ") + 1);
			const pathBefore = parts[index] ?? "";
			index += 1;
			files.push({ untracked: false, pathAfter, pathBefore });
		}
	}
	return files;
}

export function mapRawStatus(input: {
	readonly statusCode: string;
	readonly oldMode: string;
	readonly newMode: string;
	readonly binary: boolean;
}): ReviewFileStatus {
	if (input.oldMode === "160000" || input.newMode === "160000")
		return "submodule";
	if (input.statusCode === "A") return "added";
	if (input.statusCode === "D") return "deleted";
	if (input.statusCode === "R") return "renamed";
	if (input.statusCode === "C") return "copied";
	if (input.statusCode === "T") return "type-changed";
	if (input.statusCode === "U") return "unmerged";
	if (input.binary && input.statusCode === "M") return "binary";
	return "modified";
}

export function toReviewFileSummary(input: {
	readonly raw: ParsedRawFile;
	readonly stats?: ParsedNumstat | undefined;
	readonly memberId?: string | undefined;
	readonly oldContentHash?: string | undefined;
	readonly newContentHash?: string | undefined;
}): ReviewFileSummary {
	const binary = input.stats?.binary === true;
	const status = mapRawStatus({
		statusCode: input.raw.statusCode,
		oldMode: input.raw.oldMode,
		newMode: input.raw.newMode,
		binary,
	});
	const additions = input.stats?.additions;
	const deletions = input.stats?.deletions;
	const tooLargeForInline =
		binary || (additions ?? 0) + (deletions ?? 0) > 5_000;
	const pathBefore = input.raw.pathBefore;
	const pathAfter = input.raw.pathAfter;
	return {
		fileId: reviewFileId({
			status,
			...(input.memberId === undefined ? {} : { memberId: input.memberId }),
			...(pathBefore === undefined ? {} : { pathBefore }),
			...(pathAfter === undefined ? {} : { pathAfter }),
			oldBlobOid: input.raw.oldBlobOid,
			newBlobOid: input.raw.newBlobOid,
		}),
		status,
		binary,
		tooLargeForInline,
		oldBlobOid: input.raw.oldBlobOid,
		newBlobOid: input.raw.newBlobOid,
		oldMode: input.raw.oldMode,
		newMode: input.raw.newMode,
		...(pathBefore === undefined ? {} : { pathBefore }),
		...(pathAfter === undefined ? {} : { pathAfter }),
		...(additions === undefined ? {} : { additions }),
		...(deletions === undefined ? {} : { deletions }),
		...(input.oldContentHash === undefined
			? {}
			: { oldContentHash: input.oldContentHash }),
		...(input.newContentHash === undefined
			? {}
			: { newContentHash: input.newContentHash }),
	};
}

export function hashReviewManifest(
	files: readonly ReviewFileSummary[],
): string {
	return sha256Hex(
		JSON.stringify(
			files.map((file) => [
				file.fileId,
				file.status,
				file.pathBefore ?? "",
				file.pathAfter ?? "",
				file.oldBlobOid ?? "",
				file.newBlobOid ?? "",
				file.oldMode ?? "",
				file.newMode ?? "",
				file.additions ?? 0,
				file.deletions ?? 0,
				file.binary,
			]),
		),
	);
}

export function pageReviewManifest(input: {
	readonly generationId: string;
	readonly manifestHash: string;
	readonly files: readonly ReviewFileSummary[];
	readonly secret: string;
	readonly cursor?: string;
	readonly pageSize?: number;
}): ReviewDiffManifest {
	const pageSize = input.pageSize ?? DEFAULT_MANIFEST_PAGE_SIZE;
	const offset =
		input.cursor === undefined
			? 0
			: decodeReviewCursor(input.cursor, {
					secret: input.secret,
					generationId: input.generationId,
					kind: "manifest",
				}).offset;
	const files = input.files.slice(offset, offset + pageSize);
	const nextOffset = offset + files.length;
	const hasMore = nextOffset < input.files.length;
	let totalAdditions = 0;
	let totalDeletions = 0;
	let binaryFiles = 0;
	for (const file of input.files) {
		totalAdditions += file.additions ?? 0;
		totalDeletions += file.deletions ?? 0;
		if (file.binary) binaryFiles += 1;
	}
	return {
		generationId: input.generationId,
		manifestHash: input.manifestHash,
		files,
		totalFiles: input.files.length,
		totalAdditions,
		totalDeletions,
		binaryFiles,
		pages: {
			cursor: encodeReviewCursor(
				{ kind: "manifest", generationId: input.generationId, offset },
				input.secret,
			),
			limit: pageSize,
			truncated: hasMore,
			...(hasMore
				? {
						nextCursor: encodeReviewCursor(
							{
								kind: "manifest",
								generationId: input.generationId,
								offset: nextOffset,
							},
							input.secret,
						),
					}
				: {}),
		},
	};
}

export function numstatKey(pathBefore?: string, pathAfter?: string): string {
	return `${pathBefore ?? ""}=>${pathAfter ?? ""}`;
}
