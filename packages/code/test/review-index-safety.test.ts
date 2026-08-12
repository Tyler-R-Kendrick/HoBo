import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/review/review-patch.js";
import {
	computeReviewPatchApprovalDigest,
	createReviewPatchCatalog,
	createReviewPatchExecutor,
} from "../src/review/review-patch-executor.js";
import type { ReviewGeneration } from "../src/review/review-ports.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function lines(...values: string[]): string {
	return `${values.join("\n")}\n`;
}

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
	const root = mkdtempSync(join(tmpdir(), "hobo-review-index-"));
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
		createdBy: "tester",
		manifestHash: "manifest",
		diffOptionsHash: "diff",
	};
}

function registerDiff(
	catalog: ReturnType<typeof createReviewPatchCatalog>,
	gen: ReviewGeneration,
	diff: string,
	fileId = "file-1",
) {
	const parsed = parseUnifiedDiff(diff, fileId);
	const first = parsed[0];
	if (!first) throw new Error("expected a parsed file");
	catalog.add({
		generation: gen,
		file: { ...first.file, fileId },
		hunks: first.hunks.map((hunk, index) => ({
			...hunk,
			hunkId: `hunk:${fileId}:${index}`,
		})),
	});
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
	operation: "stage-review-selection" | "unstage-review-selection",
): string {
	return computeReviewPatchApprovalDigest({
		operation,
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

function seedMultiHunk(root: string): void {
	writeFileSync(
		join(root, "notes.txt"),
		lines(
			"alpha",
			"bravo",
			"charlie",
			"delta",
			"echo",
			"foxtrot",
			"golf",
			"hotel",
			"india",
			"juliet",
			"kilo",
			"lima",
			"mike",
			"november",
			"oscar",
			"papa",
		),
	);
	git(root, ["add", "notes.txt"]);
	git(root, ["commit", "-qm", "base"]);
	writeFileSync(
		join(root, "notes.txt"),
		lines(
			"alpha",
			"BRAVO",
			"charlie",
			"delta",
			"echo",
			"foxtrot",
			"golf",
			"hotel",
			"india",
			"juliet",
			"kilo",
			"lima",
			"mike",
			"NOVEMBER",
			"oscar",
			"papa",
		),
	);
}

describe("review index safety", () => {
	it("unstages one hunk and leaves the other staged", async () => {
		const root = repo();
		seedMultiHunk(root);
		git(root, ["add", "--", "notes.txt"]);
		const diff = git(
			root,
			["diff", "--cached", "--no-ext-diff", "--no-color", "--", "notes.txt"],
			[0, 1],
		);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(catalog, gen, diff);
		const executor = createReviewPatchExecutor({ catalog });
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			hunkId: "hunk:file-1:0",
			direction: "unstage",
		});
		await executor.apply({
			repositoryRoot: root,
			approvalDigest: digestFor(
				root,
				simulated,
				"notes.txt",
				"unstage-review-selection",
			),
			expectedPostIndexTreeOid: simulated.postIndexTreeOid,
			patchHash: simulated.patchHash,
		});
		const staged = git(root, ["diff", "--cached", "--", "notes.txt"], [0, 1]);
		expect(staged).toContain("NOVEMBER");
		expect(staged).not.toContain("BRAVO");
		const unstaged = git(root, ["diff", "--", "notes.txt"], [0, 1]);
		expect(unstaged).toContain("BRAVO");
	});

	it("preserves mixed staged, unstaged, and untracked work", async () => {
		const root = repo();
		writeFileSync(
			join(root, "mixed.txt"),
			"one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n",
		);
		writeFileSync(join(root, "other.txt"), "keep\n");
		git(root, ["add", "-A"]);
		git(root, ["commit", "-qm", "base"]);
		writeFileSync(
			join(root, "mixed.txt"),
			"ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n",
		);
		git(root, ["add", "--", "mixed.txt"]);
		writeFileSync(
			join(root, "mixed.txt"),
			"ONE\ntwo\nthree\nfour\nFIVE\nsix\nseven\neight\n",
		);
		writeFileSync(join(root, "other.txt"), "KEEP\n");
		writeFileSync(join(root, "untracked.txt"), "scratch\n");
		const beforeOther = git(root, ["diff", "--", "other.txt"], [0, 1]);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		const diff = git(
			root,
			["diff", "--no-ext-diff", "--no-color", "--", "mixed.txt"],
			[0, 1],
		);
		registerDiff(catalog, gen, diff);
		const executor = createReviewPatchExecutor({ catalog });
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			direction: "stage",
		});
		await executor.apply({
			repositoryRoot: root,
			approvalDigest: digestFor(
				root,
				simulated,
				"mixed.txt",
				"stage-review-selection",
			),
			expectedPostIndexTreeOid: simulated.postIndexTreeOid,
			patchHash: simulated.patchHash,
		});
		expect(git(root, ["status", "--porcelain", "-uall"])).toContain(
			"?? untracked.txt",
		);
		expect(readFileSync(join(root, "untracked.txt"), "utf8")).toBe("scratch\n");
		expect(git(root, ["diff", "--", "other.txt"], [0, 1])).toBe(beforeOther);
		expect(git(root, ["show", ":mixed.txt"])).toContain("FIVE");
		expect(git(root, ["show", ":mixed.txt"])).toContain("ONE");
		expect(git(root, ["diff", "--", "mixed.txt"], [0, 1]).trim()).toBe("");
	});

	it("fails closed when the index changes after approval", async () => {
		const root = repo();
		seedMultiHunk(root);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(
			catalog,
			gen,
			git(
				root,
				["diff", "--no-ext-diff", "--no-color", "--", "notes.txt"],
				[0, 1],
			),
		);
		const executor = createReviewPatchExecutor({ catalog });
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			hunkId: "hunk:file-1:0",
			direction: "stage",
		});
		writeFileSync(join(root, "extra.txt"), "extra\n");
		git(root, ["add", "--", "extra.txt"]);
		await expect(
			executor.apply({
				repositoryRoot: root,
				approvalDigest: digestFor(
					root,
					simulated,
					"notes.txt",
					"stage-review-selection",
				),
				expectedPostIndexTreeOid: simulated.postIndexTreeOid,
				patchHash: simulated.patchHash,
			}),
		).rejects.toMatchObject({ code: "patch-conflict" });
		expect(git(root, ["show", ":notes.txt"])).toContain("bravo");
		expect(git(root, ["ls-files", "--", "extra.txt"]).trim()).toBe("extra.txt");
	});

	it("fails closed when the worktree changes after approval", async () => {
		const root = repo();
		seedMultiHunk(root);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(
			catalog,
			gen,
			git(
				root,
				["diff", "--no-ext-diff", "--no-color", "--", "notes.txt"],
				[0, 1],
			),
		);
		const executor = createReviewPatchExecutor({ catalog });
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			hunkId: "hunk:file-1:0",
			direction: "stage",
		});
		writeFileSync(
			join(root, "notes.txt"),
			lines(
				"alpha",
				"BRAVO",
				"charlie",
				"delta",
				"echo",
				"foxtrot",
				"golf",
				"HOTEL",
				"india",
				"CHANGED",
			),
		);
		await expect(
			executor.apply({
				repositoryRoot: root,
				approvalDigest: digestFor(
					root,
					simulated,
					"notes.txt",
					"stage-review-selection",
				),
				expectedPostIndexTreeOid: simulated.postIndexTreeOid,
				patchHash: simulated.patchHash,
			}),
		).rejects.toMatchObject({ code: "patch-conflict" });
		expect(git(root, ["show", ":notes.txt"])).toContain("bravo");
	});

	it("reports a conflict when the generation hunk no longer applies", async () => {
		const root = repo();
		seedMultiHunk(root);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(
			catalog,
			gen,
			git(
				root,
				["diff", "--no-ext-diff", "--no-color", "--", "notes.txt"],
				[0, 1],
			),
		);
		writeFileSync(
			join(root, "notes.txt"),
			lines(
				"alpha",
				"NOPE",
				"charlie",
				"delta",
				"echo",
				"foxtrot",
				"golf",
				"hotel",
				"india",
				"juliet",
			),
		);
		git(root, ["add", "--", "notes.txt"]);
		const executor = createReviewPatchExecutor({ catalog });
		await expect(
			executor.simulate({
				repositoryRoot: root,
				generationId: gen.id,
				fileId: "file-1",
				hunkId: "hunk:file-1:0",
				direction: "stage",
			}),
		).rejects.toMatchObject({ code: "patch-conflict" });
	});

	it("does not disturb untracked files during simulate or apply", async () => {
		const root = repo();
		seedMultiHunk(root);
		writeFileSync(join(root, "scratch.bin"), "do-not-touch");
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(
			catalog,
			gen,
			git(
				root,
				["diff", "--no-ext-diff", "--no-color", "--", "notes.txt"],
				[0, 1],
			),
		);
		const executor = createReviewPatchExecutor({ catalog });
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			hunkId: "hunk:file-1:0",
			direction: "stage",
		});
		await executor.apply({
			repositoryRoot: root,
			approvalDigest: digestFor(
				root,
				simulated,
				"notes.txt",
				"stage-review-selection",
			),
			expectedPostIndexTreeOid: simulated.postIndexTreeOid,
			patchHash: simulated.patchHash,
		});
		expect(readFileSync(join(root, "scratch.bin"), "utf8")).toBe(
			"do-not-touch",
		);
		expect(git(root, ["status", "--porcelain", "-uall"])).toContain(
			"?? scratch.bin",
		);
	});
});
