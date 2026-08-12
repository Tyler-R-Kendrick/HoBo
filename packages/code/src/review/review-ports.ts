import type { ReviewErrorCode } from "./review-errors.js";

// public-contract: clients pin the review command envelope version at the trust boundary.
export const REVIEW_COMMAND_SCHEMA = "hobo.code.review-command/v1";
// public-contract: every client reads the same durable review snapshot version.
export const REVIEW_SNAPSHOT_SCHEMA = "hobo.code.review-snapshot/v1";
// public-contract: paged manifest/chunk responses share one version token.
export const REVIEW_PAGE_SCHEMA = "hobo.code.review-page/v1";
// public-contract: EventStore partition name for review aggregates.
export const REVIEW_PARTITION = "hobo-code-reviews";

export type ReviewActorKind = "human" | "agent" | "system" | "provider-user";
export type ReviewThreadOrigin =
	| "local-human"
	| "local-agent"
	| "github"
	| "system";
export type ReviewVisibility = "private" | "session" | "forge";
export type ReviewResolution = "open" | "resolved";
export type ReviewAnchorHealth =
	| "current"
	| "reanchored"
	| "stale"
	| "ambiguous"
	| "outdated"
	| "deleted";
export type ReviewPublicationState =
	| "private"
	| "selected-for-publication"
	| "published"
	| "rejected";
export type ReviewDecision = "comment" | "approve" | "request-changes";
export type ReviewLedgerState =
	| "pending"
	| "applied"
	| "ambiguous"
	| "reconciled"
	| "failed";
export type ReviewInboxDisposition = "active" | "deferred" | "ignored";
export type ReviewDerivedState =
	| "needs-review"
	| "in-progress"
	| "awaiting-agent"
	| "awaiting-author"
	| "changed-since-review"
	| "conflicts"
	| "checks-failing"
	| "approved-blocked"
	| "ready-to-merge"
	| "closed";
export type ReviewFileStatus =
	| "added"
	| "modified"
	| "deleted"
	| "renamed"
	| "copied"
	| "type-changed"
	| "unmerged"
	| "submodule"
	| "binary";
export type ReviewLineKind =
	| "context"
	| "addition"
	| "deletion"
	| "no-newline-marker";
export type ReviewSide = "old" | "new" | "file";

// parallel-type-allowed: swarm ports are published before codegen; generated pb types replace these at integration.
export type ReviewStackMemberTarget = {
	readonly memberId: string;
	readonly provider?: "github";
	readonly host?: string;
	readonly repository?: string;
	readonly number?: number;
	readonly baseCommitOid: string;
	readonly headCommitOid: string;
	readonly mergeBaseOid: string;
};

export type ReviewTarget =
	| {
			readonly kind: "working-tree";
			readonly repositoryId: string;
			readonly repositoryRoot: string;
			readonly baseCommitOid: string;
			readonly indexTreeOid: string;
			readonly worktreeManifestHash: string;
	  }
	| {
			readonly kind: "index";
			readonly repositoryId: string;
			readonly repositoryRoot: string;
			readonly baseCommitOid: string;
			readonly indexTreeOid: string;
	  }
	| {
			readonly kind: "commit";
			readonly repositoryId: string;
			readonly repositoryRoot: string;
			readonly parentCommitOid: string;
			readonly commitOid: string;
			readonly stablePatchEvidence?: string;
	  }
	| {
			readonly kind: "range";
			readonly repositoryId: string;
			readonly repositoryRoot: string;
			readonly requestedBaseRef: string;
			readonly requestedHeadRef: string;
			readonly mergeBaseOid: string;
			readonly baseCommitOid: string;
			readonly headCommitOid: string;
	  }
	| {
			readonly kind: "pull-request";
			readonly provider: "github";
			readonly host: string;
			readonly repository: string;
			readonly number: number;
			readonly baseRef: string;
			readonly headRef: string;
			readonly mergeBaseOid: string;
			readonly baseCommitOid: string;
			readonly headCommitOid: string;
			readonly providerNodeId?: string;
	  }
	| {
			readonly kind: "stack";
			readonly stackId: string;
			readonly repositoryId: string;
			readonly members: readonly ReviewStackMemberTarget[];
			readonly aggregateBaseOid: string;
			readonly aggregateHeadOid: string;
	  };

export interface ReviewGeneration {
	readonly id: string;
	readonly reviewId: string;
	readonly ordinal: number;
	readonly target: ReviewTarget;
	readonly createdAt: string;
	readonly createdBy: string;
	readonly manifestHash: string;
	readonly diffOptionsHash: string;
	readonly providerSnapshotHash?: string;
	readonly predecessorGenerationId?: string;
}

export interface ReviewFileSummary {
	readonly fileId: string;
	readonly pathBefore?: string;
	readonly pathAfter?: string;
	readonly status: ReviewFileStatus;
	readonly oldBlobOid?: string;
	readonly newBlobOid?: string;
	readonly oldContentHash?: string;
	readonly newContentHash?: string;
	readonly oldMode?: string;
	readonly newMode?: string;
	readonly additions?: number;
	readonly deletions?: number;
	readonly generatedHint?: boolean;
	readonly dependencyHint?: boolean;
	readonly binary: boolean;
	readonly tooLargeForInline: boolean;
	readonly hunkCount?: number;
}

export interface ReviewPageMetadata {
	readonly cursor?: string;
	readonly nextCursor?: string;
	readonly limit: number;
	readonly truncated: boolean;
}

export interface ReviewDiffManifest {
	readonly generationId: string;
	readonly manifestHash: string;
	readonly files: readonly ReviewFileSummary[];
	readonly totalFiles: number;
	readonly totalAdditions: number;
	readonly totalDeletions: number;
	readonly binaryFiles: number;
	readonly pages: ReviewPageMetadata;
}

export interface ReviewDiffLine {
	readonly lineId: string;
	readonly kind: ReviewLineKind;
	readonly oldLine?: number;
	readonly newLine?: number;
	readonly rawTextHash: string;
	readonly displayText: string;
}

export interface ReviewHunk {
	readonly hunkId: string;
	readonly header: string;
	readonly oldStart: number;
	readonly oldCount: number;
	readonly newStart: number;
	readonly newCount: number;
	readonly fingerprint: string;
	readonly lines: readonly ReviewDiffLine[];
}

export interface ReviewDiffChunk {
	readonly generationId: string;
	readonly fileId: string;
	readonly chunkId: string;
	readonly hunks: readonly ReviewHunk[];
	readonly nextCursor?: string;
}

export interface ReviewAnchor {
	readonly anchorId: string;
	readonly generationId: string;
	readonly fileId: string;
	readonly pathBefore?: string;
	readonly pathAfter?: string;
	readonly baseBlobOid?: string;
	readonly headBlobOid?: string;
	readonly baseContentHash?: string;
	readonly headContentHash?: string;
	readonly side: ReviewSide;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly hunkId?: string;
	readonly hunkFingerprint?: string;
	readonly selectedContentHash?: string;
	readonly contextBeforeHashes: readonly string[];
	readonly contextAfterHashes: readonly string[];
}

export interface ReanchorCandidate {
	readonly anchor: ReviewAnchor;
	readonly reason: string;
}

export type ReanchorOutcome =
	| {
			readonly kind: "exact";
			readonly newAnchor: ReviewAnchor;
			readonly method: "same-generation" | "same-blob" | "rename-same-blob";
			readonly confidence: 1;
			readonly evidence: readonly string[];
	  }
	| {
			readonly kind: "unique-context";
			readonly newAnchor: ReviewAnchor;
			readonly method: "selected-content-and-context" | "unique-hunk";
			readonly confidence: number;
			readonly evidence: readonly string[];
	  }
	| {
			readonly kind: "stale";
			readonly reason: "content-changed" | "deleted" | "no-match";
			readonly candidates: readonly ReanchorCandidate[];
			readonly evidence: readonly string[];
	  }
	| {
			readonly kind: "ambiguous";
			readonly reason: "multiple-matches" | "fuzzy-below-threshold";
			readonly candidates: readonly ReanchorCandidate[];
			readonly evidence: readonly string[];
	  };

export type ReviewCoverageUnit =
	| {
			readonly kind: "file";
			readonly fileId: string;
			readonly contentIdentity: string;
	  }
	| {
			readonly kind: "hunk";
			readonly fileId: string;
			readonly hunkId: string;
			readonly contentIdentity: string;
	  }
	| {
			readonly kind: "commit";
			readonly stableChangeId: string;
			readonly contentIdentity: string;
	  };

export interface ReviewCoverageRecord {
	readonly coverageId: string;
	readonly reviewId: string;
	readonly actorId: string;
	readonly actorKind: ReviewActorKind;
	readonly generationId: string;
	readonly unit: ReviewCoverageUnit;
	readonly state: "reviewed" | "stale" | "excluded";
	readonly exclusionReason?: string;
	readonly reviewedAt?: string;
	readonly invalidatedAt?: string;
	readonly invalidationEvidence?: readonly string[];
}

export interface ReviewProviderThreadIdentity {
	readonly provider: "github";
	readonly threadId: string;
	readonly nodeId?: string;
	readonly reviewCommentId?: string;
}

export interface ReviewThread {
	readonly threadId: string;
	readonly reviewId: string;
	readonly origin: ReviewThreadOrigin;
	readonly visibility: ReviewVisibility;
	readonly anchor?: ReviewAnchor;
	readonly resolution: ReviewResolution;
	readonly anchorHealth: ReviewAnchorHealth;
	readonly provider?: ReviewProviderThreadIdentity;
	readonly messageIds: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ReviewMessage {
	readonly messageId: string;
	readonly threadId: string;
	readonly authorId: string;
	readonly authorKind: ReviewActorKind;
	readonly origin: "local" | "github";
	readonly bodyHash: string;
	readonly createdAt: string;
	readonly editedAt?: string;
	readonly editRevision: number;
	readonly providerCommentId?: string;
	readonly providerNodeId?: string;
	readonly replyToMessageId?: string;
	readonly publicationState: ReviewPublicationState;
}

export interface PreparedInlineComment {
	readonly messageId: string;
	readonly threadId: string;
	readonly path: string;
	readonly side: ReviewSide;
	readonly startLine?: number;
	readonly line?: number;
	readonly bodyHash: string;
	readonly body: string;
	readonly suggestionHash?: string;
}

export type ReviewThreadOperation =
	| {
			readonly kind: "reply";
			readonly threadId: string;
			readonly messageId: string;
	  }
	| { readonly kind: "resolve" | "unresolve"; readonly threadId: string };

export interface PendingReview {
	readonly pendingReviewId: string;
	readonly reviewId: string;
	readonly generationId: string;
	readonly expectedProviderHeadOid?: string;
	readonly decision: ReviewDecision;
	readonly summaryBodyHash: string;
	readonly selectedMessageIds: readonly string[];
	readonly selectedThreadOperations: readonly ReviewThreadOperation[];
	readonly orderedInlineComments: readonly PreparedInlineComment[];
	readonly preparedBy: string;
	readonly preparedAt: string;
	readonly effectDigest: string;
}

export interface ReviewSubmission {
	readonly submissionId: string;
	readonly pendingReviewId: string;
	readonly commandId: string;
	readonly effectDigest: string;
	readonly provider: "github";
	readonly state: ReviewLedgerState;
	readonly providerReviewId?: string;
	readonly providerReviewNodeId?: string;
	readonly providerHeadOid: string;
	readonly receiptHash?: string;
	readonly failureCode?: string;
}

export interface ReviewProgressSummary {
	readonly reviewedFiles: number;
	readonly totalFiles: number;
	readonly reviewedHunks: number;
	readonly totalHunks: number;
	readonly staleUnits: number;
	readonly excludedUnits: number;
}

export interface ReviewStackSummary {
	readonly stackId: string;
	readonly memberCount: number;
	readonly blockedBy?: string;
}

export interface ReviewInboxItem {
	readonly itemId: string;
	readonly reviewId: string;
	readonly targetLabel: string;
	readonly manualDisposition: ReviewInboxDisposition;
	readonly derivedState: ReviewDerivedState;
	readonly attentionReasons: readonly string[];
	readonly progress: ReviewProgressSummary;
	readonly stack?: ReviewStackSummary;
	readonly lastUpdatedAt: string;
}

// parallel-type-allowed: swarm ports are published before codegen; generated pb types replace these at integration.
export interface ReviewCommandEnvelope {
	readonly schemaVersion: typeof REVIEW_COMMAND_SCHEMA;
	readonly commandId: string;
	readonly actorId: string;
	readonly reviewId: string;
	readonly expectedRevision: bigint;
	readonly command: ReviewCommand;
}

export type ReviewCommand =
	| {
			readonly kind: "start-review";
			readonly sessionId?: string;
			readonly target: ReviewTarget;
	  }
	| { readonly kind: "refresh-review" }
	| {
			readonly kind: "mark-coverage";
			readonly generationId: string;
			readonly unit: ReviewCoverageUnit;
			readonly state: "reviewed" | "excluded";
			readonly exclusionReason?: string;
	  }
	| {
			readonly kind: "create-thread";
			readonly anchor?: ReviewAnchor;
			readonly body: string;
			readonly visibility: ReviewVisibility;
	  }
	| {
			readonly kind: "add-message";
			readonly threadId: string;
			readonly body: string;
	  }
	| {
			readonly kind: "edit-draft-message";
			readonly messageId: string;
			readonly body: string;
	  }
	| { readonly kind: "delete-draft-message"; readonly messageId: string }
	| {
			readonly kind: "route-thread-to-agent";
			readonly threadId: string;
			readonly agentId: string;
	  }
	| { readonly kind: "resolve-thread"; readonly threadId: string }
	| { readonly kind: "unresolve-thread"; readonly threadId: string }
	| {
			readonly kind: "prepare-submission";
			readonly decision: ReviewDecision;
			readonly summaryBody: string;
			readonly selectedMessageIds: readonly string[];
			readonly selectedThreadOperations: readonly ReviewThreadOperation[];
	  }
	| {
			readonly kind: "publish-submission";
			readonly pendingReviewId: string;
			readonly approvalDigest: string;
	  }
	| {
			readonly kind: "apply-suggestion";
			readonly messageId: string;
			readonly approvalDigest: string;
	  }
	| {
			readonly kind: "stage-selection" | "unstage-selection";
			readonly generationId: string;
			readonly fileId: string;
			readonly hunkId?: string;
			readonly startLine?: number;
			readonly endLine?: number;
			readonly approvalDigest: string;
	  }
	| {
			readonly kind: "set-inbox-disposition";
			readonly disposition: ReviewInboxDisposition;
	  }
	| { readonly kind: "close-review" };

// parallel-type-allowed: swarm ports are published before codegen; generated pb types replace these at integration.
export interface ReviewSnapshot {
	readonly schemaVersion: typeof REVIEW_SNAPSHOT_SCHEMA;
	readonly reviewId: string;
	readonly revision: bigint;
	readonly sessionId?: string;
	readonly currentGenerationId?: string;
	readonly target?: ReviewTarget;
	readonly threadIds: readonly string[];
	readonly coverageIds: readonly string[];
	readonly pendingReviewId?: string;
	readonly inboxDisposition: ReviewInboxDisposition;
	readonly closed: boolean;
	readonly updatedAt: string;
}

export interface ReviewCommandResult {
	readonly reviewId: string;
	readonly revision: bigint;
	readonly snapshot: ReviewSnapshot;
	readonly replayed: boolean;
}

export type ReviewExactEffectOperation =
	| "publish-review"
	| "reply-review-thread"
	| "resolve-review-thread"
	| "unresolve-review-thread"
	| "apply-review-suggestion"
	| "stage-review-selection"
	| "unstage-review-selection";

export interface ReviewExactEffect {
	readonly operation: ReviewExactEffectOperation;
	readonly schemaVersion: "hobo.code.review-effect/v1";
	readonly commandId: string;
	readonly actorId: string;
	readonly sessionId?: string;
	readonly reviewId: string;
	readonly expectedRevision: bigint;
	readonly digest: string;
	readonly details: Readonly<Record<string, string>>;
}

export interface ReviewContentStore {
	put(bytes: Uint8Array): Promise<string>;
	get(hash: string): Promise<Uint8Array>;
	has(hash: string): Promise<boolean>;
}

export interface ReviewDiffSource {
	resolveTarget(input: ReviewTarget): Promise<ReviewTarget>;
	createGeneration(input: {
		readonly reviewId: string;
		readonly actorId: string;
		readonly target: ReviewTarget;
		readonly predecessorGenerationId?: string;
	}): Promise<ReviewGeneration>;
	loadManifest(
		generationId: string,
		cursor?: string,
	): Promise<ReviewDiffManifest>;
	loadChunk(
		generationId: string,
		fileId: string,
		cursor?: string,
	): Promise<ReviewDiffChunk>;
	cancel(generationId: string): void;
}

export interface ReviewReanchorEngine {
	reanchor(
		anchor: ReviewAnchor,
		generation: ReviewGeneration,
	): Promise<ReanchorOutcome>;
	invalidateCoverage(
		records: readonly ReviewCoverageRecord[],
		generation: ReviewGeneration,
	): Promise<readonly ReviewCoverageRecord[]>;
}

export interface ReviewRuntime {
	execute(command: ReviewCommandEnvelope): Promise<ReviewCommandResult>;
	load(reviewId: string): Promise<ReviewSnapshot>;
	list(input?: {
		readonly sessionId?: string;
	}): Promise<readonly ReviewSnapshot[]>;
}

export interface ReviewProviderCapabilities {
	readonly kind: "github";
	readonly host: string;
	readonly lineComments: boolean;
	readonly rangeComments: boolean;
	readonly fileComments: boolean;
	readonly reviewComments: boolean;
	readonly pendingReviews: boolean;
	readonly decisions: readonly ReviewDecision[];
	readonly threadReplies: boolean;
	readonly threadResolution: boolean;
	readonly importExisting: boolean;
	readonly outdatedMetadata: boolean;
	readonly enterprise: boolean;
	readonly actorMayApprove: boolean;
	readonly fingerprint: string;
}

export interface ReviewProvider {
	readonly kind: "github";
	detectRepository(input: { readonly remoteUrl: string }): Promise<{
		readonly host: string;
		readonly repository: string;
	}>;
	resolvePullRequest(input: {
		readonly host: string;
		readonly repository: string;
		readonly number: number;
	}): Promise<Extract<ReviewTarget, { kind: "pull-request" }>>;
	fetchPullRequestThreads(input: {
		readonly target: Extract<ReviewTarget, { kind: "pull-request" }>;
	}): Promise<readonly ReviewThread[]>;
	fetchPullRequestReviews(input: {
		readonly target: Extract<ReviewTarget, { kind: "pull-request" }>;
	}): Promise<readonly ReviewSubmission[]>;
	submitReview(input: {
		readonly pending: PendingReview;
		readonly target: Extract<ReviewTarget, { kind: "pull-request" }>;
		readonly correlationMarker: string;
	}): Promise<{
		readonly providerReviewId: string;
		readonly receiptHash: string;
	}>;
	replyToThread(input: {
		readonly thread: ReviewThread;
		readonly body: string;
		readonly correlationMarker: string;
	}): Promise<{ readonly providerCommentId: string }>;
	resolveThread(input: { readonly thread: ReviewThread }): Promise<void>;
	unresolveThread(input: { readonly thread: ReviewThread }): Promise<void>;
	reconcile(input: {
		readonly commandId: string;
		readonly digest: string;
		readonly operation: ReviewExactEffectOperation;
	}): Promise<{ readonly matches: number; readonly receiptHash?: string }>;
	capabilities(input: {
		readonly target: Extract<ReviewTarget, { kind: "pull-request" }>;
		readonly actorId: string;
	}): Promise<ReviewProviderCapabilities>;
}

export interface ReviewAgentTransport {
	listEligibleAgents(input: {
		readonly sessionId: string;
	}): Promise<readonly { readonly agentId: string; readonly label: string }[]>;
	deliverReviewRequest(input: {
		readonly requestId: string;
		readonly sessionId: string;
		readonly agentId: string;
		readonly reviewId: string;
		readonly generationId: string;
		readonly threadId: string;
		readonly context: string;
	}): Promise<{ readonly deliveryId: string }>;
	cancelReviewRequest(input: { readonly requestId: string }): Promise<void>;
}

export interface ReviewPatchExecutor {
	simulate(input: {
		readonly repositoryRoot: string;
		readonly generationId: string;
		readonly fileId: string;
		readonly hunkId?: string;
		readonly startLine?: number;
		readonly endLine?: number;
		readonly direction: "stage" | "unstage" | "suggestion";
		readonly suggestionBody?: string;
	}): Promise<{
		readonly preIndexTreeOid: string;
		readonly postIndexTreeOid: string;
		readonly patchHash: string;
		readonly preimageHash: string;
	}>;
	apply(input: {
		readonly repositoryRoot: string;
		readonly approvalDigest: string;
		readonly expectedPostIndexTreeOid: string;
		readonly patchHash: string;
	}): Promise<{ readonly resultTreeOid: string }>;
}

export interface ReviewTypedErrorShape {
	readonly code: ReviewErrorCode;
	readonly message: string;
	readonly details?: Readonly<Record<string, string | number | boolean>>;
}
