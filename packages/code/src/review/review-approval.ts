// Review approval digest binds identity, provider fingerprint, SHAs,
// decision, bodies, ordered comments, anchors, and thread operations.
import { createHash } from "node:crypto";

import { ReviewError, reviewError } from "./review-errors.js";
import type {
	PendingReview,
	PreparedInlineComment,
	ReviewAnchor,
	ReviewCommandEnvelope,
	ReviewExactEffect,
	ReviewExactEffectOperation,
	ReviewProviderCapabilities,
	ReviewSnapshot,
	ReviewTarget,
	ReviewThread,
	ReviewThreadOperation,
} from "./review-ports.js";

// public-contract: clients pin the exact-effect approval schema at the trust boundary.
export const REVIEW_EFFECT_SCHEMA = "hobo.code.review-effect/v1" as const;

export class ReviewApprovalRequiredError extends ReviewError {
	readonly effect: ReviewExactEffect;

	constructor(effect: ReviewExactEffect) {
		super(
			"approval-required",
			`${effect.operation} requires explicit approval`,
			{
				operation: effect.operation,
				digest: effect.digest,
			},
		);
		this.name = "ReviewApprovalRequiredError";
		this.effect = effect;
	}
}

export function hashReviewUtf8(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function reviewBodyByteLength(value: string): string {
	return String(new TextEncoder().encode(value).byteLength);
}

export function reviewCorrelationMarker(commandId: string): string {
	return createHash("sha256")
		.update("hobo.code.review-correlation\0")
		.update(commandId)
		.digest("hex");
}

export function canonicalReviewJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
	if (typeof value === "bigint") return value.toString();
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, canonicalize(item)]),
		);
	}
	return value;
}

export function reviewExactEffectDigest(
	effect: Omit<ReviewExactEffect, "digest">,
): string {
	return createHash("sha256")
		.update(
			canonicalReviewJson({
				operation: effect.operation,
				schemaVersion: effect.schemaVersion,
				commandId: effect.commandId,
				actorId: effect.actorId,
				sessionId: effect.sessionId ?? "",
				reviewId: effect.reviewId,
				expectedRevision: effect.expectedRevision.toString(),
				details: effect.details,
			}),
		)
		.digest("hex");
}

export interface ReviewEffectFacts {
	readonly operation: ReviewExactEffectOperation;
	readonly command: ReviewCommandEnvelope;
	readonly snapshot: ReviewSnapshot;
	readonly pending?: PendingReview;
	readonly capabilities?: ReviewProviderCapabilities;
	readonly target?: ReviewTarget;
	readonly summaryBody?: string;
	readonly actorIdentity?: string;
	readonly visibilityTransition?: string;
	readonly threads?: readonly ReviewThread[];
	readonly threadId?: string;
	readonly messageId?: string;
	readonly body?: string;
	readonly suggestionHash?: string;
	readonly generationId?: string;
	readonly fileId?: string;
	readonly hunkId?: string;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly preIndexTreeOid?: string;
	readonly postIndexTreeOid?: string;
	readonly patchHash?: string;
	readonly preimageHash?: string;
}

function pullRequest(
	target: ReviewTarget | undefined,
): Extract<ReviewTarget, { kind: "pull-request" }> | undefined {
	return target?.kind === "pull-request" ? target : undefined;
}

function hashOrdered(value: unknown): string {
	return createHash("sha256").update(canonicalReviewJson(value)).digest("hex");
}

function inlineCommentIdentity(comment: PreparedInlineComment) {
	return {
		messageId: comment.messageId,
		threadId: comment.threadId,
		path: comment.path,
		side: comment.side,
		startLine: String(comment.startLine ?? ""),
		line: String(comment.line ?? ""),
		bodyHash: comment.bodyHash,
		suggestionHash: comment.suggestionHash ?? "",
	};
}

function anchorIdentity(anchor: ReviewAnchor) {
	return {
		anchorId: anchor.anchorId,
		generationId: anchor.generationId,
		fileId: anchor.fileId,
		pathBefore: anchor.pathBefore ?? "",
		pathAfter: anchor.pathAfter ?? "",
		side: anchor.side,
		startLine: String(anchor.startLine ?? ""),
		endLine: String(anchor.endLine ?? ""),
		hunkId: anchor.hunkId ?? "",
		hunkFingerprint: anchor.hunkFingerprint ?? "",
		selectedContentHash: anchor.selectedContentHash ?? "",
	};
}

function threadOpIdentity(operation: ReviewThreadOperation) {
	return operation.kind === "reply"
		? {
				kind: operation.kind,
				threadId: operation.threadId,
				messageId: operation.messageId,
			}
		: { kind: operation.kind, threadId: operation.threadId };
}

export function buildReviewExactEffect(
	facts: ReviewEffectFacts,
): ReviewExactEffect {
	const pr = pullRequest(facts.target ?? facts.snapshot.target);
	const pending = facts.pending;
	const comments = pending?.orderedInlineComments ?? [];
	const threadOps = pending?.selectedThreadOperations ?? [];
	const anchors = [
		...(facts.threads ?? [])
			.map((item) => item.anchor)
			.filter((item): item is ReviewAnchor => item !== undefined),
		...comments.flatMap((comment) => {
			const match = facts.threads?.find(
				(item) => item.threadId === comment.threadId,
			)?.anchor;
			return match ? [match] : [];
		}),
	];
	const uniqueAnchors = [
		...new Map(anchors.map((item) => [item.anchorId, item])).values(),
	];
	const summaryBody = facts.summaryBody ?? "";
	const body = facts.body ?? "";
	const details: Record<string, string> = {
		actorIdentity: facts.actorIdentity ?? facts.command.actorId,
		anchors: hashOrdered(uniqueAnchors.map(anchorIdentity)),
		correlationMarker: reviewCorrelationMarker(facts.command.commandId),
		decision: pending?.decision ?? "",
		expectedBaseOid: pr?.baseCommitOid ?? "",
		expectedHeadOid:
			pr?.headCommitOid ?? pending?.expectedProviderHeadOid ?? "",
		expectedMergeBaseOid: pr?.mergeBaseOid ?? "",
		host: facts.capabilities?.host ?? pr?.host ?? "",
		orderedInlineComments: hashOrdered(comments.map(inlineCommentIdentity)),
		providerFingerprint: facts.capabilities?.fingerprint ?? "",
		pullRequestNodeId: pr?.providerNodeId ?? "",
		pullRequestNumber: pr ? String(pr.number) : "",
		repository: pr?.repository ?? "",
		summaryBodyBytes: reviewBodyByteLength(summaryBody),
		summaryBodyHash: summaryBody
			? hashReviewUtf8(summaryBody)
			: (pending?.summaryBodyHash ?? ""),
		threadOperations: hashOrdered(threadOps.map(threadOpIdentity)),
		threadResolutions: hashOrdered(
			(facts.threads ?? [])
				.map((item) => ({
					threadId: item.threadId,
					resolution: item.resolution,
				}))
				.sort((left, right) => left.threadId.localeCompare(right.threadId)),
		),
		unorderedInlineComments: hashOrdered(
			[...comments.map(inlineCommentIdentity)].sort((left, right) =>
				left.messageId.localeCompare(right.messageId),
			),
		),
		visibilityTransition: facts.visibilityTransition ?? "",
	};
	if (pending) details.pendingReviewId = pending.pendingReviewId;
	if (pending?.effectDigest)
		details.preparedEffectDigest = pending.effectDigest;
	if (facts.threadId !== undefined) details.threadId = facts.threadId;
	if (facts.messageId !== undefined) details.messageId = facts.messageId;
	if (facts.body !== undefined) {
		details.bodyHash = hashReviewUtf8(body);
		details.bodyBytes = reviewBodyByteLength(body);
	}
	if (facts.suggestionHash !== undefined)
		details.suggestionHash = facts.suggestionHash;
	if (facts.generationId !== undefined)
		details.generationId = facts.generationId;
	if (facts.fileId !== undefined) details.fileId = facts.fileId;
	if (facts.hunkId !== undefined) details.hunkId = facts.hunkId;
	if (facts.startLine !== undefined)
		details.startLine = String(facts.startLine);
	if (facts.endLine !== undefined) details.endLine = String(facts.endLine);
	if (facts.preIndexTreeOid !== undefined)
		details.preIndexTreeOid = facts.preIndexTreeOid;
	if (facts.postIndexTreeOid !== undefined)
		details.postIndexTreeOid = facts.postIndexTreeOid;
	if (facts.patchHash !== undefined) details.patchHash = facts.patchHash;
	if (facts.preimageHash !== undefined)
		details.preimageHash = facts.preimageHash;

	const effect = {
		operation: facts.operation,
		schemaVersion: REVIEW_EFFECT_SCHEMA,
		commandId: facts.command.commandId,
		actorId: facts.command.actorId,
		reviewId: facts.command.reviewId,
		expectedRevision: facts.command.expectedRevision,
		details: Object.freeze(details),
		...(facts.snapshot.sessionId === undefined
			? {}
			: { sessionId: facts.snapshot.sessionId }),
	} satisfies Omit<ReviewExactEffect, "digest">;
	return Object.freeze({
		...effect,
		digest: reviewExactEffectDigest(effect),
	});
}

export interface ReviewApprovalMismatch {
	readonly code: "approval-mismatch" | "provider-drift" | "stale-revision";
	readonly reason: string;
}

export function classifyReviewApprovalDrift(input: {
	readonly approved: ReviewExactEffect;
	readonly current: ReviewExactEffect;
	readonly snapshotRevision: bigint;
	readonly expectedRevision: bigint;
}): ReviewApprovalMismatch | undefined {
	if (input.snapshotRevision !== input.expectedRevision) {
		return { code: "stale-revision", reason: "stale-revision" };
	}
	if (input.approved.digest === input.current.digest) return undefined;
	const before = input.approved.details;
	const after = input.current.details;
	if (before.expectedHeadOid !== after.expectedHeadOid)
		return { code: "provider-drift", reason: "head-moved" };
	if (
		before.expectedBaseOid !== after.expectedBaseOid ||
		before.expectedMergeBaseOid !== after.expectedMergeBaseOid ||
		before.providerFingerprint !== after.providerFingerprint ||
		before.host !== after.host ||
		before.repository !== after.repository ||
		before.pullRequestNumber !== after.pullRequestNumber ||
		before.pullRequestNodeId !== after.pullRequestNodeId
	)
		return { code: "provider-drift", reason: "provider-identity" };
	if (before.threadResolutions !== after.threadResolutions)
		return { code: "approval-mismatch", reason: "thread-resolved" };
	if (before.summaryBodyHash !== after.summaryBodyHash)
		return { code: "approval-mismatch", reason: "body-changed" };
	if (
		before.unorderedInlineComments === after.unorderedInlineComments &&
		before.orderedInlineComments !== after.orderedInlineComments
	)
		return { code: "approval-mismatch", reason: "order-changed" };
	if (before.orderedInlineComments !== after.orderedInlineComments)
		return { code: "approval-mismatch", reason: "comments-changed" };
	return { code: "approval-mismatch", reason: "digest-mismatch" };
}

export function assertReviewApprovalCurrent(input: {
	readonly approved: ReviewExactEffect;
	readonly current: ReviewExactEffect;
	readonly snapshotRevision: bigint;
	readonly expectedRevision: bigint;
}): void {
	const drift = classifyReviewApprovalDrift(input);
	if (!drift) return;
	throw reviewError(
		drift.code,
		`review ${input.current.operation} approval is no longer valid`,
		{
			reason: drift.reason,
			approvedDigest: input.approved.digest,
			currentDigest: input.current.digest,
		},
	);
}

export function assertReviewCapabilities(
	operation: ReviewExactEffectOperation,
	capabilities: ReviewProviderCapabilities | undefined,
	decision?: PendingReview["decision"],
	hasInlineComments = false,
	hasThreadOps = false,
): void {
	if (!capabilities) {
		if (
			operation === "publish-review" ||
			operation === "reply-review-thread" ||
			operation === "resolve-review-thread" ||
			operation === "unresolve-review-thread"
		) {
			throw reviewError(
				"unsupported-capability",
				`${operation} requires provider capabilities`,
			);
		}
		return;
	}
	if (decision && !capabilities.decisions.includes(decision)) {
		throw reviewError(
			"unsupported-capability",
			`provider does not allow decision ${decision}`,
			{ decision },
		);
	}
	if (decision === "approve" && !capabilities.actorMayApprove) {
		throw reviewError(
			"unsupported-capability",
			"actor may not approve on this pull request",
		);
	}
	if (hasInlineComments && !capabilities.lineComments) {
		throw reviewError(
			"unsupported-capability",
			"provider does not allow inline review comments",
		);
	}
	if (
		hasThreadOps &&
		!capabilities.threadReplies &&
		!capabilities.threadResolution
	) {
		throw reviewError(
			"unsupported-capability",
			"provider does not allow thread operations",
		);
	}
}
