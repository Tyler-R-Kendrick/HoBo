import { reviewError } from "./review-errors.js";
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
	type ReviewEventMeta,
} from "./review-events.js";
import type {
	ReviewCommandEnvelope,
	ReviewContentStore,
	ReviewCoverageRecord,
	ReviewCoverageUnit,
	ReviewDiffSource,
	ReviewGeneration,
	ReviewMessage,
	ReviewReanchorEngine,
	ReviewSnapshot,
	ReviewTarget,
	ReviewThread,
} from "./review-ports.js";
import {
	cloneReviewSnapshot,
	emptyReviewSnapshot,
	projectReviewEvent,
} from "./review-projections.js";

export interface ReviewAggregate {
	exists: boolean;
	snapshot: ReviewSnapshot;
	generations: Record<string, ReviewGeneration>;
	coverage: Record<string, ReviewCoverageRecord>;
	threads: Record<string, ReviewThread>;
	messages: Record<string, ReviewMessage>;
	routedAgents: Record<string, string>;
	processed: Record<string, ReviewSnapshot>;
}

export interface ReviewDecideContext {
	readonly now: () => string;
	readonly id: () => string;
	readonly content: ReviewContentStore;
	readonly hashText: (value: string) => string;
	readonly inlineLimit: number;
	readonly diffSource?: ReviewDiffSource;
	readonly reanchor?: ReviewReanchorEngine;
}

export function emptyReviewAggregate(reviewId = ""): ReviewAggregate {
	return {
		exists: false,
		snapshot: emptyReviewSnapshot(reviewId),
		generations: {},
		coverage: {},
		threads: {},
		messages: {},
		routedAgents: {},
		processed: {},
	};
}

function cloneState(state: ReviewAggregate): ReviewAggregate {
	return {
		exists: state.exists,
		snapshot: cloneReviewSnapshot(state.snapshot),
		generations: { ...state.generations },
		coverage: { ...state.coverage },
		threads: { ...state.threads },
		messages: { ...state.messages },
		routedAgents: { ...state.routedAgents },
		processed: Object.fromEntries(
			Object.entries(state.processed).map(([commandId, snapshot]) => [
				commandId,
				cloneReviewSnapshot(snapshot),
			]),
		),
	};
}

export function applyReviewEvent(
	state: ReviewAggregate,
	event: ReviewDomainEvent,
): ReviewAggregate {
	const next = cloneState(state);
	next.snapshot = projectReviewEvent(next.snapshot, event);
	next.exists = true;
	switch (event.type) {
		case REVIEW_EVENT_STARTED:
			break;
		case REVIEW_EVENT_GENERATION_CREATED:
			next.generations[event.data.generation.id] = event.data.generation;
			break;
		case REVIEW_EVENT_GENERATION_ACTIVATED:
			break;
		case REVIEW_EVENT_COVERAGE_MARKED:
			next.coverage[event.data.coverage.coverageId] = event.data.coverage;
			break;
		case REVIEW_EVENT_COVERAGE_INVALIDATED:
			for (const record of event.data.records) {
				next.coverage[record.coverageId] = record;
			}
			break;
		case REVIEW_EVENT_THREAD_CREATED:
			next.threads[event.data.thread.threadId] = event.data.thread;
			break;
		case REVIEW_EVENT_THREAD_UPDATED: {
			const thread = next.threads[event.data.threadId];
			if (thread) {
				next.threads[event.data.threadId] = {
					...thread,
					updatedAt: event.data.at,
					...(event.data.resolution === undefined
						? {}
						: { resolution: event.data.resolution }),
					...(event.data.visibility === undefined
						? {}
						: { visibility: event.data.visibility }),
				};
			}
			if (event.data.routedAgentId !== undefined) {
				next.routedAgents[event.data.threadId] = event.data.routedAgentId;
			}
			break;
		}
		case REVIEW_EVENT_THREAD_DELETED: {
			const thread = next.threads[event.data.threadId];
			delete next.threads[event.data.threadId];
			delete next.routedAgents[event.data.threadId];
			if (thread) {
				for (const messageId of thread.messageIds) {
					delete next.messages[messageId];
				}
			}
			break;
		}
		case REVIEW_EVENT_MESSAGE_ADDED: {
			const message = event.data.message;
			next.messages[message.messageId] = message;
			const thread = next.threads[message.threadId];
			if (thread && !thread.messageIds.includes(message.messageId)) {
				next.threads[message.threadId] = {
					...thread,
					messageIds: [...thread.messageIds, message.messageId],
					updatedAt: event.data.at,
				};
			}
			break;
		}
		case REVIEW_EVENT_MESSAGE_EDITED: {
			const message = next.messages[event.data.messageId];
			if (message) {
				next.messages[event.data.messageId] = {
					...message,
					bodyHash: event.data.bodyHash,
					editRevision: event.data.editRevision,
					editedAt: event.data.editedAt,
				};
			}
			break;
		}
		case REVIEW_EVENT_MESSAGE_DELETED: {
			const message = next.messages[event.data.messageId];
			delete next.messages[event.data.messageId];
			if (message) {
				const thread = next.threads[message.threadId];
				if (thread) {
					next.threads[message.threadId] = {
						...thread,
						messageIds: thread.messageIds.filter(
							(messageId) => messageId !== event.data.messageId,
						),
						updatedAt: event.data.at,
					};
				}
			}
			break;
		}
		case REVIEW_EVENT_PENDING_PREPARED:
		case REVIEW_EVENT_PUBLICATION_CHANGED:
		case REVIEW_EVENT_INBOX_DISPOSITION_SET:
		case REVIEW_EVENT_CLOSED:
			if (event.type === REVIEW_EVENT_PUBLICATION_CHANGED) {
				for (const messageId of event.data.messageIds) {
					const message = next.messages[messageId];
					if (message) {
						next.messages[messageId] = {
							...message,
							publicationState: event.data.state,
						};
					}
				}
			}
			break;
	}
	next.processed[event.data.commandId] = cloneReviewSnapshot(next.snapshot);
	return next;
}

function meta(command: ReviewCommandEnvelope, at: string): ReviewEventMeta {
	return {
		commandId: command.commandId,
		actorId: command.actorId,
		reviewId: command.reviewId,
		at,
	};
}

function requireOpen(state: ReviewAggregate, reviewId: string): void {
	if (!state.exists) {
		throw reviewError("not-found", `review ${reviewId} does not exist`, {
			reviewId,
		});
	}
	if (state.snapshot.closed) {
		throw reviewError("malformed-input", `review ${reviewId} is closed`, {
			reviewId,
		});
	}
}

function requireThread(state: ReviewAggregate, threadId: string): ReviewThread {
	const thread = state.threads[threadId];
	if (!thread) {
		throw reviewError("not-found", `thread ${threadId} does not exist`, {
			threadId,
		});
	}
	return thread;
}

function requireMessage(
	state: ReviewAggregate,
	messageId: string,
): ReviewMessage {
	const message = state.messages[messageId];
	if (!message) {
		throw reviewError("not-found", `message ${messageId} does not exist`, {
			messageId,
		});
	}
	return message;
}

function requireDraft(message: ReviewMessage): void {
	if (message.publicationState !== "private") {
		throw reviewError(
			"malformed-input",
			`message ${message.messageId} is not a draft`,
			{ messageId: message.messageId },
		);
	}
}

function coverageId(generationId: string, unit: ReviewCoverageUnit): string {
	if (unit.kind === "file") return `${generationId}:file:${unit.fileId}`;
	if (unit.kind === "hunk") {
		return `${generationId}:hunk:${unit.fileId}:${unit.hunkId}`;
	}
	return `${generationId}:commit:${unit.stableChangeId}`;
}

async function storeBody(
	ctx: ReviewDecideContext,
	body: string,
): Promise<{ readonly bodyHash: string; readonly bodyInline?: string }> {
	const bytes = new TextEncoder().encode(body);
	const bodyHash = await ctx.content.put(bytes);
	if (bytes.byteLength <= ctx.inlineLimit) {
		return { bodyHash, bodyInline: body };
	}
	return { bodyHash };
}

function defaultGeneration(
	ctx: ReviewDecideContext,
	command: ReviewCommandEnvelope,
	target: ReviewTarget,
	predecessorGenerationId?: string,
): ReviewGeneration {
	return {
		id: ctx.id(),
		reviewId: command.reviewId,
		ordinal: 1,
		target,
		createdAt: ctx.now(),
		createdBy: command.actorId,
		manifestHash: ctx.hashText(JSON.stringify(target)),
		diffOptionsHash: "default",
		...(predecessorGenerationId === undefined
			? {}
			: { predecessorGenerationId }),
	};
}

async function createGeneration(
	state: ReviewAggregate,
	command: ReviewCommandEnvelope,
	ctx: ReviewDecideContext,
	target: ReviewTarget,
): Promise<ReviewGeneration> {
	const predecessorGenerationId = state.snapshot.currentGenerationId;
	const ordinal = Object.keys(state.generations).length + 1;
	if (ctx.diffSource) {
		const resolved = await ctx.diffSource.resolveTarget(target);
		return ctx.diffSource.createGeneration({
			reviewId: command.reviewId,
			actorId: command.actorId,
			target: resolved,
			...(predecessorGenerationId === undefined
				? {}
				: { predecessorGenerationId }),
		});
	}
	const generated = defaultGeneration(
		ctx,
		command,
		target,
		predecessorGenerationId,
	);
	return { ...generated, ordinal };
}

function generationEvents(
	command: ReviewCommandEnvelope,
	at: string,
	generation: ReviewGeneration,
): ReviewDomainEvent[] {
	const base = meta(command, at);
	return [
		{
			type: REVIEW_EVENT_GENERATION_CREATED,
			data: { ...base, generation },
		},
		{
			type: REVIEW_EVENT_GENERATION_ACTIVATED,
			data: { ...base, generationId: generation.id },
		},
	];
}

export async function decideReviewEvents(
	state: ReviewAggregate,
	command: ReviewCommandEnvelope,
	ctx: ReviewDecideContext,
): Promise<readonly ReviewDomainEvent[]> {
	const at = ctx.now();
	const base = meta(command, at);
	const kind = command.command.kind;
	if (kind === "start-review") {
		if (state.exists) {
			throw reviewError(
				"stale-revision",
				`review ${command.reviewId} already exists`,
				{
					reviewId: command.reviewId,
					expectedRevision: command.expectedRevision.toString(),
					actualRevision: state.snapshot.revision.toString(),
				},
			);
		}
		const target = command.command.target;
		const generation = await createGeneration(state, command, ctx, target);
		const sessionId = command.command.sessionId;
		return [
			{
				type: REVIEW_EVENT_STARTED,
				data: {
					...base,
					target,
					...(sessionId === undefined ? {} : { sessionId }),
				},
			},
			...generationEvents(command, at, generation),
		];
	}

	if (kind === "close-review") {
		requireOpen(state, command.reviewId);
		return [{ type: REVIEW_EVENT_CLOSED, data: base }];
	}

	requireOpen(state, command.reviewId);

	switch (kind) {
		case "refresh-review": {
			const target = state.snapshot.target;
			if (!target) {
				throw reviewError(
					"malformed-input",
					`review ${command.reviewId} has no target`,
					{ reviewId: command.reviewId },
				);
			}
			const generation = await createGeneration(state, command, ctx, target);
			const current = Object.values(state.coverage);
			const records = ctx.reanchor
				? await ctx.reanchor.invalidateCoverage(current, generation)
				: current.map((record) => ({
						...record,
						state: "stale" as const,
						invalidatedAt: at,
						invalidationEvidence: ["generation-activated"],
					}));
			return [
				...generationEvents(command, at, generation),
				{
					type: REVIEW_EVENT_COVERAGE_INVALIDATED,
					data: {
						...base,
						generationId: generation.id,
						records,
					},
				},
			];
		}
		case "mark-coverage": {
			if (command.command.generationId !== state.snapshot.currentGenerationId) {
				throw reviewError(
					"stale-generation",
					`generation ${command.command.generationId} is not current`,
					{
						generationId: command.command.generationId,
						currentGenerationId: state.snapshot.currentGenerationId ?? "",
					},
				);
			}
			const id = coverageId(command.command.generationId, command.command.unit);
			const exclusionReason = command.command.exclusionReason;
			const coverage: ReviewCoverageRecord = {
				coverageId: id,
				reviewId: command.reviewId,
				actorId: command.actorId,
				actorKind: "human",
				generationId: command.command.generationId,
				unit: command.command.unit,
				state: command.command.state,
				...(command.command.state === "reviewed" ? { reviewedAt: at } : {}),
				...(exclusionReason === undefined ? {} : { exclusionReason }),
			};
			return [
				{ type: REVIEW_EVENT_COVERAGE_MARKED, data: { ...base, coverage } },
			];
		}
		case "create-thread": {
			const stored = await storeBody(ctx, command.command.body);
			const threadId = ctx.id();
			const messageId = ctx.id();
			const thread: ReviewThread = {
				threadId,
				reviewId: command.reviewId,
				origin: "local-human",
				visibility: command.command.visibility,
				resolution: "open",
				anchorHealth: "current",
				messageIds: [messageId],
				createdAt: at,
				updatedAt: at,
			};
			const message: ReviewMessage = {
				messageId,
				threadId,
				authorId: command.actorId,
				authorKind: "human",
				origin: "local",
				bodyHash: stored.bodyHash,
				createdAt: at,
				editRevision: 0,
				publicationState: "private",
			};
			return [
				{ type: REVIEW_EVENT_THREAD_CREATED, data: { ...base, thread } },
				{
					type: REVIEW_EVENT_MESSAGE_ADDED,
					data: {
						...base,
						message,
						...(stored.bodyInline === undefined
							? {}
							: { bodyInline: stored.bodyInline }),
					},
				},
			];
		}
		case "add-message": {
			requireThread(state, command.command.threadId);
			const stored = await storeBody(ctx, command.command.body);
			const message: ReviewMessage = {
				messageId: ctx.id(),
				threadId: command.command.threadId,
				authorId: command.actorId,
				authorKind: "human",
				origin: "local",
				bodyHash: stored.bodyHash,
				createdAt: at,
				editRevision: 0,
				publicationState: "private",
			};
			return [
				{
					type: REVIEW_EVENT_MESSAGE_ADDED,
					data: {
						...base,
						message,
						...(stored.bodyInline === undefined
							? {}
							: { bodyInline: stored.bodyInline }),
					},
				},
			];
		}
		case "edit-draft-message": {
			const message = requireMessage(state, command.command.messageId);
			requireDraft(message);
			const stored = await storeBody(ctx, command.command.body);
			return [
				{
					type: REVIEW_EVENT_MESSAGE_EDITED,
					data: {
						...base,
						messageId: message.messageId,
						bodyHash: stored.bodyHash,
						editRevision: message.editRevision + 1,
						editedAt: at,
						...(stored.bodyInline === undefined
							? {}
							: { bodyInline: stored.bodyInline }),
					},
				},
			];
		}
		case "delete-draft-message": {
			const message = requireMessage(state, command.command.messageId);
			requireDraft(message);
			const thread = requireThread(state, message.threadId);
			const remaining = thread.messageIds.filter(
				(messageId) => messageId !== message.messageId,
			);
			return remaining.length === 0
				? [
						{
							type: REVIEW_EVENT_MESSAGE_DELETED,
							data: { ...base, messageId: message.messageId },
						},
						{
							type: REVIEW_EVENT_THREAD_DELETED,
							data: { ...base, threadId: thread.threadId },
						},
					]
				: [
						{
							type: REVIEW_EVENT_MESSAGE_DELETED,
							data: { ...base, messageId: message.messageId },
						},
					];
		}
		case "route-thread-to-agent":
			requireThread(state, command.command.threadId);
			return [
				{
					type: REVIEW_EVENT_THREAD_UPDATED,
					data: {
						...base,
						threadId: command.command.threadId,
						visibility: "session",
						routedAgentId: command.command.agentId,
					},
				},
			];
		case "resolve-thread":
			requireThread(state, command.command.threadId);
			return [
				{
					type: REVIEW_EVENT_THREAD_UPDATED,
					data: {
						...base,
						threadId: command.command.threadId,
						resolution: "resolved",
					},
				},
			];
		case "unresolve-thread":
			requireThread(state, command.command.threadId);
			return [
				{
					type: REVIEW_EVENT_THREAD_UPDATED,
					data: {
						...base,
						threadId: command.command.threadId,
						resolution: "open",
					},
				},
			];
		case "prepare-submission": {
			const generationId = state.snapshot.currentGenerationId;
			if (!generationId) {
				throw reviewError(
					"malformed-input",
					`review ${command.reviewId} has no generation`,
					{ reviewId: command.reviewId },
				);
			}
			for (const messageId of command.command.selectedMessageIds) {
				requireMessage(state, messageId);
			}
			const summary = await storeBody(ctx, command.command.summaryBody);
			const pendingReviewId = ctx.id();
			const effectDigest = ctx.hashText(
				JSON.stringify({
					decision: command.command.decision,
					selectedMessageIds: command.command.selectedMessageIds,
					selectedThreadOperations: command.command.selectedThreadOperations,
					generationId,
				}),
			);
			const target = state.snapshot.target;
			const expectedProviderHeadOid =
				target?.kind === "pull-request" ? target.headCommitOid : undefined;
			return [
				{
					type: REVIEW_EVENT_PENDING_PREPARED,
					data: {
						...base,
						pending: {
							pendingReviewId,
							reviewId: command.reviewId,
							generationId,
							decision: command.command.decision,
							summaryBodyHash: summary.bodyHash,
							selectedMessageIds: command.command.selectedMessageIds,
							selectedThreadOperations:
								command.command.selectedThreadOperations,
							orderedInlineComments: [],
							preparedBy: command.actorId,
							preparedAt: at,
							effectDigest,
							...(expectedProviderHeadOid === undefined
								? {}
								: { expectedProviderHeadOid }),
						},
					},
				},
				{
					type: REVIEW_EVENT_PUBLICATION_CHANGED,
					data: {
						...base,
						state: "selected-for-publication",
						messageIds: command.command.selectedMessageIds,
						pendingReviewId,
					},
				},
			];
		}
		case "publish-submission": {
			if (state.snapshot.pendingReviewId !== command.command.pendingReviewId) {
				throw reviewError(
					"not-found",
					`pending review ${command.command.pendingReviewId} is not current`,
					{ pendingReviewId: command.command.pendingReviewId },
				);
			}
			const selected = Object.values(state.messages)
				.filter(
					(message) => message.publicationState === "selected-for-publication",
				)
				.map((message) => message.messageId);
			return [
				{
					type: REVIEW_EVENT_PUBLICATION_CHANGED,
					data: {
						...base,
						state: "published",
						messageIds: selected,
						pendingReviewId: command.command.pendingReviewId,
						submissionId: ctx.id(),
					},
				},
			];
		}
		case "set-inbox-disposition":
			return [
				{
					type: REVIEW_EVENT_INBOX_DISPOSITION_SET,
					data: { ...base, disposition: command.command.disposition },
				},
			];
		case "apply-suggestion":
		case "stage-selection":
		case "unstage-selection":
			throw reviewError(
				"unsupported-capability",
				`${kind} is not implemented by the review runtime`,
				{ kind },
			);
	}
}
