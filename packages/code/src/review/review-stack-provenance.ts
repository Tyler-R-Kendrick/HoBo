import { reviewError } from "./review-errors.js";
import type { ReviewSide } from "./review-ports.js";
import type { ReviewStackState } from "./review-stack.js";

export interface ReviewStackComment {
	readonly messageId: string;
	readonly fileId?: string;
	readonly path?: string;
	readonly hunkId?: string;
	readonly memberId?: string;
}

export interface ReviewCommentCandidate {
	readonly memberId: string;
	readonly number?: number;
}

export type ReviewCommentDestination =
	| ({
			readonly kind: "unique";
	  } & ReviewCommentCandidate)
	| {
			readonly kind: "ambiguous";
			readonly candidates: readonly ReviewCommentCandidate[];
	  };

export interface ReviewLineProvenance {
	readonly memberId: string;
	readonly fileId: string;
	readonly hunkId: string;
	readonly lineId: string;
	readonly path?: string;
	readonly side: ReviewSide;
	readonly oldLine?: number;
	readonly newLine?: number;
}

export function stackMemberIdFromFileId(
	fileId: string,
	memberIds: readonly string[],
): string | undefined {
	return memberIds.find(
		(memberId) => fileId === memberId || fileId.startsWith(`${memberId}:`),
	);
}

export function collectStackLineProvenance(
	stack: ReviewStackState,
): readonly ReviewLineProvenance[] {
	const rows: ReviewLineProvenance[] = [];
	for (const member of stack.members) {
		for (const chunk of member.chunks) {
			const file = member.files.find((item) => item.fileId === chunk.fileId);
			const path = file?.pathAfter ?? file?.pathBefore;
			for (const hunk of chunk.hunks) {
				for (const line of hunk.lines) {
					rows.push({
						memberId: member.member.memberId,
						fileId: chunk.fileId,
						hunkId: hunk.hunkId,
						lineId: line.lineId,
						side: line.oldLine !== undefined ? "old" : "new",
						...(path === undefined ? {} : { path }),
						...(line.oldLine === undefined ? {} : { oldLine: line.oldLine }),
						...(line.newLine === undefined ? {} : { newLine: line.newLine }),
					});
				}
			}
		}
	}
	return rows;
}

export function mapAggregateComment(
	stack: ReviewStackState,
	comment: ReviewStackComment,
): ReviewCommentDestination {
	const candidates = commentCandidates(stack, comment);
	if (comment.memberId !== undefined) {
		const selected = candidates.find(
			(candidate) => candidate.memberId === comment.memberId,
		);
		if (selected === undefined) {
			throw reviewError(
				"malformed-input",
				`stack member ${comment.memberId} does not own the comment`,
				{ memberId: comment.memberId, messageId: comment.messageId },
			);
		}
		return { kind: "unique", ...selected };
	}
	if (candidates.length === 1) {
		const [only] = candidates;
		if (only === undefined) {
			throw reviewError("not-found", "comment destination disappeared");
		}
		return { kind: "unique", ...only };
	}
	if (candidates.length === 0) {
		throw reviewError(
			"not-found",
			`no stack member owns comment ${comment.messageId}`,
			{ messageId: comment.messageId },
		);
	}
	return { kind: "ambiguous", candidates };
}

export function requireCommentDestination(
	destination: ReviewCommentDestination,
): ReviewCommentCandidate {
	if (destination.kind === "unique") {
		return {
			memberId: destination.memberId,
			...(destination.number === undefined
				? {}
				: { number: destination.number }),
		};
	}
	throw reviewError(
		"ambiguous-outcome",
		"aggregate comment maps to more than one stack member",
		{
			candidates: destination.candidates.map((item) => item.memberId).join(","),
		},
	);
}

function commentCandidates(
	stack: ReviewStackState,
	comment: ReviewStackComment,
): readonly ReviewCommentCandidate[] {
	const matches: ReviewCommentCandidate[] = [];
	for (const member of stack.members) {
		if (
			comment.memberId !== undefined &&
			comment.memberId !== member.member.memberId
		) {
			continue;
		}
		const ownsFile =
			comment.fileId === undefined
				? true
				: member.files.some((file) => file.fileId === comment.fileId) ||
					stackMemberIdFromFileId(comment.fileId, [member.member.memberId]) ===
						member.member.memberId;
		const ownsPath =
			comment.path === undefined
				? true
				: member.files.some(
						(file) =>
							file.pathAfter === comment.path ||
							file.pathBefore === comment.path,
					);
		const ownsHunk =
			comment.hunkId === undefined
				? true
				: member.chunks.some((chunk) =>
						chunk.hunks.some((hunk) => hunk.hunkId === comment.hunkId),
					);
		if (ownsFile && ownsPath && ownsHunk) {
			matches.push(candidate(member.member));
		}
	}
	return matches;
}

function candidate(member: {
	readonly memberId: string;
	readonly number?: number;
}): ReviewCommentCandidate {
	return member.number === undefined
		? { memberId: member.memberId }
		: { memberId: member.memberId, number: member.number };
}
