import { reviewError } from "./review-errors.js";
import {
	REVIEW_COMMAND_SCHEMA,
	REVIEW_SNAPSHOT_SCHEMA,
	type ReviewAnchor,
	type ReviewCommand,
	type ReviewCommandEnvelope,
	type ReviewInboxDisposition,
	type ReviewSnapshot,
	type ReviewTarget,
	type ReviewThreadOperation,
} from "./review-ports.js";

const DISPOSITIONS = new Set<ReviewInboxDisposition>([
	"active",
	"deferred",
	"ignored",
]);

function record(value: unknown, field: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw reviewError("malformed-input", `${field} must be an object`);
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

function requiredBigInt(value: unknown, field: string): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isSafeInteger(value))
		return BigInt(value);
	if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);
	throw reviewError("malformed-input", `${field} must be an integer revision`);
}

function optionalInteger(value: unknown, field: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw reviewError("malformed-input", `${field} must be an integer`);
	}
	return value;
}

function parseReviewAnchor(value: unknown): ReviewAnchor {
	const body = record(value, "anchor");
	const pathBefore = optionalString(body.pathBefore, "anchor.pathBefore");
	const pathAfter = optionalString(body.pathAfter, "anchor.pathAfter");
	const baseBlobOid = optionalString(body.baseBlobOid, "anchor.baseBlobOid");
	const headBlobOid = optionalString(body.headBlobOid, "anchor.headBlobOid");
	const baseContentHash = optionalString(
		body.baseContentHash,
		"anchor.baseContentHash",
	);
	const headContentHash = optionalString(
		body.headContentHash,
		"anchor.headContentHash",
	);
	const startLine = optionalInteger(body.startLine, "anchor.startLine");
	const endLine = optionalInteger(body.endLine, "anchor.endLine");
	const hunkId = optionalString(body.hunkId, "anchor.hunkId");
	const hunkFingerprint = optionalString(
		body.hunkFingerprint,
		"anchor.hunkFingerprint",
	);
	const selectedContentHash = optionalString(
		body.selectedContentHash,
		"anchor.selectedContentHash",
	);
	const side = requiredString(body.side, "anchor.side");
	if (side !== "old" && side !== "new") {
		throw reviewError("malformed-input", "anchor.side must be old or new");
	}
	return {
		anchorId: requiredString(body.anchorId, "anchor.anchorId"),
		generationId: requiredString(body.generationId, "anchor.generationId"),
		fileId: requiredString(body.fileId, "anchor.fileId"),
		side,
		contextBeforeHashes: strings(body.contextBeforeHashes, "contextBeforeHashes"),
		contextAfterHashes: strings(body.contextAfterHashes, "contextAfterHashes"),
		...(pathBefore === undefined ? {} : { pathBefore }),
		...(pathAfter === undefined ? {} : { pathAfter }),
		...(baseBlobOid === undefined ? {} : { baseBlobOid }),
		...(headBlobOid === undefined ? {} : { headBlobOid }),
		...(baseContentHash === undefined ? {} : { baseContentHash }),
		...(headContentHash === undefined ? {} : { headContentHash }),
		...(startLine === undefined ? {} : { startLine }),
		...(endLine === undefined ? {} : { endLine }),
		...(hunkId === undefined ? {} : { hunkId }),
		...(hunkFingerprint === undefined ? {} : { hunkFingerprint }),
		...(selectedContentHash === undefined ? {} : { selectedContentHash }),
	};
}

function strings(value: unknown, field: string): readonly string[] {
	if (value === undefined) return [];
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== "string" || item.length === 0)
	) {
		throw reviewError(
			"malformed-input",
			`${field} must be an array of nonempty strings`,
		);
	}
	return value;
}

export function parseReviewTarget(value: unknown): ReviewTarget {
	const body = record(value, "target");
	const kind = requiredString(body.kind, "target.kind");
	const repositoryId = optionalString(body.repositoryId, "target.repositoryId");
	const repositoryRoot = optionalString(
		body.repositoryRoot,
		"target.repositoryRoot",
	);
	switch (kind) {
		case "working-tree":
			return {
				kind,
				repositoryId: requiredString(repositoryId, "target.repositoryId"),
				repositoryRoot: requiredString(repositoryRoot, "target.repositoryRoot"),
				baseCommitOid: requiredString(
					body.baseCommitOid,
					"target.baseCommitOid",
				),
				indexTreeOid: requiredString(body.indexTreeOid, "target.indexTreeOid"),
				worktreeManifestHash: requiredString(
					body.worktreeManifestHash,
					"target.worktreeManifestHash",
				),
			};
		case "index":
			return {
				kind,
				repositoryId: requiredString(repositoryId, "target.repositoryId"),
				repositoryRoot: requiredString(repositoryRoot, "target.repositoryRoot"),
				baseCommitOid: requiredString(
					body.baseCommitOid,
					"target.baseCommitOid",
				),
				indexTreeOid: requiredString(body.indexTreeOid, "target.indexTreeOid"),
			};
		case "commit": {
			const evidence = optionalString(
				body.stablePatchEvidence,
				"target.stablePatchEvidence",
			);
			return evidence === undefined
				? {
						kind,
						repositoryId: requiredString(repositoryId, "target.repositoryId"),
						repositoryRoot: requiredString(
							repositoryRoot,
							"target.repositoryRoot",
						),
						parentCommitOid: requiredString(
							body.parentCommitOid,
							"target.parentCommitOid",
						),
						commitOid: requiredString(body.commitOid, "target.commitOid"),
					}
				: {
						kind,
						repositoryId: requiredString(repositoryId, "target.repositoryId"),
						repositoryRoot: requiredString(
							repositoryRoot,
							"target.repositoryRoot",
						),
						parentCommitOid: requiredString(
							body.parentCommitOid,
							"target.parentCommitOid",
						),
						commitOid: requiredString(body.commitOid, "target.commitOid"),
						stablePatchEvidence: evidence,
					};
		}
		case "range":
			return {
				kind,
				repositoryId: requiredString(repositoryId, "target.repositoryId"),
				repositoryRoot: requiredString(repositoryRoot, "target.repositoryRoot"),
				requestedBaseRef: requiredString(
					body.requestedBaseRef,
					"target.requestedBaseRef",
				),
				requestedHeadRef: requiredString(
					body.requestedHeadRef,
					"target.requestedHeadRef",
				),
				mergeBaseOid: requiredString(body.mergeBaseOid, "target.mergeBaseOid"),
				baseCommitOid: requiredString(
					body.baseCommitOid,
					"target.baseCommitOid",
				),
				headCommitOid: requiredString(
					body.headCommitOid,
					"target.headCommitOid",
				),
			};
		case "pull-request":
			if (body.provider !== "github") {
				throw reviewError(
					"unsupported-capability",
					"only the github provider is implemented",
				);
			}
			const nodeId = optionalString(
				body.providerNodeId,
				"target.providerNodeId",
			);
			const pullRequest = {
				kind,
				provider: "github" as const,
				host: requiredString(body.host, "target.host"),
				repository: requiredString(body.repository, "target.repository"),
				number: Number(body.number),
				baseRef: requiredString(body.baseRef, "target.baseRef"),
				headRef: requiredString(body.headRef, "target.headRef"),
				mergeBaseOid: requiredString(body.mergeBaseOid, "target.mergeBaseOid"),
				baseCommitOid: requiredString(
					body.baseCommitOid,
					"target.baseCommitOid",
				),
				headCommitOid: requiredString(
					body.headCommitOid,
					"target.headCommitOid",
				),
			};
			return nodeId === undefined
				? pullRequest
				: { ...pullRequest, providerNodeId: nodeId };
		case "stack":
			if (!Array.isArray(body.members)) {
				throw reviewError("malformed-input", "target.members must be an array");
			}
			return {
				kind,
				stackId: requiredString(body.stackId, "target.stackId"),
				repositoryId: requiredString(repositoryId, "target.repositoryId"),
				aggregateBaseOid: requiredString(
					body.aggregateBaseOid,
					"target.aggregateBaseOid",
				),
				aggregateHeadOid: requiredString(
					body.aggregateHeadOid,
					"target.aggregateHeadOid",
				),
				members: body.members.map((member, index) => {
					const item = record(member, `target.members[${index}]`);
					return {
						memberId: requiredString(item.memberId, "memberId"),
						baseCommitOid: requiredString(item.baseCommitOid, "baseCommitOid"),
						headCommitOid: requiredString(item.headCommitOid, "headCommitOid"),
						mergeBaseOid: requiredString(item.mergeBaseOid, "mergeBaseOid"),
					};
				}),
			};
		default:
			throw reviewError(
				"malformed-input",
				`unknown review target kind: ${kind}`,
			);
	}
}

function parseThreadOperations(
	value: unknown,
): readonly ReviewThreadOperation[] {
	if (value === undefined) return [];
	if (!Array.isArray(value))
		throw reviewError("malformed-input", "thread operations must be an array");
	return value.map((item, index) => {
		const body = record(item, `threadOperations[${index}]`);
		const kind = requiredString(body.kind, "kind");
		const threadId = requiredString(body.threadId, "threadId");
		if (kind === "reply") {
			return {
				kind,
				threadId,
				messageId: requiredString(body.messageId, "messageId"),
			};
		}
		if (kind === "resolve" || kind === "unresolve") return { kind, threadId };
		throw reviewError("malformed-input", `unknown thread operation: ${kind}`);
	});
}

function parseCommand(value: unknown): ReviewCommand {
	const body = record(value, "command");
	const kind = requiredString(body.kind, "command.kind");
	switch (kind) {
		case "start-review": {
			const sessionId = optionalString(body.sessionId, "sessionId");
			return sessionId === undefined
				? { kind, target: parseReviewTarget(body.target) }
				: { kind, target: parseReviewTarget(body.target), sessionId };
		}
		case "refresh-review":
		case "close-review":
			return { kind };
		case "mark-coverage": {
			const unit = record(body.unit, "unit");
			const unitKind = requiredString(unit.kind, "unit.kind");
			const contentIdentity = requiredString(
				unit.contentIdentity,
				"unit.contentIdentity",
			);
			const coverageUnit =
				unitKind === "file"
					? {
							kind: "file" as const,
							fileId: requiredString(unit.fileId, "fileId"),
							contentIdentity,
						}
					: unitKind === "hunk"
						? {
								kind: "hunk" as const,
								fileId: requiredString(unit.fileId, "fileId"),
								hunkId: requiredString(unit.hunkId, "hunkId"),
								contentIdentity,
							}
						: {
								kind: "commit" as const,
								stableChangeId: requiredString(
									unit.stableChangeId,
									"stableChangeId",
								),
								contentIdentity,
							};
			const state = requiredString(body.state, "state");
			if (state !== "reviewed" && state !== "excluded") {
				throw reviewError(
					"malformed-input",
					"coverage state must be reviewed or excluded",
				);
			}
			const exclusionReason = optionalString(
				body.exclusionReason,
				"exclusionReason",
			);
			return exclusionReason === undefined
				? {
						kind,
						generationId: requiredString(body.generationId, "generationId"),
						unit: coverageUnit,
						state,
					}
				: {
						kind,
						generationId: requiredString(body.generationId, "generationId"),
						unit: coverageUnit,
						state,
						exclusionReason,
					};
		}
		case "create-thread": {
			const visibility = requiredString(body.visibility, "visibility");
			if (
				visibility !== "private" &&
				visibility !== "session" &&
				visibility !== "forge"
			) {
				throw reviewError(
					"malformed-input",
					"thread visibility must be private, session, or forge",
				);
			}
			return {
				kind,
				body: requiredString(body.body, "body"),
				visibility,
				...(body.anchor === undefined
					? {}
					: { anchor: parseReviewAnchor(body.anchor) }),
			};
		}
		case "add-message":
			return {
				kind,
				threadId: requiredString(body.threadId, "threadId"),
				body: requiredString(body.body, "body"),
			};
		case "edit-draft-message":
			return {
				kind,
				messageId: requiredString(body.messageId, "messageId"),
				body: requiredString(body.body, "body"),
			};
		case "delete-draft-message":
			return { kind, messageId: requiredString(body.messageId, "messageId") };
		case "route-thread-to-agent":
			return {
				kind,
				threadId: requiredString(body.threadId, "threadId"),
				agentId: requiredString(body.agentId, "agentId"),
			};
		case "resolve-thread":
		case "unresolve-thread":
			return { kind, threadId: requiredString(body.threadId, "threadId") };
		case "prepare-submission": {
			const decision = requiredString(body.decision, "decision");
			if (
				decision !== "comment" &&
				decision !== "approve" &&
				decision !== "request-changes"
			) {
				throw reviewError(
					"malformed-input",
					"decision must be comment, approve, or request-changes",
				);
			}
			return {
				kind,
				decision,
				summaryBody: requiredString(body.summaryBody, "summaryBody"),
				selectedMessageIds: strings(
					body.selectedMessageIds,
					"selectedMessageIds",
				),
				selectedThreadOperations: parseThreadOperations(
					body.selectedThreadOperations,
				),
			};
		}
		case "publish-submission":
			return {
				kind,
				pendingReviewId: requiredString(
					body.pendingReviewId,
					"pendingReviewId",
				),
				approvalDigest: requiredString(body.approvalDigest, "approvalDigest"),
			};
		case "apply-suggestion":
			return {
				kind,
				messageId: requiredString(body.messageId, "messageId"),
				approvalDigest: requiredString(body.approvalDigest, "approvalDigest"),
			};
		case "stage-selection":
		case "unstage-selection": {
			const hunkId = optionalString(body.hunkId, "hunkId");
			const startLine =
				typeof body.startLine === "number" ? body.startLine : undefined;
			const endLine =
				typeof body.endLine === "number" ? body.endLine : undefined;
			return {
				kind,
				generationId: requiredString(body.generationId, "generationId"),
				fileId: requiredString(body.fileId, "fileId"),
				approvalDigest: requiredString(body.approvalDigest, "approvalDigest"),
				...(hunkId === undefined ? {} : { hunkId }),
				...(startLine === undefined ? {} : { startLine }),
				...(endLine === undefined ? {} : { endLine }),
			};
		}
		case "set-inbox-disposition": {
			const disposition = requiredString(body.disposition, "disposition");
			if (!DISPOSITIONS.has(disposition as ReviewInboxDisposition)) {
				throw reviewError(
					"malformed-input",
					"inbox disposition must be active, deferred, or ignored",
				);
			}
			return { kind, disposition: disposition as ReviewInboxDisposition };
		}
		default:
			throw reviewError("malformed-input", `unknown review command: ${kind}`);
	}
}

export function parseReviewCommand(value: unknown): ReviewCommandEnvelope {
	const body = record(value, "review command");
	const schemaVersion = requiredString(body.schemaVersion, "schemaVersion");
	if (schemaVersion !== REVIEW_COMMAND_SCHEMA) {
		throw reviewError(
			"malformed-input",
			`unsupported review command schema: ${schemaVersion}`,
		);
	}
	return {
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId: requiredString(body.commandId, "commandId"),
		actorId: requiredString(body.actorId, "actorId"),
		reviewId: requiredString(body.reviewId, "reviewId"),
		expectedRevision: requiredBigInt(body.expectedRevision, "expectedRevision"),
		command: parseCommand(body.command),
	};
}

export function parseReviewSnapshot(value: unknown): ReviewSnapshot {
	const body = record(value, "review snapshot");
	const schemaVersion = requiredString(body.schemaVersion, "schemaVersion");
	if (schemaVersion !== REVIEW_SNAPSHOT_SCHEMA) {
		throw reviewError(
			"malformed-input",
			`unsupported review snapshot schema: ${schemaVersion}`,
		);
	}
	const disposition = requiredString(body.inboxDisposition, "inboxDisposition");
	if (!DISPOSITIONS.has(disposition as ReviewInboxDisposition)) {
		throw reviewError(
			"malformed-input",
			"inbox disposition must be active, deferred, or ignored",
		);
	}
	const sessionId = optionalString(body.sessionId, "sessionId");
	const currentGenerationId = optionalString(
		body.currentGenerationId,
		"currentGenerationId",
	);
	const pendingReviewId = optionalString(
		body.pendingReviewId,
		"pendingReviewId",
	);
	return {
		schemaVersion: REVIEW_SNAPSHOT_SCHEMA,
		reviewId: requiredString(body.reviewId, "reviewId"),
		revision: requiredBigInt(body.revision, "revision"),
		threadIds: strings(body.threadIds, "threadIds"),
		coverageIds: strings(body.coverageIds, "coverageIds"),
		inboxDisposition: disposition as ReviewInboxDisposition,
		closed: body.closed === true,
		updatedAt: requiredString(body.updatedAt, "updatedAt"),
		...(sessionId === undefined ? {} : { sessionId }),
		...(currentGenerationId === undefined ? {} : { currentGenerationId }),
		...(pendingReviewId === undefined ? {} : { pendingReviewId }),
		...(body.target === undefined
			? {}
			: { target: parseReviewTarget(body.target) }),
	};
}
