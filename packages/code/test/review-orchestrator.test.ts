import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	buildReviewExactEffect,
	hashReviewUtf8,
	ReviewApprovalRequiredError,
	reviewBodyByteLength,
	reviewCorrelationMarker,
	reviewExactEffectDigest,
} from "../src/review/review-approval.js";
import { ReviewError } from "../src/review/review-errors.js";
import {
	createReviewOrchestrator,
	type ReviewAggregateQuery,
	type ReviewEffectRequest,
} from "../src/review/review-orchestrator.js";
import {
	type PendingReview,
	type PreparedInlineComment,
	REVIEW_COMMAND_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
	type ReviewCommand,
	type ReviewCommandEnvelope,
	type ReviewCommandResult,
	type ReviewContentStore,
	type ReviewPatchExecutor,
	type ReviewProvider,
	type ReviewProviderCapabilities,
	type ReviewRuntime,
	type ReviewSnapshot,
	type ReviewTarget,
	type ReviewThread,
} from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	roots.push(path);
	return path;
}

function sha(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

const headA = "a".repeat(40);
const headB = "b".repeat(40);
const baseOid = "c".repeat(40);
const mergeBase = "d".repeat(40);

function prTarget(
	head = headA,
): Extract<ReviewTarget, { kind: "pull-request" }> {
	return {
		kind: "pull-request",
		provider: "github",
		host: "github.com",
		repository: "acme/widgets",
		number: 42,
		baseRef: "main",
		headRef: "feat",
		mergeBaseOid: mergeBase,
		baseCommitOid: baseOid,
		headCommitOid: head,
		providerNodeId: "PR_kwDOwidgets",
	};
}

function worktreeTarget(): Extract<ReviewTarget, { kind: "working-tree" }> {
	return {
		kind: "working-tree",
		repositoryId: "repo-1",
		repositoryRoot: "/tmp/repo",
		baseCommitOid: baseOid,
		indexTreeOid: "e".repeat(40),
		worktreeManifestHash: "f".repeat(64),
	};
}

function comment(
	id: string,
	path = "src/a.ts",
	line = 4,
): PreparedInlineComment {
	return {
		messageId: id,
		threadId: `thread-${id}`,
		path,
		side: "new",
		line,
		bodyHash: sha(`body-${id}`),
		body: `body-${id}`,
	};
}

function envelope(
	command: ReviewCommand,
	overrides: Partial<ReviewCommandEnvelope> = {},
): ReviewCommandEnvelope {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId: "cmd-review-1",
		actorId: "actor-1",
		reviewId: "review-1",
		expectedRevision: 3n,
		command,
		...overrides,
	};
}

function snapshot(target: ReviewTarget = prTarget()): ReviewSnapshot {
	return {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId: "review-1",
		revision: 3n,
		sessionId: "session-1",
		currentGenerationId: "gen-1",
		target,
		threadIds: ["thread-c1", "thread-c2"],
		coverageIds: [],
		pendingReviewId: "pending-1",
		inboxDisposition: "active",
		closed: false,
		updatedAt: "2026-08-12T00:00:00.000Z",
	};
}

function pendingReview(overrides: Partial<PendingReview> = {}): PendingReview {
	const comments = overrides.orderedInlineComments ?? [
		comment("c1"),
		comment("c2"),
	];
	return {
		pendingReviewId: "pending-1",
		reviewId: "review-1",
		generationId: "gen-1",
		expectedProviderHeadOid: headA,
		decision: "approve",
		summaryBodyHash: sha("Looks good."),
		selectedMessageIds: comments.map((item) => item.messageId),
		selectedThreadOperations: [
			{ kind: "reply", threadId: "thread-c1", messageId: "c1" },
		],
		orderedInlineComments: comments,
		preparedBy: "actor-1",
		preparedAt: "2026-08-12T00:00:00.000Z",
		effectDigest: "prepared-digest",
		...overrides,
	};
}

function thread(
	id: string,
	resolution: ReviewThread["resolution"] = "open",
): ReviewThread {
	return {
		threadId: id,
		reviewId: "review-1",
		origin: "local-human",
		visibility: "session",
		resolution,
		anchorHealth: "current",
		messageIds: [id.replace("thread-", "")],
		createdAt: "2026-08-12T00:00:00.000Z",
		updatedAt: "2026-08-12T00:00:00.000Z",
		anchor: {
			anchorId: `anchor-${id}`,
			generationId: "gen-1",
			fileId: "file-a",
			side: "new",
			startLine: 4,
			endLine: 4,
			contextBeforeHashes: [],
			contextAfterHashes: [],
		},
	};
}

function capabilities(
	overrides: Partial<ReviewProviderCapabilities> = {},
): ReviewProviderCapabilities {
	return {
		kind: "github",
		host: "github.com",
		lineComments: true,
		rangeComments: true,
		fileComments: true,
		reviewComments: true,
		pendingReviews: true,
		decisions: ["comment", "approve", "request-changes"],
		threadReplies: true,
		threadResolution: true,
		importExisting: true,
		outdatedMetadata: true,
		enterprise: false,
		actorMayApprove: true,
		fingerprint: "gh-fingerprint-1",
		...overrides,
	};
}

function memoryStore(initial: Record<string, string> = {}): ReviewContentStore {
	const blobs = new Map<string, Uint8Array>();
	const put = (text: string): string => {
		const bytes = new TextEncoder().encode(text);
		const hash = createHash("sha256").update(bytes).digest("hex");
		blobs.set(hash, bytes);
		return hash;
	};
	for (const value of Object.values(initial)) put(value);
	return {
		async put(bytes) {
			const hash = createHash("sha256").update(bytes).digest("hex");
			blobs.set(hash, bytes);
			return hash;
		},
		async get(hash) {
			const bytes = blobs.get(hash);
			if (!bytes) throw new Error(`missing content ${hash}`);
			return bytes;
		},
		async has(hash) {
			return blobs.has(hash);
		},
	};
}

interface HarnessState {
	snapshot: ReviewSnapshot;
	pending: PendingReview;
	threads: Map<string, ReviewThread>;
	summaryBody: string;
	head: string;
	caps: ReviewProviderCapabilities;
	submitCalls: number;
	replyCalls: string[];
	resolveCalls: string[];
	unresolveCalls: string[];
	applyCalls: number;
	simulateCalls: number;
	reconcile: { matches: number; receiptHash?: string };
	submitImpl?: ReviewProvider["submitReview"];
}

function createHarness(
	options: {
		readonly target?: ReviewTarget;
		readonly authorize?: boolean | ((effect: { digest: string }) => boolean);
		readonly ledgerDir?: string;
	} = {},
) {
	const target = options.target ?? prTarget();
	const state: HarnessState = {
		snapshot: snapshot(target),
		pending: pendingReview(),
		threads: new Map([
			["thread-c1", thread("thread-c1")],
			["thread-c2", thread("thread-c2")],
			["thread-extra", thread("thread-extra")],
		]),
		summaryBody: "Looks good.",
		head: target.kind === "pull-request" ? target.headCommitOid : headA,
		caps: capabilities(),
		submitCalls: 0,
		replyCalls: [],
		resolveCalls: [],
		unresolveCalls: [],
		applyCalls: 0,
		simulateCalls: 0,
		reconcile: { matches: 0 },
	};
	const store = memoryStore({
		summary: state.summaryBody,
		"body-c1": "body-c1",
		"body-c2": "body-c2",
		suggestion: "@@\n-old\n+new\n",
	});
	const runtime: ReviewRuntime = {
		async execute(command) {
			state.snapshot = {
				...state.snapshot,
				revision: state.snapshot.revision + 1n,
				updatedAt: "2026-08-12T00:00:01.000Z",
				pendingReviewId:
					command.command.kind === "publish-submission"
						? undefined
						: state.snapshot.pendingReviewId,
			};
			const result: ReviewCommandResult = {
				reviewId: state.snapshot.reviewId,
				revision: state.snapshot.revision,
				snapshot: state.snapshot,
				replayed: false,
			};
			return result;
		},
		async load() {
			return state.snapshot;
		},
		async list() {
			return [state.snapshot];
		},
	};
	const query: ReviewAggregateQuery = {
		async loadPending() {
			return {
				...state.pending,
				summaryBodyHash: sha(state.summaryBody),
			};
		},
		async loadThread(threadId) {
			const item = state.threads.get(threadId);
			if (!item)
				throw new ReviewError("not-found", `missing thread ${threadId}`);
			return item;
		},
		async loadMessage(messageId) {
			return {
				messageId,
				threadId: `thread-${messageId}`,
				authorId: "actor-1",
				authorKind: "human",
				origin: "local",
				bodyHash: sha(
					messageId === "suggestion-1"
						? "@@\n-old\n+new\n"
						: `body-${messageId}`,
				),
				createdAt: "2026-08-12T00:00:00.000Z",
				editRevision: 0,
				publicationState: "selected-for-publication",
			};
		},
		async loadAnchors() {
			return [...state.threads.values()]
				.map((item) => item.anchor)
				.filter((item): item is NonNullable<typeof item> => item !== undefined);
		},
		async loadSummaryBody() {
			return state.summaryBody;
		},
	};
	const provider: ReviewProvider = {
		kind: "github",
		async detectRepository() {
			return { host: "github.com", repository: "acme/widgets" };
		},
		async resolvePullRequest() {
			return { ...prTarget(state.head) };
		},
		async fetchPullRequestThreads() {
			return [...state.threads.values()];
		},
		async fetchPullRequestReviews() {
			return [];
		},
		async submitReview(input) {
			state.submitCalls += 1;
			if (state.submitImpl) return state.submitImpl(input);
			return { providerReviewId: "PRR_1", receiptHash: "receipt-1" };
		},
		async replyToThread(input) {
			state.replyCalls.push(input.thread.threadId);
			return { providerCommentId: `PC_${input.thread.threadId}` };
		},
		async resolveThread(input) {
			state.resolveCalls.push(input.thread.threadId);
		},
		async unresolveThread(input) {
			state.unresolveCalls.push(input.thread.threadId);
		},
		async reconcile() {
			return { ...state.reconcile };
		},
		async capabilities() {
			return state.caps;
		},
	};
	const patchExecutor: ReviewPatchExecutor = {
		async simulate() {
			state.simulateCalls += 1;
			return {
				preIndexTreeOid: "1".repeat(40),
				postIndexTreeOid: "2".repeat(40),
				patchHash: "patch-1",
				preimageHash: "pre-1",
			};
		},
		async apply() {
			state.applyCalls += 1;
			return { resultTreeOid: "2".repeat(40) };
		},
	};
	const authorize =
		options.authorize === undefined
			? undefined
			: typeof options.authorize === "boolean"
				? () => options.authorize === true
				: options.authorize;
	const orchestrator = createReviewOrchestrator({
		runtime,
		provider,
		patchExecutor,
		contentStore: store,
		query,
		ledgerDir: options.ledgerDir ?? temp("hobo-review-ledger-"),
		authorize,
	});
	return { state, orchestrator, provider, runtime, query, store };
}

describe("review exact-effect digest", () => {
	it("binds operation, schema, identity, provider, SHAs, body, comments, and marker", () => {
		const comments = [comment("c1"), comment("c2")];
		const effect = buildReviewExactEffect({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
			snapshot: snapshot(),
			pending: pendingReview({ orderedInlineComments: comments }),
			capabilities: capabilities(),
			target: prTarget(),
			summaryBody: "Looks good.",
			actorIdentity: "human:actor-1",
			visibilityTransition: "session->forge",
		});
		expect(effect.schemaVersion).toBe("hobo.code.review-effect/v1");
		expect(effect.operation).toBe("publish-review");
		expect(effect.details.providerFingerprint).toBe("gh-fingerprint-1");
		expect(effect.details.host).toBe("github.com");
		expect(effect.details.repository).toBe("acme/widgets");
		expect(effect.details.pullRequestNumber).toBe("42");
		expect(effect.details.pullRequestNodeId).toBe("PR_kwDOwidgets");
		expect(effect.details.expectedBaseOid).toBe(baseOid);
		expect(effect.details.expectedMergeBaseOid).toBe(mergeBase);
		expect(effect.details.expectedHeadOid).toBe(headA);
		expect(effect.details.decision).toBe("approve");
		expect(effect.details.summaryBodyHash).toBe(hashReviewUtf8("Looks good."));
		expect(effect.details.summaryBodyBytes).toBe(
			reviewBodyByteLength("Looks good."),
		);
		expect(effect.details.orderedInlineComments.length).toBe(64);
		expect(effect.details.anchors.length).toBe(64);
		expect(effect.details.threadOperations.length).toBe(64);
		expect(effect.details.visibilityTransition).toBe("session->forge");
		expect(effect.details.actorIdentity).toBe("human:actor-1");
		expect(effect.details.correlationMarker).toBe(
			reviewCorrelationMarker("cmd-review-1"),
		);
		expect(effect.digest).toBe(
			reviewExactEffectDigest({
				operation: effect.operation,
				schemaVersion: effect.schemaVersion,
				commandId: effect.commandId,
				actorId: effect.actorId,
				sessionId: effect.sessionId,
				reviewId: effect.reviewId,
				expectedRevision: effect.expectedRevision,
				details: effect.details,
			}),
		);
	});

	it("changes digest when comment order changes", () => {
		const first = buildReviewExactEffect({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "x",
			}),
			snapshot: snapshot(),
			pending: pendingReview({
				orderedInlineComments: [comment("c1"), comment("c2")],
			}),
			target: prTarget(),
			summaryBody: "Looks good.",
		});
		const second = buildReviewExactEffect({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "x",
			}),
			snapshot: snapshot(),
			pending: pendingReview({
				orderedInlineComments: [comment("c2"), comment("c1")],
			}),
			target: prTarget(),
			summaryBody: "Looks good.",
		});
		expect(first.details.orderedInlineComments).not.toBe(
			second.details.orderedInlineComments,
		);
		expect(first.digest).not.toBe(second.digest);
	});
});

describe("review orchestrator", () => {
	it("requires explicit approval before every exact-effect operation", async () => {
		const { orchestrator, state } = createHarness();
		const operations: ReviewEffectRequest[] = [
			{
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: "unapproved",
				}),
			},
			{
				operation: "reply-review-thread",
				command: envelope({
					kind: "add-message",
					threadId: "thread-c1",
					body: "follow-up",
				}),
				threadId: "thread-c1",
				messageId: "c1",
				body: "follow-up",
			},
			{
				operation: "resolve-review-thread",
				command: envelope({
					kind: "resolve-thread",
					threadId: "thread-c1",
				}),
				threadId: "thread-c1",
			},
			{
				operation: "unresolve-review-thread",
				command: envelope({
					kind: "unresolve-thread",
					threadId: "thread-c1",
				}),
				threadId: "thread-c1",
			},
			{
				operation: "apply-review-suggestion",
				command: envelope({
					kind: "apply-suggestion",
					messageId: "suggestion-1",
					approvalDigest: "unapproved",
				}),
				messageId: "suggestion-1",
			},
			{
				operation: "stage-review-selection",
				command: envelope({
					kind: "stage-selection",
					generationId: "gen-1",
					fileId: "file-a",
					hunkId: "hunk-1",
					approvalDigest: "unapproved",
				}),
				generationId: "gen-1",
				fileId: "file-a",
				hunkId: "hunk-1",
			},
			{
				operation: "unstage-review-selection",
				command: envelope({
					kind: "unstage-selection",
					generationId: "gen-1",
					fileId: "file-a",
					hunkId: "hunk-1",
					approvalDigest: "unapproved",
				}),
				generationId: "gen-1",
				fileId: "file-a",
				hunkId: "hunk-1",
			},
		];
		for (const request of operations) {
			await expect(orchestrator.execute(request)).rejects.toBeInstanceOf(
				ReviewApprovalRequiredError,
			);
		}
		expect(state.submitCalls).toBe(0);
		expect(state.applyCalls).toBe(0);
		expect(state.replyCalls).toEqual([]);
	});

	it("invalidates approval after a one-character summary body change", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		const described = await orchestrator.describe({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
		});
		state.summaryBody = "Looks good!";
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: described.digest,
				}),
				approvalDigest: described.digest,
			}),
		).rejects.toMatchObject({
			code: "approval-mismatch",
			details: { reason: "body-changed" },
		});
		expect(state.submitCalls).toBe(0);
	});

	it("invalidates approval when inline comment order changes", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		const described = await orchestrator.describe({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
		});
		state.pending = pendingReview({
			orderedInlineComments: [comment("c2"), comment("c1")],
		});
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: described.digest,
				}),
				approvalDigest: described.digest,
			}),
		).rejects.toMatchObject({
			code: "approval-mismatch",
			details: { reason: "order-changed" },
		});
		expect(state.submitCalls).toBe(0);
	});

	it("invalidates approval when the pull request head moves", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		const described = await orchestrator.describe({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
		});
		state.head = headB;
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: described.digest,
				}),
				approvalDigest: described.digest,
			}),
		).rejects.toMatchObject({
			code: "provider-drift",
			details: { reason: "head-moved" },
		});
		expect(state.submitCalls).toBe(0);
	});

	it("invalidates approval when a touched thread is resolved after approval", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		const described = await orchestrator.describe({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
		});
		state.threads.set("thread-c1", thread("thread-c1", "resolved"));
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: described.digest,
				}),
				approvalDigest: described.digest,
			}),
		).rejects.toMatchObject({
			code: "approval-mismatch",
			details: { reason: "thread-resolved" },
		});
		expect(state.submitCalls).toBe(0);
	});

	it("refuses a stale aggregate revision before mutation", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		state.snapshot = { ...state.snapshot, revision: 9n };
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: "pending",
				}),
			}),
		).rejects.toMatchObject({ code: "stale-revision" });
		expect(state.submitCalls).toBe(0);
	});

	it("never auto-reprepares under an old approval digest", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		const described = await orchestrator.describe({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
		});
		state.summaryBody = "changed after approval";
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: described.digest,
				}),
				approvalDigest: described.digest,
			}),
		).rejects.toBeInstanceOf(ReviewError);
		const current = await orchestrator.describe({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "pending",
			}),
		});
		expect(current.digest).not.toBe(described.digest);
		expect(state.submitCalls).toBe(0);
	});

	it("persists pending before mutation and completes a publish review", async () => {
		const ledgerDir = temp("hobo-review-pending-");
		const { orchestrator, state } = createHarness({
			authorize: true,
			ledgerDir,
		});
		let pendingDuringSubmit = "";
		state.submitImpl = async (input) => {
			const { loadReviewDeliveryLedger } = await import(
				"../src/review/review-delivery-ledger.js"
			);
			const record = await loadReviewDeliveryLedger(ledgerDir, "cmd-review-1");
			pendingDuringSubmit = record?.status ?? "";
			expect(input.correlationMarker).toBe(
				reviewCorrelationMarker("cmd-review-1"),
			);
			return { providerReviewId: "PRR_1", receiptHash: "receipt-1" };
		};
		const result = await orchestrator.execute({
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "unused",
			}),
		});
		expect(pendingDuringSubmit).toBe("pending");
		expect(result.ledger.status).toBe("complete");
		expect(result.replayed).toBe(false);
		expect(result.submission?.state).toBe("reconciled");
		expect(state.submitCalls).toBe(1);
		expect(state.replyCalls).toEqual(["thread-c1"]);
	});

	it("replays the same commandId without posting duplicate comments", async () => {
		const { orchestrator, state } = createHarness({ authorize: true });
		const request: ReviewEffectRequest = {
			operation: "publish-review",
			command: envelope({
				kind: "publish-submission",
				pendingReviewId: "pending-1",
				approvalDigest: "unused",
			}),
		};
		const first = await orchestrator.execute(request);
		const second = await orchestrator.execute(request);
		expect(second.replayed).toBe(true);
		expect(second.ledger.digest).toBe(first.ledger.digest);
		expect(state.submitCalls).toBe(1);
		expect(state.replyCalls).toEqual(["thread-c1"]);
	});

	it("treats partial multi-call success as an incomplete submission", async () => {
		const ledgerDir = temp("hobo-review-partial-");
		const { orchestrator, state, provider } = createHarness({
			authorize: true,
			ledgerDir,
		});
		const originalReply = provider.replyToThread.bind(provider);
		provider.replyToThread = async (input) => {
			await originalReply(input);
			throw new Error("reply transport lost");
		};
		await expect(
			orchestrator.execute({
				operation: "publish-review",
				command: envelope({
					kind: "publish-submission",
					pendingReviewId: "pending-1",
					approvalDigest: "unused",
				}),
			}),
		).rejects.toMatchObject({ code: "ambiguous-outcome" });
		expect(state.submitCalls).toBe(1);
		expect(state.replyCalls).toEqual(["thread-c1"]);
		const { loadReviewDeliveryLedger } = await import(
			"../src/review/review-delivery-ledger.js"
		);
		const record = await loadReviewDeliveryLedger(ledgerDir, "cmd-review-1");
		expect(record?.status).toBe("ambiguous");
	});

	it("executes reply, resolve, unresolve, suggestion, stage, and unstage operations", async () => {
		const { orchestrator, state } = createHarness({
			authorize: true,
			target: worktreeTarget(),
		});
		state.snapshot = snapshot(worktreeTarget());
		const reply = await orchestrator.execute({
			operation: "reply-review-thread",
			command: envelope(
				{ kind: "add-message", threadId: "thread-c1", body: "follow-up" },
				{ commandId: "cmd-reply", expectedRevision: state.snapshot.revision },
			),
			threadId: "thread-c1",
			messageId: "c1",
			body: "follow-up",
		});
		expect(reply.effect.operation).toBe("reply-review-thread");
		expect(state.replyCalls).toEqual(["thread-c1"]);

		const resolved = await orchestrator.execute({
			operation: "resolve-review-thread",
			command: envelope(
				{ kind: "resolve-thread", threadId: "thread-c1" },
				{ commandId: "cmd-resolve", expectedRevision: state.snapshot.revision },
			),
			threadId: "thread-c1",
		});
		expect(resolved.effect.operation).toBe("resolve-review-thread");
		expect(state.resolveCalls).toEqual(["thread-c1"]);

		state.threads.set("thread-c1", thread("thread-c1", "resolved"));
		const unresolved = await orchestrator.execute({
			operation: "unresolve-review-thread",
			command: envelope(
				{ kind: "unresolve-thread", threadId: "thread-c1" },
				{
					commandId: "cmd-unresolve",
					expectedRevision: state.snapshot.revision,
				},
			),
			threadId: "thread-c1",
		});
		expect(unresolved.effect.operation).toBe("unresolve-review-thread");
		expect(state.unresolveCalls).toEqual(["thread-c1"]);

		const applied = await orchestrator.execute({
			operation: "apply-review-suggestion",
			command: envelope(
				{
					kind: "apply-suggestion",
					messageId: "suggestion-1",
					approvalDigest: "unused",
				},
				{ commandId: "cmd-suggest", expectedRevision: state.snapshot.revision },
			),
			messageId: "suggestion-1",
		});
		expect(applied.effect.operation).toBe("apply-review-suggestion");

		const staged = await orchestrator.execute({
			operation: "stage-review-selection",
			command: envelope(
				{
					kind: "stage-selection",
					generationId: "gen-1",
					fileId: "file-a",
					hunkId: "hunk-1",
					approvalDigest: "unused",
				},
				{ commandId: "cmd-stage", expectedRevision: state.snapshot.revision },
			),
			generationId: "gen-1",
			fileId: "file-a",
			hunkId: "hunk-1",
		});
		expect(staged.effect.operation).toBe("stage-review-selection");

		const unstaged = await orchestrator.execute({
			operation: "unstage-review-selection",
			command: envelope(
				{
					kind: "unstage-selection",
					generationId: "gen-1",
					fileId: "file-a",
					hunkId: "hunk-1",
					approvalDigest: "unused",
				},
				{ commandId: "cmd-unstage", expectedRevision: state.snapshot.revision },
			),
			generationId: "gen-1",
			fileId: "file-a",
			hunkId: "hunk-1",
		});
		expect(unstaged.effect.operation).toBe("unstage-review-selection");
		expect(state.applyCalls).toBe(3);
	});
});
