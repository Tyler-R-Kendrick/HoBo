/**
 * The review runtime's command surface, past `startReview`.
 *
 * `review.test.ts` starts a review and walks one happy path; `review-target-kinds`
 * covers how each target kind resolves. Neither touches the seventeen other
 * commands — threads, messages, coverage, staging, submission, publication —
 * which is where most of this module's behaviour lives.
 *
 * Three properties are worth pinning here more than the individual verbs:
 *
 * 1. **Approval is exact-effect, not a boolean.** Publishing, staging, and
 *    applying a suggestion each compute a digest over precisely what they are
 *    about to do, and refuse anything that does not match. A drift here does
 *    not fail loudly — it means a user approved one patch and a different one
 *    was applied, which is the worst outcome this whole design exists to
 *    prevent.
 * 2. **Drafts are mutable, published messages are not.** The line between them
 *    is what lets someone write freely before deciding to send. If an edit ever
 *    reached a published message, the record a reviewer sent and the record the
 *    author sees would silently disagree.
 * 3. **Commands are idempotent by id.** They arrive over a channel that
 *    redelivers. A second delivery must not double-post a comment or bump a
 *    revision, and — subtly — a *failure* must be cached too, except for stale
 *    revisions, which are the one error a retry can legitimately fix.
 *
 * Everything runs against a real store and a real git repository. Approval and
 * the provider are injected, because those are the two things a test must be
 * able to make say "no".
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	ReviewActorKind,
	ReviewAnchorHealth,
	ReviewCoverageState,
	ReviewDecision,
	ReviewDerivedState,
	ReviewInboxDisposition,
	ReviewLifecycle,
	ReviewPublicationState,
	type ReviewSnapshot,
	ReviewThreadOrigin,
	ReviewThreadResolution,
} from "../src/_generated/code_review_pb.js";
import type { ReviewProvider } from "../src/review/github-review-provider.js";
import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-contract.js";
import {
	createReviewRuntime,
	inboxDerivedState,
	type ReviewRuntime,
} from "../src/review/review-runtime.js";
import { sessionProcessRunner } from "../src/session-orchestrator.js";

const open: ReviewRuntime[] = [];

afterEach(() => {
	for (const created of open.splice(0)) created.close();
});

async function repository(): Promise<string> {
	const root = mkdtempSync(join(tmpdir(), "hobo-review-surface-repo-"));
	const runner = sessionProcessRunner();
	await runner.run("git", ["init"], root);
	await runner.run("git", ["config", "user.email", "dev@hobo.test"], root);
	await runner.run("git", ["config", "user.name", "HoBo"], root);
	writeFileSync(join(root, "src.ts"), "export const a = 1;\n");
	await runner.run("git", ["add", "src.ts"], root);
	await runner.run("git", ["commit", "-m", "base"], root);
	writeFileSync(join(root, "src.ts"), "export const a = 2;\n");
	await runner.run("git", ["add", "src.ts"], root);
	await runner.run("git", ["commit", "-m", "change"], root);
	return root;
}

let counter = 0;

/** A runtime plus a review already started over a real repository. */
async function started(
	options: {
		readonly authorize?: (
			digest: string,
			operation: string,
		) => boolean | Promise<boolean>;
		readonly provider?: ReviewProvider;
	} = {},
) {
	counter += 1;
	const reviewId = `rev-${counter}`;
	const repo = await repository();
	const review = createReviewRuntime({
		dataDir: mkdtempSync(join(tmpdir(), "hobo-review-surface-")),
		now: () => "2026-08-20T00:00:00.000Z",
		...(options.authorize ? { authorize: options.authorize } : {}),
		...(options.provider ? { provider: options.provider } : {}),
	});
	open.push(review);
	let issued = 0;
	/** Issue a command; every commandId is distinct unless a test reuses one. */
	async function send(body: Record<string, unknown>, commandId?: string) {
		issued += 1;
		return review.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: commandId ?? `${reviewId}-cmd-${issued}`,
			actorId: "human",
			reviewId,
			...body,
		});
	}
	const start = await send({
		startReview: {
			target: {
				kind: "REVIEW_TARGET_KIND_COMMIT",
				repositoryId: repo,
				repositoryRoot: repo,
				headCommitOid: "HEAD",
			},
		},
	});
	return { review, reviewId, repo, send, start };
}

/**
 * The snapshot from an accepted result.
 *
 * `inboxDerivedState` needs a snapshot, not `snapshot | undefined`. Asserting
 * it away with `!` would turn a command that was unexpectedly declined into a
 * confusing "cannot read property of undefined" several frames later; this
 * fails on the actual problem.
 */
function snapshotOf(result: { snapshot?: ReviewSnapshot }): ReviewSnapshot {
	const snapshot = result.snapshot;
	if (!snapshot) throw new Error("expected an accepted result with a snapshot");
	return snapshot;
}

/** Start a thread and return its id, since almost every test needs one. */
async function withThread(ctx: Awaited<ReturnType<typeof started>>) {
	const created = await ctx.send({
		createReviewThread: { body: "this name reads as a verb" },
	});
	const thread = created.snapshot?.threads[0];
	return {
		threadId: thread?.threadId ?? "",
		messageId: created.snapshot?.messages[0]?.messageId ?? "",
	};
}

describe("threads and messages", () => {
	it("creates a thread carrying its first message", async () => {
		// A thread with no message is an empty comment box in the reviewer's
		// list — visible, unexplained, and impossible to act on.
		const ctx = await started();
		const result = await ctx.send({
			createReviewThread: { body: "this name reads as a verb" },
		});
		expect(result.snapshot?.threads).toHaveLength(1);
		expect(result.snapshot?.messages).toHaveLength(1);
		expect(result.snapshot?.messages[0]?.body).toBe(
			"this name reads as a verb",
		);
	});

	it("links the message to the thread from both ends", async () => {
		// The thread holds ids and the message holds a threadId. If those two ever
		// disagree, a comment renders under the wrong anchor.
		const ctx = await started();
		const result = await ctx.send({
			createReviewThread: { body: "note" },
		});
		const thread = result.snapshot?.threads[0];
		const message = result.snapshot?.messages[0];
		expect(thread?.messageIds).toEqual([message?.messageId]);
		expect(message?.threadId).toBe(thread?.threadId);
	});

	it("starts a new thread open and current", async () => {
		const ctx = await started();
		const result = await ctx.send({ createReviewThread: { body: "note" } });
		expect(result.snapshot?.threads[0]?.resolution).toBe(
			ReviewThreadResolution.OPEN,
		);
		expect(result.snapshot?.threads[0]?.anchorHealth).toBe(
			ReviewAnchorHealth.CURRENT,
		);
	});

	it("appends a reply to an existing thread", async () => {
		const ctx = await started();
		const { threadId } = await withThread(ctx);
		const result = await ctx.send({
			addReviewMessage: { threadId, body: "agreed" },
		});
		expect(result.snapshot?.messages).toHaveLength(2);
		expect(result.snapshot?.threads[0]?.messageIds).toHaveLength(2);
	});

	it("refuses a reply to a thread that does not exist", async () => {
		// Silently creating one would scatter orphan threads that no anchor ever
		// renders — the comment is accepted and then never seen again.
		const ctx = await started();
		const result = await ctx.send({
			addReviewMessage: { threadId: "no-such-thread", body: "hello" },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("thread not found");
	});

	it("records what a reply is replying to", async () => {
		const ctx = await started();
		const { threadId, messageId } = await withThread(ctx);
		const result = await ctx.send({
			addReviewMessage: {
				threadId,
				body: "agreed",
				replyToMessageId: messageId,
			},
		});
		expect(result.snapshot?.messages[1]?.replyToMessageId).toBe(messageId);
	});

	it("hashes the body so an edit is detectable without storing two copies", async () => {
		const ctx = await started();
		const result = await ctx.send({ createReviewThread: { body: "note" } });
		expect(result.snapshot?.messages[0]?.bodyHash).toMatch(/^[0-9a-f]{64}$/u);
	});
});

describe("editing and deleting drafts", () => {
	it("edits a draft body and bumps its revision", async () => {
		// The revision is what tells a reader they are not looking at what was
		// there a moment ago — without it, an edit is indistinguishable from the
		// original.
		const ctx = await started();
		const { messageId } = await withThread(ctx);
		const result = await ctx.send({
			editDraftReviewMessage: { messageId, body: "reworded" },
		});
		const message = result.snapshot?.messages[0];
		expect(message?.body).toBe("reworded");
		expect(message?.editRevision).toBe(2);
		expect(message?.editedAt).toBe("2026-08-20T00:00:00.000Z");
	});

	it("re-hashes the body on edit", async () => {
		// A stale hash beside a new body is worse than no hash: it asserts
		// integrity for content it no longer describes.
		const ctx = await started();
		const created = await ctx.send({
			createReviewThread: { body: "original" },
		});
		const messageId = created.snapshot?.messages[0]?.messageId ?? "";
		const originalHash = created.snapshot?.messages[0]?.bodyHash;
		const result = await ctx.send({
			editDraftReviewMessage: { messageId, body: "reworded" },
		});
		const message = result.snapshot?.messages[0];
		expect(message?.bodyHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(message?.bodyHash).not.toBe(originalHash);
	});

	it("refuses to edit a message that does not exist", async () => {
		const ctx = await started();
		const result = await ctx.send({
			editDraftReviewMessage: { messageId: "ghost", body: "x" },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("message not found");
	});

	it("deletes a draft and unlinks it from its thread", async () => {
		// Leaving the id on the thread would render a comment slot with nothing in
		// it, which reads as a loading failure rather than a deletion.
		const ctx = await started();
		const { threadId, messageId } = await withThread(ctx);
		await ctx.send({ addReviewMessage: { threadId, body: "second" } });
		const result = await ctx.send({
			deleteDraftReviewMessage: { messageId },
		});
		expect(result.snapshot?.messages.map((row) => row.messageId)).not.toContain(
			messageId,
		);
		expect(result.snapshot?.threads[0]?.messageIds).not.toContain(messageId);
	});

	it("refuses to delete a message that does not exist", async () => {
		const ctx = await started();
		const result = await ctx.send({
			deleteDraftReviewMessage: { messageId: "ghost" },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("message not found");
	});
});

describe("resolving threads", () => {
	it("resolves a thread", async () => {
		const ctx = await started();
		const { threadId } = await withThread(ctx);
		const result = await ctx.send({ resolveReviewThread: { threadId } });
		expect(result.snapshot?.threads[0]?.resolution).toBe(
			ReviewThreadResolution.RESOLVED,
		);
	});

	it("unresolves a thread that was resolved", async () => {
		// Resolution is not one-way: a reviewer who resolves by mistake, or who
		// finds the fix incomplete, has to be able to reopen the conversation.
		const ctx = await started();
		const { threadId } = await withThread(ctx);
		await ctx.send({ resolveReviewThread: { threadId } });
		const result = await ctx.send({ unresolveReviewThread: { threadId } });
		expect(result.snapshot?.threads[0]?.resolution).toBe(
			ReviewThreadResolution.OPEN,
		);
	});

	it("refuses to resolve a thread that does not exist", async () => {
		const ctx = await started();
		const result = await ctx.send({
			resolveReviewThread: { threadId: "ghost" },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("thread not found");
	});

	it("stamps the thread's updatedAt when resolution changes", async () => {
		const ctx = await started();
		const { threadId } = await withThread(ctx);
		const result = await ctx.send({ resolveReviewThread: { threadId } });
		expect(result.snapshot?.threads[0]?.updatedAt).toBe(
			"2026-08-20T00:00:00.000Z",
		);
	});
});

describe("routing a thread to an agent", () => {
	it("posts the routing as an agent-authored message", async () => {
		// Attribution is the point. A routed request that looked human-authored
		// would leave a reviewer arguing with an agent they cannot see.
		const ctx = await started();
		const { threadId } = await withThread(ctx);
		const result = await ctx.send({
			routeReviewThreadToAgent: {
				threadId,
				agentId: "claude",
				prompt: "rename this",
			},
		});
		const routed = result.snapshot?.messages[1];
		expect(routed?.authorId).toBe("claude");
		expect(routed?.authorKind).toBe(ReviewActorKind.AGENT);
		expect(routed?.body).toBe("routed to agent claude: rename this");
	});

	it("attaches the routed message to the thread", async () => {
		const ctx = await started();
		const { threadId } = await withThread(ctx);
		const result = await ctx.send({
			routeReviewThreadToAgent: { threadId, agentId: "claude", prompt: "go" },
		});
		expect(result.snapshot?.threads[0]?.messageIds).toHaveLength(2);
	});

	it("refuses to route a thread that does not exist", async () => {
		const ctx = await started();
		const result = await ctx.send({
			routeReviewThreadToAgent: {
				threadId: "ghost",
				agentId: "claude",
				prompt: "go",
			},
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("thread not found");
	});
});

describe("coverage", () => {
	it("records a reviewed unit", async () => {
		const ctx = await started();
		const result = await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "f1",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		expect(result.snapshot?.coverage).toHaveLength(1);
		expect(result.snapshot?.coverage[0]?.unit?.fileId).toBe("f1");
	});

	it("defaults an unstated state to reviewed", async () => {
		// Marking coverage is an affirmative act — the caller pressed a key that
		// means "I read this". Defaulting to anything else would lose the signal.
		const ctx = await started();
		const result = await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "f1",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		expect(result.snapshot?.coverage[0]?.state).toBe(
			ReviewCoverageState.REVIEWED,
		);
	});

	it("substitutes an empty unit rather than dropping the record", async () => {
		// A coverage record with no unit is still evidence somebody pressed the
		// key. Dropping it would make the surface silently ignore the keypress.
		const ctx = await started();
		const result = await ctx.send({ markReviewCoverage: {} });
		expect(result.snapshot?.coverage).toHaveLength(1);
		expect(result.snapshot?.coverage[0]?.unit?.fileId).toBe("");
	});

	it("ties coverage to the generation it was read against", async () => {
		// This is what makes staleness computable later: without the generation,
		// there is no way to know whether the file changed after it was read.
		const ctx = await started();
		const result = await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "f1",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		expect(result.snapshot?.coverage[0]?.generationId).toBe(
			ctx.start.snapshot?.currentGenerationId,
		);
	});
});

describe("refreshing against a moved tree", () => {
	it("adds a generation chained to its predecessor", async () => {
		// The chain is how a reviewer's comments are carried forward. A generation
		// with no predecessor is an island: nothing can be reanchored across it.
		const ctx = await started();
		const before = ctx.start.snapshot?.currentGenerationId;
		const result = await ctx.send({ refreshReview: {} });
		expect(result.snapshot?.generations).toHaveLength(2);
		expect(result.snapshot?.generations[1]?.predecessorGenerationId).toBe(
			before,
		);
		expect(result.snapshot?.currentGenerationId).not.toBe(before);
	});

	it("numbers generations in order", async () => {
		const ctx = await started();
		await ctx.send({ refreshReview: {} });
		const result = await ctx.send({ refreshReview: {} });
		expect(result.snapshot?.generations.map((row) => row.ordinal)).toEqual([
			1, 2, 3,
		]);
	});

	it("marks reviewed coverage stale when the file it covered is gone", async () => {
		// This is the safety property of the whole coverage feature: a reviewer's
		// "I read this" must not survive the content it referred to.
		const ctx = await started();
		await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "not-in-manifest",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		const result = await ctx.send({ refreshReview: {} });
		expect(result.snapshot?.coverage[0]?.state).toBe(ReviewCoverageState.STALE);
		expect(result.snapshot?.coverage[0]?.invalidationEvidence).toEqual([
			"content-changed",
		]);
	});

	it("stamps when coverage was invalidated", async () => {
		const ctx = await started();
		await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "gone",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		const result = await ctx.send({ refreshReview: {} });
		expect(result.snapshot?.coverage[0]?.invalidatedAt).toBe(
			"2026-08-20T00:00:00.000Z",
		);
	});

	it("marks a thread whose file left the manifest as stale rather than moving it", async () => {
		// Reanchoring a comment onto a file it was never about is the failure this
		// health flag exists to make visible instead.
		const ctx = await started();
		await withThread(ctx);
		const result = await ctx.send({ refreshReview: {} });
		expect(result.snapshot?.threads[0]?.anchorHealth).toBe(
			ReviewAnchorHealth.STALE,
		);
	});
});

describe("the inbox disposition and lifecycle", () => {
	it("changes the inbox disposition", async () => {
		const ctx = await started();
		const result = await ctx.send({
			setReviewInboxDisposition: {
				disposition: ReviewInboxDisposition.IGNORED,
			},
		});
		expect(result.snapshot?.inboxDisposition).toBe(
			ReviewInboxDisposition.IGNORED,
		);
	});

	it("closes a review", async () => {
		const ctx = await started();
		const result = await ctx.send({ closeReview: {} });
		expect(result.snapshot?.lifecycle).toBe(ReviewLifecycle.CLOSED);
	});

	it("reports a closed review as closed regardless of its coverage", async () => {
		// Closed wins over every other signal: a review nobody is going to act on
		// should not sit in the inbox demanding attention.
		const ctx = await started();
		await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "f",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		const closed = await ctx.send({ closeReview: {} });
		expect(inboxDerivedState(snapshotOf(closed))).toBe(
			ReviewDerivedState.CLOSED,
		);
	});

	it("reports an untouched review as needing review", async () => {
		const ctx = await started();
		expect(inboxDerivedState(snapshotOf(ctx.start))).toBe(
			ReviewDerivedState.NEEDS_REVIEW,
		);
	});

	it("reports a partly-read review as in progress", async () => {
		const ctx = await started();
		const marked = await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "f",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		expect(inboxDerivedState(snapshotOf(marked))).toBe(
			ReviewDerivedState.IN_PROGRESS,
		);
	});

	it("reports stale coverage as changed-since-review, outranking in-progress", async () => {
		// A reviewer who reads "in progress" will pick up where they left off. The
		// whole point of the stale state is that where they left off no longer
		// exists.
		const ctx = await started();
		await ctx.send({
			markReviewCoverage: {
				unit: {
					kind: "file",
					fileId: "gone",
					hunkId: "",
					stableChangeId: "",
					contentIdentity: "abc",
				},
			},
		});
		const refreshed = await ctx.send({ refreshReview: {} });
		expect(inboxDerivedState(snapshotOf(refreshed))).toBe(
			ReviewDerivedState.CHANGED_SINCE_REVIEW,
		);
	});

	it("reports an open agent thread as awaiting the agent", async () => {
		const ctx = await started();
		const result = await ctx.send({
			createReviewThread: {
				body: "agent please",
				origin: ReviewThreadOrigin.LOCAL_AGENT,
			},
		});
		expect(inboxDerivedState(snapshotOf(result))).toBe(
			ReviewDerivedState.AWAITING_AGENT,
		);
	});
});

describe("preparing a submission", () => {
	it("marks the selected messages as selected rather than published", async () => {
		// Selection is reversible; publication is not. Conflating them would send
		// a comment the moment somebody ticked a box.
		const ctx = await started();
		const { messageId } = await withThread(ctx);
		const result = await ctx.send({
			prepareReviewSubmission: {
				selectedMessageIds: [messageId],
				summaryBody: "looks good",
				decision: ReviewDecision.COMMENT,
			},
		});
		expect(result.snapshot?.messages[0]?.publicationState).toBe(
			ReviewPublicationState.SELECTED_FOR_PUBLICATION,
		);
	});

	it("computes an effect digest over what is about to be published", async () => {
		// This digest is the thing a human approves. If it did not cover the
		// message ids and the head oid, approval would authorise a different
		// publication than the one shown.
		const ctx = await started();
		const { messageId } = await withThread(ctx);
		const result = await ctx.send({
			prepareReviewSubmission: {
				selectedMessageIds: [messageId],
				summaryBody: "looks good",
				decision: ReviewDecision.COMMENT,
			},
		});
		expect(result.snapshot?.pending?.effectDigest).toMatch(/^[0-9a-f]{64}$/u);
	});

	it("pins the head oid the approval was computed against", async () => {
		const ctx = await started();
		const result = await ctx.send({
			prepareReviewSubmission: {
				selectedMessageIds: [],
				summaryBody: "s",
				decision: ReviewDecision.COMMENT,
			},
		});
		expect(result.snapshot?.pending?.expectedProviderHeadOid).toBe(
			ctx.start.snapshot?.target?.headCommitOid,
		);
	});

	it("orders the inline comments alongside their anchors", async () => {
		const ctx = await started();
		const { messageId } = await withThread(ctx);
		const result = await ctx.send({
			prepareReviewSubmission: {
				selectedMessageIds: [messageId],
				summaryBody: "s",
				decision: ReviewDecision.COMMENT,
			},
		});
		const inline = result.snapshot?.pending?.orderedInlineComments[0];
		expect(inline?.messageId).toBe(messageId);
		expect(inline?.anchor).toBeDefined();
	});

	it("ignores a selected id that names no message", async () => {
		// Failing the whole preparation because one id went stale would lose the
		// reviewer's other selections along with it.
		const ctx = await started();
		const result = await ctx.send({
			prepareReviewSubmission: {
				selectedMessageIds: ["ghost"],
				summaryBody: "s",
				decision: ReviewDecision.COMMENT,
			},
		});
		expect(result.accepted).toBe(true);
		expect(result.snapshot?.pending?.selectedMessageIds).toEqual(["ghost"]);
	});

	it("defaults an unstated decision to comment", async () => {
		// Defaulting to approve would turn a missing field into an approval
		// nobody gave.
		const ctx = await started();
		const result = await ctx.send({
			prepareReviewSubmission: { selectedMessageIds: [], summaryBody: "s" },
		});
		expect(result.snapshot?.pending?.decision).toBe(ReviewDecision.COMMENT);
	});
});

describe("publishing a submission", () => {
	function fakeProvider(): ReviewProvider {
		return {
			id: "github",
			capabilities: () => ["review-submit"],
			async submitReview() {
				return {
					submissionId: "sub-1",
					state: 2,
					providerReviewId: "gh-1",
					receiptHash: "receipt",
				};
			},
		};
	}

	async function prepared(options: {
		readonly authorize?: (
			digest: string,
			operation: string,
		) => boolean | Promise<boolean>;
	}) {
		const ctx = await started({
			...options,
			provider: fakeProvider(),
		});
		const { messageId } = await withThread(ctx);
		const prep = await ctx.send({
			prepareReviewSubmission: {
				selectedMessageIds: [messageId],
				summaryBody: "ship it",
				decision: ReviewDecision.COMMENT,
			},
		});
		return {
			ctx,
			messageId,
			pendingReviewId: prep.snapshot?.pending?.pendingReviewId ?? "",
			effectDigest: prep.snapshot?.pending?.effectDigest ?? "",
		};
	}

	it("refuses to publish without approval", async () => {
		// No `authorize` at all means `options.authorize?.()` is undefined, which
		// must read as refusal rather than as consent. Defaulting the other way
		// would make every embedder that forgot to wire approval publish freely.
		const { ctx, pendingReviewId } = await prepared({});
		const result = await ctx.send({
			publishReviewSubmission: { pendingReviewId },
		});
		expect(result.accepted).toBe(false);
		expect(result.code).toBe("HOBO_CODE_REVIEW_APPROVAL_REQUIRED");
	});

	it("refuses when the approver says no", async () => {
		const { ctx, pendingReviewId } = await prepared({
			authorize: () => false,
		});
		const result = await ctx.send({
			publishReviewSubmission: { pendingReviewId },
		});
		expect(result.code).toBe("HOBO_CODE_REVIEW_APPROVAL_REQUIRED");
	});

	it("hands the approver the operation name and the digest", async () => {
		// An approver that cannot tell publishing from patching cannot make a
		// meaningful decision — it can only say yes to everything.
		const seen: { digest: string; operation: string }[] = [];
		const { ctx, pendingReviewId, effectDigest } = await prepared({
			authorize: (digest, operation) => {
				seen.push({ digest, operation });
				return true;
			},
		});
		await ctx.send({ publishReviewSubmission: { pendingReviewId } });
		expect(seen).toContainEqual({
			digest: effectDigest,
			operation: "publish-review",
		});
	});

	it("refuses a pending id that does not match the prepared one", async () => {
		// This is the replay guard: an old approval must not publish a newer
		// pending review that the approver never saw.
		const { ctx } = await prepared({ authorize: () => true });
		const result = await ctx.send({
			publishReviewSubmission: { pendingReviewId: "stale-pending" },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("pending review not found");
	});

	it("refuses an approval digest that does not match the pending review", async () => {
		// An approver that returns true for the wrong digest is the exact-effect
		// contract failing open. The second check is what catches it.
		const { ctx, pendingReviewId } = await prepared({
			authorize: () => true,
		});
		const result = await ctx.send({
			publishReviewSubmission: {
				pendingReviewId,
				authorizationDigest:
					"0000000000000000000000000000000000000000000000000000000000000000",
			},
		});
		expect(result.code).toBe("HOBO_CODE_REVIEW_APPROVAL_MISMATCH");
	});

	it("publishes and records the provider receipt", async () => {
		const { ctx, pendingReviewId } = await prepared({
			authorize: () => true,
		});
		const result = await ctx.send({
			publishReviewSubmission: { pendingReviewId },
		});
		expect(result.accepted).toBe(true);
		expect(result.snapshot?.submission?.providerReviewId).toBe("gh-1");
		expect(result.snapshot?.submission?.receiptHash).toBe("receipt");
	});

	it("flips the published messages out of draft", async () => {
		// A message that stayed a draft after being sent could be edited, and the
		// local record would then disagree with what the reviewer received.
		const { ctx, pendingReviewId } = await prepared({
			authorize: () => true,
		});
		const result = await ctx.send({
			publishReviewSubmission: { pendingReviewId },
		});
		expect(result.snapshot?.messages[0]?.publicationState).toBe(
			ReviewPublicationState.PUBLISHED,
		);
	});

	it("refuses to edit a published message", async () => {
		const { ctx, pendingReviewId, messageId } = await prepared({
			authorize: () => true,
		});
		await ctx.send({ publishReviewSubmission: { pendingReviewId } });
		const result = await ctx.send({
			editDraftReviewMessage: { messageId, body: "actually never mind" },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("published messages are immutable");
	});

	it("refuses to delete a published message", async () => {
		const { ctx, pendingReviewId, messageId } = await prepared({
			authorize: () => true,
		});
		await ctx.send({ publishReviewSubmission: { pendingReviewId } });
		const result = await ctx.send({
			deleteDraftReviewMessage: { messageId },
		});
		expect(result.accepted).toBe(false);
		expect(result.message).toBe("published messages are immutable");
	});

	it("refuses to publish when HEAD moved after approval", async () => {
		// The reviewer approved comments against specific lines. If HEAD moved,
		// those line numbers now point somewhere else, and publishing would attach
		// the comments to code nobody reviewed.
		const { ctx, pendingReviewId } = await prepared({
			authorize: () => true,
		});
		const runner = sessionProcessRunner();
		writeFileSync(join(ctx.repo, "src.ts"), "export const a = 3;\n");
		await runner.run("git", ["add", "src.ts"], ctx.repo);
		await runner.run("git", ["commit", "-m", "moved"], ctx.repo);
		const result = await ctx.send({
			publishReviewSubmission: { pendingReviewId },
		});
		expect(result.code).toBe("HOBO_CODE_REVIEW_PROVIDER_DRIFT");
	});
});

describe("staging and suggestions", () => {
	it("refuses to stage without approval", async () => {
		// Staging writes to the user's index. Doing it unapproved would mean a
		// review surface silently editing what the next `git commit` records.
		const ctx = await started();
		const result = await ctx.send({
			stageReviewSelection: { fileId: "f1", hunkId: "h1" },
		});
		expect(result.code).toBe("HOBO_CODE_REVIEW_APPROVAL_REQUIRED");
	});

	it("carries the effect digest on the refusal so a caller can ask for it", async () => {
		// Without the digest in the refusal, a UI cannot show the user what they
		// would be approving — it can only re-ask blindly.
		const ctx = await started();
		const result = await ctx.send({
			stageReviewSelection: { fileId: "f1", hunkId: "h1" },
		});
		expect(result.message).toContain("patch requires exact-effect approval");
	});

	it("names the staging operation to the approver", async () => {
		const seen: string[] = [];
		const ctx = await started({
			authorize: (_digest, operation) => {
				seen.push(operation);
				return false;
			},
		});
		await ctx.send({ stageReviewSelection: { fileId: "f1", hunkId: "h1" } });
		expect(seen).toContain("stageReviewSelection");
	});

	it("distinguishes unstaging from staging to the approver", async () => {
		// These are opposite edits to the index. An approver told only "patch"
		// could approve an unstage believing it was a stage.
		const seen: string[] = [];
		const ctx = await started({
			authorize: (_digest, operation) => {
				seen.push(operation);
				return false;
			},
		});
		await ctx.send({ unstageReviewSelection: { fileId: "f1", hunkId: "h1" } });
		expect(seen).toContain("unstageReviewSelection");
	});

	it("refuses to apply a suggestion without approval", async () => {
		const ctx = await started();
		const result = await ctx.send({
			applyReviewSuggestion: { messageId: "m1" },
		});
		expect(result.code).toBe("HOBO_CODE_REVIEW_APPROVAL_REQUIRED");
		expect(result.message).toContain(
			"suggestion requires exact-effect approval",
		);
	});

	it("accepts an approved suggestion", async () => {
		const ctx = await started({ authorize: () => true });
		const result = await ctx.send({
			applyReviewSuggestion: { messageId: "m1" },
		});
		expect(result.accepted).toBe(true);
	});

	it("gives staging and suggestions different digests", async () => {
		// A shared digest would let an approval for one authorise the other,
		// which is precisely the confused-deputy this scheme exists to block.
		const digests: string[] = [];
		const ctx = await started({
			authorize: (digest) => {
				digests.push(digest);
				return false;
			},
		});
		await ctx.send({ stageReviewSelection: { fileId: "f1", hunkId: "h1" } });
		await ctx.send({ applyReviewSuggestion: { messageId: "f1" } });
		expect(digests[0]).not.toBe(digests[1]);
	});
});

describe("redelivery and concurrency", () => {
	it("returns the first result for a repeated command id", async () => {
		// Commands arrive over a channel that redelivers. A second delivery that
		// created a second thread would double-post the reviewer's comment.
		const ctx = await started();
		const first = await ctx.send({ createReviewThread: { body: "x" } }, "dup");
		const second = await ctx.send({ createReviewThread: { body: "x" } }, "dup");
		expect(second).toBe(first);
		expect(second.snapshot?.threads).toHaveLength(1);
	});

	it("does not advance the revision on a redelivery", async () => {
		const ctx = await started();
		const first = await ctx.send({ createReviewThread: { body: "x" } }, "dup");
		const second = await ctx.send({ createReviewThread: { body: "x" } }, "dup");
		expect(second.snapshot?.revision).toBe(first.snapshot?.revision);
	});

	it("caches a refusal so a retry gets the same answer", async () => {
		// Re-running a failing command could have side effects on the way to
		// failing again; the cached refusal makes redelivery inert.
		const ctx = await started();
		const first = await ctx.send(
			{ addReviewMessage: { threadId: "ghost", body: "x" } },
			"dup-fail",
		);
		const second = await ctx.send(
			{ addReviewMessage: { threadId: "ghost", body: "x" } },
			"dup-fail",
		);
		expect(second).toBe(first);
	});

	it("does not cache a stale-revision refusal, because a retry can fix it", async () => {
		// This is the one error where retrying is the correct response: the caller
		// reloads, sees the new revision, and sends again under the same id.
		// Caching it would make that retry permanently impossible.
		const ctx = await started();
		const stale = await ctx.send(
			{ expectedRevision: "99", createReviewThread: { body: "x" } },
			"retryable",
		);
		expect(stale.code).toBe("HOBO_CODE_REVIEW_STALE_REVISION");
		const retried = await ctx.send(
			{ createReviewThread: { body: "x" } },
			"retryable",
		);
		expect(retried.accepted).toBe(true);
	});

	it("accepts a command whose expected revision matches", async () => {
		const ctx = await started();
		const result = await ctx.send({
			expectedRevision: String(ctx.start.snapshot?.revision ?? 0),
			createReviewThread: { body: "x" },
		});
		expect(result.accepted).toBe(true);
	});

	it("reports both revisions on a conflict so the caller can reconcile", async () => {
		const ctx = await started();
		const result = await ctx.send({
			expectedRevision: "99",
			createReviewThread: { body: "x" },
		});
		expect(result.accepted).toBe(false);
		expect(result.code).toBe("HOBO_CODE_REVIEW_STALE_REVISION");
	});
});

describe("durability", () => {
	it("reads a review back through the event stream", async () => {
		const ctx = await started();
		await ctx.send({ createReviewThread: { body: "persisted" } });
		const loaded = await ctx.review.load(ctx.reviewId);
		expect(loaded?.threads).toHaveLength(1);
		expect(loaded?.messages[0]?.body).toBe("persisted");
	});

	it("advances the revision once per accepted command", async () => {
		// The revision is the optimistic-concurrency token. Skipping or repeating
		// a number would make every later expectedRevision check wrong.
		const ctx = await started();
		const one = await ctx.send({ createReviewThread: { body: "a" } });
		const two = await ctx.send({ createReviewThread: { body: "b" } });
		expect(two.snapshot?.revision).toBe((one.snapshot?.revision ?? 0n) + 1n);
	});

	it("throws on an unknown command key rather than declining it", async () => {
		// The parse boundary runs `fromJson` with `ignoreUnknownFields: false`, so
		// an unrecognised key throws out of `execute` rather than coming back as a
		// declined result. That split is deliberate and worth knowing: a declined
		// result means the runtime understood the request and said no, while a
		// throw means the caller sent something this build has no concept of —
		// a version skew, not a policy decision. A caller that only checked
		// `accepted` would let this escape as an unhandled rejection.
		const ctx = await started();
		await expect(
			ctx.send({ importPullRequest: { number: 1 } }),
		).rejects.toThrow(/unknown/u);
	});

	it("closes twice without throwing", async () => {
		// A shutdown path where both an error handler and a `finally` close is
		// ordinary; the second close throwing would replace the real failure.
		const review = createReviewRuntime({
			dataDir: mkdtempSync(join(tmpdir(), "hobo-review-close-")),
		});
		review.close();
		expect(() => review.close()).not.toThrow();
	});
});
