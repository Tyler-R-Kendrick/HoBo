import {
	type ReviewAgentQuery,
	readBoundedReviewFile,
	resolveReviewAgentPath,
} from "./review-agent-context.js";
import type { ReviewAgentRequestRecord } from "./review-agent-transport.js";
import { reviewError } from "./review-errors.js";
import type {
	ReviewCommandEnvelope,
	ReviewContentStore,
	ReviewPatchExecutor,
	ReviewPublicationState,
	ReviewRuntime,
} from "./review-ports.js";
import { REVIEW_COMMAND_SCHEMA } from "./review-ports.js";

export const REVIEW_AGENT_RESPONSE_SCHEMA =
	"hobo.code.review-agent-response/v1" as const;
export const REVIEW_AGENT_RESPONSE_LIMIT = 65_536;

export const REVIEW_AGENT_TOOL_NAMES = [
	"read_review_context",
	"draft_reply",
	"draft_finding",
	"propose_suggestion",
	"complete_review_request",
	"fail_review_request",
] as const;

export type ReviewAgentToolName = (typeof REVIEW_AGENT_TOOL_NAMES)[number];

export type ReviewAgentToolKind =
	| "context"
	| "reply"
	| "finding"
	| "suggestion"
	| "complete"
	| "fail";

export interface ReviewAgentToolResult {
	readonly ok: boolean;
	readonly requestId: string;
	readonly kind: ReviewAgentToolKind;
	readonly authorId: string;
	readonly reviewId?: string;
	readonly generationId?: string;
	readonly threadId?: string;
	readonly context?: string;
	readonly messageId?: string;
	readonly publicationState?: ReviewPublicationState;
}

export interface ReviewAgentRequestStore {
	load(requestId: string): ReviewAgentRequestRecord | undefined;
	save(record: ReviewAgentRequestRecord): void;
	listPending(): readonly ReviewAgentRequestRecord[];
}

export interface ReviewAgentToolsOptions {
	readonly reviews: ReviewRuntime;
	readonly query: ReviewAgentQuery;
	readonly content: ReviewContentStore;
	readonly requests: ReviewAgentRequestStore;
	readonly now?: () => string;
	readonly repositoryRoot?: string;
}

export interface ReviewAgentTools {
	readContext(input: {
		readonly requestId: string;
		readonly path?: string;
		readonly startLine?: number;
		readonly endLine?: number;
	}): Promise<ReviewAgentToolResult>;
	draftReply(input: {
		readonly requestId: string;
		readonly generationId: string;
		readonly body: string;
		readonly authorId?: string;
	}): Promise<ReviewAgentToolResult>;
	draftFinding(input: {
		readonly requestId: string;
		readonly generationId: string;
		readonly title: string;
		readonly severity: string;
		readonly body: string;
		readonly authorId?: string;
	}): Promise<ReviewAgentToolResult>;
	proposeSuggestion(input: {
		readonly requestId: string;
		readonly generationId: string;
		readonly path: string;
		readonly startLine: number;
		readonly endLine: number;
		readonly replacement: string;
		readonly authorId?: string;
	}): Promise<ReviewAgentToolResult>;
	complete(input: {
		readonly requestId: string;
		readonly generationId: string;
	}): Promise<ReviewAgentToolResult>;
	fail(input: {
		readonly requestId: string;
		readonly generationId: string;
		readonly reason?: string;
	}): Promise<ReviewAgentToolResult>;
	invoke(name: string, input: unknown): Promise<ReviewAgentToolResult>;
}

export function createReviewAgentTools(
	options: ReviewAgentToolsOptions,
): ReviewAgentTools {
	const now = options.now ?? (() => new Date().toISOString());

	function requireRequest(requestId: string): ReviewAgentRequestRecord {
		const request = options.requests.load(requestId);
		if (!request) {
			throw reviewError(
				"not-found",
				`review agent request ${requestId} is missing`,
				{
					requestId,
				},
			);
		}
		return request;
	}

	function assertPending(request: ReviewAgentRequestRecord): void {
		if (request.status !== "pending") {
			throw reviewError(
				"idempotent-replay",
				`review agent request ${request.requestId} already ${request.status}`,
				{ requestId: request.requestId, status: request.status },
			);
		}
	}

	async function assertGeneration(
		request: ReviewAgentRequestRecord,
		generationId: string,
	): Promise<void> {
		if (generationId !== request.generationId) {
			throw reviewError(
				"stale-generation",
				`generation ${generationId} does not match the pinned request`,
				{
					generationId,
					pinnedGenerationId: request.generationId,
				},
			);
		}
		const snapshot = await options.reviews.load(request.reviewId);
		if (snapshot.currentGenerationId !== request.generationId) {
			throw reviewError(
				"stale-generation",
				`generation ${request.generationId} is not current`,
				{
					generationId: request.generationId,
					currentGenerationId: snapshot.currentGenerationId ?? "",
				},
			);
		}
	}

	function assertAuthor(
		request: ReviewAgentRequestRecord,
		authorId: string | undefined,
	): void {
		if (authorId !== undefined && authorId !== request.agentId) {
			throw reviewError(
				"malformed-input",
				"review agent authorship is immutable",
				{ authorId, agentId: request.agentId },
			);
		}
	}

	function assertBody(body: string): void {
		const bytes = new TextEncoder().encode(body).byteLength;
		if (bytes > REVIEW_AGENT_RESPONSE_LIMIT) {
			throw reviewError(
				"body-limit",
				"review agent response exceeds the size limit",
				{
					bytes,
					limit: REVIEW_AGENT_RESPONSE_LIMIT,
				},
			);
		}
		if (body.length === 0) {
			throw reviewError(
				"malformed-input",
				"review agent body must be nonempty",
			);
		}
	}

	async function addPrivateMessage(
		request: ReviewAgentRequestRecord,
		body: string,
	): Promise<{ messageId: string; revision: bigint }> {
		const snapshot = await options.reviews.load(request.reviewId);
		const commandId = `agent-msg:${request.requestId}:${now()}:${body.length}`;
		const envelope: ReviewCommandEnvelope = {
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId,
			actorId: request.agentId,
			reviewId: request.reviewId,
			expectedRevision: snapshot.revision,
			command: {
				kind: "add-message",
				threadId: request.threadId,
				body,
			},
		};
		const before = await options.query.loadView(request.reviewId);
		const result = await options.reviews.execute(envelope);
		const after = await options.query.loadView(request.reviewId);
		const added = Object.keys(after.aggregate.messages).find(
			(messageId) => before.aggregate.messages[messageId] === undefined,
		);
		if (!added) {
			throw reviewError(
				"corrupted-state",
				"review agent message was not persisted",
				{ requestId: request.requestId },
			);
		}
		return { messageId: added, revision: result.revision };
	}

	const tools: ReviewAgentTools = {
		async readContext(input) {
			const request = requireRequest(input.requestId);
			if (input.path !== undefined) {
				const root = options.repositoryRoot;
				if (!root) {
					throw reviewError(
						"unsupported-capability",
						"review agent file reads require a repository root",
					);
				}
				const text = readBoundedReviewFile({
					repositoryRoot: root,
					path: input.path,
					...(input.startLine === undefined
						? {}
						: { startLine: input.startLine }),
					...(input.endLine === undefined ? {} : { endLine: input.endLine }),
				});
				return {
					ok: true,
					requestId: request.requestId,
					kind: "context",
					authorId: request.agentId,
					reviewId: request.reviewId,
					generationId: request.generationId,
					threadId: request.threadId,
					context: text,
				};
			}
			return {
				ok: true,
				requestId: request.requestId,
				kind: "context",
				authorId: request.agentId,
				reviewId: request.reviewId,
				generationId: request.generationId,
				threadId: request.threadId,
				context: request.context,
			};
		},

		async draftReply(input) {
			const request = requireRequest(input.requestId);
			assertPending(request);
			assertAuthor(request, input.authorId);
			assertBody(input.body);
			await assertGeneration(request, input.generationId);
			const added = await addPrivateMessage(request, input.body);
			return {
				ok: true,
				requestId: request.requestId,
				kind: "reply",
				authorId: request.agentId,
				messageId: added.messageId,
				publicationState: "private",
			};
		},

		async draftFinding(input) {
			const request = requireRequest(input.requestId);
			assertPending(request);
			assertAuthor(request, input.authorId);
			const body = [
				"[hobo.review.finding]",
				`severity: ${input.severity}`,
				`title: ${input.title}`,
				input.body,
			].join("\n");
			assertBody(body);
			await assertGeneration(request, input.generationId);
			const added = await addPrivateMessage(request, body);
			return {
				ok: true,
				requestId: request.requestId,
				kind: "finding",
				authorId: request.agentId,
				messageId: added.messageId,
				publicationState: "private",
			};
		},

		async proposeSuggestion(input) {
			const request = requireRequest(input.requestId);
			assertPending(request);
			assertAuthor(request, input.authorId);
			if (options.repositoryRoot) {
				resolveReviewAgentPath(options.repositoryRoot, input.path);
			} else {
				resolveReviewAgentPath(".", input.path);
			}
			const body = [
				`path: ${input.path}`,
				`lines: ${input.startLine}-${input.endLine}`,
				"```suggestion",
				input.replacement.replace(/\n$/u, ""),
				"```",
			].join("\n");
			assertBody(body);
			await assertGeneration(request, input.generationId);
			const added = await addPrivateMessage(request, body);
			return {
				ok: true,
				requestId: request.requestId,
				kind: "suggestion",
				authorId: request.agentId,
				messageId: added.messageId,
				publicationState: "private",
			};
		},

		async complete(input) {
			const request = requireRequest(input.requestId);
			assertPending(request);
			await assertGeneration(request, input.generationId);
			options.requests.save({
				...request,
				status: "completed",
				updatedAt: now(),
			});
			return {
				ok: true,
				requestId: request.requestId,
				kind: "complete",
				authorId: request.agentId,
			};
		},

		async fail(input) {
			const request = requireRequest(input.requestId);
			assertPending(request);
			await assertGeneration(request, input.generationId);
			options.requests.save({
				...request,
				status: "failed",
				updatedAt: now(),
			});
			return {
				ok: true,
				requestId: request.requestId,
				kind: "fail",
				authorId: request.agentId,
			};
		},

		async invoke(name, input) {
			if (!isToolName(name)) {
				throw reviewError(
					"unsupported-capability",
					`review agents cannot invoke ${name}`,
					{ tool: name },
				);
			}
			const parsed = parseReviewAgentToolInput(name, input);
			switch (name) {
				case "read_review_context":
					return tools.readContext(
						parsed as Parameters<ReviewAgentTools["readContext"]>[0],
					);
				case "draft_reply":
					return tools.draftReply(
						parsed as Parameters<ReviewAgentTools["draftReply"]>[0],
					);
				case "draft_finding":
					return tools.draftFinding(
						parsed as Parameters<ReviewAgentTools["draftFinding"]>[0],
					);
				case "propose_suggestion":
					return tools.proposeSuggestion(
						parsed as Parameters<ReviewAgentTools["proposeSuggestion"]>[0],
					);
				case "complete_review_request":
					return tools.complete(
						parsed as Parameters<ReviewAgentTools["complete"]>[0],
					);
				case "fail_review_request":
					return tools.fail(parsed as Parameters<ReviewAgentTools["fail"]>[0]);
			}
		},
	};
	return tools;
}

function isToolName(name: string): name is ReviewAgentToolName {
	return (REVIEW_AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw reviewError(
			"malformed-input",
			"review agent tool input must be an object",
		);
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

function requiredNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value)) {
		throw reviewError("malformed-input", `${field} must be an integer`);
	}
	return value;
}

export function parseReviewAgentResponse(
	value: unknown,
): Record<string, unknown> {
	const body = record(value);
	const schema = requiredString(body.schemaVersion, "schemaVersion");
	if (schema !== REVIEW_AGENT_RESPONSE_SCHEMA) {
		throw reviewError(
			"malformed-input",
			"review agent response schema is invalid",
			{
				schemaVersion: schema,
			},
		);
	}
	return body;
}

function parseReviewAgentToolInput(
	name: ReviewAgentToolName,
	value: unknown,
): Record<string, unknown> {
	const body = record(value);
	const requestId = optionalString(body.requestId, "requestId");
	if (!requestId) {
		throw reviewError("malformed-input", "requestId must be a nonempty string");
	}
	if (name === "read_review_context") {
		const path = optionalString(body.path, "path");
		return path === undefined ? { requestId } : { requestId, path };
	}
	const generationId = optionalString(body.generationId, "generationId");
	if (!generationId) {
		throw reviewError(
			"malformed-input",
			"generationId must be a nonempty string",
		);
	}
	if (name === "draft_reply") {
		parseReviewAgentResponse(body);
		const authorId = optionalString(body.authorId, "authorId");
		return {
			requestId,
			generationId,
			body: requiredString(body.body, "body"),
			...(authorId === undefined ? {} : { authorId }),
		};
	}
	if (name === "draft_finding") {
		parseReviewAgentResponse(body);
		const authorId = optionalString(body.authorId, "authorId");
		return {
			requestId,
			generationId,
			title: requiredString(body.title, "title"),
			severity: requiredString(body.severity, "severity"),
			body: requiredString(body.body, "body"),
			...(authorId === undefined ? {} : { authorId }),
		};
	}
	if (name === "propose_suggestion") {
		parseReviewAgentResponse(body);
		return {
			requestId,
			generationId,
			path: requiredString(body.path, "path"),
			startLine: requiredNumber(body.startLine, "startLine"),
			endLine: requiredNumber(body.endLine, "endLine"),
			replacement: requiredString(body.replacement, "replacement"),
		};
	}
	const reason = optionalString(body.reason, "reason");
	return {
		requestId,
		generationId,
		...(reason === undefined ? {} : { reason }),
	};
}

export async function applyReviewAgentSuggestion(input: {
	readonly requestId: string;
	readonly messageId: string;
	readonly patchExecutor: ReviewPatchExecutor;
	readonly approvalDigest: string;
	readonly repositoryRoot: string;
	readonly generationId: string;
	readonly fileId: string;
	readonly hunkId?: string;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly suggestionBody?: string;
}): Promise<{ readonly resultTreeOid: string }> {
	if (!input.approvalDigest) {
		throw reviewError(
			"approval-required",
			"suggestion apply requires an approval digest",
		);
	}
	const simulated = await input.patchExecutor.simulate({
		repositoryRoot: input.repositoryRoot,
		generationId: input.generationId,
		fileId: input.fileId,
		direction: "suggestion",
		...(input.hunkId === undefined ? {} : { hunkId: input.hunkId }),
		...(input.startLine === undefined ? {} : { startLine: input.startLine }),
		...(input.endLine === undefined ? {} : { endLine: input.endLine }),
		...(input.suggestionBody === undefined
			? {}
			: { suggestionBody: input.suggestionBody }),
	});
	return input.patchExecutor.apply({
		repositoryRoot: input.repositoryRoot,
		approvalDigest: input.approvalDigest,
		expectedPostIndexTreeOid: simulated.postIndexTreeOid,
		patchHash: simulated.patchHash,
	});
}
