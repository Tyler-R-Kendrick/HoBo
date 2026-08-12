import { reviewError } from "./review-errors.js";
import type {
	PendingReview,
	ReviewCoverageRecord,
	ReviewGeneration,
	ReviewInboxDisposition,
	ReviewMessage,
	ReviewPublicationState,
	ReviewTarget,
	ReviewThread,
} from "./review-ports.js";

// public-contract: review aggregate event types on partition hobo-code-reviews.
export const REVIEW_EVENT_STARTED = "code.ReviewStarted";
// public-contract: a generation was created for a review target.
export const REVIEW_EVENT_GENERATION_CREATED = "code.ReviewGenerationCreated";
// public-contract: a generation became the current review generation.
export const REVIEW_EVENT_GENERATION_ACTIVATED =
	"code.ReviewGenerationActivated";
// public-contract: an actor marked a coverage unit.
export const REVIEW_EVENT_COVERAGE_MARKED = "code.ReviewCoverageMarked";
// public-contract: coverage records were invalidated against a new generation.
export const REVIEW_EVENT_COVERAGE_INVALIDATED =
	"code.ReviewCoverageInvalidated";
// public-contract: a review thread was created.
export const REVIEW_EVENT_THREAD_CREATED = "code.ReviewThreadCreated";
// public-contract: a review thread was updated.
export const REVIEW_EVENT_THREAD_UPDATED = "code.ReviewThreadUpdated";
// public-contract: a review thread was deleted.
export const REVIEW_EVENT_THREAD_DELETED = "code.ReviewThreadDeleted";
// public-contract: a review message was added.
export const REVIEW_EVENT_MESSAGE_ADDED = "code.ReviewMessageAdded";
// public-contract: a draft review message was edited.
export const REVIEW_EVENT_MESSAGE_EDITED = "code.ReviewMessageEdited";
// public-contract: a draft review message was deleted.
export const REVIEW_EVENT_MESSAGE_DELETED = "code.ReviewMessageDeleted";
// public-contract: a pending publication was prepared.
export const REVIEW_EVENT_PENDING_PREPARED = "code.ReviewPendingPrepared";
// public-contract: publication state advanced for selected review artifacts.
export const REVIEW_EVENT_PUBLICATION_CHANGED =
	"code.ReviewPublicationStateChanged";
// public-contract: inbox disposition changed.
export const REVIEW_EVENT_INBOX_DISPOSITION_SET =
	"code.ReviewInboxDispositionSet";
// public-contract: the review was closed.
export const REVIEW_EVENT_CLOSED = "code.ReviewClosed";

export const REVIEW_EVENT_TYPES = [
	REVIEW_EVENT_STARTED,
	REVIEW_EVENT_GENERATION_CREATED,
	REVIEW_EVENT_GENERATION_ACTIVATED,
	REVIEW_EVENT_COVERAGE_MARKED,
	REVIEW_EVENT_COVERAGE_INVALIDATED,
	REVIEW_EVENT_THREAD_CREATED,
	REVIEW_EVENT_THREAD_UPDATED,
	REVIEW_EVENT_THREAD_DELETED,
	REVIEW_EVENT_MESSAGE_ADDED,
	REVIEW_EVENT_MESSAGE_EDITED,
	REVIEW_EVENT_MESSAGE_DELETED,
	REVIEW_EVENT_PENDING_PREPARED,
	REVIEW_EVENT_PUBLICATION_CHANGED,
	REVIEW_EVENT_INBOX_DISPOSITION_SET,
	REVIEW_EVENT_CLOSED,
] as const;

export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];

export interface ReviewEventMeta {
	readonly commandId: string;
	readonly actorId: string;
	readonly reviewId: string;
	readonly at: string;
}

export type ReviewDomainEvent =
	| {
			readonly type: typeof REVIEW_EVENT_STARTED;
			readonly data: ReviewEventMeta & {
				readonly target: ReviewTarget;
				readonly sessionId?: string;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_GENERATION_CREATED;
			readonly data: ReviewEventMeta & {
				readonly generation: ReviewGeneration;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_GENERATION_ACTIVATED;
			readonly data: ReviewEventMeta & { readonly generationId: string };
	  }
	| {
			readonly type: typeof REVIEW_EVENT_COVERAGE_MARKED;
			readonly data: ReviewEventMeta & {
				readonly coverage: ReviewCoverageRecord;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_COVERAGE_INVALIDATED;
			readonly data: ReviewEventMeta & {
				readonly generationId: string;
				readonly records: readonly ReviewCoverageRecord[];
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_THREAD_CREATED;
			readonly data: ReviewEventMeta & { readonly thread: ReviewThread };
	  }
	| {
			readonly type: typeof REVIEW_EVENT_THREAD_UPDATED;
			readonly data: ReviewEventMeta & {
				readonly threadId: string;
				readonly resolution?: ReviewThread["resolution"];
				readonly visibility?: ReviewThread["visibility"];
				readonly routedAgentId?: string;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_THREAD_DELETED;
			readonly data: ReviewEventMeta & { readonly threadId: string };
	  }
	| {
			readonly type: typeof REVIEW_EVENT_MESSAGE_ADDED;
			readonly data: ReviewEventMeta & {
				readonly message: ReviewMessage;
				readonly bodyInline?: string;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_MESSAGE_EDITED;
			readonly data: ReviewEventMeta & {
				readonly messageId: string;
				readonly bodyHash: string;
				readonly editRevision: number;
				readonly editedAt: string;
				readonly bodyInline?: string;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_MESSAGE_DELETED;
			readonly data: ReviewEventMeta & { readonly messageId: string };
	  }
	| {
			readonly type: typeof REVIEW_EVENT_PENDING_PREPARED;
			readonly data: ReviewEventMeta & { readonly pending: PendingReview };
	  }
	| {
			readonly type: typeof REVIEW_EVENT_PUBLICATION_CHANGED;
			readonly data: ReviewEventMeta & {
				readonly state: ReviewPublicationState;
				readonly messageIds: readonly string[];
				readonly pendingReviewId?: string;
				readonly submissionId?: string;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_INBOX_DISPOSITION_SET;
			readonly data: ReviewEventMeta & {
				readonly disposition: ReviewInboxDisposition;
			};
	  }
	| {
			readonly type: typeof REVIEW_EVENT_CLOSED;
			readonly data: ReviewEventMeta;
	  };

const EVENT_TYPES = new Set<string>(REVIEW_EVENT_TYPES);

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

export function isReviewEventType(value: string): value is ReviewEventType {
	return EVENT_TYPES.has(value);
}

export function parseReviewEvent(value: {
	readonly type: string;
	readonly data: unknown;
}): ReviewDomainEvent {
	if (!isReviewEventType(value.type)) {
		throw reviewError("malformed-input", `unknown review event: ${value.type}`);
	}
	const data = record(value.data, "event.data");
	const meta = {
		commandId: requiredString(data.commandId, "commandId"),
		actorId: requiredString(data.actorId, "actorId"),
		reviewId: requiredString(data.reviewId, "reviewId"),
		at: requiredString(data.at, "at"),
	};
	switch (value.type) {
		case REVIEW_EVENT_STARTED: {
			const sessionId = optionalString(data.sessionId, "sessionId");
			return {
				type: value.type,
				data: {
					...meta,
					target: data.target as ReviewTarget,
					...(sessionId === undefined ? {} : { sessionId }),
				},
			};
		}
		case REVIEW_EVENT_GENERATION_CREATED:
			return {
				type: value.type,
				data: {
					...meta,
					generation: data.generation as ReviewGeneration,
				},
			};
		case REVIEW_EVENT_GENERATION_ACTIVATED:
			return {
				type: value.type,
				data: {
					...meta,
					generationId: requiredString(data.generationId, "generationId"),
				},
			};
		case REVIEW_EVENT_COVERAGE_MARKED:
			return {
				type: value.type,
				data: {
					...meta,
					coverage: data.coverage as ReviewCoverageRecord,
				},
			};
		case REVIEW_EVENT_COVERAGE_INVALIDATED:
			return {
				type: value.type,
				data: {
					...meta,
					generationId: requiredString(data.generationId, "generationId"),
					records: Array.isArray(data.records)
						? (data.records as ReviewCoverageRecord[])
						: [],
				},
			};
		case REVIEW_EVENT_THREAD_CREATED:
			return {
				type: value.type,
				data: { ...meta, thread: data.thread as ReviewThread },
			};
		case REVIEW_EVENT_THREAD_UPDATED: {
			const resolution = optionalString(data.resolution, "resolution") as
				| ReviewThread["resolution"]
				| undefined;
			const visibility = optionalString(data.visibility, "visibility") as
				| ReviewThread["visibility"]
				| undefined;
			const routedAgentId = optionalString(data.routedAgentId, "routedAgentId");
			return {
				type: value.type,
				data: {
					...meta,
					threadId: requiredString(data.threadId, "threadId"),
					...(resolution === undefined ? {} : { resolution }),
					...(visibility === undefined ? {} : { visibility }),
					...(routedAgentId === undefined ? {} : { routedAgentId }),
				},
			};
		}
		case REVIEW_EVENT_THREAD_DELETED:
			return {
				type: value.type,
				data: {
					...meta,
					threadId: requiredString(data.threadId, "threadId"),
				},
			};
		case REVIEW_EVENT_MESSAGE_ADDED: {
			const bodyInline = optionalString(data.bodyInline, "bodyInline");
			return {
				type: value.type,
				data: {
					...meta,
					message: data.message as ReviewMessage,
					...(bodyInline === undefined ? {} : { bodyInline }),
				},
			};
		}
		case REVIEW_EVENT_MESSAGE_EDITED: {
			const bodyInline = optionalString(data.bodyInline, "bodyInline");
			return {
				type: value.type,
				data: {
					...meta,
					messageId: requiredString(data.messageId, "messageId"),
					bodyHash: requiredString(data.bodyHash, "bodyHash"),
					editRevision: Number(data.editRevision),
					editedAt: requiredString(data.editedAt, "editedAt"),
					...(bodyInline === undefined ? {} : { bodyInline }),
				},
			};
		}
		case REVIEW_EVENT_MESSAGE_DELETED:
			return {
				type: value.type,
				data: {
					...meta,
					messageId: requiredString(data.messageId, "messageId"),
				},
			};
		case REVIEW_EVENT_PENDING_PREPARED:
			return {
				type: value.type,
				data: { ...meta, pending: data.pending as PendingReview },
			};
		case REVIEW_EVENT_PUBLICATION_CHANGED: {
			const pendingReviewId = optionalString(
				data.pendingReviewId,
				"pendingReviewId",
			);
			const submissionId = optionalString(data.submissionId, "submissionId");
			return {
				type: value.type,
				data: {
					...meta,
					state: requiredString(data.state, "state") as ReviewPublicationState,
					messageIds: Array.isArray(data.messageIds)
						? data.messageIds.map((item, index) =>
								requiredString(item, `messageIds[${index}]`),
							)
						: [],
					...(pendingReviewId === undefined ? {} : { pendingReviewId }),
					...(submissionId === undefined ? {} : { submissionId }),
				},
			};
		}
		case REVIEW_EVENT_INBOX_DISPOSITION_SET:
			return {
				type: value.type,
				data: {
					...meta,
					disposition: requiredString(
						data.disposition,
						"disposition",
					) as ReviewInboxDisposition,
				},
			};
		case REVIEW_EVENT_CLOSED:
			return { type: value.type, data: meta };
	}
}

export function reviewEventInput(event: ReviewDomainEvent): {
	readonly type: ReviewEventType;
	readonly v: 1;
	readonly data: ReviewDomainEvent["data"];
} {
	return { type: event.type, v: 1, data: event.data };
}
