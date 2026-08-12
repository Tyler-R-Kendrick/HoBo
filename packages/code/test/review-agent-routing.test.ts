import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AgentLifecycleState } from "../src/_generated/code_harness_pb.js";
import type { MuxRunner } from "../src/mux.js";
import { createResidentSessionRuntime } from "../src/resident-session-runtime.js";
import {
	createMemoryReviewContentStore,
	createResidentReviewRuntime,
} from "../src/review/resident-review-runtime.js";
import { createReviewEventQuery } from "../src/review/review-agent-context.js";
import {
	applyReviewAgentSuggestion,
	REVIEW_AGENT_RESPONSE_LIMIT,
	REVIEW_AGENT_RESPONSE_SCHEMA,
} from "../src/review/review-agent-tools.js";
import {
	createReviewAgentRouter,
	REVIEW_AGENT_PANE_BEGIN,
	REVIEW_AGENT_PANE_END,
} from "../src/review/review-agent-transport.js";
import {
	REVIEW_COMMAND_SCHEMA,
	type ReviewAnchor,
	type ReviewCommandEnvelope,
	type ReviewPatchExecutor,
	type ReviewTarget,
} from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix = "hobo-review-agent-"): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

function fakeTmux(): MuxRunner & { calls: string[][] } {
	const calls: string[][] = [];
	let pane = 0;
	const sessions = new Set<string>();
	return {
		calls,
		async run(args) {
			calls.push([...args]);
			if (args[0] === "has-session") {
				const target = args[args.indexOf("-t") + 1] ?? "";
				return {
					code: sessions.has(target) ? 0 : 1,
					stdout: "",
					stderr: "can't find session",
				};
			}
			if (args[0] === "kill-session") {
				sessions.delete(args[args.indexOf("-t") + 1] ?? "");
			}
			if (
				["new-session", "new-window", "split-window"].includes(args[0] ?? "")
			) {
				if (args[0] === "new-session") {
					sessions.add(args[args.indexOf("-s") + 1] ?? "");
				}
				pane += 1;
				return { code: 0, stdout: `%${pane}\n` };
			}
			return { code: 0, stdout: "" };
		},
	};
}

function ids(prefix = "id"): () => string {
	let n = 0;
	return () => `${prefix}-${++n}`;
}

function commitTarget(repositoryRoot = "/tmp/repo"): ReviewTarget {
	return {
		kind: "commit",
		repositoryId: "repo-1",
		repositoryRoot,
		parentCommitOid: "a".repeat(40),
		commitOid: "b".repeat(40),
	};
}

function envelope(
	reviewId: string,
	commandId: string,
	expectedRevision: bigint,
	command: ReviewCommandEnvelope["command"],
	actorId = "human-1",
): ReviewCommandEnvelope {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId,
		actorId,
		reviewId,
		expectedRevision,
		command,
	};
}

function testAnchor(generationId: string): ReviewAnchor {
	return {
		anchorId: "anchor-1",
		generationId,
		fileId: "file-src-a",
		pathAfter: "src/a.ts",
		side: "new",
		startLine: 2,
		endLine: 3,
		contextBeforeHashes: [],
		contextAfterHashes: [],
	};
}

async function boot(options?: {
	readonly structured?: boolean;
	readonly repositoryRoot?: string;
	readonly sourceText?: string;
}) {
	const root = tempRoot();
	const repositoryRoot = options?.repositoryRoot ?? join(root, "repo");
	const requestDir = join(root, "agent-requests");
	const reviewDir = join(root, "reviews");
	const sessionDir = join(root, "sessions");
	const content = createMemoryReviewContentStore();
	const reviews = createResidentReviewRuntime({
		dataDir: reviewDir,
		contentStore: content,
		id: ids("rev"),
		now: () => "2026-08-12T00:00:00.000Z",
	});
	const tmux = fakeTmux();
	const sessions = createResidentSessionRuntime({
		dataDir: sessionDir,
		tmux,
		now: () => "2026-08-12T00:00:00.000Z",
	});
	const created = await sessions.create({
		id: "session-1",
		name: "review",
		projectRoot: repositoryRoot,
		worktreePath: repositoryRoot,
		branch: "feat/review",
		clientId: "cli-1",
	});
	const startedAgent = await sessions.startAgent(
		"session-1",
		created.revision,
		created.focusedPaneId,
		"claude",
		["claude"],
		"",
	);
	const agentId = startedAgent.agentRuns[0]?.id ?? "";
	expect(startedAgent.agentRuns[0]?.lifecycleState).toBe(
		AgentLifecycleState.WORKING,
	);
	const started = await reviews.execute(
		envelope("review-1", "cmd-start", 0n, {
			kind: "start-review",
			sessionId: "session-1",
			target: commitTarget(repositoryRoot),
		}),
	);
	const threaded = await reviews.execute(
		envelope("review-1", "cmd-thread", started.revision, {
			kind: "create-thread",
			body: "please inspect this",
			visibility: "private",
		}),
	);
	const threadId = threaded.snapshot.threadIds[0] ?? "";
	const generationId = threaded.snapshot.currentGenerationId ?? "";
	const inner = createReviewEventQuery({ dataDir: reviewDir, content });
	const anchor = testAnchor(generationId);
	const query = {
		async loadView(reviewId: string) {
			const view = await inner.loadView(reviewId);
			const thread = view.aggregate.threads[threadId];
			if (thread && thread.anchor === undefined) {
				view.aggregate.threads[threadId] = { ...thread, anchor };
			}
			return view;
		},
	};
	const delivered: unknown[] = [];
	const router = createReviewAgentRouter({
		sessions,
		reviews,
		query,
		content,
		requestDir,
		now: () => "2026-08-12T00:00:01.000Z",
		id: ids("req"),
		repositoryRoot,
		...(options?.structured === false
			? {}
			: {
					structured: {
						async deliver(request) {
							delivered.push(request);
							return { deliveryId: `deliv-${request.requestId}` };
						},
					},
				}),
	});
	return {
		root,
		repositoryRoot,
		requestDir,
		reviewDir,
		content,
		reviews,
		sessions,
		tmux,
		router,
		query,
		delivered,
		agentId,
		threadId,
		generationId,
		revision: threaded.revision,
		humanMessageId: "rev-3",
		sourceText: options?.sourceText ?? "export const n = 1;\n",
	};
}

describe("review agent routing", () => {
	it("routes one thread to an eligible resident-session agent", async () => {
		const ctx = await boot();
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		expect(routed.requestId.length).toBeGreaterThan(0);
		expect(routed.deliveryId).toBe(`deliv-${routed.requestId}`);
		expect(ctx.delivered).toHaveLength(1);
		const delivery = ctx.delivered[0] as {
			reviewId: string;
			generationId: string;
			threadId: string;
			anchor?: ReviewAnchor;
			sessionId: string;
			agentId: string;
		};
		expect(delivery).toMatchObject({
			reviewId: "review-1",
			generationId: ctx.generationId,
			threadId: ctx.threadId,
			sessionId: "session-1",
			agentId: ctx.agentId,
		});
		expect(delivery.anchor?.generationId).toBe(ctx.generationId);
		expect(delivery.anchor?.pathAfter).toBe("src/a.ts");
		const eligible = await ctx.router.transport.listEligibleAgents({
			sessionId: "session-1",
		});
		expect(eligible).toEqual([{ agentId: ctx.agentId, label: "claude" }]);
		const context = await ctx.router.tools.readContext({
			requestId: routed.requestId,
		});
		expect(context.reviewId).toBe("review-1");
		expect(context.generationId).toBe(ctx.generationId);
		expect(context.threadId).toBe(ctx.threadId);
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("fails closed when the agent is missing from the session", async () => {
		const ctx = await boot();
		await expect(
			ctx.router.routeThread({
				sessionId: "session-1",
				reviewId: "review-1",
				threadId: ctx.threadId,
				agentId: "missing-agent",
				actorId: "human-1",
				expectedRevision: ctx.revision,
			}),
		).rejects.toMatchObject({
			name: "ReviewError",
			code: "not-found",
		});
		expect(ctx.delivered).toHaveLength(0);
		expect(ctx.router.listPending()).toHaveLength(0);
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("rejects oversized and malformed agent responses", async () => {
		const ctx = await boot();
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		await expect(
			ctx.router.tools.invoke("draft_reply", {
				schemaVersion: REVIEW_AGENT_RESPONSE_SCHEMA,
				requestId: routed.requestId,
				generationId: ctx.generationId,
				threadId: ctx.threadId,
				body: "x".repeat(REVIEW_AGENT_RESPONSE_LIMIT + 1),
			}),
		).rejects.toMatchObject({ code: "body-limit" });
		await expect(
			ctx.router.tools.invoke("draft_reply", {
				requestId: routed.requestId,
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		await expect(
			ctx.router.tools.invoke("publish_submission", {
				schemaVersion: REVIEW_AGENT_RESPONSE_SCHEMA,
				requestId: routed.requestId,
				generationId: ctx.generationId,
				threadId: ctx.threadId,
			}),
		).rejects.toMatchObject({ code: "unsupported-capability" });
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("refuses to attach a stale generation", async () => {
		const ctx = await boot();
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		const refreshed = await ctx.reviews.execute(
			envelope("review-1", "cmd-refresh", routed.snapshot.revision, {
				kind: "refresh-review",
			}),
		);
		expect(refreshed.snapshot.currentGenerationId).not.toBe(ctx.generationId);
		await expect(
			ctx.router.tools.draftReply({
				requestId: routed.requestId,
				generationId: ctx.generationId,
				body: "looks fine on the old generation",
			}),
		).rejects.toMatchObject({ code: "stale-generation" });
		const request = ctx.router.loadRequest(routed.requestId);
		expect(request?.status).toBe("pending");
		expect(request?.generationId).toBe(ctx.generationId);
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("rejects a duplicate completion", async () => {
		const ctx = await boot();
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		const first = await ctx.router.tools.complete({
			requestId: routed.requestId,
			generationId: ctx.generationId,
		});
		expect(first.ok).toBe(true);
		await expect(
			ctx.router.tools.complete({
				requestId: routed.requestId,
				generationId: ctx.generationId,
			}),
		).rejects.toMatchObject({ code: "idempotent-replay" });
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("keeps a private finding out of pending until it is selected", async () => {
		const ctx = await boot();
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		const finding = await ctx.router.tools.draftFinding({
			requestId: routed.requestId,
			generationId: ctx.generationId,
			title: "null deref",
			severity: "warning",
			body: "possible crash",
		});
		expect(finding.publicationState).toBe("private");
		expect(finding.authorId).toBe(ctx.agentId);
		await expect(
			ctx.router.tools.draftFinding({
				requestId: routed.requestId,
				generationId: ctx.generationId,
				title: "spoof",
				severity: "warning",
				body: "nope",
				authorId: "human-1",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		const current = await ctx.reviews.load("review-1");
		const prepared = await ctx.reviews.execute(
			envelope("review-1", "cmd-prepare", current.revision, {
				kind: "prepare-submission",
				decision: "comment",
				summaryBody: "human only",
				selectedMessageIds: [ctx.humanMessageId],
				selectedThreadOperations: [],
			}),
		);
		const view = await ctx.query.loadView("review-1");
		expect(prepared.snapshot.pendingReviewId).toBeDefined();
		expect(view.pending?.selectedMessageIds).toEqual([ctx.humanMessageId]);
		expect(view.pending?.selectedMessageIds).not.toContain(finding.messageId);
		expect(
			view.aggregate.messages[finding.messageId ?? ""]?.publicationState,
		).toBe("private");
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("refuses path escape when reading bounded context", async () => {
		const repositoryRoot = join(tempRoot(), "repo");
		const ctx = await boot({ repositoryRoot });
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		await expect(
			ctx.router.tools.readContext({
				requestId: routed.requestId,
				path: "../../etc/passwd",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		await expect(
			ctx.router.tools.readContext({
				requestId: routed.requestId,
				path: "/etc/passwd",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("recovers a pending request after restart", async () => {
		const ctx = await boot();
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		expect(ctx.router.listPending()).toHaveLength(1);
		const restarted = createReviewAgentRouter({
			sessions: ctx.sessions,
			reviews: ctx.reviews,
			query: ctx.query,
			content: ctx.content,
			requestDir: ctx.requestDir,
			now: () => "2026-08-12T00:00:02.000Z",
			id: ids("req2"),
			repositoryRoot: ctx.repositoryRoot,
			structured: {
				async deliver(request) {
					return { deliveryId: `deliv-${request.requestId}` };
				},
			},
		});
		expect(restarted.listPending().map((item) => item.requestId)).toEqual([
			routed.requestId,
		]);
		const done = await restarted.tools.complete({
			requestId: routed.requestId,
			generationId: ctx.generationId,
		});
		expect(done.ok).toBe(true);
		expect(restarted.listPending()).toHaveLength(0);
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("uses a delimited pane adapter only when structured delivery is absent", async () => {
		const ctx = await boot({ structured: false });
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		const sent = ctx.tmux.calls.filter((call) => call[0] === "send-keys");
		expect(sent.length).toBeGreaterThan(0);
		expect(
			sent.some((call) => call.join("\n").includes(REVIEW_AGENT_PANE_BEGIN)),
		).toBe(true);
		expect(
			sent.some((call) => call.join("\n").includes(REVIEW_AGENT_PANE_END)),
		).toBe(true);
		expect(routed.deliveryId.startsWith("pane:")).toBe(true);
		ctx.reviews.close();
		ctx.sessions.close();
	});

	it("proposes suggestions without writing the tree; apply uses the patch executor", async () => {
		const repositoryRoot = join(tempRoot(), "repo-tree");
		const file = join(repositoryRoot, "src/a.ts");
		const ctx = await boot({ repositoryRoot });
		mkdirSync(join(repositoryRoot, "src"), { recursive: true });
		writeFileSync(file, "export const n = 1;\n");
		const original = readFileSync(file, "utf8");
		const routed = await ctx.router.routeThread({
			sessionId: "session-1",
			reviewId: "review-1",
			threadId: ctx.threadId,
			agentId: ctx.agentId,
			actorId: "human-1",
			expectedRevision: ctx.revision,
		});
		const calls: string[] = [];
		const executor: ReviewPatchExecutor = {
			async simulate() {
				calls.push("simulate");
				return {
					preIndexTreeOid: "1".repeat(40),
					postIndexTreeOid: "2".repeat(40),
					patchHash: "p".repeat(64),
					preimageHash: "i".repeat(64),
				};
			},
			async apply() {
				calls.push("apply");
				return { resultTreeOid: "3".repeat(40) };
			},
		};
		const proposed = await ctx.router.tools.proposeSuggestion({
			requestId: routed.requestId,
			generationId: ctx.generationId,
			path: "src/a.ts",
			startLine: 1,
			endLine: 1,
			replacement: "export const n = 2;\n",
		});
		expect(proposed.publicationState).toBe("private");
		expect(readFileSync(file, "utf8")).toBe(original);
		expect(calls).toEqual([]);
		await applyReviewAgentSuggestion({
			requestId: routed.requestId,
			messageId: proposed.messageId ?? "",
			patchExecutor: executor,
			approvalDigest: "digest",
			repositoryRoot,
			generationId: ctx.generationId,
			fileId: "file-src-a",
		});
		expect(calls).toEqual(["simulate", "apply"]);
		ctx.reviews.close();
		ctx.sessions.close();
	});
});
