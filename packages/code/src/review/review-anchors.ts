import {
	type ReviewAnchor,
	ReviewAnchorHealth,
	type ReviewHunk,
} from "../_generated/code_review_pb.js";

export type ReanchorOutcome =
	| {
			readonly kind: "exact";
			readonly newAnchor: ReviewAnchor;
			readonly method: string;
			readonly evidence: readonly string[];
	  }
	| {
			readonly kind: "unique-context";
			readonly newAnchor: ReviewAnchor;
			readonly method: string;
			readonly evidence: readonly string[];
	  }
	| {
			readonly kind: "stale";
			readonly reason: string;
			readonly evidence: readonly string[];
	  }
	| {
			readonly kind: "ambiguous";
			readonly reason: string;
			readonly evidence: readonly string[];
	  };

export function reanchor(
	anchor: ReviewAnchor,
	hunks: readonly ReviewHunk[],
	nextGenerationId: string,
	fileId: string,
): ReanchorOutcome {
	if (anchor.generationId === nextGenerationId && anchor.fileId === fileId) {
		return {
			kind: "exact",
			newAnchor: anchor,
			method: "same-generation",
			evidence: [anchor.anchorId],
		};
	}
	const sameFingerprint = hunks.filter(
		(hunk) => hunk.fingerprint === anchor.hunkFingerprint,
	);
	if (sameFingerprint.length === 1) {
		const hunk = sameFingerprint[0]!;
		return {
			kind: "exact",
			newAnchor: {
				...anchor,
				generationId: nextGenerationId,
				fileId,
				hunkId: hunk.hunkId,
			},
			method: "unique-hunk",
			evidence: [hunk.fingerprint],
		};
	}
	if (sameFingerprint.length > 1) {
		return {
			kind: "ambiguous",
			reason: "multiple-matches",
			evidence: sameFingerprint.map((hunk) => hunk.fingerprint),
		};
	}
	const sameContent = hunks.filter((hunk) =>
		hunk.lines.some((line) => line.rawTextHash === anchor.selectedContentHash),
	);
	if (sameContent.length === 1) {
		const hunk = sameContent[0]!;
		return {
			kind: "unique-context",
			newAnchor: {
				...anchor,
				generationId: nextGenerationId,
				fileId,
				hunkId: hunk.hunkId,
			},
			method: "selected-content-and-context",
			evidence: [anchor.selectedContentHash],
		};
	}
	if (sameContent.length > 1) {
		return {
			kind: "ambiguous",
			reason: "multiple-matches",
			evidence: sameContent.map((hunk) => hunk.hunkId),
		};
	}
	return {
		kind: "stale",
		reason: hunks.length === 0 ? "deleted" : "no-match",
		evidence: [anchor.hunkFingerprint],
	};
}

export function coverageIdentity(fileId: string, hunkId?: string): string {
	return hunkId ? `${fileId}:${hunkId}` : fileId;
}

export { ReviewAnchorHealth };
