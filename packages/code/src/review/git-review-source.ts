import { createHash } from "node:crypto";
import { basename } from "node:path";

import { create } from "@bufbuild/protobuf";

import {
	type ReviewDiffManifest,
	type ReviewFileSummary,
	ReviewFileStatus,
	ReviewDiffManifestSchema,
	ReviewFileSummarySchema,
	ReviewPageMetadataSchema,
} from "../_generated/code_review_pb.js";
import type { SessionProcessRunner } from "../session-orchestrator.js";
import { REVIEW_ERROR, ReviewError } from "./review-errors.js";
import { hashText, parseUnifiedDiff } from "./unified-diff-parser.js";

const GENERATED = /(^|\/)(_generated|dist|node_modules|pnpm-lock\.yaml|package-lock\.json)$/u;

function statusFromRaw(code: string): ReviewFileStatus {
	if (code.startsWith("A")) return ReviewFileStatus.ADDED;
	if (code.startsWith("D")) return ReviewFileStatus.DELETED;
	if (code.startsWith("R")) return ReviewFileStatus.RENAMED;
	if (code.startsWith("C")) return ReviewFileStatus.COPIED;
	if (code.startsWith("T")) return ReviewFileStatus.TYPE_CHANGED;
	if (code.startsWith("U") || code === "UU") return ReviewFileStatus.UNMERGED;
	return ReviewFileStatus.MODIFIED;
}

export async function gitOid(
	runner: SessionProcessRunner,
	cwd: string,
	rev: string,
): Promise<string> {
	const result = await runner.run("git", ["rev-parse", rev], cwd);
	if (result.code !== 0) {
		throw new ReviewError(REVIEW_ERROR.NOT_FOUND, `git rev-parse ${rev} failed`);
	}
	return result.stdout.trim();
}

export async function gitWriteTree(
	runner: SessionProcessRunner,
	cwd: string,
): Promise<string> {
	const result = await runner.run("git", ["write-tree"], cwd);
	if (result.code !== 0) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, "git write-tree failed");
	}
	return result.stdout.trim();
}

export async function gitRepositoryId(
	runner: SessionProcessRunner,
	cwd: string,
): Promise<string> {
	const common = await runner.run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
	const remote = await runner.run("git", ["remote", "get-url", "origin"], cwd);
	const basis = `${common.stdout.trim()}\0${remote.stdout.trim()}`;
	return hashText(basis);
}

export async function loadReviewManifest(
	runner: SessionProcessRunner,
	cwd: string,
	generationId: string,
	base: string,
	head: string,
): Promise<{ readonly manifest: ReviewDiffManifest; readonly patches: Map<string, string> }> {
	const raw = await runner.run(
		"git",
		["diff", "--raw", "-z", "--no-ext-diff", "--no-color", "--find-renames", base, head],
		cwd,
	);
	if (raw.code !== 0 && !raw.stdout) {
		throw new ReviewError(REVIEW_ERROR.MALFORMED, raw.stderr || "git diff --raw failed");
	}
	const files: ReviewFileSummary[] = [];
	const parts = raw.stdout.split("\0").filter(Boolean);
	for (let i = 0; i < parts.length; i += 1) {
		const record = parts[i] ?? "";
		if (!record.startsWith(":")) continue;
		const bits = record.slice(1).split(" ");
		const oldMode = bits[0] ?? "";
		const newMode = bits[1] ?? "";
		const oldBlob = bits[2] ?? "";
		const newBlob = bits[3] ?? "";
		const statusCode = bits[4] ?? "M";
		const pathAfter = parts[i + 1] ?? "";
		const renamedFrom = statusCode.startsWith("R") || statusCode.startsWith("C") ? pathAfter : "";
		const path = statusCode.startsWith("R") || statusCode.startsWith("C") ? (parts[i + 2] ?? pathAfter) : pathAfter;
		if (statusCode.startsWith("R") || statusCode.startsWith("C")) i += 2;
		else i += 1;
		const binary = newMode === "160000" || oldMode === "160000";
		const fileId = hashText(`${oldBlob}:${newBlob}:${path}`).slice(0, 16);
		files.push(
			create(ReviewFileSummarySchema, {
				fileId,
				pathBefore: renamedFrom,
				pathAfter: path,
				status: binary ? ReviewFileStatus.SUBMODULE : statusFromRaw(statusCode),
				oldBlobOid: oldBlob,
				newBlobOid: newBlob,
				oldContentHash: oldBlob,
				newContentHash: newBlob,
				oldMode,
				newMode,
				additions: 0,
				deletions: 0,
				generatedHint: GENERATED.test(path) || basename(path).endsWith(".lock"),
				dependencyHint: basename(path).includes("lock"),
				binary,
				tooLargeForInline: false,
				hunkCount: 0,
			}),
		);
	}
	const patches = new Map<string, string>();
	let additions = 0;
	let deletions = 0;
	let binaries = 0;
	for (const file of files) {
		if (file.binary) {
			binaries += 1;
			continue;
		}
		const path = file.pathAfter || file.pathBefore;
		const patch = await runner.run(
			"git",
			["diff", "--no-ext-diff", "--no-textconv", "--no-color", "-U3", base, head, "--", path],
			cwd,
		);
		const hunks = parseUnifiedDiff(patch.stdout);
		file.hunkCount = hunks.length;
		file.additions = hunks.reduce(
			(sum, hunk) => sum + hunk.lines.filter((line) => line.kind === 2).length,
			0,
		);
		file.deletions = hunks.reduce(
			(sum, hunk) => sum + hunk.lines.filter((line) => line.kind === 3).length,
			0,
		);
		additions += file.additions;
		deletions += file.deletions;
		patches.set(file.fileId, patch.stdout);
	}
	const manifestHash = createHash("sha256")
		.update(files.map((file) => `${file.fileId}:${file.newBlobOid}`).join("\n"))
		.digest("hex");
	return {
		manifest: create(ReviewDiffManifestSchema, {
			generationId,
			manifestHash,
			files,
			totalFiles: files.length,
			totalAdditions: additions,
			totalDeletions: deletions,
			binaryFiles: binaries,
			pages: create(ReviewPageMetadataSchema, {
				pageSize: 50,
				nextCursor: "",
				totalFiles: files.length,
			}),
		}),
		patches,
	};
}

export async function workingTreeManifestHash(
	runner: SessionProcessRunner,
	cwd: string,
): Promise<string> {
	const status = await runner.run(
		"git",
		["status", "--porcelain=v2", "-z", "--untracked-files=all", "--no-optional-locks"],
		cwd,
	);
	return hashText(status.stdout);
}
