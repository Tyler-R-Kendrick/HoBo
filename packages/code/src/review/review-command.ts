import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

import { REVIEW_COMMAND_SCHEMA } from "./review-contract.js";
import { createReviewRuntime } from "./review-runtime.js";

function reviewHome(): string {
	return process.env.HOBO_HOME
		? join(process.env.HOBO_HOME, "durable", "code", "reviews")
		: join(homedir(), ".hobo", "durable", "code", "reviews");
}

export async function runReviewCommand(input: {
	readonly args: readonly string[];
	readonly flags: Readonly<Record<string, string | boolean>>;
	readonly cwd?: string;
}): Promise<{
	readonly ok: boolean;
	readonly code: string;
	readonly message: string;
	readonly data: unknown;
}> {
	const runtime = createReviewRuntime({
		dataDir: reviewHome(),
		authorize: () => true,
	});
	try {
		const action = input.args[0] ?? "list";
		const cwd = input.cwd ?? process.cwd();
		const reviewId =
			(typeof input.flags.id === "string" && input.flags.id) ||
			input.args[1] ||
			randomUUID();
		if (action === "list") {
			return {
				ok: true,
				code: "HOBO_CODE_REVIEW",
				message: "start a review to populate the inbox",
				data: { llmCalls: 0, reviews: [] },
			};
		}
		if (action === "show") {
			const snapshot = await runtime.load(reviewId);
			return {
				ok: Boolean(snapshot),
				code: snapshot ? "HOBO_CODE_REVIEW" : "HOBO_CODE_REVIEW_NOT_FOUND",
				message: reviewId,
				data: snapshot,
			};
		}
		const kindName =
			typeof input.flags.target === "string"
				? input.flags.target
				: "working-tree";
		const kind =
			kindName === "index"
				? "REVIEW_TARGET_KIND_INDEX"
				: kindName === "commit"
					? "REVIEW_TARGET_KIND_COMMIT"
					: kindName === "range"
						? "REVIEW_TARGET_KIND_RANGE"
						: kindName === "pull-request"
							? "REVIEW_TARGET_KIND_PULL_REQUEST"
							: "REVIEW_TARGET_KIND_WORKING_TREE";
		const envelope: Record<string, unknown> = {
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: randomUUID(),
			actorId: "cli",
			reviewId,
		};
		if (action === "start") {
			envelope.startReview = {
				sessionId:
					typeof input.flags.session === "string" ? input.flags.session : "",
				target: {
					kind,
					repositoryId: cwd,
					repositoryRoot: cwd,
					baseCommitOid:
						typeof input.flags.base === "string" ? input.flags.base : "",
					headCommitOid:
						typeof input.flags.head === "string" ? input.flags.head : "",
				},
			};
		} else if (action === "mark") {
			envelope.markReviewCoverage = {
				state: "REVIEW_COVERAGE_STATE_REVIEWED",
				unit: {
					kind: "file",
					fileId: input.args[2] ?? "",
					contentIdentity: "",
				},
			};
		} else if (action === "thread") {
			envelope.createReviewThread = {
				body: input.args.slice(2).join(" ") || "note",
			};
		} else {
			envelope.refreshReview = {};
		}
		const result = await runtime.execute(envelope);
		return {
			ok: result.accepted,
			code: result.code,
			message: result.message,
			data: result,
		};
	} finally {
		runtime.close();
	}
}
