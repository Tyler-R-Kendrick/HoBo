import type { ReviewFileLocator } from "./git-review-manifest.js";
import type { ReviewFileSummary, ReviewGeneration } from "./review-ports.js";

export interface ReviewCacheRecord {
	generation: ReviewGeneration;
	files: readonly ReviewFileSummary[];
	locators?: readonly ReviewFileLocator[];
	cursorSecret: string;
	repositoryRoot: string;
	isolatedGitDir?: string;
	cancelled: boolean;
	ready: boolean;
	abort: AbortController;
}

export interface ReviewCache {
	put(record: ReviewCacheRecord): void;
	get(generationId: string): ReviewCacheRecord | undefined;
	cancel(generationId: string): void;
	cancelReview(reviewId: string, exceptGenerationId?: string): void;
	latest(reviewId: string): ReviewCacheRecord | undefined;
}

export function createReviewCache(): ReviewCache {
	const records = new Map<string, ReviewCacheRecord>();
	const order: string[] = [];

	const write = (record: ReviewCacheRecord): void => {
		if (!records.has(record.generation.id)) order.push(record.generation.id);
		records.set(record.generation.id, record);
	};

	const cancelRecord = (record: ReviewCacheRecord): void => {
		if (!record.abort.signal.aborted) record.abort.abort();
		records.set(record.generation.id, { ...record, cancelled: true });
	};

	return {
		put(record) {
			write({
				...record,
				locators: record.locators ?? [],
			});
		},
		get(generationId) {
			return records.get(generationId);
		},
		cancel(generationId) {
			const record = records.get(generationId);
			if (record) cancelRecord(record);
		},
		cancelReview(reviewId, exceptGenerationId) {
			for (const record of records.values()) {
				if (record.generation.reviewId !== reviewId) continue;
				if (record.generation.id === exceptGenerationId) continue;
				if (!record.ready) cancelRecord(record);
			}
		},
		latest(reviewId) {
			for (let index = order.length - 1; index >= 0; index -= 1) {
				const id = order[index];
				if (id === undefined) continue;
				const record = records.get(id);
				if (record?.generation.reviewId === reviewId) return record;
			}
			return undefined;
		},
	};
}
