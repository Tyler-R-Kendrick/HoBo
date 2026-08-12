import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGitReviewSource } from "../src/review/git-review-source.js";
import { createReviewCache } from "../src/review/review-cache.js";
import { createReviewContentStore } from "../src/review/review-content-store.js";
import {
	decodeReviewCursor,
	encodeReviewCursor,
} from "../src/review/review-cursors.js";
import { ReviewError } from "../src/review/review-errors.js";
import type {
	ReviewDiffSource,
	ReviewTarget,
} from "../src/review/review-ports.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync("git", [...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Review",
			GIT_AUTHOR_EMAIL: "review@example.com",
			GIT_COMMITTER_NAME: "Review",
			GIT_COMMITTER_EMAIL: "review@example.com",
		},
	});
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return (result.stdout ?? "").trim();
}

function oid(cwd: string, rev = "HEAD"): string {
	return git(cwd, ["rev-parse", rev]);
}

function repository(setup?: (root: string) => void): string {
	const root = tmp("hobo-review-repo-");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "review@example.com"]);
	git(root, ["config", "user.name", "Review"]);
	git(root, ["config", "core.autocrlf", "false"]);
	writeFileSync(join(root, "README.md"), "base\n");
	git(root, ["add", "-A"]);
	git(root, ["commit", "-qm", "base"]);
	setup?.(root);
	return root;
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function createSource(
	repo: string,
	options?: {
		readonly createId?: () => string;
		readonly now?: () => string;
		readonly delayDiff?: () => Promise<void>;
	},
): {
	readonly source: ReviewDiffSource;
	readonly store: ReturnType<typeof createReviewContentStore>;
	readonly cache: ReturnType<typeof createReviewCache>;
	readonly gitCalls: string[][];
	readonly storeRoot: string;
	readonly objectsRoot: string;
} {
	const storeRoot = tmp("hobo-review-store-");
	const objectsRoot = tmp("hobo-review-objects-");
	const store = createReviewContentStore({ root: storeRoot });
	const cache = createReviewCache();
	const gitCalls: string[][] = [];
	const real = async (
		command: string,
		args: readonly string[],
		cwd: string,
		env?: Readonly<Record<string, string>>,
	) => {
		const result = spawnSync(command, [...args], {
			cwd,
			encoding: "utf8",
			env: env ? { ...process.env, ...env } : process.env,
		});
		return {
			code: result.status,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
		};
	};
	const source = createGitReviewSource({
		contentStore: store,
		cache,
		repositoryRoot: repo,
		objectsRoot,
		now: options?.now ?? (() => "2026-08-12T00:00:00.000Z"),
		createId: options?.createId,
		runner: {
			async run(command, args, cwd, env) {
				gitCalls.push([command, ...args]);
				if (options?.delayDiff && args.includes("diff"))
					await options.delayDiff();
				return real(command, args, cwd, env);
			},
		},
	});
	return { source, store, cache, gitCalls, storeRoot, objectsRoot };
}

function commitTarget(root: string, parentRev = "HEAD^"): ReviewTarget {
	return {
		kind: "commit",
		repositoryId: "repo-1",
		repositoryRoot: root,
		parentCommitOid: oid(root, parentRev),
		commitOid: oid(root),
	};
}

describe("review content store", () => {
	it("addresses blobs by sha256, writes atomically, and uses restrictive perms", async () => {
		const root = tmp("hobo-review-store-");
		const store = createReviewContentStore({ root });
		const bytes = new Uint8Array([0, 1, 2, 255]);
		const hash = await store.put(bytes);
		expect(hash).toBe(sha256(bytes));
		expect(await store.has(hash)).toBe(true);
		expect([...(await store.get(hash))]).toEqual([0, 1, 2, 255]);
		expect(statSync(join(root, hash)).mode & 0o777).toBe(0o600);
		expect(statSync(root).mode & 0o777).toBe(0o700);
		expect(
			spawnSync("ls", ["-A", root], { encoding: "utf8" }).stdout,
		).not.toMatch(/tmp|partial/iu);
	});

	it("rejects user path components, oversized bodies, and corrupted bytes", async () => {
		const root = tmp("hobo-review-store-");
		const store = createReviewContentStore({ root, maxBytes: 16 });
		const hash = await store.put(new Uint8Array([9, 8, 7]));
		await expect(store.get("../etc/passwd")).rejects.toMatchObject({
			code: "malformed-input",
		});
		await expect(store.get(`sha256:${"a".repeat(64)}`)).rejects.toMatchObject({
			code: "malformed-input",
		});
		await expect(store.get(`${hash}/../${hash}`)).rejects.toMatchObject({
			code: "malformed-input",
		});
		await expect(store.put(new Uint8Array(17))).rejects.toMatchObject({
			code: "body-limit",
		});
		writeFileSync(join(root, hash), "tampered");
		await expect(store.get(hash)).rejects.toBeInstanceOf(ReviewError);
		await expect(store.get(hash)).rejects.toMatchObject({
			code: "corrupted-state",
		});
		await expect(store.get("b".repeat(64))).rejects.toMatchObject({
			code: "not-found",
		});
	});
});

describe("review cursors", () => {
	it("binds an opaque cursor to a generation and rejects tampering", () => {
		const secret = "cursor-secret";
		const cursor = encodeReviewCursor(
			{ kind: "manifest", generationId: "gen-1", offset: 20 },
			secret,
		);
		expect(cursor).not.toContain("gen-1");
		expect(cursor).not.toContain("manifest");
		expect(
			decodeReviewCursor(cursor, {
				secret,
				generationId: "gen-1",
				kind: "manifest",
			}),
		).toEqual({ kind: "manifest", generationId: "gen-1", offset: 20 });
		expect(() =>
			decodeReviewCursor(`${cursor.slice(0, -2)}aa`, {
				secret,
				generationId: "gen-1",
				kind: "manifest",
			}),
		).toThrow(ReviewError);
		try {
			decodeReviewCursor(cursor, {
				secret,
				generationId: "gen-2",
				kind: "manifest",
			});
			throw new Error("expected cursor to reject the other generation");
		} catch (error) {
			expect(error).toBeInstanceOf(ReviewError);
			expect((error as ReviewError).code).toBe("stale-generation");
		}
	});
});

describe("review cache", () => {
	it("cancels prior in-flight generations for the same review", () => {
		const cache = createReviewCache();
		const first = {
			generation: {
				id: "gen-1",
				reviewId: "rev-1",
				ordinal: 1,
				target: {
					kind: "commit" as const,
					repositoryId: "repo-1",
					repositoryRoot: "/tmp/repo",
					parentCommitOid: "a".repeat(40),
					commitOid: "b".repeat(40),
				},
				createdAt: "2026-08-12T00:00:00.000Z",
				createdBy: "actor",
				manifestHash: "a".repeat(64),
				diffOptionsHash: "b".repeat(64),
			},
			files: [],
			cursorSecret: "s1",
			repositoryRoot: "/tmp/repo",
			cancelled: false,
			ready: false,
			abort: new AbortController(),
		};
		cache.put(first);
		cache.cancelReview("rev-1", "gen-2");
		expect(cache.get("gen-1")?.cancelled).toBe(true);
		expect(first.abort.signal.aborted).toBe(true);
	});
});

describe("git review source", () => {
	it("builds a working-tree generation that includes untracked files", async () => {
		const root = repository((repo) => {
			writeFileSync(join(repo, "README.md"), "dirty\n");
			writeFileSync(join(repo, "fresh.txt"), "untracked\n");
		});
		const { source } = createSource(root);
		const resolved = await source.resolveTarget({
			kind: "working-tree",
			repositoryId: "repo-1",
			repositoryRoot: root,
			baseCommitOid: "pending",
			indexTreeOid: "pending",
			worktreeManifestHash: "pending",
		});
		if (resolved.kind !== "working-tree") throw new Error("expected worktree");
		expect(resolved.baseCommitOid).toBe(oid(root));
		expect(resolved.indexTreeOid).toMatch(/^[0-9a-f]{40}$/u);
		expect(resolved.worktreeManifestHash).toMatch(/^[0-9a-f]{64}$/u);
		const generation = await source.createGeneration({
			reviewId: "rev-work",
			actorId: "actor-1",
			target: resolved,
		});
		const manifest = await source.loadManifest(generation.id);
		expect(manifest.files.some((file) => file.pathAfter === "README.md")).toBe(
			true,
		);
		expect(manifest.files.some((file) => file.pathAfter === "fresh.txt")).toBe(
			true,
		);
		expect(
			manifest.files.find((file) => file.pathAfter === "fresh.txt")?.status,
		).toBe("added");
	});

	it("builds an index generation from staged changes only", async () => {
		const root = repository((repo) => {
			writeFileSync(join(repo, "staged.txt"), "staged\n");
			git(repo, ["add", "staged.txt"]);
			writeFileSync(join(repo, "loose.txt"), "not staged\n");
		});
		const { source } = createSource(root);
		const generation = await source.createGeneration({
			reviewId: "rev-index",
			actorId: "actor-1",
			target: {
				kind: "index",
				repositoryId: "repo-1",
				repositoryRoot: root,
				baseCommitOid: "pending",
				indexTreeOid: "pending",
			},
		});
		const manifest = await source.loadManifest(generation.id);
		expect(manifest.files.map((file) => file.pathAfter)).toEqual([
			"staged.txt",
		]);
	});

	it("reviews a commit, range, PR, and stack member without checking out", async () => {
		const root = repository();
		const base = oid(root);
		writeFileSync(join(root, "feature.txt"), "one\n");
		git(root, ["add", "feature.txt"]);
		git(root, ["commit", "-qm", "feature-1"]);
		const first = oid(root);
		git(root, ["switch", "-q", "-c", "pr-head"]);
		writeFileSync(join(root, "feature.txt"), "one\ntwo\n");
		git(root, ["commit", "-am", "feature-2"]);
		const second = oid(root);
		git(root, ["switch", "-q", "main"]);
		const mainHead = oid(root);
		const { source, objectsRoot, gitCalls } = createSource(root);
		const commitGen = await source.createGeneration({
			reviewId: "rev-commit",
			actorId: "actor-1",
			target: {
				kind: "commit",
				repositoryId: "repo-1",
				repositoryRoot: root,
				parentCommitOid: base,
				commitOid: first,
			},
		});
		expect(
			(await source.loadManifest(commitGen.id)).files.some(
				(file) => file.pathAfter === "feature.txt",
			),
		).toBe(true);

		const range = await source.resolveTarget({
			kind: "range",
			repositoryId: "repo-1",
			repositoryRoot: root,
			requestedBaseRef: "main",
			requestedHeadRef: "pr-head",
			mergeBaseOid: "pending",
			baseCommitOid: "pending",
			headCommitOid: "pending",
		});
		if (range.kind !== "range") throw new Error("expected range");
		expect(range.mergeBaseOid).toBe(
			git(root, ["merge-base", "--", "main", "pr-head"]),
		);
		expect(range.mergeBaseOid).toMatch(/^[0-9a-f]{40}$/u);
		expect(range.headCommitOid).toBe(second);
		expect(range.baseCommitOid).toBe(mainHead);

		const beforeRefs = git(root, [
			"for-each-ref",
			"--format=%(refname) %(objectname)",
		]);
		const pr = await source.resolveTarget({
			kind: "pull-request",
			provider: "github",
			host: "github.com",
			repository: "acme/demo",
			number: 7,
			baseRef: "refs/heads/main",
			headRef: "refs/heads/pr-head",
			mergeBaseOid: "0".repeat(40),
			baseCommitOid: "0".repeat(40),
			headCommitOid: "0".repeat(40),
		});
		if (pr.kind !== "pull-request") throw new Error("expected pull-request");
		expect(pr.mergeBaseOid).toBe(range.mergeBaseOid);
		expect(pr.headCommitOid).toBe(second);
		expect(oid(root)).toBe(mainHead);
		expect(git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
		expect(git(root, ["status", "--porcelain"])).toBe("");
		expect(
			git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
		).toBe(beforeRefs);
		expect(oid(root, "HEAD")).toBe(mainHead);
		const prGen = await source.createGeneration({
			reviewId: "rev-pr",
			actorId: "actor-1",
			target: pr,
		});
		const prManifest = await source.loadManifest(prGen.id);
		expect(
			prManifest.files.some((file) => file.pathAfter === "feature.txt"),
		).toBe(true);
		expect(
			gitCalls.every(
				(args) =>
					args[0] !== "git" ||
					!["checkout", "switch", "reset"].includes(args[1] ?? ""),
			),
		).toBe(true);
		expect(
			spawnSync("find", [objectsRoot, "-type", "f"], { encoding: "utf8" })
				.stdout.length,
		).toBeGreaterThan(0);

		const stack = await source.resolveTarget({
			kind: "stack",
			stackId: "stack-1",
			repositoryId: "repo-1",
			aggregateBaseOid: "pending",
			aggregateHeadOid: "pending",
			members: [
				{
					memberId: "m1",
					baseCommitOid: base,
					headCommitOid: first,
					mergeBaseOid: "pending",
				},
				{
					memberId: "m2",
					baseCommitOid: first,
					headCommitOid: second,
					mergeBaseOid: "pending",
				},
			],
		});
		if (stack.kind !== "stack") throw new Error("expected stack");
		expect(stack.members[0]?.mergeBaseOid).toMatch(/^[0-9a-f]{40}$/u);
		expect(stack.members[1]?.mergeBaseOid).toBe(first);
		const stackGen = await source.createGeneration({
			reviewId: "rev-stack",
			actorId: "actor-1",
			target: stack,
		});
		const stackManifest = await source.loadManifest(stackGen.id);
		expect(stackManifest.files.some((file) => file.fileId.includes("m2"))).toBe(
			true,
		);
	});

	it("classifies rename, copy, delete, mode, symlink, submodule, binary, CRLF, no-newline, long-line, and metacharacter paths", async () => {
		const root = repository((repo) => {
			writeFileSync(join(repo, "keep.txt"), "same\n".repeat(20));
			writeFileSync(join(repo, "gone.txt"), "delete me\n");
			writeFileSync(join(repo, "mode.sh"), "echo hi\n");
			writeFileSync(join(repo, "crlf.txt"), "old\n");
			writeFileSync(join(repo, "nonewline.txt"), "closed\n");
			writeFileSync(join(repo, "long.txt"), "short\n");
			writeFileSync(join(repo, "plain.txt"), "plain\n");
			git(repo, ["add", "-A"]);
			git(repo, ["commit", "-qm", "fixtures"]);
		});
		git(root, ["mv", "plain.txt", "renamed.txt"]);
		writeFileSync(join(root, "copied.txt"), `${"same\n".repeat(20)}tail\n`);
		rmSync(join(root, "gone.txt"));
		chmodSync(join(root, "mode.sh"), 0o755);
		symlinkSync("keep.txt", join(root, "link.txt"));
		writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2, 0, 255]));
		writeFileSync(join(root, "crlf.txt"), "old\r\nnew\r\n");
		writeFileSync(join(root, "nonewline.txt"), "open");
		writeFileSync(join(root, "long.txt"), `${"z".repeat(80_000)}\n`);
		writeFileSync(join(root, "weird $file&(1).txt"), "meta\n");
		const sub = tmp("hobo-review-sub-");
		git(sub, ["init", "-q", "-b", "main"]);
		git(sub, ["config", "user.email", "review@example.com"]);
		git(sub, ["config", "user.name", "Review"]);
		writeFileSync(join(sub, "inside.txt"), "sub\n");
		git(sub, ["add", "-A"]);
		git(sub, ["commit", "-qm", "sub"]);
		const subOid = oid(sub);
		git(root, ["add", "-A"]);
		git(root, [
			"update-index",
			"--add",
			"--cacheinfo",
			`160000,${subOid},vendor/lib`,
		]);
		git(root, ["commit", "-qm", "kinds"]);

		const { source } = createSource(root);
		const generation = await source.createGeneration({
			reviewId: "rev-kinds",
			actorId: "actor-1",
			target: commitTarget(root),
		});
		const manifest = await source.loadManifest(generation.id);
		const byPath = new Map(
			manifest.files.map((file) => [file.pathAfter ?? file.pathBefore, file]),
		);
		expect(byPath.get("renamed.txt")?.status).toBe("renamed");
		expect(byPath.get("renamed.txt")?.pathBefore).toBe("plain.txt");
		expect(byPath.get("copied.txt")?.status).toBe("copied");
		expect(byPath.get("gone.txt")?.status).toBe("deleted");
		expect(byPath.get("mode.sh")?.oldMode).toBe("100644");
		expect(byPath.get("mode.sh")?.newMode).toBe("100755");
		expect(byPath.get("link.txt")?.newMode).toBe("120000");
		expect(byPath.get("vendor/lib")?.status).toBe("submodule");
		expect(byPath.get("binary.bin")?.binary).toBe(true);
		expect(byPath.get("weird $file&(1).txt")?.status).toBe("added");
		const crlf = await source.loadChunk(
			generation.id,
			byPath.get("crlf.txt")?.fileId ?? "",
		);
		expect(
			crlf.hunks.some((hunk) =>
				hunk.lines.some((line) => line.displayText.includes("new")),
			),
		).toBe(true);
		const nonew = await source.loadChunk(
			generation.id,
			byPath.get("nonewline.txt")?.fileId ?? "",
		);
		expect(
			nonew.hunks.some((hunk) =>
				hunk.lines.some((line) => line.kind === "no-newline-marker"),
			),
		).toBe(true);
		const long = await source.loadChunk(
			generation.id,
			byPath.get("long.txt")?.fileId ?? "",
		);
		expect(
			long.hunks.some((hunk) =>
				hunk.lines.some((line) => line.displayText.length >= 80_000),
			),
		).toBe(true);
	});

	it("pages a 1000-file manifest without parsing unified bodies", async () => {
		const root = repository((repo) => {
			mkdirSync(join(repo, "bulk"));
			for (let index = 0; index < 1000; index += 1)
				writeFileSync(
					join(repo, "bulk", `${String(index).padStart(4, "0")}.txt`),
					`file-${index}\n`,
				);
			git(repo, ["add", "bulk"]);
			git(repo, ["commit", "-qm", "thousand"]);
		});
		const { source, gitCalls } = createSource(root);
		const generation = await source.createGeneration({
			reviewId: "rev-1000",
			actorId: "actor-1",
			target: commitTarget(root),
		});
		const first = await source.loadManifest(generation.id);
		expect(first.totalFiles).toBe(1000);
		expect(first.files.length).toBeLessThan(1000);
		expect(first.pages.nextCursor).toBeTruthy();
		const names = new Set(first.files.map((file) => file.pathAfter));
		let cursor = first.pages.nextCursor;
		let pages = 1;
		while (cursor) {
			const page = await source.loadManifest(generation.id, cursor);
			for (const file of page.files) names.add(file.pathAfter);
			cursor = page.pages.nextCursor;
			pages += 1;
		}
		expect(names.size).toBe(1000);
		expect(pages).toBeGreaterThan(1);
		const bodyCommands = gitCalls.filter(
			([command, ...args]) =>
				command === "git" &&
				args[0] === "diff" &&
				(args.includes("-p") ||
					args.includes("--patch") ||
					args.includes("-u") ||
					args.some((arg) => arg.startsWith("--unified"))),
		);
		expect(bodyCommands).toEqual([]);
		expect(
			gitCalls.some(
				([command, ...args]) =>
					command === "git" &&
					args[0] === "diff" &&
					(args.includes("--raw") || args.includes("--numstat")),
			),
		).toBe(true);
	});

	it("rejects a tampered cursor and cancelled generations", async () => {
		const root = repository((repo) => {
			writeFileSync(join(repo, "a.txt"), "a\n");
			git(repo, ["add", "a.txt"]);
			git(repo, ["commit", "-qm", "a"]);
		});
		const { source, cache } = createSource(root, {
			createId: () => "gen-fixed",
		});
		const generation = await source.createGeneration({
			reviewId: "rev-cursor",
			actorId: "actor-1",
			target: commitTarget(root),
		});
		const page = await source.loadManifest(generation.id);
		await expect(
			source.loadManifest(
				generation.id,
				`${page.pages.nextCursor ?? page.pages.cursor ?? "abc"}x`,
			),
		).rejects.toMatchObject({
			code: expect.stringMatching(/malformed-input|corrupted-state/u),
		});
		source.cancel(generation.id);
		expect(cache.get(generation.id)?.cancelled).toBe(true);
		await expect(source.loadManifest(generation.id)).rejects.toMatchObject({
			code: "stale-generation",
		});
	});

	it("cancels an in-flight generation when a later one starts", async () => {
		const root = repository((repo) => {
			writeFileSync(join(repo, "a.txt"), "a\n");
			git(repo, ["add", "a.txt"]);
			git(repo, ["commit", "-qm", "a"]);
		});
		let resume: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			resume = resolve;
		});
		let ids = 0;
		const { source } = createSource(root, {
			createId: () => `gen-${++ids}`,
			delayDiff: () => gate,
		});
		const first = source.createGeneration({
			reviewId: "rev-latest",
			actorId: "actor-1",
			target: commitTarget(root),
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		const second = source.createGeneration({
			reviewId: "rev-latest",
			actorId: "actor-1",
			target: commitTarget(root),
		});
		resume?.();
		const results = await Promise.allSettled([first, second]);
		const rejected = results.find((result) => result.status === "rejected");
		const fulfilled = results.find((result) => result.status === "fulfilled");
		expect(rejected).toBeTruthy();
		expect(fulfilled).toBeTruthy();
		if (rejected?.status === "rejected") {
			expect(rejected.reason).toBeInstanceOf(ReviewError);
			expect((rejected.reason as ReviewError).code).toBe("stale-generation");
		}
	});
});
