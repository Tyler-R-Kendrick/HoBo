import { existsSync, readFileSync } from "node:fs";
import { createRuntimeLocalEventStore } from "@hobo/runtime-local";
import { reviewStreamId } from "./resident-review-runtime.js";
import { renderReviewAgentPrompt } from "./review-agent-prompt.js";
import {
	applyReviewEvent,
	emptyReviewAggregate,
	type ReviewAggregate,
} from "./review-aggregate.js";
import { reviewError } from "./review-errors.js";
import {
	parseReviewEvent,
	REVIEW_EVENT_MESSAGE_ADDED,
	REVIEW_EVENT_MESSAGE_DELETED,
	REVIEW_EVENT_MESSAGE_EDITED,
	REVIEW_EVENT_PENDING_PREPARED,
	REVIEW_EVENT_PUBLICATION_CHANGED,
} from "./review-events.js";
import type { ReviewContentStore } from "./review-ports.js";
import { type PendingReview, REVIEW_PARTITION } from "./review-ports.js";
import { assertSafeRepositoryPath } from "./review-suggestions.js";

export const REVIEW_AGENT_CONTEXT_LIMIT = 32_768;

export interface ReviewAgentView {
	readonly aggregate: ReviewAggregate;
	readonly pending?: PendingReview;
	readonly bodies: ReadonlyMap<string, string>;
}

export interface ReviewAgentQuery {
	loadView(reviewId: string): Promise<ReviewAgentView>;
}

export function createReviewEventQuery(options: {
	readonly dataDir: string;
	readonly content: ReviewContentStore;
}): ReviewAgentQuery {
	return {
		loadView(reviewId) {
			return loadReviewAgentView(options.dataDir, reviewId, options.content);
		},
	};
}

export async function loadReviewAgentView(
	dataDir: string,
	reviewId: string,
	content: ReviewContentStore,
): Promise<ReviewAgentView> {
	const store = createRuntimeLocalEventStore({
		dataDir,
		partitionId: REVIEW_PARTITION,
	});
	try {
		let state = emptyReviewAggregate(reviewId);
		let pending: PendingReview | undefined;
		const bodies = new Map<string, string>();
		for await (const event of store.read(reviewStreamId(reviewId))) {
			const domain = parseReviewEvent(event);
			state = applyReviewEvent(state, domain);
			if (domain.type === REVIEW_EVENT_MESSAGE_ADDED) {
				bodies.set(
					domain.data.message.messageId,
					await readBody(
						content,
						domain.data.message.bodyHash,
						domain.data.bodyInline,
					),
				);
			} else if (domain.type === REVIEW_EVENT_MESSAGE_EDITED) {
				const current = state.messages[domain.data.messageId];
				if (current) {
					bodies.set(
						domain.data.messageId,
						await readBody(
							content,
							domain.data.bodyHash,
							domain.data.bodyInline,
						),
					);
				}
			} else if (domain.type === REVIEW_EVENT_MESSAGE_DELETED) {
				bodies.delete(domain.data.messageId);
			} else if (domain.type === REVIEW_EVENT_PENDING_PREPARED) {
				pending = domain.data.pending;
			} else if (
				domain.type === REVIEW_EVENT_PUBLICATION_CHANGED &&
				domain.data.state === "published"
			) {
				pending = undefined;
			}
		}
		return pending === undefined
			? { aggregate: state, bodies }
			: { aggregate: state, pending, bodies };
	} finally {
		store.close();
	}
}

async function readBody(
	content: ReviewContentStore,
	hash: string,
	inline?: string,
): Promise<string> {
	if (inline !== undefined) return inline;
	return new TextDecoder().decode(await content.get(hash));
}

export function resolveReviewAgentPath(
	repositoryRoot: string,
	relPath: string,
): string {
	return assertSafeRepositoryPath(repositoryRoot, relPath);
}

export function readBoundedReviewFile(input: {
	readonly repositoryRoot: string;
	readonly path: string;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly maxBytes?: number;
}): string {
	const safe = resolveReviewAgentPath(input.repositoryRoot, input.path);
	const absolute = `${input.repositoryRoot.replace(/\/$/u, "")}/${safe}`;
	if (!existsSync(absolute)) {
		throw reviewError(
			"not-found",
			`review context file ${safe} does not exist`,
			{
				path: safe,
			},
		);
	}
	const raw = readFileSync(absolute, "utf8");
	const maxBytes = input.maxBytes ?? REVIEW_AGENT_CONTEXT_LIMIT;
	const start = input.startLine ?? 1;
	const lines = raw.split(/\r?\n/u);
	const end = input.endLine ?? lines.length;
	if (start < 1 || end < start) {
		throw reviewError("malformed-input", "review context range is invalid", {
			startLine: start,
			endLine: end,
		});
	}
	const sliced = lines.slice(start - 1, end).join("\n");
	const bytes = new TextEncoder().encode(sliced);
	if (bytes.byteLength > maxBytes) {
		throw reviewError("body-limit", "review context exceeds the bounded size", {
			bytes: bytes.byteLength,
			limit: maxBytes,
		});
	}
	return sliced;
}

export function buildReviewAgentContext(input: {
	readonly reviewId: string;
	readonly generationId: string;
	readonly threadId: string;
	readonly anchorId?: string;
	readonly source?: { readonly path: string; readonly text: string };
	readonly comments: readonly {
		readonly authorId: string;
		readonly body: string;
	}[];
}): string {
	return renderReviewAgentPrompt({
		reviewId: input.reviewId,
		generationId: input.generationId,
		threadId: input.threadId,
		comments: input.comments,
		...(input.anchorId === undefined ? {} : { anchorId: input.anchorId }),
		...(input.source === undefined ? {} : { source: input.source }),
	});
}
