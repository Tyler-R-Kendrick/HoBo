import type { ReviewFileSummary } from "../_generated/code_review_pb.js";
import type { SessionProcessRunner } from "../session-orchestrator.js";
import { REVIEW_ERROR, ReviewError } from "./review-errors.js";

export async function applyHunkPatch(
	runner: SessionProcessRunner,
	cwd: string,
	input: {
		readonly fileId: string;
		readonly hunkId: string;
		readonly unstage: boolean;
		readonly files: readonly ReviewFileSummary[];
	},
): Promise<void> {
	const file = input.files.find((item) => item.fileId === input.fileId);
	if (!file)
		throw new ReviewError(REVIEW_ERROR.NOT_FOUND, "patch file not in manifest");
	const path = file.pathAfter || file.pathBefore;
	if (path.includes("\0") || path.includes("..")) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, "unsafe patch path");
	}
	const pre = await runner.run("git", ["write-tree"], cwd);
	if (pre.code !== 0)
		throw new ReviewError(
			REVIEW_ERROR.PATCH_CONFLICT,
			"preimage write-tree failed",
		);
	const args = input.unstage
		? ["restore", "--staged", "--worktree", "--source=HEAD", "--", path]
		: ["add", "--", path];
	const work = await runner.run("git", args, cwd);
	if (work.code !== 0) {
		throw new ReviewError(
			REVIEW_ERROR.PATCH_CONFLICT,
			work.stderr || "patch apply failed",
		);
	}
	const post = await runner.run("git", ["write-tree"], cwd);
	if (post.code !== 0)
		throw new ReviewError(
			REVIEW_ERROR.PATCH_CONFLICT,
			"postimage write-tree failed",
		);
}
