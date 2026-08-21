import { createHash, randomUUID } from "node:crypto";
import {
	type PendingReview,
	type ReviewSnapshot,
	ReviewSubmissionState,
} from "../_generated/code_review_pb.js";
import { isJsonBigInt, type JsonObject } from "../json.js";
import type { SessionProcessRunner } from "../session-orchestrator.js";
import { REVIEW_ERROR, ReviewError } from "./review-errors.js";

export type ReviewProviderSubmitInput = {
	readonly snapshot: ReviewSnapshot;
	readonly pending: PendingReview;
	readonly commandId: string;
};

export type ReviewProviderSubmitResult = {
	readonly submissionId: string;
	readonly state: ReviewSubmissionState;
	readonly providerReviewId: string;
	readonly receiptHash: string;
};

export type ReviewProvider = {
	readonly id: "github";
	capabilities(): readonly string[];
	submitReview(
		input: ReviewProviderSubmitInput,
	): Promise<ReviewProviderSubmitResult>;
	importPullRequest?(
		host: string,
		repository: string,
		number: number,
	): Promise<{
		readonly headOid: string;
		readonly baseOid: string;
		readonly threads: readonly { readonly id: string; readonly body: string }[];
	}>;
};

export function reviewEffectDigest(input: JsonObject): string {
	return createHash("sha256")
		.update(
			JSON.stringify(input, (_, value) =>
				isJsonBigInt(value) ? value.toString() : value,
			),
		)
		.digest("hex");
}

export function createFakeGithubProvider(
	store: { submissions?: ReviewProviderSubmitResult[] } = {},
): ReviewProvider {
	const submissions = store.submissions ?? [];
	return {
		id: "github",
		capabilities: () => [
			"pull-request-import",
			"review-submit",
			"thread-reply",
			"thread-resolve",
		],
		async submitReview(input) {
			const existing = submissions.find(
				(item) => item.submissionId === input.commandId,
			);
			if (existing) return existing;
			const receipt = {
				submissionId: input.commandId,
				state: ReviewSubmissionState.APPLIED,
				providerReviewId: `PRR_${randomUUID()}`,
				receiptHash: reviewEffectDigest({
					commandId: input.commandId,
					digest: input.pending.effectDigest,
					head: input.pending.expectedProviderHeadOid,
				}),
			};
			submissions.push(receipt);
			return receipt;
		},
		async importPullRequest() {
			return { headOid: "", baseOid: "", threads: [] };
		},
	};
}

export function createGithubCliProvider(
	runner: SessionProcessRunner,
): ReviewProvider {
	return {
		id: "github",
		capabilities: () => ["pull-request-import", "review-submit"],
		async submitReview(input) {
			const target = input.snapshot.target;
			if (!target?.number) {
				throw new ReviewError(
					REVIEW_ERROR.UNSUPPORTED,
					"publish needs a pull-request target",
				);
			}
			const body = input.pending.summaryBody;
			const event =
				input.pending.decision === 2
					? "APPROVE"
					: input.pending.decision === 3
						? "REQUEST_CHANGES"
						: "COMMENT";
			const result = await runner.run(
				"gh",
				[
					"api",
					"--method",
					"POST",
					`repos/${target.repository}/pulls/${target.number}/reviews`,
					"-f",
					`event=${event}`,
					"-f",
					`body=${body}`,
					"-f",
					`commit_id=${input.pending.expectedProviderHeadOid}`,
				],
				target.repositoryRoot || process.cwd(),
			);
			if (result.code !== 0) {
				throw new ReviewError(
					REVIEW_ERROR.PROVIDER_DRIFT,
					result.stderr || "gh review submit failed",
				);
			}
			return {
				submissionId: input.commandId,
				state: ReviewSubmissionState.APPLIED,
				providerReviewId: input.commandId,
				receiptHash: reviewEffectDigest({ stdout: result.stdout }),
			};
		},
	};
}
