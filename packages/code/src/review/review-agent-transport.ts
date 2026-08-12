import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
	AgentLifecycleState,
	type SessionSnapshot,
} from "../_generated/code_harness_pb.js";
import type { ResidentSessionRuntime } from "../resident-session-runtime.js";
import {
	buildReviewAgentContext,
	type ReviewAgentQuery,
} from "./review-agent-context.js";
import {
	createReviewAgentTools,
	type ReviewAgentRequestStore,
	type ReviewAgentTools,
} from "./review-agent-tools.js";
import { reviewError } from "./review-errors.js";
import {
	REVIEW_COMMAND_SCHEMA,
	type ReviewAgentTransport,
	type ReviewAnchor,
	type ReviewContentStore,
	type ReviewRuntime,
} from "./review-ports.js";

export const REVIEW_AGENT_REQUEST_SCHEMA =
	"hobo.code.review-agent-request/v1" as const;
export const REVIEW_AGENT_PANE_BEGIN = "-----BEGIN HOBO_REVIEW_REQUEST-----";
export const REVIEW_AGENT_PANE_END = "-----END HOBO_REVIEW_REQUEST-----";

export type ReviewAgentRequestStatus =
	| "pending"
	| "completed"
	| "failed"
	| "cancelled";

export interface ReviewAgentRequestRecord {
	readonly schemaVersion: typeof REVIEW_AGENT_REQUEST_SCHEMA;
	readonly requestId: string;
	readonly deliveryId?: string;
	readonly sessionId: string;
	readonly agentId: string;
	readonly reviewId: string;
	readonly generationId: string;
	readonly threadId: string;
	readonly context: string;
	readonly status: ReviewAgentRequestStatus;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly anchor?: ReviewAnchor;
}

export interface ReviewAgentStructuredSink {
	deliver(
		request: ReviewAgentRequestRecord,
	): Promise<{ readonly deliveryId: string } | undefined>;
	cancel?(requestId: string): Promise<void>;
}

export interface ReviewAgentRouter {
	readonly transport: ReviewAgentTransport;
	readonly tools: ReviewAgentTools;
	routeThread(input: {
		readonly sessionId: string;
		readonly reviewId: string;
		readonly threadId: string;
		readonly agentId: string;
		readonly actorId: string;
		readonly expectedRevision: bigint;
		readonly commandId?: string;
	}): Promise<{
		readonly requestId: string;
		readonly deliveryId: string;
		readonly snapshot: Awaited<ReturnType<ReviewRuntime["load"]>>;
	}>;
	loadRequest(requestId: string): ReviewAgentRequestRecord | undefined;
	listPending(): readonly ReviewAgentRequestRecord[];
}

export interface ReviewAgentRouterOptions {
	readonly sessions: Pick<ResidentSessionRuntime, "load" | "sendInput">;
	readonly reviews: ReviewRuntime;
	readonly query: ReviewAgentQuery;
	readonly content: ReviewContentStore;
	readonly requestDir: string;
	readonly structured?: ReviewAgentStructuredSink;
	readonly now?: () => string;
	readonly id?: () => string;
	readonly repositoryRoot?: string;
}

const TERMINAL_AGENT = new Set<AgentLifecycleState>([
	AgentLifecycleState.DONE,
	AgentLifecycleState.FAILED,
	AgentLifecycleState.STOPPED,
]);

export function createReviewAgentTransport(
	options: Pick<
		ReviewAgentRouterOptions,
		"sessions" | "requestDir" | "structured" | "now" | "id"
	>,
): ReviewAgentTransport & ReviewAgentRequestStore {
	const now = options.now ?? (() => new Date().toISOString());
	const store = createRequestStore(options.requestDir, now);

	async function eligible(sessionId: string): Promise<{
		readonly session: SessionSnapshot;
		readonly agents: readonly {
			readonly agentId: string;
			readonly label: string;
		}[];
	}> {
		const session = await options.sessions.load(sessionId);
		if (!session?.session) {
			throw reviewError("not-found", `session ${sessionId} does not exist`, {
				sessionId,
			});
		}
		const agents = session.agentRuns
			.filter((run) => !TERMINAL_AGENT.has(run.lifecycleState))
			.map((run) => ({
				agentId: run.id,
				label: run.provider || run.summary || run.id,
			}));
		return { session, agents };
	}

	async function deliverStructuredOrPane(
		record: ReviewAgentRequestRecord,
		session: SessionSnapshot,
	): Promise<{ readonly deliveryId: string }> {
		if (options.structured) {
			const delivered = await options.structured.deliver(record);
			if (delivered) return delivered;
		}
		const run = session.agentRuns.find((item) => item.id === record.agentId);
		if (!run) {
			throw reviewError(
				"not-found",
				`agent ${record.agentId} is not in the session`,
				{
					agentId: record.agentId,
				},
			);
		}
		const payload = [
			REVIEW_AGENT_PANE_BEGIN,
			JSON.stringify(record),
			REVIEW_AGENT_PANE_END,
			"",
		].join("\n");
		if (session.revision === undefined) {
			throw reviewError(
				"corrupted-state",
				`session ${record.sessionId} is missing a revision`,
				{ sessionId: record.sessionId },
			);
		}
		await options.sessions.sendInput(
			record.sessionId,
			session.revision,
			run.paneId,
			payload,
			record.requestId,
		);
		return { deliveryId: `pane:${record.requestId}` };
	}

	return {
		async listEligibleAgents(input) {
			return (await eligible(input.sessionId)).agents;
		},

		async deliverReviewRequest(input) {
			const { session, agents } = await eligible(input.sessionId);
			if (!agents.some((agent) => agent.agentId === input.agentId)) {
				throw reviewError(
					"not-found",
					`agent ${input.agentId} is not eligible on session ${input.sessionId}`,
					{ agentId: input.agentId, sessionId: input.sessionId },
				);
			}
			const existing = store.load(input.requestId);
			const record: ReviewAgentRequestRecord = {
				schemaVersion: REVIEW_AGENT_REQUEST_SCHEMA,
				requestId: input.requestId,
				sessionId: input.sessionId,
				agentId: input.agentId,
				reviewId: input.reviewId,
				generationId: input.generationId,
				threadId: input.threadId,
				context: input.context,
				status: existing?.status ?? "pending",
				createdAt: existing?.createdAt ?? now(),
				updatedAt: now(),
				...(existing?.anchor === undefined ? {} : { anchor: existing.anchor }),
				...(existing?.deliveryId === undefined
					? {}
					: { deliveryId: existing.deliveryId }),
			};
			store.save(record);
			const delivered = await deliverStructuredOrPane(record, session);
			const next = {
				...record,
				deliveryId: delivered.deliveryId,
				updatedAt: now(),
			};
			store.save(next);
			return { deliveryId: delivered.deliveryId };
		},

		async cancelReviewRequest(input) {
			const existing = store.load(input.requestId);
			if (!existing) {
				throw reviewError(
					"not-found",
					`review agent request ${input.requestId} is missing`,
					{ requestId: input.requestId },
				);
			}
			store.save({ ...existing, status: "cancelled", updatedAt: now() });
			await options.structured?.cancel?.(input.requestId);
		},

		load: (requestId) => store.load(requestId),
		save: (record) => store.save(record),
		listPending: () => store.listPending(),
	};
}

export function createReviewAgentRouter(
	options: ReviewAgentRouterOptions,
): ReviewAgentRouter {
	const now = options.now ?? (() => new Date().toISOString());
	const nextId = options.id ?? (() => randomUUID());
	const transport = createReviewAgentTransport(options);
	const tools = createReviewAgentTools({
		reviews: options.reviews,
		query: options.query,
		content: options.content,
		requests: transport,
		now,
		...(options.repositoryRoot === undefined
			? {}
			: { repositoryRoot: options.repositoryRoot }),
	});

	return {
		transport,
		tools,
		loadRequest: (requestId) => transport.load(requestId),
		listPending: () => transport.listPending(),
		async routeThread(input) {
			const eligible = await transport.listEligibleAgents({
				sessionId: input.sessionId,
			});
			if (!eligible.some((agent) => agent.agentId === input.agentId)) {
				throw reviewError(
					"not-found",
					`agent ${input.agentId} is not eligible on session ${input.sessionId}`,
					{ agentId: input.agentId, sessionId: input.sessionId },
				);
			}
			const snapshot = await options.reviews.load(input.reviewId);
			if (snapshot.revision !== input.expectedRevision) {
				throw reviewError(
					"stale-revision",
					`expected revision ${input.expectedRevision}, found ${snapshot.revision}`,
					{
						expectedRevision: input.expectedRevision.toString(),
						actualRevision: snapshot.revision.toString(),
					},
				);
			}
			if (snapshot.sessionId && snapshot.sessionId !== input.sessionId) {
				throw reviewError(
					"not-found",
					`review ${input.reviewId} is not associated with session ${input.sessionId}`,
					{ reviewId: input.reviewId, sessionId: input.sessionId },
				);
			}
			const generationId = snapshot.currentGenerationId;
			if (!generationId) {
				throw reviewError(
					"malformed-input",
					`review ${input.reviewId} has no generation`,
					{ reviewId: input.reviewId },
				);
			}
			const view = await options.query.loadView(input.reviewId);
			const thread = view.aggregate.threads[input.threadId];
			if (!thread) {
				throw reviewError(
					"not-found",
					`thread ${input.threadId} does not exist`,
					{
						threadId: input.threadId,
					},
				);
			}
			const comments = thread.messageIds.map((messageId) => {
				const message = view.aggregate.messages[messageId];
				return {
					authorId: message?.authorId ?? "unknown",
					body: view.bodies.get(messageId) ?? "",
				};
			});
			const context = buildReviewAgentContext({
				reviewId: input.reviewId,
				generationId,
				threadId: input.threadId,
				comments,
				...(thread.anchor?.anchorId === undefined
					? {}
					: { anchorId: thread.anchor.anchorId }),
			});
			const requestId = nextId();
			const record: ReviewAgentRequestRecord = {
				schemaVersion: REVIEW_AGENT_REQUEST_SCHEMA,
				requestId,
				sessionId: input.sessionId,
				agentId: input.agentId,
				reviewId: input.reviewId,
				generationId,
				threadId: input.threadId,
				context,
				status: "pending",
				createdAt: now(),
				updatedAt: now(),
				...(thread.anchor === undefined ? {} : { anchor: thread.anchor }),
			};
			transport.save(record);
			const routed = await options.reviews.execute({
				schemaVersion: REVIEW_COMMAND_SCHEMA,
				commandId: input.commandId ?? `route:${requestId}`,
				actorId: input.actorId,
				reviewId: input.reviewId,
				expectedRevision: input.expectedRevision,
				command: {
					kind: "route-thread-to-agent",
					threadId: input.threadId,
					agentId: input.agentId,
				},
			});
			const delivered = await transport.deliverReviewRequest({
				requestId,
				sessionId: input.sessionId,
				agentId: input.agentId,
				reviewId: input.reviewId,
				generationId,
				threadId: input.threadId,
				context,
			});
			const saved = transport.load(requestId);
			if (saved && thread.anchor) {
				transport.save({
					...saved,
					anchor: thread.anchor,
					deliveryId: delivered.deliveryId,
					updatedAt: now(),
				});
			}
			return {
				requestId,
				deliveryId: delivered.deliveryId,
				snapshot: routed.snapshot,
			};
		},
	};
}

function createRequestStore(
	requestDir: string,
	now: () => string,
): ReviewAgentRequestStore {
	mkdirSync(requestDir, { recursive: true });

	function pathFor(requestId: string): string {
		const hash = createHash("sha256").update(requestId).digest("hex");
		return join(requestDir, `${hash}.json`);
	}

	function read(path: string): ReviewAgentRequestRecord | undefined {
		if (!existsSync(path)) return undefined;
		return JSON.parse(readFileSync(path, "utf8")) as ReviewAgentRequestRecord;
	}

	function write(record: ReviewAgentRequestRecord): void {
		const path = pathFor(record.requestId);
		mkdirSync(dirname(path), { recursive: true });
		const temporary = `${path}.${process.pid}.${randomUUID()}`;
		const descriptor = openSync(temporary, "wx", 0o600);
		try {
			writeFileSync(
				descriptor,
				`${JSON.stringify({ ...record, updatedAt: record.updatedAt || now() })}\n`,
			);
			fsyncSync(descriptor);
		} finally {
			closeSync(descriptor);
		}
		renameSync(temporary, path);
	}

	return {
		load(requestId) {
			return read(pathFor(requestId));
		},
		save(record) {
			write(record);
		},
		listPending() {
			if (!existsSync(requestDir)) return [];
			return readdirSync(requestDir)
				.filter((entry) => entry.endsWith(".json"))
				.map((entry) => read(join(requestDir, entry)))
				.filter(
					(record): record is ReviewAgentRequestRecord => record !== undefined,
				)
				.filter((record) => record.status === "pending")
				.sort((left, right) => left.requestId.localeCompare(right.requestId));
		},
	};
}
