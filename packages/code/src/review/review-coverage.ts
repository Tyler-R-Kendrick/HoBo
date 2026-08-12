import {
	fileContentIdentity,
	hunkContentIdentity,
	reviewIdentity,
} from "./review-anchors.js";
import { reviewError } from "./review-errors.js";
import { interdiffGenerations } from "./review-interdiff.js";
import type {
	ReviewActorKind,
	ReviewCoverageRecord,
	ReviewCoverageUnit,
	ReviewDiffChunk,
	ReviewDiffManifest,
	ReviewFileSummary,
	ReviewHunk,
	ReviewProgressSummary,
} from "./review-ports.js";

export const DEFAULT_COVERAGE_ACTOR_KIND: ReviewActorKind = "human";

export function coverageUnitKey(unit: ReviewCoverageUnit): string {
	if (unit.kind === "file")
		return `file:${unit.fileId}:${unit.contentIdentity}`;
	if (unit.kind === "hunk") {
		return `hunk:${unit.fileId}:${unit.hunkId}:${unit.contentIdentity}`;
	}
	return `commit:${unit.stableChangeId}:${unit.contentIdentity}`;
}

export function fileCoverageUnit(file: ReviewFileSummary): ReviewCoverageUnit {
	return {
		kind: "file",
		fileId: file.fileId,
		contentIdentity: fileContentIdentity(file),
	};
}

export function hunkCoverageUnit(
	file: ReviewFileSummary,
	hunk: ReviewHunk,
): ReviewCoverageUnit {
	return {
		kind: "hunk",
		fileId: file.fileId,
		hunkId: hunk.hunkId,
		contentIdentity: hunkContentIdentity(hunk),
	};
}

export function createReviewCoverageRecord(input: {
	readonly reviewId: string;
	readonly actorId: string;
	readonly actorKind: ReviewActorKind;
	readonly generationId: string;
	readonly unit: ReviewCoverageUnit;
	readonly state: "reviewed" | "excluded";
	readonly exclusionReason?: string;
	readonly reviewedAt?: string;
}): ReviewCoverageRecord {
	if (input.state === "excluded" && input.exclusionReason === undefined) {
		throw reviewError(
			"malformed-input",
			"excluded coverage requires an exclusion reason",
		);
	}
	const reviewedAt =
		input.state === "reviewed"
			? (input.reviewedAt ?? new Date().toISOString())
			: undefined;
	const exclusionReason = input.exclusionReason;
	return {
		coverageId: reviewIdentity([
			"coverage",
			input.reviewId,
			input.actorId,
			input.actorKind,
			input.generationId,
			coverageUnitKey(input.unit),
		]),
		reviewId: input.reviewId,
		actorId: input.actorId,
		actorKind: input.actorKind,
		generationId: input.generationId,
		unit: input.unit,
		state: input.state,
		...(exclusionReason === undefined ? {} : { exclusionReason }),
		...(reviewedAt === undefined ? {} : { reviewedAt }),
	};
}

export function summarizeReviewProgress(
	records: readonly ReviewCoverageRecord[],
	manifest: ReviewDiffManifest,
	actor: {
		readonly actorId?: string;
		readonly actorKind?: ReviewActorKind;
	} = {},
): ReviewProgressSummary {
	const actorKind = actor.actorKind ?? DEFAULT_COVERAGE_ACTOR_KIND;
	const scoped = records.filter((record) => {
		if (record.actorKind !== actorKind) return false;
		return actor.actorId === undefined || record.actorId === actor.actorId;
	});
	const reviewedFiles = new Set<string>();
	const reviewedHunks = new Set<string>();
	let staleUnits = 0;
	let excludedUnits = 0;
	for (const record of scoped) {
		if (record.state === "excluded") {
			excludedUnits += 1;
			continue;
		}
		if (record.state === "stale") {
			staleUnits += 1;
			continue;
		}
		if (record.unit.kind === "file") reviewedFiles.add(record.unit.fileId);
		if (record.unit.kind === "hunk") {
			reviewedHunks.add(`${record.unit.fileId}:${record.unit.hunkId}`);
		}
	}
	return {
		reviewedFiles: reviewedFiles.size,
		totalFiles: manifest.totalFiles,
		reviewedHunks: reviewedHunks.size,
		totalHunks: manifest.files.reduce(
			(sum, file) => sum + (file.hunkCount ?? 0),
			0,
		),
		staleUnits,
		excludedUnits,
	};
}

export function invalidateCoverageForHunkEdit(
	records: readonly ReviewCoverageRecord[],
	input: {
		readonly fileId: string;
		readonly hunkId: string;
		readonly at: string;
		readonly evidence?: readonly string[];
	},
): readonly ReviewCoverageRecord[] {
	const evidence = input.evidence ?? [
		`agent-edit:${input.fileId}:${input.hunkId}`,
	];
	return records.map((record) => {
		const matchesHunk =
			record.unit.kind === "hunk" &&
			record.unit.fileId === input.fileId &&
			record.unit.hunkId === input.hunkId;
		const matchesFile =
			record.unit.kind === "file" && record.unit.fileId === input.fileId;
		if (!matchesHunk && !matchesFile) return record;
		if (record.state === "excluded") return record;
		return staleRecord(record, input.at, evidence);
	});
}

export function remapCoverageRecords(
	records: readonly ReviewCoverageRecord[],
	input: {
		readonly from: ReviewDiffManifest;
		readonly to: ReviewDiffManifest;
		readonly fromChunks: readonly ReviewDiffChunk[];
		readonly toChunks: readonly ReviewDiffChunk[];
		readonly toGenerationId: string;
		readonly at: string;
	},
): readonly ReviewCoverageRecord[] {
	const diff = interdiffGenerations(
		input.from,
		input.to,
		input.fromChunks,
		input.toChunks,
	);
	const fileMap = new Map<string, string>();
	const hunkMap = new Map<string, string>();
	const changedFiles = new Set<string>();
	const changedHunks = new Set<string>();
	const deletedFiles = new Set<string>();
	const deletedHunks = new Set<string>();

	for (const file of diff.files) {
		if (file.fromFileId !== undefined && file.toFileId !== undefined) {
			fileMap.set(file.fromFileId, file.toFileId);
		}
		if (file.kind === "deleted" && file.fromFileId !== undefined) {
			deletedFiles.add(file.fromFileId);
		}
		if (
			(file.kind === "modified" || file.kind === "binary") &&
			file.fromFileId !== undefined
		) {
			changedFiles.add(file.fromFileId);
		}
		for (const hunk of file.hunks) {
			if (hunk.fromHunkId !== undefined && hunk.toHunkId !== undefined) {
				hunkMap.set(hunk.fromHunkId, hunk.toHunkId);
			}
			if (hunk.kind === "modified" && hunk.fromHunkId !== undefined) {
				changedHunks.add(hunk.fromHunkId);
				if (file.fromFileId !== undefined) changedFiles.add(file.fromFileId);
			}
			if (hunk.kind === "deleted" && hunk.fromHunkId !== undefined) {
				deletedHunks.add(hunk.fromHunkId);
			}
		}
	}

	const toFiles = new Map(input.to.files.map((file) => [file.fileId, file]));
	const toHunks = new Map<
		string,
		{ file: ReviewFileSummary; hunk: ReviewHunk }
	>();
	for (const chunk of input.toChunks) {
		const file = toFiles.get(chunk.fileId);
		if (file === undefined) continue;
		for (const hunk of chunk.hunks) {
			toHunks.set(hunk.hunkId, { file, hunk });
		}
	}

	return records.map((record) => {
		if (record.unit.kind === "commit") {
			return {
				...record,
				generationId: input.toGenerationId,
			};
		}
		if (record.unit.kind === "file") {
			if (deletedFiles.has(record.unit.fileId)) {
				return staleRecord(record, input.at, [
					`file-deleted:${record.unit.fileId}`,
				]);
			}
			const nextFileId = fileMap.get(record.unit.fileId) ?? record.unit.fileId;
			const nextFile = toFiles.get(nextFileId);
			if (nextFile === undefined) {
				return staleRecord(record, input.at, [
					`file-missing:${record.unit.fileId}`,
				]);
			}
			if (
				changedFiles.has(record.unit.fileId) ||
				fileContentIdentity(nextFile) !== record.unit.contentIdentity
			) {
				return staleRecord(
					{
						...record,
						generationId: input.toGenerationId,
						unit: fileCoverageUnit(nextFile),
					},
					input.at,
					[`file-content-changed:${record.unit.fileId}`],
				);
			}
			if (record.state === "excluded") {
				return {
					...record,
					generationId: input.toGenerationId,
					unit: fileCoverageUnit(nextFile),
				};
			}
			return {
				...record,
				generationId: input.toGenerationId,
				unit: fileCoverageUnit(nextFile),
			};
		}

		if (
			deletedHunks.has(record.unit.hunkId) ||
			deletedFiles.has(record.unit.fileId)
		) {
			return staleRecord(record, input.at, [
				`hunk-deleted:${record.unit.hunkId}`,
			]);
		}
		if (changedHunks.has(record.unit.hunkId)) {
			return staleRecord(record, input.at, [
				`hunk-content-changed:${record.unit.hunkId}`,
			]);
		}
		const nextHunkId = hunkMap.get(record.unit.hunkId);
		const mapped =
			nextHunkId === undefined ? undefined : toHunks.get(nextHunkId);
		if (mapped === undefined) {
			return staleRecord(record, input.at, [
				`hunk-missing:${record.unit.hunkId}`,
			]);
		}
		if (hunkContentIdentity(mapped.hunk) !== record.unit.contentIdentity) {
			return staleRecord(record, input.at, [
				`hunk-content-changed:${record.unit.hunkId}`,
			]);
		}
		return {
			...record,
			generationId: input.toGenerationId,
			unit: hunkCoverageUnit(mapped.file, mapped.hunk),
		};
	});
}

function staleRecord(
	record: ReviewCoverageRecord,
	at: string,
	evidence: readonly string[],
): ReviewCoverageRecord {
	return {
		...record,
		state: "stale",
		invalidatedAt: at,
		invalidationEvidence: evidence,
	};
}
