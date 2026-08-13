import { createHash, randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import {
	OptimisticSequenceConflictError,
	createRuntimeLocalEventStore,
} from "@hobo/runtime-local";

import {
	ReviewActorKind,
	ReviewAnchorHealth,
	ReviewAnchorSide,
	type AddReviewMessageCommand,
	type DeleteDraftReviewMessageCommand,
	type EditDraftReviewMessageCommand,
	type ReviewCommandEnvelope,
	type ReviewCommandResult,
	type ResolveReviewThreadCommand,
	type RouteReviewThreadToAgentCommand,
	type StageReviewSelectionCommand,
	ReviewCommandResultSchema,
	ReviewCoverageRecordSchema,
	ReviewGenerationSchema,
	ReviewMessageSchema,
	PendingReviewSchema,
	ReviewSubmissionSchema,
	ReviewThreadSchema,
	ReviewCoverageState,
	ReviewDecision,
	ReviewDerivedState,
	ReviewInboxDisposition,
	ReviewLifecycle,
	ReviewPublicationState,
	type ReviewSnapshot,
	ReviewSnapshotSchema,
	ReviewSubmissionState,
	ReviewTargetKind,
	ReviewThreadOrigin,
	ReviewThreadResolution,
	ReviewVisibility,
} from "../_generated/code_review_pb.js";
import type { SessionProcessRunner } from "../session-orchestrator.js";
import { sessionProcessRunner } from "../session-orchestrator.js";
import {
	gitOid,
	gitRepositoryId,
	gitWriteTree,
	loadReviewManifest,
	workingTreeManifestHash,
} from "./git-review-source.js";
import {
	REVIEW_COMMAND_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
	parseReviewCommand,
	parseReviewSnapshot,
	reviewSnapshotJson,
} from "./review-contract.js";
import { createReviewContentStore } from "./review-content-store.js";
import { REVIEW_ERROR, ReviewError } from "./review-errors.js";
import { parseUnifiedDiff } from "./unified-diff-parser.js";
import { coverageIdentity, reanchor } from "./review-anchors.js";
import { applyHunkPatch } from "./review-patch.js";
import {
	reviewEffectDigest,
	type ReviewProvider,
	createFakeGithubProvider,
} from "./github-review-provider.js";

export interface ReviewRuntimeOptions {
	readonly dataDir: string;
	readonly runner?: SessionProcessRunner;
	readonly provider?: ReviewProvider;
	readonly now?: () => string;
	readonly authorize?: (digest: string, operation: string) => boolean | Promise<boolean>;
}

export interface ReviewRuntime {
	execute(input: unknown): Promise<ReviewCommandResult>;
	load(reviewId: string): Promise<ReviewSnapshot | undefined>;
	inbox(): Promise<ReviewSnapshot[]>;
	close(): void;
}

function emptySnapshot(reviewId: string, now: string): ReviewSnapshot {
	return create(ReviewSnapshotSchema, {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId,
		revision: 0n,
		lifecycle: ReviewLifecycle.OPEN,
		createdAt: now,
		updatedAt: now,
		inboxDisposition: ReviewInboxDisposition.ACTIVE,
		coverage: [],
		threads: [],
		messages: [],
		generations: [],
	});
}

export function createReviewRuntime(options: ReviewRuntimeOptions): ReviewRuntime {
	const now = options.now ?? (() => new Date().toISOString());
	const runner = options.runner ?? sessionProcessRunner();
	const provider = options.provider ?? createFakeGithubProvider();
	const blobs = createReviewContentStore(options.dataDir);
	const store = createRuntimeLocalEventStore({
		dataDir: options.dataDir,
		clock: { now },
		partitionId: "hobo-code-reviews",
	});
	const seen = new Map<string, ReviewCommandResult>();

	function streamId(reviewId: string): string {
		return `code-review:${reviewId}`;
	}

	async function loadStored(reviewId: string): Promise<ReviewSnapshot | undefined> {
		const record = await store.loadSnapshot<unknown>(streamId(reviewId));
		let snapshot = record ? parseReviewSnapshot(record.state) : undefined;
		for await (const event of store.read(streamId(reviewId), (record?.seq ?? 0) + 1)) {
			const data = event.data as { snapshot?: unknown };
			if (data.snapshot) snapshot = parseReviewSnapshot(data.snapshot);
		}
		return snapshot;
	}

	async function persist(snapshot: ReviewSnapshot, type: string): Promise<void> {
		const revision = Number(snapshot.revision);
		await store.append(
			streamId(snapshot.reviewId),
			[{ type, data: { snapshot: reviewSnapshotJson(snapshot) } }],
			{
				expectedSeq: revision - 1,
				actor: { kind: "system", id: "hobo-code-review" },
				tenant: "local",
				correlationId: snapshot.reviewId,
			},
		);
		await store.snapshot(streamId(snapshot.reviewId), reviewSnapshotJson(snapshot), revision);
	}

	async function apply(command: ReviewCommandEnvelope): Promise<ReviewSnapshot> {
		function take<T>(name: NonNullable<ReviewCommandEnvelope["command"]["case"]>): T {
			if (command.command.case !== name || command.command.value === undefined) {
				throw new ReviewError(REVIEW_ERROR.MALFORMED, `expected ${name}`);
			}
			return command.command.value as T;
		}
		const prior = seen.get(command.commandId);
		if (prior?.snapshot) return prior.snapshot;
		const existing = await loadStored(command.reviewId);
		if (
			command.expectedRevision !== undefined &&
			existing &&
			existing.revision !== command.expectedRevision
		) {
			throw new ReviewError(REVIEW_ERROR.STALE_REVISION, "review revision moved", {
				expected: String(command.expectedRevision),
				found: String(existing.revision),
			});
		}
		let snapshot = existing ?? emptySnapshot(command.reviewId, now());
		const stamp = now();
		const nextRevision = snapshot.revision + 1n;
		const caseName = command.command.case;
		if (command.command.case === "startReview") {
			const requested = command.command.value.target;
			if (!requested) {
				throw new ReviewError(REVIEW_ERROR.MALFORMED, "startReview.target is required");
			}
			const root = requested.repositoryRoot;
			const repoId = requested.repositoryId || (await gitRepositoryId(runner, root));
			const head = requested.headCommitOid || (await gitOid(runner, root, "HEAD"));
			const base =
				requested.baseCommitOid ||
				(requested.kind === ReviewTargetKind.COMMIT
					? requested.parentCommitOid || `${head}^`
					: requested.kind === ReviewTargetKind.INDEX
						? head
						: `${head}`);
			const resolvedBase =
				requested.kind === ReviewTargetKind.WORKING_TREE ||
				requested.kind === ReviewTargetKind.INDEX
					? head
					: await gitOid(runner, root, base);
			const resolvedHead =
				requested.kind === ReviewTargetKind.INDEX
					? await gitWriteTree(runner, root)
					: requested.kind === ReviewTargetKind.WORKING_TREE
						? head
						: requested.headCommitOid
							? await gitOid(runner, root, requested.headCommitOid)
							: head;
			const generationId = randomUUID();
			const { manifest, patches } = await loadReviewManifest(
				runner,
				root,
				generationId,
				requested.kind === ReviewTargetKind.INDEX ? head : resolvedBase,
				requested.kind === ReviewTargetKind.INDEX ? resolvedHead : resolvedHead,
			);
			if (requested.kind === ReviewTargetKind.WORKING_TREE) {
				requested.worktreeManifestHash = await workingTreeManifestHash(runner, root);
				requested.indexTreeOid = await gitWriteTree(runner, root);
			}
			requested.repositoryId = repoId;
			requested.baseCommitOid = resolvedBase;
			requested.headCommitOid = resolvedHead;
			for (const [fileId, patch] of patches) {
				blobs.put(patch);
				void fileId;
			}
			snapshot = create(ReviewSnapshotSchema, {
				schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
				reviewId: command.reviewId,
				revision: 0n,
				lifecycle: ReviewLifecycle.OPEN,
				sessionId: command.command.value.sessionId,
				actorId: command.actorId,
				target: requested,
				currentGenerationId: generationId,
				generations: [
					create(ReviewGenerationSchema, {
						id: generationId,
						reviewId: command.reviewId,
						ordinal: 1,
						target: requested,
						createdAt: stamp,
						createdBy: command.actorId,
						manifestHash: manifest.manifestHash,
						diffOptionsHash: hashOptions(requested.kind),
					}),
				],
				manifest,
				createdAt: stamp,
				updatedAt: stamp,
				inboxDisposition: ReviewInboxDisposition.ACTIVE,
			});
		} else if (!existing) {
			throw new ReviewError(REVIEW_ERROR.NOT_FOUND, `review ${command.reviewId} does not exist`);
		} else if (command.command.case === "refreshReview") {
			const root = snapshot.target?.repositoryRoot ?? "";
			const generationId = randomUUID();
			const base = snapshot.target?.baseCommitOid || "HEAD";
			const head = snapshot.target?.headCommitOid || "HEAD";
			const { manifest, patches } = await loadReviewManifest(runner, root, generationId, base, head);
			for (const patch of patches.values()) blobs.put(patch);
			const predecessor = snapshot.currentGenerationId;
			for (const record of snapshot.coverage) {
				if (record.state === ReviewCoverageState.REVIEWED) {
					const file = manifest.files.find((item) => item.fileId === record.unit?.fileId);
					if (!file || file.newContentHash !== record.unit?.contentIdentity) {
						record.state = ReviewCoverageState.STALE;
						record.invalidatedAt = stamp;
						record.invalidationEvidence = ["content-changed"];
					}
				}
			}
			for (const thread of snapshot.threads) {
				const anchor = thread.anchor;
				if (!anchor) continue;
				const file = manifest.files.find((item) => item.fileId === anchor.fileId);
				const patch = file ? (patches.get(file.fileId) ?? "") : "";
				const outcome = reanchor(
					anchor,
					parseUnifiedDiff(patch),
					generationId,
					anchor.fileId,
				);
				if (outcome.kind === "exact" || outcome.kind === "unique-context") {
					thread.anchor = outcome.newAnchor;
					thread.anchorHealth = ReviewAnchorHealth.REANCHORED;
				} else if (outcome.kind === "ambiguous") {
					thread.anchorHealth = ReviewAnchorHealth.AMBIGUOUS;
				} else {
					thread.anchorHealth = ReviewAnchorHealth.STALE;
				}
			}
			snapshot.generations.push(
				create(ReviewGenerationSchema, {
					id: generationId,
					reviewId: snapshot.reviewId,
					ordinal: snapshot.generations.length + 1,
					target: snapshot.target,
					createdAt: stamp,
					createdBy: command.actorId,
					manifestHash: manifest.manifestHash,
					diffOptionsHash: hashOptions(snapshot.target?.kind ?? 0),
					predecessorGenerationId: predecessor,
				}),
			);
			snapshot.currentGenerationId = generationId;
			snapshot.manifest = manifest;
		} else if (command.command.case === "markReviewCoverage") {
			const unit = command.command.value.unit;
			snapshot.coverage.push(
				create(ReviewCoverageRecordSchema, {
					coverageId: randomUUID(),
					reviewId: snapshot.reviewId,
					actorId: command.actorId,
					actorKind: ReviewActorKind.HUMAN,
					generationId: snapshot.currentGenerationId,
					unit: unit ?? { kind: "file", fileId: "", hunkId: "", stableChangeId: "", contentIdentity: "" },
					state: command.command.value.state || ReviewCoverageState.REVIEWED,
					exclusionReason: command.command.value.exclusionReason,
					reviewedAt: stamp,
				}),
			);
		} else if (command.command.case === "createReviewThread") {
			const threadId = randomUUID();
			const messageId = randomUUID();
			const body = command.command.value.body;
			const bodyHash = createHash("sha256").update(body).digest("hex");
			blobs.put(body);
			snapshot.threads.push(
				create(ReviewThreadSchema, {
					threadId,
					reviewId: snapshot.reviewId,
					origin: command.command.value.origin || ReviewThreadOrigin.LOCAL_HUMAN,
					visibility: command.command.value.visibility || ReviewVisibility.PRIVATE,
					anchor: command.command.value.anchor ?? {
						anchorId: randomUUID(),
						generationId: snapshot.currentGenerationId,
						fileId: "",
						side: ReviewAnchorSide.NEW,
					},
					resolution: ReviewThreadResolution.OPEN,
					anchorHealth: ReviewAnchorHealth.CURRENT,
					messageIds: [messageId],
					createdAt: stamp,
					updatedAt: stamp,
				}),
			);
			snapshot.messages.push(
				create(ReviewMessageSchema, {
					messageId,
					threadId,
					authorId: command.actorId,
					authorKind: ReviewActorKind.HUMAN,
					origin: "local",
					bodyHash,
					body,
					createdAt: stamp,
					editRevision: 1,
					publicationState: ReviewPublicationState.PRIVATE,
				}),
			);
		} else if (command.command.case === "addReviewMessage") {
			const value = take<AddReviewMessageCommand>("addReviewMessage");
			const thread = snapshot.threads.find((item) => item.threadId === value.threadId);
			if (!thread) throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "thread not found");
			const messageId = randomUUID();
			const body = value.body;
			const bodyHash = createHash("sha256").update(body).digest("hex");
			blobs.put(body);
			thread.messageIds.push(messageId);
			thread.updatedAt = stamp;
			snapshot.messages.push(
				create(ReviewMessageSchema, {
					messageId,
					threadId: thread.threadId,
					authorId: command.actorId,
					authorKind: ReviewActorKind.HUMAN,
					origin: "local",
					bodyHash,
					body,
					createdAt: stamp,
					editRevision: 1,
					replyToMessageId: value.replyToMessageId,
					publicationState: ReviewPublicationState.PRIVATE,
				}),
			);
		} else if (command.command.case === "editDraftReviewMessage") {
			const value = take<EditDraftReviewMessageCommand>("editDraftReviewMessage");
			const message = snapshot.messages.find((item) => item.messageId === value.messageId);
			if (!message) throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "message not found");
			if (message.publicationState === ReviewPublicationState.PUBLISHED) {
				throw new ReviewError(REVIEW_ERROR.UNSUPPORTED, "published messages are immutable");
			}
			message.body = value.body;
			message.bodyHash = createHash("sha256").update(message.body).digest("hex");
			message.editedAt = stamp;
			message.editRevision += 1;
		} else if (command.command.case === "deleteDraftReviewMessage") {
			const value = take<DeleteDraftReviewMessageCommand>("deleteDraftReviewMessage");
			const message = snapshot.messages.find((item) => item.messageId === value.messageId);
			if (!message) throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "message not found");
			if (message.publicationState === ReviewPublicationState.PUBLISHED) {
				throw new ReviewError(REVIEW_ERROR.UNSUPPORTED, "published messages are immutable");
			}
			snapshot.messages = snapshot.messages.filter((item) => item.messageId !== message.messageId);
			for (const thread of snapshot.threads) {
				thread.messageIds = thread.messageIds.filter((id) => id !== message.messageId);
			}
		} else if (
			command.command.case === "resolveReviewThread" ||
			command.command.case === "unresolveReviewThread"
		) {
			const threadId = take<ResolveReviewThreadCommand>(
				command.command.case === "resolveReviewThread"
					? "resolveReviewThread"
					: "unresolveReviewThread",
			).threadId;
			const thread = snapshot.threads.find((item) => item.threadId === threadId);
			if (!thread) throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "thread not found");
			thread.resolution =
				caseName === "resolveReviewThread"
					? ReviewThreadResolution.RESOLVED
					: ReviewThreadResolution.OPEN;
			thread.updatedAt = stamp;
		} else if (command.command.case === "routeReviewThreadToAgent") {
			const value = take<RouteReviewThreadToAgentCommand>("routeReviewThreadToAgent");
			const thread = snapshot.threads.find((item) => item.threadId === value.threadId);
			if (!thread) throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "thread not found");
			const messageId = randomUUID();
			const body = `routed to agent ${value.agentId}: ${value.prompt}`;
			snapshot.messages.push(
				create(ReviewMessageSchema, {
					messageId,
					threadId: thread.threadId,
					authorId: command.command.value.agentId,
					authorKind: ReviewActorKind.AGENT,
					origin: "local",
					bodyHash: createHash("sha256").update(body).digest("hex"),
					body,
					createdAt: stamp,
					editRevision: 1,
					publicationState: ReviewPublicationState.PRIVATE,
				}),
			);
			thread.messageIds.push(messageId);
			thread.updatedAt = stamp;
		} else if (command.command.case === "prepareReviewSubmission") {
			const selected = command.command.value.selectedMessageIds;
			for (const id of selected) {
				const message = snapshot.messages.find((item) => item.messageId === id);
				if (message) message.publicationState = ReviewPublicationState.SELECTED_FOR_PUBLICATION;
			}
			const summary = command.command.value.summaryBody;
			const digest = reviewEffectDigest({
				operation: "publish-review",
				reviewId: snapshot.reviewId,
				generationId: snapshot.currentGenerationId,
				decision: String(command.command.value.decision),
				summary,
				messageIds: selected,
				headOid: snapshot.target?.headCommitOid ?? "",
			});
			snapshot.pending = create(PendingReviewSchema, {
				pendingReviewId: randomUUID(),
				reviewId: snapshot.reviewId,
				generationId: snapshot.currentGenerationId,
				expectedProviderHeadOid: snapshot.target?.headCommitOid ?? "",
				decision: command.command.value.decision || ReviewDecision.COMMENT,
				summaryBodyHash: createHash("sha256").update(summary).digest("hex"),
				summaryBody: summary,
				selectedMessageIds: selected,
				selectedThreadOperations: [],
				orderedInlineComments: selected.map((id) => ({
					messageId: id,
					anchor: snapshot.threads.find((thread) => thread.messageIds.includes(id))?.anchor,
					bodyHash: snapshot.messages.find((item) => item.messageId === id)?.bodyHash ?? "",
				})),
				preparedBy: command.actorId,
				preparedAt: stamp,
				effectDigest: digest,
			});
		} else if (command.command.case === "publishReviewSubmission") {
			const pending = snapshot.pending;
			if (!pending || pending.pendingReviewId !== command.command.value.pendingReviewId) {
				throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "pending review not found");
			}
			const authorized = await options.authorize?.(
				command.command.value.authorizationDigest || pending.effectDigest,
				"publish-review",
			);
			if (!authorized) {
				throw new ReviewError(REVIEW_ERROR.APPROVAL_REQUIRED, "publish requires exact-effect approval", {
					effectDigest: pending.effectDigest,
				});
			}
			if (
				command.command.value.authorizationDigest &&
				command.command.value.authorizationDigest !== pending.effectDigest
			) {
				throw new ReviewError(REVIEW_ERROR.APPROVAL_MISMATCH, "approval digest does not match pending review");
			}
			const liveHead = snapshot.target?.repositoryRoot
				? await gitOid(runner, snapshot.target.repositoryRoot, snapshot.target.headRef || "HEAD")
				: snapshot.target?.headCommitOid;
			if (pending.expectedProviderHeadOid && liveHead !== pending.expectedProviderHeadOid) {
				throw new ReviewError(REVIEW_ERROR.PROVIDER_DRIFT, "target HEAD changed after approval");
			}
			const published = await provider.submitReview({
				snapshot,
				pending,
				commandId: command.commandId,
			});
			snapshot.submission = create(ReviewSubmissionSchema, {
				submissionId: published.submissionId,
				pendingReviewId: pending.pendingReviewId,
				commandId: command.commandId,
				effectDigest: pending.effectDigest,
				provider: "github",
				state: published.state,
				providerReviewId: published.providerReviewId,
				providerHeadOid: pending.expectedProviderHeadOid ?? "",
				receiptHash: published.receiptHash,
			});
			for (const id of pending.selectedMessageIds) {
				const message = snapshot.messages.find((item) => item.messageId === id);
				if (message) message.publicationState = ReviewPublicationState.PUBLISHED;
			}
		} else if (
			command.command.case === "stageReviewSelection" ||
			command.command.case === "unstageReviewSelection"
		) {
			const value = take<StageReviewSelectionCommand>(
				command.command.case === "stageReviewSelection"
					? "stageReviewSelection"
					: "unstageReviewSelection",
			);
			const digest = reviewEffectDigest({
				operation: caseName,
				reviewId: snapshot.reviewId,
				fileId: value.fileId,
				hunkId: value.hunkId,
				headOid: snapshot.target?.indexTreeOid ?? "",
			});
			const authorized = await options.authorize?.(
				value.authorizationDigest || digest,
				caseName ?? "stageReviewSelection",
			);
			if (!authorized) {
				throw new ReviewError(REVIEW_ERROR.APPROVAL_REQUIRED, "patch requires exact-effect approval", {
					effectDigest: digest,
				});
			}
			const root = snapshot.target?.repositoryRoot ?? "";
			await applyHunkPatch(runner, root, {
				fileId: value.fileId,
				hunkId: value.hunkId || "",
				unstage: caseName === "unstageReviewSelection",
				files: snapshot.manifest?.files ?? [],
			});
		} else if (command.command.case === "applyReviewSuggestion") {
			const digest = reviewEffectDigest({
				operation: "apply-suggestion",
				reviewId: snapshot.reviewId,
				messageId: command.command.value.messageId,
			});
			const authorized = await options.authorize?.(
				command.command.value.authorizationDigest || digest,
				"apply-suggestion",
			);
			if (!authorized) {
				throw new ReviewError(REVIEW_ERROR.APPROVAL_REQUIRED, "suggestion requires exact-effect approval", {
					effectDigest: digest,
				});
			}
		} else if (command.command.case === "setReviewInboxDisposition") {
			snapshot.inboxDisposition = command.command.value.disposition;
		} else if (command.command.case === "closeReview") {
			snapshot.lifecycle = ReviewLifecycle.CLOSED;
		} else {
			throw new ReviewError(REVIEW_ERROR.UNSUPPORTED, `unsupported review command ${caseName}`);
		}
		snapshot.revision = nextRevision;
		snapshot.updatedAt = stamp;
		try {
			await persist(snapshot, eventType(caseName));
		} catch (error) {
			if (error instanceof OptimisticSequenceConflictError) {
				throw new ReviewError(REVIEW_ERROR.CONCURRENCY, "review stream conflict");
			}
			throw error;
		}
		return snapshot;
	}

	return {
		async execute(input: unknown) {
			const command = parseReviewCommand(input);
			const cached = seen.get(command.commandId);
			if (cached) return cached;
			try {
				const snapshot = await apply(command);
				const result = create(ReviewCommandResultSchema, {
					accepted: true,
					code: "HOBO_CODE_REVIEW",
					message: command.command.case ?? "ok",
					snapshot,
				});
				seen.set(command.commandId, result);
				return result;
			} catch (error) {
				if (error instanceof ReviewError) {
					const result = create(ReviewCommandResultSchema, {
						accepted: false,
						code: error.code,
						message: error.message,
					});
					if (error.code !== REVIEW_ERROR.STALE_REVISION) seen.set(command.commandId, result);
					return result;
				}
				throw error;
			}
		},
		load: loadStored,
		async inbox() {
			// Projection: scan known streams is avoided; callers persist review ids via list file.
			return [];
		},
		close() {
			store.close();
		},
	};
}

function hashOptions(kind: number): string {
	return `diff-v1:${kind}`;
}

function eventType(caseName: string | undefined): string {
	const map: Record<string, string> = {
		startReview: "code.ReviewStarted",
		refreshReview: "code.ReviewRefreshed",
		markReviewCoverage: "code.ReviewCoverageMarked",
		createReviewThread: "code.ReviewThreadCreated",
		addReviewMessage: "code.ReviewMessageAdded",
		editDraftReviewMessage: "code.ReviewDraftMessageEdited",
		deleteDraftReviewMessage: "code.ReviewDraftMessageDeleted",
		routeReviewThreadToAgent: "code.ReviewAgentRequestQueued",
		resolveReviewThread: "code.ReviewThreadResolved",
		unresolveReviewThread: "code.ReviewThreadUnresolved",
		prepareReviewSubmission: "code.PendingReviewPrepared",
		publishReviewSubmission: "code.ReviewPublicationApplied",
		applyReviewSuggestion: "code.ReviewSuggestionApplied",
		stageReviewSelection: "code.ReviewIndexPatchApplied",
		unstageReviewSelection: "code.ReviewIndexPatchApplied",
		setReviewInboxDisposition: "code.ReviewInboxDispositionChanged",
		closeReview: "code.ReviewClosed",
	};
	return map[caseName ?? ""] ?? "code.ReviewChanged";
}

export function inboxDerivedState(snapshot: ReviewSnapshot): ReviewDerivedState {
	if (snapshot.lifecycle === ReviewLifecycle.CLOSED) return ReviewDerivedState.CLOSED;
	if (snapshot.coverage.some((item) => item.state === ReviewCoverageState.STALE)) {
		return ReviewDerivedState.CHANGED_SINCE_REVIEW;
	}
	if (snapshot.threads.some((item) => item.resolution === ReviewThreadResolution.OPEN && item.origin === ReviewThreadOrigin.LOCAL_AGENT)) {
		return ReviewDerivedState.AWAITING_AGENT;
	}
	if (snapshot.coverage.some((item) => item.state === ReviewCoverageState.REVIEWED)) {
		return ReviewDerivedState.IN_PROGRESS;
	}
	return ReviewDerivedState.NEEDS_REVIEW;
}

export { coverageIdentity };
