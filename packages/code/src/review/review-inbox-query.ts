import { reviewError } from "./review-errors.js";
import type { ReviewDomainEvent } from "./review-events.js";
import {
	applyInboxDispositionEvent,
	projectInboxDispositionEvent,
	projectReviewInboxItem,
	type ReviewInboxSignal,
	type ReviewInboxTruth,
} from "./review-inbox.js";
import type {
	ReviewInboxDisposition,
	ReviewInboxItem,
	ReviewSnapshot,
} from "./review-ports.js";

export interface ReviewInboxSource {
	readonly snapshot: ReviewSnapshot;
	readonly signal?: ReviewInboxSignal;
}

export interface ReviewInboxQuery {
	apply(snapshot: ReviewSnapshot, signal?: ReviewInboxSignal): ReviewInboxItem;
	applyDisposition(
		reviewId: string,
		disposition: ReviewInboxDisposition,
		at: string,
	): ReviewInboxItem;
	applyDispositionEvent(event: ReviewDomainEvent): ReviewInboxItem;
	get(reviewId: string): ReviewInboxItem | undefined;
	list(): readonly ReviewInboxItem[];
	rebuild(
		sources: readonly ReviewInboxSource[],
		truth?: ReviewInboxTruth,
	): readonly ReviewInboxItem[];
}

export function createReviewInboxQuery(
	options: { readonly scanAll?: () => void } = {},
): ReviewInboxQuery {
	const items = new Map<string, ReviewInboxItem>();
	const snapshots = new Map<string, ReviewSnapshot>();

	const project = (
		snapshot: ReviewSnapshot,
		signal: ReviewInboxSignal | undefined,
		truth?: ReviewInboxTruth,
	): ReviewInboxItem => {
		const item = projectReviewInboxItem({
			snapshot,
			...(signal === undefined ? {} : { signal }),
			...(truth === undefined ? {} : { truth }),
		});
		items.set(snapshot.reviewId, item);
		snapshots.set(snapshot.reviewId, snapshot);
		return item;
	};

	return {
		apply(snapshot, signal) {
			return project(snapshot, signal);
		},
		applyDisposition(reviewId, disposition, at) {
			const current = items.get(reviewId);
			if (current === undefined) {
				throw reviewError(
					"not-found",
					`inbox item ${reviewId} does not exist`,
					{
						reviewId,
					},
				);
			}
			const snapshot = snapshots.get(reviewId);
			if (snapshot !== undefined) {
				snapshots.set(reviewId, {
					...snapshot,
					inboxDisposition: disposition,
					updatedAt: at,
				});
			}
			const next = applyInboxDispositionEvent(current, disposition, { at });
			items.set(reviewId, next);
			return next;
		},
		applyDispositionEvent(event) {
			const current = items.get(event.data.reviewId);
			if (current === undefined) {
				throw reviewError(
					"not-found",
					`inbox item ${event.data.reviewId} does not exist`,
					{ reviewId: event.data.reviewId },
				);
			}
			const next = projectInboxDispositionEvent(current, event);
			items.set(event.data.reviewId, next);
			const snapshot = snapshots.get(event.data.reviewId);
			if (
				snapshot !== undefined &&
				event.type === "code.ReviewInboxDispositionSet"
			) {
				snapshots.set(event.data.reviewId, {
					...snapshot,
					inboxDisposition: event.data.disposition,
					updatedAt: event.data.at,
				});
			}
			return next;
		},
		get(reviewId) {
			return items.get(reviewId);
		},
		list() {
			return [...items.values()];
		},
		rebuild(sources, truth) {
			options.scanAll?.();
			items.clear();
			snapshots.clear();
			for (const source of sources) {
				project(source.snapshot, source.signal, truth);
			}
			return [...items.values()];
		},
	};
}
