import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewError } from "../src/review/review-errors.js";
import { createReviewDiffLine } from "../src/review/review-patch.js";
import {
	computeReviewPatchApprovalDigest,
	createReviewPatchCatalog,
	createReviewPatchExecutor,
} from "../src/review/review-patch-executor.js";
import type {
	ReviewGeneration,
	ReviewHunk,
} from "../src/review/review-ports.js";
import { parseGitHubSuggestion } from "../src/review/review-suggestions.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function git(
	cwd: string,
	args: readonly string[],
	allow: readonly number[] = [0],
): string {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
	const code = result.status ?? 1;
	if (!allow.includes(code))
		throw new Error(result.stderr || `git ${args[0]} failed`);
	return result.stdout;
}

function repo(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-review-suggest-"));
	roots.push(root);
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "user.name", "Test"]);
	git(root, ["config", "core.autocrlf", "false"]);
	return root;
}

function generation(root: string): ReviewGeneration {
	return {
		id: "gen-1",
		reviewId: "review-1",
		ordinal: 1,
		target: {
			kind: "working-tree",
			repositoryId: "repo-1",
			repositoryRoot: root,
			baseCommitOid: git(root, ["rev-parse", "HEAD"]).trim(),
			indexTreeOid: git(root, ["write-tree"]).trim(),
			worktreeManifestHash: "manifest",
		},
		createdAt: "2026-08-12T00:00:00.000Z",
		createdBy: "agent-bot",
		manifestHash: "manifest",
		diffOptionsHash: "diff",
	};
}

function fileHunk(text: string, line: number): ReviewHunk {
	return {
		hunkId: "hunk:file-1:0",
		header: `@@ -${line},3 +${line},3 @@`,
		oldStart: line,
		oldCount: 3,
		newStart: line,
		newCount: 3,
		fingerprint: "fp",
		lines: [
			createReviewDiffLine({
				lineId: "c1",
				kind: "context",
				rawText: "before",
				oldLine: line - 1,
				newLine: line - 1,
			}),
			createReviewDiffLine({
				lineId: "n1",
				kind: "context",
				rawText: text,
				oldLine: line,
				newLine: line,
			}),
			createReviewDiffLine({
				lineId: "c2",
				kind: "context",
				rawText: "after",
				oldLine: line + 1,
				newLine: line + 1,
			}),
		],
	};
}

function digestFor(
	root: string,
	simulated: {
		readonly preIndexTreeOid: string;
		readonly postIndexTreeOid: string;
		readonly patchHash: string;
		readonly preimageHash: string;
	},
	path: string,
): string {
	return computeReviewPatchApprovalDigest({
		operation: "apply-review-suggestion",
		patchHash: simulated.patchHash,
		preIndexTreeOid: simulated.preIndexTreeOid,
		postIndexTreeOid: simulated.postIndexTreeOid,
		preimageHash: simulated.preimageHash,
		headOid: git(root, ["rev-parse", "HEAD"]).trim(),
		repositoryRoot: git(root, [
			"rev-parse",
			"--path-format=absolute",
			"--show-toplevel",
		]).trim(),
		path,
	});
}

describe("review suggestions", () => {
	it("parses a supported GitHub suggestion and rejects malformed blocks", () => {
		expect(parseGitHubSuggestion("nits:\n```suggestion\nfixed\n```\n")).toEqual(
			{
				replacement: "fixed",
			},
		);
		expect(() => parseGitHubSuggestion("```js\ncode\n```")).toThrow(
			ReviewError,
		);
		expect(() => parseGitHubSuggestion("no fence")).toThrow(
			/supported GitHub suggestion/u,
		);
		expect(() =>
			parseGitHubSuggestion("```suggestion\na\n```\n```suggestion\nb\n```"),
		).toThrow(/multiple suggestion/u);
	});

	it("applies a valid suggestion only after a human exact-effect digest", async () => {
		const root = repo();
		writeFileSync(join(root, "app.ts"), "before\nold\nafter\n");
		writeFileSync(join(root, "untracked.ts"), "leave-me\n");
		git(root, ["add", "app.ts"]);
		git(root, ["commit", "-qm", "base"]);
		const head = git(root, ["rev-parse", "HEAD"]).trim();
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		catalog.add({
			generation: gen,
			file: {
				fileId: "file-1",
				pathAfter: "app.ts",
				status: "modified",
				binary: false,
				tooLargeForInline: false,
			},
			hunks: [fileHunk("old", 2)],
		});
		const executor = createReviewPatchExecutor({
			catalog,
			permittedWorktrees: [root],
		});
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			startLine: 2,
			endLine: 2,
			direction: "suggestion",
			suggestionBody: "```suggestion\nfixed\n```",
		});
		await expect(
			executor.apply({
				repositoryRoot: root,
				approvalDigest: "",
				expectedPostIndexTreeOid: simulated.postIndexTreeOid,
				patchHash: simulated.patchHash,
			}),
		).rejects.toMatchObject({ code: "approval-required" });
		await expect(
			executor.apply({
				repositoryRoot: root,
				approvalDigest: "agent-self-approve",
				expectedPostIndexTreeOid: simulated.postIndexTreeOid,
				patchHash: simulated.patchHash,
			}),
		).rejects.toMatchObject({ code: "approval-mismatch" });
		const applied = await executor.apply({
			repositoryRoot: root,
			approvalDigest: digestFor(root, simulated, "app.ts"),
			expectedPostIndexTreeOid: simulated.postIndexTreeOid,
			patchHash: simulated.patchHash,
		});
		expect(applied.resultTreeOid).toBe(simulated.postIndexTreeOid);
		expect(readFileSync(join(root, "app.ts"), "utf8")).toBe(
			"before\nfixed\nafter\n",
		);
		expect(git(root, ["show", ":app.ts"])).toContain("fixed");
		expect(git(root, ["rev-parse", "HEAD"]).trim()).toBe(head);
		expect(git(root, ["status", "--porcelain", "-uall"])).toContain(
			"?? untracked.ts",
		);
		expect(readFileSync(join(root, "untracked.ts"), "utf8")).toBe("leave-me\n");
	});

	it("rejects an outdated suggestion preimage", async () => {
		const root = repo();
		writeFileSync(join(root, "app.ts"), "before\nchanged\nafter\n");
		git(root, ["add", "app.ts"]);
		git(root, ["commit", "-qm", "base"]);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		catalog.add({
			generation: gen,
			file: {
				fileId: "file-1",
				pathAfter: "app.ts",
				status: "modified",
				binary: false,
				tooLargeForInline: false,
			},
			hunks: [fileHunk("old", 2)],
		});
		const executor = createReviewPatchExecutor({ catalog });
		await expect(
			executor.simulate({
				repositoryRoot: root,
				generationId: gen.id,
				fileId: "file-1",
				startLine: 2,
				endLine: 2,
				direction: "suggestion",
				suggestionBody: "```suggestion\nfixed\n```",
			}),
		).rejects.toMatchObject({ code: "anchor-stale" });
	});

	it("rejects a suggestion path that escapes the repository", async () => {
		const root = repo();
		writeFileSync(join(root, "app.ts"), "ok\n");
		git(root, ["add", "app.ts"]);
		git(root, ["commit", "-qm", "base"]);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		catalog.add({
			generation: gen,
			file: {
				fileId: "file-1",
				pathAfter: "../escape.txt",
				status: "modified",
				binary: false,
				tooLargeForInline: false,
			},
			hunks: [fileHunk("ok", 1)],
		});
		const executor = createReviewPatchExecutor({
			catalog,
			permittedWorktrees: [root],
		});
		await expect(
			executor.simulate({
				repositoryRoot: root,
				generationId: gen.id,
				fileId: "file-1",
				startLine: 1,
				endLine: 1,
				direction: "suggestion",
				suggestionBody: "```suggestion\nnope\n```",
			}),
		).rejects.toMatchObject({ code: "malformed-input" });
	});

	it("refuses to apply a suggestion outside the permitted worktree", async () => {
		const allowed = repo();
		writeFileSync(join(allowed, "app.ts"), "before\nold\nafter\n");
		git(allowed, ["add", "app.ts"]);
		git(allowed, ["commit", "-qm", "base"]);
		const other = repo();
		writeFileSync(join(other, "app.ts"), "before\nold\nafter\n");
		git(other, ["add", "app.ts"]);
		git(other, ["commit", "-qm", "base"]);
		const catalog = createReviewPatchCatalog();
		const gen = generation(other);
		catalog.add({
			generation: gen,
			file: {
				fileId: "file-1",
				pathAfter: "app.ts",
				status: "modified",
				binary: false,
				tooLargeForInline: false,
			},
			hunks: [fileHunk("old", 2)],
		});
		const executor = createReviewPatchExecutor({
			catalog,
			permittedWorktrees: [allowed],
		});
		await expect(
			executor.simulate({
				repositoryRoot: other,
				generationId: gen.id,
				fileId: "file-1",
				startLine: 2,
				endLine: 2,
				direction: "suggestion",
				suggestionBody: "```suggestion\nfixed\n```",
			}),
		).rejects.toMatchObject({ code: "auth-denied" });
	});
});
