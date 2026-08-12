// Exact-effect gate for forge/patch review mutations. Pending ledger is
// durable before any provider call; uncertain transport stays ambiguous.
import {
	assertReviewApprovalCurrent,
	assertReviewCapabilities,
	buildReviewExactEffect,
	ReviewApprovalRequiredError,
	type ReviewEffectFacts,
} from "./review-approval.js";
import {
	loadReviewDeliveryLedger,
	markReviewDeliveryLedger,
	persistReviewDeliveryPending,
	type ReviewDeliveryLedgerRecord,
	readReviewApproval,
	reviewSubmissionFromLedger,
	writeReviewApproval,
} from "./review-delivery-ledger.js";
import { reviewError } from "./review-errors.js";
import type {
	PendingReview,
	ReviewAnchor,
	ReviewCommandEnvelope,
	ReviewContentStore,
	ReviewExactEffect,
	ReviewExactEffectOperation,
	ReviewMessage,
	ReviewPatchExecutor,
	ReviewProvider,
	ReviewProviderCapabilities,
	ReviewRuntime,
	ReviewSnapshot,
	ReviewTarget,
	ReviewThread,
} from "./review-ports.js";
import {
	gatherReviewProviderEvidence,
	ledgerStatusForEvidence,
} from "./review-reconciliation.js";

export interface ReviewAggregateQuery {
	loadPending(pendingReviewId: string): Promise<PendingReview>;
	loadThread(threadId: string): Promise<ReviewThread>;
	loadMessage(messageId: string): Promise<ReviewMessage>;
	loadAnchors(reviewId: string): Promise<readonly ReviewAnchor[]>;
	loadSummaryBody(pendingReviewId: string): Promise<string>;
}

export interface ReviewEffectRequest {
	readonly operation: ReviewExactEffectOperation;
	readonly command: ReviewCommandEnvelope;
	readonly approvalDigest?: string;
	readonly threadId?: string;
	readonly messageId?: string;
	readonly body?: string;
	readonly pendingReviewId?: string;
	readonly generationId?: string;
	readonly fileId?: string;
	readonly hunkId?: string;
	readonly startLine?: number;
	readonly endLine?: number;
}

export interface ReviewMutationResult {
	readonly reviewId: string;
	readonly revision: bigint;
	readonly snapshot: ReviewSnapshot;
	readonly replayed: boolean;
	readonly effect: ReviewExactEffect;
	readonly ledger: ReviewDeliveryLedgerRecord;
	readonly submission?: ReturnType<typeof reviewSubmissionFromLedger>;
}

export interface ReviewOrchestratorOptions {
	readonly runtime: ReviewRuntime;
	readonly provider: ReviewProvider;
	readonly patchExecutor: ReviewPatchExecutor;
	readonly contentStore: ReviewContentStore;
	readonly query: ReviewAggregateQuery;
	readonly ledgerDir: string;
	readonly authorize?: (
		effect: ReviewExactEffect,
		snapshot: ReviewSnapshot,
	) => boolean | Promise<boolean>;
	readonly now?: () => string;
}

export interface ReviewOrchestrator {
	describe(
		input: ReviewCommandEnvelope | ReviewEffectRequest,
	): Promise<ReviewExactEffect>;
	execute(
		input: ReviewCommandEnvelope | ReviewEffectRequest,
	): Promise<ReviewMutationResult>;
}

function isEffectRequest(
	input: ReviewCommandEnvelope | ReviewEffectRequest,
): input is ReviewEffectRequest {
	return "operation" in input;
}

export function reviewEffectRequestFromCommand(
	command: ReviewCommandEnvelope,
): ReviewEffectRequest {
	const body = command.command;
	switch (body.kind) {
		case "publish-submission":
			return {
				operation: "publish-review",
				command,
				approvalDigest: body.approvalDigest,
				pendingReviewId: body.pendingReviewId,
			};
		case "apply-suggestion":
			return {
				operation: "apply-review-suggestion",
				command,
				approvalDigest: body.approvalDigest,
				messageId: body.messageId,
			};
		case "stage-selection":
			return {
				operation: "stage-review-selection",
				command,
				approvalDigest: body.approvalDigest,
				generationId: body.generationId,
				fileId: body.fileId,
				...(body.hunkId === undefined ? {} : { hunkId: body.hunkId }),
				...(body.startLine === undefined ? {} : { startLine: body.startLine }),
				...(body.endLine === undefined ? {} : { endLine: body.endLine }),
			};
		case "unstage-selection":
			return {
				operation: "unstage-review-selection",
				command,
				approvalDigest: body.approvalDigest,
				generationId: body.generationId,
				fileId: body.fileId,
				...(body.hunkId === undefined ? {} : { hunkId: body.hunkId }),
				...(body.startLine === undefined ? {} : { startLine: body.startLine }),
				...(body.endLine === undefined ? {} : { endLine: body.endLine }),
			};
		default:
			throw reviewError(
				"malformed-input",
				`command ${body.kind} is not an exact-effect mutation`,
			);
	}
}

function normalize(
	input: ReviewCommandEnvelope | ReviewEffectRequest,
): ReviewEffectRequest {
	return isEffectRequest(input) ? input : reviewEffectRequestFromCommand(input);
}

function pullRequestTarget(
	target: ReviewTarget | undefined,
): Extract<ReviewTarget, { kind: "pull-request" }> | undefined {
	return target?.kind === "pull-request" ? target : undefined;
}

function localRepositoryRoot(
	target: ReviewTarget | undefined,
): string | undefined {
	if (
		target &&
		(target.kind === "working-tree" ||
			target.kind === "index" ||
			target.kind === "commit" ||
			target.kind === "range")
	) {
		return target.repositoryRoot;
	}
	return undefined;
}

function requireLocalRepositoryRoot(target: ReviewTarget | undefined): string {
	const root = localRepositoryRoot(target);
	if (root === undefined) {
		throw reviewError(
			"unsupported-capability",
			"patch operations require a local repository root",
		);
	}
	return root;
}

function visibilityTransition(
	operation: ReviewExactEffectOperation,
	threads: readonly ReviewThread[],
): string {
	if (
		operation === "apply-review-suggestion" ||
		operation === "stage-review-selection" ||
		operation === "unstage-review-selection"
	)
		return "";
	const current = threads[0]?.visibility ?? "session";
	return `${current}->forge`;
}

function resultFrom(
	snapshot: ReviewSnapshot,
	effect: ReviewExactEffect,
	ledger: ReviewDeliveryLedgerRecord,
	replayed: boolean,
): ReviewMutationResult {
	const submission =
		effect.operation === "publish-review"
			? reviewSubmissionFromLedger(ledger, effect.details.expectedHeadOid ?? "")
			: undefined;
	return {
		reviewId: snapshot.reviewId,
		revision: snapshot.revision,
		snapshot,
		replayed,
		effect,
		ledger,
		...(submission === undefined ? {} : { submission }),
	};
}

export function createReviewOrchestrator(
	options: ReviewOrchestratorOptions,
): ReviewOrchestrator {
	const now = options.now ?? (() => new Date().toISOString());

	async function loadInvolvedThreads(
		request: ReviewEffectRequest,
		pending: PendingReview | undefined,
	): Promise<readonly ReviewThread[]> {
		const ids = new Set<string>();
		if (request.threadId !== undefined) ids.add(request.threadId);
		if (pending) {
			for (const operation of pending.selectedThreadOperations)
				ids.add(operation.threadId);
			for (const comment of pending.orderedInlineComments)
				ids.add(comment.threadId);
		}
		const threads: ReviewThread[] = [];
		for (const threadId of ids) {
			threads.push(await options.query.loadThread(threadId));
		}
		return threads;
	}

	async function currentWorld(request: ReviewEffectRequest): Promise<{
		readonly snapshot: ReviewSnapshot;
		readonly effect: ReviewExactEffect;
		readonly pending?: PendingReview;
		readonly target?: ReviewTarget;
		readonly capabilities?: ReviewProviderCapabilities;
		readonly threads: readonly ReviewThread[];
	}> {
		const snapshot = await options.runtime.load(request.command.reviewId);
		if (snapshot.revision !== request.command.expectedRevision) {
			throw reviewError(
				"stale-revision",
				"review aggregate revision changed before mutation",
				{
					expected: request.command.expectedRevision.toString(),
					actual: snapshot.revision.toString(),
				},
			);
		}
		const pendingReviewId =
			request.pendingReviewId ??
			(request.command.command.kind === "publish-submission"
				? request.command.command.pendingReviewId
				: snapshot.pendingReviewId);
		const pending =
			request.operation === "publish-review" && pendingReviewId !== undefined
				? await options.query.loadPending(pendingReviewId)
				: undefined;
		let target = snapshot.target;
		let capabilities: ReviewProviderCapabilities | undefined;
		const existingPr = pullRequestTarget(target);
		if (existingPr) {
			target = await options.provider.resolvePullRequest({
				host: existingPr.host,
				repository: existingPr.repository,
				number: existingPr.number,
			});
			capabilities = await options.provider.capabilities({
				target,
				actorId: request.command.actorId,
			});
			if (
				pending?.expectedProviderHeadOid !== undefined &&
				target.headCommitOid !== pending.expectedProviderHeadOid
			) {
				throw reviewError(
					"provider-drift",
					"pull request head changed after review approval",
					{
						reason: "head-moved",
						expected: pending.expectedProviderHeadOid,
						actual: target.headCommitOid,
					},
				);
			}
		}
		const threads = await loadInvolvedThreads(request, pending);
		const summaryBody =
			pending && pendingReviewId !== undefined
				? await options.query.loadSummaryBody(pendingReviewId)
				: request.body;
		let patch:
			| {
					readonly preIndexTreeOid: string;
					readonly postIndexTreeOid: string;
					readonly patchHash: string;
					readonly preimageHash: string;
			  }
			| undefined;
		const repositoryRoot = localRepositoryRoot(target);
		if (
			repositoryRoot !== undefined &&
			(request.operation === "apply-review-suggestion" ||
				request.operation === "stage-review-selection" ||
				request.operation === "unstage-review-selection")
		) {
			const message =
				request.operation === "apply-review-suggestion" &&
				request.messageId !== undefined
					? await options.query.loadMessage(request.messageId)
					: undefined;
			const suggestionBody =
				message === undefined
					? undefined
					: new TextDecoder().decode(
							await options.contentStore
								.get(message.bodyHash)
								.catch(() => new Uint8Array()),
						);
			patch = await options.patchExecutor.simulate({
				repositoryRoot,
				generationId:
					request.generationId ??
					snapshot.currentGenerationId ??
					pending?.generationId ??
					"",
				fileId: request.fileId ?? "",
				direction:
					request.operation === "apply-review-suggestion"
						? "suggestion"
						: request.operation === "stage-review-selection"
							? "stage"
							: "unstage",
				...(request.hunkId === undefined ? {} : { hunkId: request.hunkId }),
				...(request.startLine === undefined
					? {}
					: { startLine: request.startLine }),
				...(request.endLine === undefined ? {} : { endLine: request.endLine }),
				...(suggestionBody === undefined ? {} : { suggestionBody }),
			});
		}
		if (existingPr !== undefined || capabilities !== undefined) {
			assertReviewCapabilities(
				request.operation,
				capabilities,
				pending?.decision,
				(pending?.orderedInlineComments.length ?? 0) > 0,
				(pending?.selectedThreadOperations.length ?? 0) > 0,
			);
		}
		const facts: ReviewEffectFacts = {
			operation: request.operation,
			command: request.command,
			snapshot,
			threads,
			...(pending === undefined ? {} : { pending }),
			...(capabilities === undefined ? {} : { capabilities }),
			...(target === undefined ? {} : { target }),
			...(summaryBody === undefined ? {} : { summaryBody }),
			visibilityTransition: visibilityTransition(request.operation, threads),
			actorIdentity: request.command.actorId,
			...(request.threadId === undefined ? {} : { threadId: request.threadId }),
			...(request.messageId === undefined
				? {}
				: { messageId: request.messageId }),
			...(request.body === undefined ? {} : { body: request.body }),
			...(request.generationId === undefined
				? {}
				: { generationId: request.generationId }),
			...(request.fileId === undefined ? {} : { fileId: request.fileId }),
			...(request.hunkId === undefined ? {} : { hunkId: request.hunkId }),
			...(request.startLine === undefined
				? {}
				: { startLine: request.startLine }),
			...(request.endLine === undefined ? {} : { endLine: request.endLine }),
			...(patch === undefined
				? {}
				: {
						preIndexTreeOid: patch.preIndexTreeOid,
						postIndexTreeOid: patch.postIndexTreeOid,
						patchHash: patch.patchHash,
						preimageHash: patch.preimageHash,
					}),
		};
		return {
			snapshot,
			effect: buildReviewExactEffect(facts),
			threads,
			...(pending === undefined ? {} : { pending }),
			...(target === undefined ? {} : { target }),
			...(capabilities === undefined ? {} : { capabilities }),
		};
	}

	async function completeApplied(
		request: ReviewEffectRequest,
		ledger: ReviewDeliveryLedgerRecord,
	): Promise<ReviewMutationResult> {
		const persisted = await options.runtime.execute(request.command);
		const complete = await markReviewDeliveryLedger(
			options.ledgerDir,
			request.command.commandId,
			"complete",
			{ now: now() },
		);
		return resultFrom(persisted.snapshot, ledger.effect, complete, false);
	}

	async function replayOrReconcile(
		request: ReviewEffectRequest,
	): Promise<ReviewMutationResult | undefined> {
		const prior = await loadReviewDeliveryLedger(
			options.ledgerDir,
			request.command.commandId,
		);
		if (!prior) return undefined;
		if (prior.effect.operation !== request.operation) {
			throw reviewError(
				"malformed-input",
				"command ID was reused for a different review action",
				{ commandId: request.command.commandId },
			);
		}
		if (prior.status === "complete") {
			const snapshot = await options.runtime.load(request.command.reviewId);
			return resultFrom(snapshot, prior.effect, prior, true);
		}
		if (prior.status === "failed") return undefined;
		const evidence = await gatherReviewProviderEvidence(options.provider, {
			commandId: prior.commandId,
			digest: prior.digest,
			operation: prior.effect.operation,
		});
		const partial = prior.status === "ambiguous";
		const status = ledgerStatusForEvidence(evidence, partial);
		if (status === "ambiguous" || (partial && evidence.kind !== "none")) {
			const marked =
				prior.status === "ambiguous"
					? prior
					: await markReviewDeliveryLedger(
							options.ledgerDir,
							prior.commandId,
							"ambiguous",
							{ now: now(), failureCode: "ambiguous-outcome" },
						);
			throw reviewError(
				"ambiguous-outcome",
				"review delivery has an unknown prior outcome; reconcile before retrying",
				{ commandId: prior.commandId, status: marked.status },
			);
		}
		if (status === "applied" || prior.status === "applied") {
			const applied =
				prior.status === "applied"
					? prior
					: await markReviewDeliveryLedger(
							options.ledgerDir,
							prior.commandId,
							"applied",
							{
								now: now(),
								...(evidence.kind === "one" &&
								evidence.receiptHash !== undefined
									? { receiptHash: evidence.receiptHash }
									: prior.receiptHash === undefined
										? {}
										: { receiptHash: prior.receiptHash }),
								...(evidence.kind === "one" &&
								evidence.providerReviewId !== undefined
									? { providerReviewId: evidence.providerReviewId }
									: prior.providerReviewId === undefined
										? {}
										: { providerReviewId: prior.providerReviewId }),
							},
						);
			return completeApplied(request, applied);
		}
		if (status === "failed") {
			await markReviewDeliveryLedger(
				options.ledgerDir,
				prior.commandId,
				"failed",
				{ now: now() },
			);
			return undefined;
		}
		throw reviewError(
			"ambiguous-outcome",
			"review delivery has an unknown prior outcome; reconcile before retrying",
			{ commandId: prior.commandId },
		);
	}

	async function mutate(
		request: ReviewEffectRequest,
		world: Awaited<ReturnType<typeof currentWorld>>,
	): Promise<{
		readonly receiptHash?: string;
		readonly providerReviewId?: string;
	}> {
		const marker = world.effect.details.correlationMarker ?? "";
		if (request.operation === "publish-review") {
			const pending = world.pending;
			const target = pullRequestTarget(world.target);
			if (!pending || !target) {
				throw reviewError(
					"unsupported-capability",
					"publish-review requires a pending review on a pull request",
				);
			}
			const submitted = await options.provider.submitReview({
				pending,
				target,
				correlationMarker: marker,
			});
			try {
				for (const operation of pending.selectedThreadOperations) {
					const thread = world.threads.find(
						(item) => item.threadId === operation.threadId,
					);
					if (!thread) {
						throw reviewError(
							"not-found",
							`thread ${operation.threadId} is missing`,
						);
					}
					if (operation.kind === "reply") {
						const comment = pending.orderedInlineComments.find(
							(item) => item.messageId === operation.messageId,
						);
						await options.provider.replyToThread({
							thread,
							body: comment?.body ?? request.body ?? "",
							correlationMarker: marker,
						});
					} else if (operation.kind === "resolve") {
						await options.provider.resolveThread({ thread });
					} else {
						await options.provider.unresolveThread({ thread });
					}
				}
			} catch (error) {
				throw Object.assign(
					reviewError(
						"ambiguous-outcome",
						"partial review publication is not a complete submission",
						{ commandId: request.command.commandId },
					),
					{ cause: error },
				);
			}
			return {
				receiptHash: submitted.receiptHash,
				providerReviewId: submitted.providerReviewId,
			};
		}
		if (request.operation === "reply-review-thread") {
			const threadId = request.threadId;
			if (threadId === undefined || request.body === undefined) {
				throw reviewError(
					"malformed-input",
					"reply-review-thread requires threadId and body",
				);
			}
			const thread =
				world.threads.find((item) => item.threadId === threadId) ??
				(await options.query.loadThread(threadId));
			await options.provider.replyToThread({
				thread,
				body: request.body,
				correlationMarker: marker,
			});
			return {};
		}
		if (request.operation === "resolve-review-thread") {
			const threadId = request.threadId;
			if (threadId === undefined) {
				throw reviewError(
					"malformed-input",
					"resolve-review-thread requires threadId",
				);
			}
			const thread =
				world.threads.find((item) => item.threadId === threadId) ??
				(await options.query.loadThread(threadId));
			await options.provider.resolveThread({ thread });
			return {};
		}
		if (request.operation === "unresolve-review-thread") {
			const threadId = request.threadId;
			if (threadId === undefined) {
				throw reviewError(
					"malformed-input",
					"unresolve-review-thread requires threadId",
				);
			}
			const thread =
				world.threads.find((item) => item.threadId === threadId) ??
				(await options.query.loadThread(threadId));
			await options.provider.unresolveThread({ thread });
			return {};
		}
		const expectedTree = world.effect.details.postIndexTreeOid;
		const patchHash = world.effect.details.patchHash;
		if (!expectedTree || !patchHash) {
			throw reviewError(
				"approval-mismatch",
				"patch approval is missing its tree identity",
			);
		}
		await options.patchExecutor.apply({
			repositoryRoot: requireLocalRepositoryRoot(world.target),
			approvalDigest: world.effect.digest,
			expectedPostIndexTreeOid: expectedTree,
			patchHash,
		});
		return {};
	}

	return {
		async describe(input) {
			const request = normalize(input);
			const world = await currentWorld(request);
			await writeReviewApproval(options.ledgerDir, world.effect);
			return world.effect;
		},
		async execute(input) {
			const request = normalize(input);
			const replayed = await replayOrReconcile(request);
			if (replayed) return replayed;
			const world = await currentWorld(request);
			const approvalDigest = request.approvalDigest;
			if (approvalDigest !== undefined) {
				const approved =
					(await readReviewApproval(options.ledgerDir, approvalDigest)) ??
					(approvalDigest === world.effect.digest ? world.effect : undefined);
				if (!approved || approved.digest !== approvalDigest) {
					throw reviewError(
						"approval-mismatch",
						"review approval digest does not match the current exact effect",
						{ reason: "digest-mismatch", digest: approvalDigest },
					);
				}
				assertReviewApprovalCurrent({
					approved,
					current: world.effect,
					snapshotRevision: world.snapshot.revision,
					expectedRevision: request.command.expectedRevision,
				});
			} else if (!(await options.authorize?.(world.effect, world.snapshot))) {
				await writeReviewApproval(options.ledgerDir, world.effect);
				throw new ReviewApprovalRequiredError(world.effect);
			}
			const prior = await loadReviewDeliveryLedger(
				options.ledgerDir,
				request.command.commandId,
			);
			if (prior && prior.digest !== world.effect.digest) {
				throw reviewError(
					"approval-mismatch",
					"never auto-reprepare a review under an old approval",
					{
						reason: "digest-mismatch",
						approvedDigest: prior.digest,
						currentDigest: world.effect.digest,
					},
				);
			}
			await writeReviewApproval(options.ledgerDir, world.effect);
			const pending = await persistReviewDeliveryPending(options.ledgerDir, {
				commandId: request.command.commandId,
				effect: world.effect,
				correlationMarker: world.effect.details.correlationMarker ?? "",
				now: now(),
				...(world.pending === undefined
					? {}
					: { pendingReviewId: world.pending.pendingReviewId }),
			});
			if (pending.status === "complete") {
				return resultFrom(world.snapshot, world.effect, pending, true);
			}
			try {
				const receipt = await mutate(request, world);
				const applied = await markReviewDeliveryLedger(
					options.ledgerDir,
					request.command.commandId,
					"applied",
					{ now: now(), ...receipt },
				);
				return await completeApplied(request, applied);
			} catch (error) {
				if (error instanceof Error && "code" in error) {
					const coded = error as { readonly code: string };
					if (coded.code === "ambiguous-outcome") {
						await markReviewDeliveryLedger(
							options.ledgerDir,
							request.command.commandId,
							"ambiguous",
							{ now: now(), failureCode: "ambiguous-outcome" },
						);
						throw error;
					}
				}
				const evidence = await gatherReviewProviderEvidence(options.provider, {
					commandId: request.command.commandId,
					digest: world.effect.digest,
					operation: request.operation,
				});
				const status = ledgerStatusForEvidence(evidence);
				if (status === "applied") {
					const applied = await markReviewDeliveryLedger(
						options.ledgerDir,
						request.command.commandId,
						"applied",
						{
							now: now(),
							...(evidence.kind === "one" && evidence.receiptHash !== undefined
								? { receiptHash: evidence.receiptHash }
								: {}),
							...(evidence.kind === "one" &&
							evidence.providerReviewId !== undefined
								? { providerReviewId: evidence.providerReviewId }
								: {}),
						},
					);
					return await completeApplied(request, applied);
				}
				await markReviewDeliveryLedger(
					options.ledgerDir,
					request.command.commandId,
					status,
					{
						now: now(),
						failureCode:
							status === "ambiguous" ? "ambiguous-outcome" : "provider-failed",
					},
				);
				if (status === "ambiguous") {
					throw reviewError(
						"ambiguous-outcome",
						"review delivery transport is uncertain; reconcile before retrying",
						{ commandId: request.command.commandId },
					);
				}
				throw error;
			}
		},
	};
}
