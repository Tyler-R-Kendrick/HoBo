import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewError } from "../src/review/review-errors.js";
import { reviewProcessRunner } from "../src/review/review-index-simulator.js";
import {
	assertSingleFileSelection,
	buildReviewPatch,
	parseUnifiedDiff,
} from "../src/review/review-patch.js";
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
	const root = mkdtempSync(join(tmpdir(), "hobo-review-patch-"));
	roots.push(root);
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "user.name", "Test"]);
	git(root, ["config", "core.autocrlf", "false"]);
	git(root, ["config", "core.eol", "lf"]);
	return root;
}

function generation(root: string, id = "gen-1"): ReviewGeneration {
	return {
		id,
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
	return `hunk:${fileId}:0`;
}

async function approveAndApply(
	executor: ReturnType<typeof createReviewPatchExecutor>,
	root: string,
	simulated: {
		readonly preIndexTreeOid: string;
		readonly postIndexTreeOid: string;
		readonly patchHash: string;
		readonly preimageHash: string;
	},
	path: string,
	operation:
		| "stage-review-selection"
		| "unstage-review-selection"
		| "apply-review-suggestion",
) {
	const digest = computeReviewPatchApprovalDigest({
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
	return await executor.apply({
		repositoryRoot: root,
		approvalDigest: digest,
		expectedPostIndexTreeOid: simulated.postIndexTreeOid,
		patchHash: simulated.patchHash,
	});
}

describe("review-patch", () => {
	it("rejects unsupported cross-hunk and cross-file ranges", () => {
		const parsed = parseUnifiedDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
@@ -20,3 +20,3 @@
 x
-y
+Y
 z
`);
		const file = parsed[0];
		if (!file) throw new Error("missing file");
		expect(() => buildReviewPatch(file, { startLine: 2, endLine: 21 })).toThrow(
			ReviewError,
		);
		try {
			buildReviewPatch(file, { startLine: 2, endLine: 21 });
		} catch (error) {
			expect(error).toMatchObject({ code: "unsupported-capability" });
			expect(String(error)).toMatch(/cross-hunk/u);
		}
		expect(() => assertSingleFileSelection(["a", "b"])).toThrow(/cross-file/u);
	});

	it("builds an exact patch for one hunk of a multi-hunk file", async () => {
		const root = repo();
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
		const diff = git(
			root,
			["diff", "--no-ext-diff", "--no-color", "--", "notes.txt"],
			[0, 1],
		);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(catalog, gen, diff);
		const executor = createReviewPatchExecutor({
			catalog,
			permittedWorktrees: [root],
		});
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			hunkId: "hunk:file-1:0",
			direction: "stage",
		});
		const applied = await approveAndApply(
			executor,
			root,
			simulated,
			"notes.txt",
			"stage-review-selection",
		);
		expect(applied.resultTreeOid).toBe(simulated.postIndexTreeOid);
		const staged = git(root, ["diff", "--cached", "--", "notes.txt"], [0, 1]);
		expect(staged).toContain("+BRAVO");
		expect(staged).not.toContain("NOVEMBER");
		const unstaged = git(root, ["diff", "--", "notes.txt"], [0, 1]);
		expect(unstaged).toContain("+NOVEMBER");
		expect(unstaged).not.toContain("BRAVO");
	});

	it("stages a line range inside a single hunk", async () => {
		const root = repo();
		writeFileSync(join(root, "range.txt"), "keep\none\ntwo\nthree\nkeep\n");
		git(root, ["add", "range.txt"]);
		git(root, ["commit", "-qm", "base"]);
		writeFileSync(join(root, "range.txt"), "keep\nONE\nTWO\nTHREE\nkeep\n");
		const diff = git(
			root,
			["diff", "--no-ext-diff", "--no-color", "--", "range.txt"],
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
			startLine: 2,
			endLine: 2,
			direction: "stage",
		});
		await approveAndApply(
			executor,
			root,
			simulated,
			"range.txt",
			"stage-review-selection",
		);
		const staged = git(root, ["show", ":range.txt"]);
		expect(staged).toContain("ONE");
		expect(staged).toContain("two");
		expect(staged).not.toContain("TWO");
	});

	it("preserves rename, mode, CRLF, and no-newline in exact patches", async () => {
		const constructed = parseUnifiedDiff(
			[
				"diff --git a/old name.txt b/renamed name.txt",
				"old mode 100644",
				"new mode 100755",
				"similarity index 80%",
				"rename from old name.txt",
				"rename to renamed name.txt",
				"--- a/old name.txt",
				"+++ b/renamed name.txt",
				"@@ -1,2 +1,2 @@",
				" keep",
				"-body",
				"+BODY",
				"",
			].join("\n"),
			"rename",
		);
		expect(constructed[0]?.file.status).toBe("renamed");
		expect(constructed[0]?.file.oldMode).toBe("100644");
		expect(constructed[0]?.file.newMode).toBe("100755");
		const renameFile = constructed[0];
		if (!renameFile) throw new Error("expected constructed rename patch");
		const builtRename = buildReviewPatch(renameFile, {
			hunkId: "hunk:rename-1:0",
		});
		expect(builtRename.text).toContain("rename from old name.txt");
		expect(builtRename.text).toContain("rename to renamed name.txt");

		const root = repo();
		writeFileSync(join(root, "crlf.txt"), "keep\r\nbody\r\n");
		writeFileSync(join(root, "nonewline.txt"), "tail");
		git(root, ["add", "-A"]);
		git(root, ["commit", "-qm", "base"]);
		writeFileSync(join(root, "crlf.txt"), "keep\r\nBODY\r\n");
		chmodSync(join(root, "crlf.txt"), 0o755);
		writeFileSync(join(root, "nonewline.txt"), "tail-changed");
		const crlfDiff = git(
			root,
			["diff", "--no-ext-diff", "--no-color", "--", "crlf.txt"],
			[0, 1],
		);
		expect(crlfDiff).toContain("\r");
		const crlfFile = parseUnifiedDiff(crlfDiff, "crlf")[0];
		if (!crlfFile) throw new Error("expected CRLF diff");
		expect(
			buildReviewPatch(crlfFile, {
				hunkId: "hunk:crlf-1:0",
			}).text,
		).toContain("\r");
		const nlDiff = git(
			root,
			["diff", "--no-ext-diff", "--no-color", "--", "nonewline.txt"],
			[0, 1],
		);
		expect(nlDiff).toMatch(/No newline at end of file/u);
		const nlFile = parseUnifiedDiff(nlDiff, "nl")[0];
		if (!nlFile) throw new Error("expected no-newline diff");
		const nlPatch = buildReviewPatch(nlFile, {
			hunkId: "hunk:nl-1:0",
		});
		expect(nlPatch.text).toContain("\\ No newline at end of file");
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(catalog, gen, crlfDiff, "file-1");
		const executor = createReviewPatchExecutor({ catalog });
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			direction: "stage",
		});
		await approveAndApply(
			executor,
			root,
			simulated,
			"crlf.txt",
			"stage-review-selection",
		);
		const blob = git(root, ["show", ":crlf.txt"]);
		expect(blob).toContain("\r\n");
		expect(blob).toContain("BODY");
	});

	it("stages metacharacter paths with argv-safe git", async () => {
		const root = repo();
		const path = "weird $file; name`.txt";
		writeFileSync(join(root, path), "alpha\nbeta\ngamma\n");
		git(root, ["add", "--", path]);
		git(root, ["commit", "-qm", "base"]);
		writeFileSync(join(root, path), "alpha\nBETA\ngamma\n");
		const diff = git(
			root,
			["diff", "--no-ext-diff", "--no-color", "--", path],
			[0, 1],
		);
		const catalog = createReviewPatchCatalog();
		const gen = generation(root);
		registerDiff(catalog, gen, diff);
		const calls: string[][] = [];
		const inner = reviewProcessRunner();
		const executor = createReviewPatchExecutor({
			catalog,
			runner: {
				async run(command, args, cwd, env) {
					calls.push([command, ...args]);
					return inner.run(command, args, cwd, env);
				},
			},
		});
		const simulated = await executor.simulate({
			repositoryRoot: root,
			generationId: gen.id,
			fileId: "file-1",
			direction: "stage",
		});
		await approveAndApply(
			executor,
			root,
			simulated,
			path,
			"stage-review-selection",
		);
		expect(git(root, ["show", `:${path}`])).toContain("BETA");
		expect(calls.every((call) => call[0] === "git")).toBe(true);
		expect(
			calls.some(
				(call) =>
					call[1] === "apply" &&
					call.includes("--cached") &&
					call.includes("--") &&
					call.some((arg) => arg.endsWith("change.patch")),
			),
		).toBe(true);
		expect(
			calls.every((call) =>
				call.slice(1).every((arg) => !arg.includes("git apply")),
			),
		).toBe(true);
	});
});
