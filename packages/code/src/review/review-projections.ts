import { parseReviewSnapshot } from "./review-contract.js";
import {
	REVIEW_EVENT_CLOSED,
	REVIEW_EVENT_COVERAGE_INVALIDATED,
	REVIEW_EVENT_COVERAGE_MARKED,
	REVIEW_EVENT_GENERATION_ACTIVATED,
	REVIEW_EVENT_GENERATION_CREATED,
	REVIEW_EVENT_INBOX_DISPOSITION_SET,
	REVIEW_EVENT_MESSAGE_ADDED,
	REVIEW_EVENT_MESSAGE_DELETED,
	REVIEW_EVENT_MESSAGE_EDITED,
	REVIEW_EVENT_PENDING_PREPARED,
	REVIEW_EVENT_PUBLICATION_CHANGED,
	REVIEW_EVENT_STARTED,
	REVIEW_EVENT_THREAD_CREATED,
	REVIEW_EVENT_THREAD_DELETED,
	REVIEW_EVENT_THREAD_UPDATED,
	type ReviewDomainEvent,
} from "./review-events.js";
import { REVIEW_SNAPSHOT_SCHEMA, type ReviewSnapshot } from "./review-ports.js";

export function emptyReviewSnapshot(
	reviewId: string,
	updatedAt = "",
): ReviewSnapshot {
	return {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId,
		revision: 0n,
		threadIds: [],
		coverageIds: [],
		inboxDisposition: "active",
		closed: false,
		updatedAt,
	};
}

export function reviewSnapshotJson(
	snapshot: ReviewSnapshot,
): Record<string, unknown> {
	return {
		schemaVersion: snapshot.schemaVersion,
		reviewId: snapshot.reviewId,
		revision: snapshot.revision.toString(),
		threadIds: [...snapshot.threadIds],
		coverageIds: [...snapshot.coverageIds],
		inboxDisposition: snapshot.inboxDisposition,
		closed: snapshot.closed,
		updatedAt: snapshot.updatedAt,
		...(snapshot.sessionId === undefined
			? {}
			: { sessionId: snapshot.sessionId }),
		...(snapshot.currentGenerationId === undefined
			? {}
			: { currentGenerationId: snapshot.currentGenerationId }),
		...(snapshot.pendingReviewId === undefined
			? {}
			: { pendingReviewId: snapshot.pendingReviewId }),
		...(snapshot.target === undefined ? {} : { target: snapshot.target }),
	};
}

export function cloneReviewSnapshot(snapshot: ReviewSnapshot): ReviewSnapshot {
	return snapshot.updatedAt === ""
		? {
				...snapshot,
				threadIds: [...snapshot.threadIds],
				coverageIds: [...snapshot.coverageIds],
			}
		: parseReviewSnapshot(reviewSnapshotJson(snapshot));
}

export function projectReviewEvent(
	snapshot: ReviewSnapshot,
	event: ReviewDomainEvent,
): ReviewSnapshot {
	const revision = snapshot.revision + 1n;
	const updatedAt = event.data.at;
	const reviewId = event.data.reviewId || snapshot.reviewId;
	switch (event.type) {
		case REVIEW_EVENT_STARTED:
			return {
				schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
				reviewId,
				revision,
				threadIds: [],
				coverageIds: [],
				inboxDisposition: "active",
				closed: false,
				updatedAt,
				target: event.data.target,
				...(event.data.sessionId === undefined
					? {}
					: { sessionId: event.data.sessionId }),
			};
		case REVIEW_EVENT_GENERATION_CREATED:
			return { ...snapshot, revision, updatedAt };
		case REVIEW_EVENT_GENERATION_ACTIVATED:
			return {
				...snapshot,
				revision,
				updatedAt,
				currentGenerationId: event.data.generationId,
			};
		case REVIEW_EVENT_COVERAGE_MARKED: {
			const coverageId = event.data.coverage.coverageId;
			const coverageIds = snapshot.coverageIds.includes(coverageId)
				? snapshot.coverageIds
				: [...snapshot.coverageIds, coverageId];
			return { ...snapshot, revision, updatedAt, coverageIds };
		}
		case REVIEW_EVENT_COVERAGE_INVALIDATED:
			return { ...snapshot, revision, updatedAt };
		case REVIEW_EVENT_THREAD_CREATED: {
			const threadId = event.data.thread.threadId;
			const threadIds = snapshot.threadIds.includes(threadId)
				? snapshot.threadIds
				: [...snapshot.threadIds, threadId];
			return { ...snapshot, revision, updatedAt, threadIds };
		}
		case REVIEW_EVENT_THREAD_UPDATED:
			return { ...snapshot, revision, updatedAt };
		case REVIEW_EVENT_THREAD_DELETED:
			return {
				...snapshot,
				revision,
				updatedAt,
				threadIds: snapshot.threadIds.filter(
					(threadId) => threadId !== event.data.threadId,
				),
			};
		case REVIEW_EVENT_MESSAGE_ADDED:
		case REVIEW_EVENT_MESSAGE_EDITED:
		case REVIEW_EVENT_MESSAGE_DELETED:
			return { ...snapshot, revision, updatedAt };
		case REVIEW_EVENT_PENDING_PREPARED:
			return {
				...snapshot,
				revision,
				updatedAt,
				pendingReviewId: event.data.pending.pendingReviewId,
			};
		case REVIEW_EVENT_PUBLICATION_CHANGED: {
			const pendingReviewId =
				event.data.state === "published" || event.data.state === "rejected"
					? undefined
					: (event.data.pendingReviewId ?? snapshot.pendingReviewId);
			return pendingReviewId === undefined
				? {
						schemaVersion: snapshot.schemaVersion,
						reviewId: snapshot.reviewId,
						revision,
						threadIds: snapshot.threadIds,
						coverageIds: snapshot.coverageIds,
						inboxDisposition: snapshot.inboxDisposition,
						closed: snapshot.closed,
						updatedAt,
						...(snapshot.sessionId === undefined
							? {}
							: { sessionId: snapshot.sessionId }),
						...(snapshot.currentGenerationId === undefined
							? {}
							: { currentGenerationId: snapshot.currentGenerationId }),
						...(snapshot.target === undefined
							? {}
							: { target: snapshot.target }),
					}
				: {
						...snapshot,
						revision,
						updatedAt,
						pendingReviewId,
					};
		}
		case REVIEW_EVENT_INBOX_DISPOSITION_SET:
			return {
				...snapshot,
				revision,
				updatedAt,
				inboxDisposition: event.data.disposition,
			};
		case REVIEW_EVENT_CLOSED:
			return { ...snapshot, revision, updatedAt, closed: true };
	}
}

export function projectReviewEvents(
	reviewId: string,
	events: readonly ReviewDomainEvent[],
): ReviewSnapshot {
	return events.reduce(
		(snapshot, event) => projectReviewEvent(snapshot, event),
		emptyReviewSnapshot(reviewId),
	);
}
