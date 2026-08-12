import { reviewFileId } from "./git-review-manifest.js";
import { reviewError } from "./review-errors.js";
import {
	createReviewGeneration,
	type MemoryReviewFileInput,
	materializeReviewFiles,
} from "./review-generations.js";
import type {
	ReviewDiffChunk,
	ReviewFileSummary,
	ReviewGeneration,
	ReviewStackMemberTarget,
	ReviewTarget,
} from "./review-ports.js";
import {
	mapAggregateComment,
	type ReviewStackComment,
	requireCommentDestination,
} from "./review-stack-provenance.js";

export interface ReviewStackMemberDiff {
	readonly member: ReviewStackMemberTarget;
	readonly files: readonly MemoryReviewFileInput[];
}

export interface ReviewStackMemberState {
	readonly member: ReviewStackMemberTarget;
	readonly generation: ReviewGeneration;
	readonly files: readonly ReviewFileSummary[];
	readonly chunks: readonly ReviewDiffChunk[];
	readonly closed: boolean;
}

export interface ReviewStackState {
	readonly stackId: string;
	readonly repositoryId: string;
	readonly reviewId: string;
	readonly aggregate: ReviewGeneration;
	readonly aggregateFiles: readonly ReviewFileSummary[];
	readonly aggregateChunks: readonly ReviewDiffChunk[];
	readonly members: readonly ReviewStackMemberState[];
	readonly historicalGenerations: readonly ReviewGeneration[];
}

export interface SessionStackView {
	readonly branches?: ReadonlyArray<{
		readonly name?: string;
		readonly head?: string;
		readonly pr?: { readonly number?: number };
	}>;
}

export interface ReviewStackMemberSubmission {
	readonly memberId: string;
	readonly number?: number;
	readonly messageIds: readonly string[];
}

export function membersFromSessionStackView(input: {
	readonly stackId: string;
	readonly view: SessionStackView;
	readonly oids: Readonly<
		Record<
			string,
			{ readonly baseCommitOid: string; readonly mergeBaseOid: string }
		>
	>;
}): {
	readonly stackId: string;
	readonly members: readonly ReviewStackMemberTarget[];
} {
	if (!input.stackId) {
		throw reviewError("malformed-input", "stackId is required");
	}
	const members: ReviewStackMemberTarget[] = [];
	for (const branch of input.view.branches ?? []) {
		const memberId = branch.name;
		if (!memberId) {
			throw reviewError(
				"malformed-input",
				"stack view branch is missing a name",
			);
		}
		const oids = input.oids[memberId];
		if (oids === undefined) {
			throw reviewError(
				"malformed-input",
				`stack member ${memberId} is missing commit identity`,
				{ memberId },
			);
		}
		const number = branch.pr?.number;
		members.push({
			memberId,
			baseCommitOid: oids.baseCommitOid,
			headCommitOid: branch.head ?? oids.baseCommitOid,
			mergeBaseOid: oids.mergeBaseOid,
			...(number === undefined
				? {}
				: {
						provider: "github" as const,
						number,
					}),
		});
	}
	return { stackId: input.stackId, members };
}

export function createReviewStack(input: {
	readonly reviewId: string;
	readonly actorId: string;
	readonly createdAt: string;
	readonly stackId: string;
	readonly repositoryId: string;
	readonly members: readonly ReviewStackMemberDiff[];
	readonly historicalGenerations?: readonly ReviewGeneration[];
}): ReviewStackState {
	if (!input.stackId) {
		throw reviewError("malformed-input", "stackId is required");
	}
	if (input.members.length === 0) {
		throw reviewError("malformed-input", "stack members must not be empty");
	}
	const members = input.members.map((entry) =>
		materializeMember({
			reviewId: input.reviewId,
			actorId: input.actorId,
			createdAt: input.createdAt,
			repositoryId: input.repositoryId,
			entry,
			closed: false,
		}),
	);
	const aggregateFiles = members.flatMap((member) => member.files);
	const aggregateChunks = members.flatMap((member) => member.chunks);
	const aggregate = createReviewGeneration({
		reviewId: input.reviewId,
		actorId: input.actorId,
		target: stackTarget(input.stackId, input.repositoryId, members),
		files: aggregateFiles,
		createdAt: input.createdAt,
	});
	return {
		stackId: input.stackId,
		repositoryId: input.repositoryId,
		reviewId: input.reviewId,
		aggregate,
		aggregateFiles,
		aggregateChunks: stampChunks(aggregate.id, aggregateChunks),
		members,
		historicalGenerations: input.historicalGenerations ?? [],
	};
}

export function restackReviewStackMember(
	stack: ReviewStackState,
	input: {
		readonly actorId: string;
		readonly createdAt: string;
		readonly memberId: string;
		readonly members: readonly ReviewStackMemberDiff[];
	},
): ReviewStackState {
	const index = stack.members.findIndex(
		(member) => member.member.memberId === input.memberId,
	);
	if (index < 0) {
		throw reviewError("not-found", `stack member ${input.memberId} not found`, {
			memberId: input.memberId,
		});
	}
	const kept = stack.members.slice(0, index);
	const invalidated = stack.members.slice(index);
	const replacements = new Map(
		input.members.map((entry) => [entry.member.memberId, entry]),
	);
	const nextMembers = [
		...kept,
		...invalidated.map((member) => {
			const entry =
				replacements.get(member.member.memberId) ??
				({
					member: member.member,
					files: filesFromSummaries(member.files),
				} satisfies ReviewStackMemberDiff);
			return materializeMember({
				reviewId: stack.reviewId,
				actorId: input.actorId,
				createdAt: input.createdAt,
				repositoryId: stack.repositoryId,
				entry,
				closed: member.closed,
				predecessor: member.generation,
			});
		}),
	];
	const aggregateFiles = nextMembers.flatMap((member) => member.files);
	const aggregateChunks = nextMembers.flatMap((member) => member.chunks);
	const aggregate = createReviewGeneration({
		reviewId: stack.reviewId,
		actorId: input.actorId,
		target: stackTarget(stack.stackId, stack.repositoryId, nextMembers),
		files: aggregateFiles,
		createdAt: input.createdAt,
		predecessor: stack.aggregate,
	});
	return {
		stackId: stack.stackId,
		repositoryId: stack.repositoryId,
		reviewId: stack.reviewId,
		aggregate,
		aggregateFiles,
		aggregateChunks: stampChunks(aggregate.id, aggregateChunks),
		members: nextMembers,
		historicalGenerations: [
			...stack.historicalGenerations,
			stack.aggregate,
			...invalidated.map((member) => member.generation),
		],
	};
}

export function closeReviewStackMember(
	stack: ReviewStackState,
	memberId: string,
): ReviewStackState {
	const member = stack.members.find(
		(item) => item.member.memberId === memberId,
	);
	if (member === undefined) {
		throw reviewError("not-found", `stack member ${memberId} not found`, {
			memberId,
		});
	}
	return {
		...stack,
		members: stack.members.map((item) =>
			item.member.memberId === memberId ? { ...item, closed: true } : item,
		),
		historicalGenerations: stack.historicalGenerations.some(
			(generation) => generation.id === member.generation.id,
		)
			? stack.historicalGenerations
			: [...stack.historicalGenerations, member.generation],
	};
}

export function stackFileCount(stack: ReviewStackState): number {
	return stack.aggregateFiles.length;
}

export function planReviewStackSubmissions(input: {
	readonly stack: ReviewStackState;
	readonly comments: readonly ReviewStackComment[];
}): readonly ReviewStackMemberSubmission[] {
	const grouped = new Map<string, ReviewStackMemberSubmission>();
	for (const comment of input.comments) {
		const destination = requireCommentDestination(
			mapAggregateComment(input.stack, comment),
		);
		const current = grouped.get(destination.memberId);
		if (current === undefined) {
			grouped.set(destination.memberId, {
				memberId: destination.memberId,
				messageIds: [comment.messageId],
				...(destination.number === undefined
					? {}
					: { number: destination.number }),
			});
			continue;
		}
		grouped.set(destination.memberId, {
			...current,
			messageIds: [...current.messageIds, comment.messageId],
		});
	}
	return input.stack.members.flatMap((member) => {
		const plan = grouped.get(member.member.memberId);
		return plan === undefined ? [] : [plan];
	});
}

function materializeMember(input: {
	readonly reviewId: string;
	readonly actorId: string;
	readonly createdAt: string;
	readonly repositoryId: string;
	readonly entry: ReviewStackMemberDiff;
	readonly closed: boolean;
	readonly predecessor?: ReviewGeneration;
}): ReviewStackMemberState {
	const pending = materializeReviewFiles("pending", input.entry.files);
	const stamped = stampMemberFiles(input.entry.member.memberId, pending);
	const generation = createReviewGeneration({
		reviewId: input.reviewId,
		actorId: input.actorId,
		target: memberTarget(input.repositoryId, input.entry.member),
		files: stamped.summaries,
		createdAt: input.createdAt,
		...(input.predecessor === undefined
			? {}
			: { predecessor: input.predecessor }),
	});
	return {
		member: input.entry.member,
		generation,
		files: stamped.summaries,
		chunks: stampChunks(generation.id, stamped.chunks),
		closed: input.closed,
	};
}

function stampMemberFiles(
	memberId: string,
	materialized: {
		readonly summaries: readonly ReviewFileSummary[];
		readonly chunks: readonly ReviewDiffChunk[];
	},
): {
	readonly summaries: readonly ReviewFileSummary[];
	readonly chunks: readonly ReviewDiffChunk[];
} {
	const ids = new Map<string, string>();
	const summaries = materialized.summaries.map((file) => {
		const fileId = reviewFileId({
			memberId,
			status: file.status,
			...(file.pathBefore === undefined ? {} : { pathBefore: file.pathBefore }),
			...(file.pathAfter === undefined ? {} : { pathAfter: file.pathAfter }),
			...(file.oldBlobOid === undefined ? {} : { oldBlobOid: file.oldBlobOid }),
			...(file.newBlobOid === undefined ? {} : { newBlobOid: file.newBlobOid }),
		});
		ids.set(file.fileId, fileId);
		return { ...file, fileId };
	});
	const chunks = materialized.chunks.map((chunk) => ({
		...chunk,
		fileId: ids.get(chunk.fileId) ?? chunk.fileId,
	}));
	return { summaries, chunks };
}

function stampChunks(
	generationId: string,
	chunks: readonly ReviewDiffChunk[],
): readonly ReviewDiffChunk[] {
	return chunks.map((chunk) => ({ ...chunk, generationId }));
}

function stackTarget(
	stackId: string,
	repositoryId: string,
	members: readonly ReviewStackMemberState[],
): ReviewTarget {
	const first = members[0]?.member;
	const last = members[members.length - 1]?.member;
	return {
		kind: "stack",
		stackId,
		repositoryId,
		members: members.map((item) => item.member),
		aggregateBaseOid: first?.mergeBaseOid ?? first?.baseCommitOid ?? "",
		aggregateHeadOid: last?.headCommitOid ?? "",
	};
}

function memberTarget(
	repositoryId: string,
	member: ReviewStackMemberTarget,
): ReviewTarget {
	if (member.number !== undefined && member.repository !== undefined) {
		return {
			kind: "pull-request",
			provider: "github",
			host: member.host ?? "github.com",
			repository: member.repository,
			number: member.number,
			baseRef: member.memberId,
			headRef: member.memberId,
			mergeBaseOid: member.mergeBaseOid,
			baseCommitOid: member.baseCommitOid,
			headCommitOid: member.headCommitOid,
		};
	}
	return {
		kind: "range",
		repositoryId,
		repositoryRoot: "",
		requestedBaseRef: member.baseCommitOid,
		requestedHeadRef: member.headCommitOid,
		mergeBaseOid: member.mergeBaseOid,
		baseCommitOid: member.baseCommitOid,
		headCommitOid: member.headCommitOid,
	};
}

function filesFromSummaries(
	files: readonly ReviewFileSummary[],
): readonly MemoryReviewFileInput[] {
	return files.map((file) => ({
		path: file.pathAfter ?? file.pathBefore ?? file.fileId,
		...(file.pathBefore === undefined ? {} : { pathBefore: file.pathBefore }),
		status: file.status,
		binary: file.binary,
		tooLargeForInline: file.tooLargeForInline,
		...(file.oldBlobOid === undefined ? {} : { oldBlobOid: file.oldBlobOid }),
		...(file.newBlobOid === undefined ? {} : { newBlobOid: file.newBlobOid }),
		...(file.oldMode === undefined ? {} : { oldMode: file.oldMode }),
		...(file.newMode === undefined ? {} : { newMode: file.newMode }),
		...(file.generatedHint === undefined
			? {}
			: { generatedHint: file.generatedHint }),
		...(file.dependencyHint === undefined
			? {}
			: { dependencyHint: file.dependencyHint }),
	}));
}
