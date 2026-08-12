import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadReviewDeliveryLedger } from "../src/review/review-delivery-ledger.js";
import { createReviewOrchestrator } from "../src/review/review-orchestrator.js";
import {
	type PendingReview,
	type PreparedInlineComment,
	REVIEW_COMMAND_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
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

function prTarget(): Extract<ReviewTarget, { kind: "pull-request" }> {
	return {
		kind: "pull-request",
		provider: "github",
		host: "github.com",
		repository: "acme/widgets",
		number: 42,
		baseRef: "main",
		headRef: "feat",
		mergeBaseOid: "d".repeat(40),
		baseCommitOid: "c".repeat(40),
		headCommitOid: headA,
		providerNodeId: "PR_kwDOwidgets",
	};
}

function comment(id: string): PreparedInlineComment {
	return {
		messageId: id,
		threadId: `thread-${id}`,
		path: "src/a.ts",
		side: "new",
		line: 4,
		bodyHash: sha(`body-${id}`),
		body: `body-${id}`,
	};
}

function envelope(
	overrides: Partial<ReviewCommandEnvelope> = {},
): ReviewCommandEnvelope {
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId: "cmd-recover",
		actorId: "actor-1",
		reviewId: "review-1",
		expectedRevision: 3n,
		command: {
			kind: "publish-submission",
			pendingReviewId: "pending-1",
			approvalDigest: "unused",
		},
		...overrides,
	};
}

function pending(): PendingReview {
	return {
		pendingReviewId: "pending-1",
		reviewId: "review-1",
		generationId: "gen-1",
		expectedProviderHeadOid: headA,
		decision: "comment",
		summaryBodyHash: sha("note"),
		selectedMessageIds: ["c1"],
		selectedThreadOperations: [],
		orderedInlineComments: [comment("c1")],
		preparedBy: "actor-1",
		preparedAt: "2026-08-12T00:00:00.000Z",
		effectDigest: "prepared-digest",
	};
}

function thread(id: string): ReviewThread {
	return {
		threadId: id,
		reviewId: "review-1",
		origin: "local-human",
		visibility: "session",
		resolution: "open",
		anchorHealth: "current",
		messageIds: [id.replace("thread-", "")],
		createdAt: "2026-08-12T00:00:00.000Z",
		updatedAt: "2026-08-12T00:00:00.000Z",
	};
}

function capabilities(): ReviewProviderCapabilities {
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
	};
}

function memoryStore(): ReviewContentStore {
	const blobs = new Map<string, Uint8Array>();
	return {
		async put(bytes) {
			const hash = createHash("sha256").update(bytes).digest("hex");
			blobs.set(hash, bytes);
			return hash;
		},
		async get(hash) {
			const bytes = blobs.get(hash);
			if (!bytes) throw new Error(`missing ${hash}`);
			return bytes;
		},
		async has(hash) {
			return blobs.has(hash);
		},
	};
}

interface RecoveryState {
	snapshot: ReviewSnapshot;
	submitCalls: number;
	reconcile: { matches: number; receiptHash?: string };
	submitError?: Error;
	reconcileError?: Error;
}

function createRecovery(options: {
	readonly ledgerDir: string;
	readonly state?: RecoveryState;
}) {
	const snapshotValue: ReviewSnapshot = {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId: "review-1",
		revision: 3n,
		sessionId: "session-1",
		currentGenerationId: "gen-1",
		target: prTarget(),
		threadIds: ["thread-c1"],
		coverageIds: [],
		pendingReviewId: "pending-1",
		inboxDisposition: "active",
		closed: false,
		updatedAt: "2026-08-12T00:00:00.000Z",
	};
	const state: RecoveryState = options.state ?? {
		snapshot: snapshotValue,
		submitCalls: 0,
		reconcile: { matches: 0 },
	};
	if (!options.state) state.snapshot = snapshotValue;
	const runtime: ReviewRuntime = {
		async execute() {
			state.snapshot = {
				...state.snapshot,
				revision: state.snapshot.revision + 1n,
				pendingReviewId: undefined,
				updatedAt: "2026-08-12T00:00:01.000Z",
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
	const provider: ReviewProvider = {
		kind: "github",
		async detectRepository() {
			return { host: "github.com", repository: "acme/widgets" };
		},
		async resolvePullRequest() {
			return prTarget();
		},
		async fetchPullRequestThreads() {
			return [thread("thread-c1")];
		},
		async fetchPullRequestReviews() {
			return [];
		},
		async submitReview() {
			state.submitCalls += 1;
			if (state.submitError) throw state.submitError;
			return { providerReviewId: "PRR_1", receiptHash: "receipt-1" };
		},
		async replyToThread() {
			return { providerCommentId: "PC_1" };
		},
		async resolveThread() {
			return;
		},
		async unresolveThread() {
			return;
		},
		async reconcile() {
			if (state.reconcileError) throw state.reconcileError;
			return { ...state.reconcile };
		},
		async capabilities() {
			return capabilities();
		},
	};
	const patchExecutor: ReviewPatchExecutor = {
		async simulate() {
			return {
				preIndexTreeOid: "1".repeat(40),
				postIndexTreeOid: "2".repeat(40),
				patchHash: "patch-1",
				preimageHash: "pre-1",
			};
		},
		async apply() {
			return { resultTreeOid: "2".repeat(40) };
		},
	};
	const orchestrator = createReviewOrchestrator({
		runtime,
		provider,
		patchExecutor,
		contentStore: memoryStore(),
		query: {
			async loadPending() {
				return pending();
			},
			async loadThread(threadId) {
				return thread(threadId);
			},
			async loadMessage(messageId) {
				return {
					messageId,
					threadId: `thread-${messageId}`,
					authorId: "actor-1",
					authorKind: "human",
					origin: "local",
					bodyHash: sha(`body-${messageId}`),
					createdAt: "2026-08-12T00:00:00.000Z",
					editRevision: 0,
					publicationState: "selected-for-publication",
				};
			},
			async loadAnchors() {
				return [];
			},
			async loadSummaryBody() {
				return "note";
			},
		},
		ledgerDir: options.ledgerDir,
		authorize: () => true,
	});
	return { orchestrator, state };
}

describe("review recovery ledger", () => {
	it("writes pending before accept-time mutation and survives kill after accept", async () => {
		const ledgerDir = temp("hobo-review-kill-");
		const first = createRecovery({ ledgerDir });
		first.state.submitError = new Error("killed after accept");
		first.state.reconcileError = new Error("provider unreachable");
		const publish = {
			operation: "publish-review" as const,
			command: envelope(),
		};
		await expect(first.orchestrator.execute(publish)).rejects.toMatchObject({
			code: "ambiguous-outcome",
		});
		expect(first.state.submitCalls).toBe(1);
		expect(
			(await loadReviewDeliveryLedger(ledgerDir, "cmd-recover"))?.status,
		).toBe("ambiguous");

		const restarted = createRecovery({ ledgerDir, state: first.state });
		restarted.state.submitError = new Error("must not retry while ambiguous");
		await expect(restarted.orchestrator.execute(publish)).rejects.toMatchObject(
			{
				code: "ambiguous-outcome",
			},
		);
		expect(restarted.state.submitCalls).toBe(1);
	});

	it("retries after none evidence, completes after one, and refuses multiple", async () => {
		const noneDir = temp("hobo-review-none-");
		const none = createRecovery({ ledgerDir: noneDir });
		const nonePublish = {
			operation: "publish-review" as const,
			command: envelope(),
		};
		none.state.submitError = new Error("transport reset");
		none.state.reconcile = { matches: 0 };
		await expect(none.orchestrator.execute(nonePublish)).rejects.toThrow(
			"transport reset",
		);
		expect(
			(await loadReviewDeliveryLedger(noneDir, "cmd-recover"))?.status,
		).toBe("failed");
		none.state.submitError = undefined;
		const retried = await none.orchestrator.execute(nonePublish);
		expect(retried.replayed).toBe(false);
		expect(retried.ledger.status).toBe("complete");
		expect(none.state.submitCalls).toBe(2);

		const oneDir = temp("hobo-review-one-");
		const one = createRecovery({ ledgerDir: oneDir });
		const onePublish = {
			operation: "publish-review" as const,
			command: envelope(),
		};
		one.state.submitError = new Error("killed after provider accept");
		one.state.reconcile = { matches: 1, receiptHash: "receipt-1" };
		const recovered = await one.orchestrator.execute(onePublish);
		expect(recovered.ledger.status).toBe("complete");
		expect(recovered.submission?.receiptHash).toBe("receipt-1");
		expect(one.state.submitCalls).toBe(1);
		const replayed = await one.orchestrator.execute(onePublish);
		expect(replayed.replayed).toBe(true);
		expect(one.state.submitCalls).toBe(1);

		const manyDir = temp("hobo-review-many-");
		const many = createRecovery({ ledgerDir: manyDir });
		const manyPublish = {
			operation: "publish-review" as const,
			command: envelope(),
		};
		many.state.submitError = new Error("timeout after write");
		many.state.reconcile = { matches: 2 };
		await expect(many.orchestrator.execute(manyPublish)).rejects.toMatchObject({
			code: "ambiguous-outcome",
		});
		expect(many.state.submitCalls).toBe(1);
		expect(
			(await loadReviewDeliveryLedger(manyDir, "cmd-recover"))?.status,
		).toBe("ambiguous");
		await expect(many.orchestrator.execute(manyPublish)).rejects.toMatchObject({
			code: "ambiguous-outcome",
		});
		expect(many.state.submitCalls).toBe(1);
	});

	it("does not post duplicate comments after a complete ledger replay", async () => {
		const ledgerDir = temp("hobo-review-dupe-");
		const first = createRecovery({ ledgerDir });
		const publish = {
			operation: "publish-review" as const,
			command: envelope(),
		};
		await first.orchestrator.execute(publish);
		const second = createRecovery({ ledgerDir, state: first.state });
		const replayed = await second.orchestrator.execute(publish);
		expect(replayed.replayed).toBe(true);
		expect(first.state.submitCalls).toBe(1);
		expect(second.state.submitCalls).toBe(1);
	});
});
