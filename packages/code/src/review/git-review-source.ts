import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	hashReviewManifest,
	numstatKey,
	pageReviewManifest,
	parseGitNumstatZ,
	parseGitPorcelainV2Z,
	parseGitRawZ,
	type ReviewFileLocator,
	reviewFileId,
	toReviewFileSummary,
} from "./git-review-manifest.js";
import { createReviewCache, type ReviewCache } from "./review-cache.js";
import { decodeReviewCursor, encodeReviewCursor } from "./review-cursors.js";
import { reviewError } from "./review-errors.js";
import type {
	ReviewContentStore,
	ReviewDiffSource,
	ReviewFileSummary,
	ReviewGeneration,
	ReviewTarget,
} from "./review-ports.js";
import { parseUnifiedDiff } from "./unified-diff-parser.js";

// public-contract: PR fetches land only under this namespaced ref prefix.
export const HOBO_REVIEW_REF_NAMESPACE = "refs/hobo/reviews";
export const DEFAULT_CHUNK_PAGE_SIZE = 32;

const DIFF_SAFETY = ["--no-ext-diff", "--no-textconv", "--no-color"] as const;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ZERO_OID = "0".repeat(40);
const DIFF_OPTIONS_HASH = createHash("sha256")
	.update(
		JSON.stringify({
			rename: true,
			copy: true,
			context: 3,
			extDiff: false,
			textconv: false,
			color: false,
		}),
	)
	.digest("hex");

export interface ReviewGitRunner {
	run(
		command: string,
		args: readonly string[],
		cwd: string,
		env?: Readonly<Record<string, string>>,
	): Promise<{
		readonly code: number | null;
		readonly stdout: string;
		readonly stderr: string;
	}>;
}

export interface GitReviewSourceOptions {
	readonly contentStore: ReviewContentStore;
	readonly cache?: ReviewCache;
	readonly repositoryRoot?: string;
	readonly objectsRoot?: string;
	readonly now?: () => string;
	readonly createId?: () => string;
	readonly runner?: ReviewGitRunner;
	readonly pageSize?: number;
	readonly chunkPageSize?: number;
}

function defaultRunner(): ReviewGitRunner {
	return {
		run(command, args, cwd, env) {
			return new Promise((done) => {
				const child = spawn(command, [...args], {
					cwd,
					env: env ? { ...process.env, ...env } : process.env,
					stdio: ["ignore", "pipe", "pipe"],
				});
				let stdout = "";
				let stderr = "";
				child.stdout.setEncoding("utf8");
				child.stderr.setEncoding("utf8");
				child.stdout.on("data", (chunk: string) => {
					stdout += chunk;
				});
				child.stderr.on("data", (chunk: string) => {
					stderr += chunk;
				});
				child.once("error", (error) =>
					done({ code: null, stdout, stderr: String(error) }),
				);
				child.once("close", (code) => done({ code, stdout, stderr }));
			});
		},
	};
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isOid(value: string): boolean {
	return /^[0-9a-f]{40}$/u.test(value);
}

function placeholderOid(value: string): boolean {
	return value === "pending" || value === ZERO_OID || !isOid(value);
}

function gitDirArgs(gitDir?: string): readonly string[] {
	return gitDir === undefined ? [] : ["--git-dir", gitDir];
}

export function createGitReviewSource(
	options: GitReviewSourceOptions,
): ReviewDiffSource {
	const cache = options.cache ?? createReviewCache();
	const runner = options.runner ?? defaultRunner();
	const pageSize = options.pageSize ?? 200;
	const chunkPageSize = options.chunkPageSize ?? DEFAULT_CHUNK_PAGE_SIZE;

	const cancelled = (generationId: string) =>
		reviewError("stale-generation", "review generation was cancelled", {
			generationId,
		});

	const throwIfAborted = (record: {
		abort: AbortController;
		cancelled: boolean;
		generation: ReviewGeneration;
	}): void => {
		if (record.cancelled || record.abort.signal.aborted)
			throw cancelled(record.generation.id);
	};

	const runGit = async (
		args: readonly string[],
		cwd: string,
		signal?: AbortSignal,
		allowCodes: readonly number[] = [0],
	): Promise<string> => {
		if (signal?.aborted) throw cancelled("cancelled");
		const result = await new Promise<{
			readonly code: number | null;
			readonly stdout: string;
			readonly stderr: string;
		}>((resolve, reject) => {
			const onAbort = () => reject(cancelled("cancelled"));
			signal?.addEventListener("abort", onAbort, { once: true });
			void runner.run("git", args, cwd).then(
				(value) => {
					signal?.removeEventListener("abort", onAbort);
					resolve(value);
				},
				(error: unknown) => {
					signal?.removeEventListener("abort", onAbort);
					reject(error);
				},
			);
		});
		if (signal?.aborted) throw cancelled("cancelled");
		if (result.code === null || !allowCodes.includes(result.code)) {
			throw reviewError(
				"not-found",
				`git ${args
					.filter((arg) => arg[0] !== "-")
					.slice(0, 3)
					.join(" ")} failed`,
				{ code: result.code ?? -1 },
			);
		}
		return result.stdout;
	};

	const revParse = async (
		rev: string,
		cwd: string,
		signal?: AbortSignal,
		gitDir?: string,
	): Promise<string> => {
		const stdout = await runGit(
			[...gitDirArgs(gitDir), "rev-parse", "--verify", `${rev}^{commit}`],
			cwd,
			signal,
		);
		const value = stdout.trim();
		if (!isOid(value)) {
			throw reviewError("not-found", "revision did not resolve to an oid", {
				rev,
			});
		}
		return value;
	};

	const mergeBase = async (
		left: string,
		right: string,
		cwd: string,
		signal?: AbortSignal,
		gitDir?: string,
	): Promise<string> => {
		const stdout = await runGit(
			[...gitDirArgs(gitDir), "merge-base", "--", left, right],
			cwd,
			signal,
		);
		const value = stdout.trim();
		if (!isOid(value)) {
			throw reviewError("not-found", "merge-base did not resolve to an oid");
		}
		return value;
	};

	const writeTree = async (
		cwd: string,
		signal?: AbortSignal,
	): Promise<string> => (await runGit(["write-tree"], cwd, signal)).trim();

	const hashObject = async (
		path: string,
		cwd: string,
		signal?: AbortSignal,
	): Promise<string> =>
		(await runGit(["hash-object", "--", path], cwd, signal)).trim();

	const repositoryRootOf = (target: ReviewTarget): string => {
		if ("repositoryRoot" in target && typeof target.repositoryRoot === "string")
			return target.repositoryRoot;
		if (options.repositoryRoot) return options.repositoryRoot;
		throw reviewError(
			"malformed-input",
			"review target is missing a repository root",
		);
	};

	const isolatedPrDir = (
		target: Extract<ReviewTarget, { kind: "pull-request" }>,
	): string => {
		const root = options.objectsRoot ?? join(repositoryRootOf(target), ".git");
		const key = sha256Hex(
			`${target.host}/${target.repository}#${target.number}`,
		).slice(0, 16);
		return join(root, "pr", key);
	};

	const ensureIsolatedPr = async (
		target: Extract<ReviewTarget, { kind: "pull-request" }>,
		cwd: string,
		signal?: AbortSignal,
	): Promise<string> => {
		const gitDir = isolatedPrDir(target);
		mkdirSync(gitDir, { recursive: true, mode: 0o700 });
		if (!existsSync(join(gitDir, "HEAD"))) {
			await runGit(["init", "--bare", gitDir], cwd, signal);
		}
		const key = sha256Hex(
			`${target.host}/${target.repository}#${target.number}`,
		).slice(0, 16);
		await runGit(
			[
				"--git-dir",
				gitDir,
				"fetch",
				"--no-tags",
				"--no-recurse-submodules",
				cwd,
				`+${target.baseRef}:${HOBO_REVIEW_REF_NAMESPACE}/${key}/base`,
				`+${target.headRef}:${HOBO_REVIEW_REF_NAMESPACE}/${key}/head`,
			],
			cwd,
			signal,
		);
		return gitDir;
	};

	const collectDiff = async (input: {
		readonly cwd: string;
		readonly args: readonly string[];
		readonly signal?: AbortSignal | undefined;
		readonly memberId?: string | undefined;
		readonly locator: Omit<
			ReviewFileLocator,
			"fileId" | "pathBefore" | "pathAfter"
		>;
		readonly gitDir?: string | undefined;
	}): Promise<{
		readonly files: ReviewFileSummary[];
		readonly locators: ReviewFileLocator[];
	}> => {
		const rawOut = await runGit(
			[
				...gitDirArgs(input.gitDir),
				"diff",
				...DIFF_SAFETY,
				"--abbrev=40",
				"-M",
				"-C",
				"--find-copies-harder",
				"--raw",
				"-z",
				...input.args,
				"--",
			],
			input.cwd,
			input.signal,
		);
		const numOut = await runGit(
			[
				...gitDirArgs(input.gitDir),
				"diff",
				...DIFF_SAFETY,
				"-M",
				"-C",
				"--find-copies-harder",
				"--numstat",
				"-z",
				...input.args,
				"--",
			],
			input.cwd,
			input.signal,
		);
		const stats = new Map(
			parseGitNumstatZ(numOut).map((row) => [
				numstatKey(row.pathBefore, row.pathAfter),
				row,
			]),
		);
		const files: ReviewFileSummary[] = [];
		const locators: ReviewFileLocator[] = [];
		for (const raw of parseGitRawZ(rawOut)) {
			const summary = toReviewFileSummary({
				raw,
				stats:
					stats.get(numstatKey(raw.pathBefore, raw.pathAfter)) ??
					stats.get(numstatKey(raw.pathAfter, raw.pathAfter)),
				...(input.memberId === undefined ? {} : { memberId: input.memberId }),
			});
			files.push(summary);
			locators.push({
				fileId: summary.fileId,
				...input.locator,
				...(raw.pathBefore === undefined ? {} : { pathBefore: raw.pathBefore }),
				...(raw.pathAfter === undefined ? {} : { pathAfter: raw.pathAfter }),
				...(input.gitDir === undefined ? {} : { gitDir: input.gitDir }),
			});
		}
		return { files, locators };
	};

	const collectUntracked = async (
		cwd: string,
		signal?: AbortSignal,
	): Promise<{
		readonly files: ReviewFileSummary[];
		readonly locators: ReviewFileLocator[];
	}> => {
		const porcelain = await runGit(
			["status", "--porcelain=v2", "-z", "--untracked-files=all"],
			cwd,
			signal,
		);
		const files: ReviewFileSummary[] = [];
		const locators: ReviewFileLocator[] = [];
		for (const entry of parseGitPorcelainV2Z(porcelain)) {
			if (!entry.untracked) continue;
			const blob = await hashObject(entry.pathAfter, cwd, signal);
			let contentHash: string | undefined;
			try {
				const bytes = new Uint8Array(readFileSync(join(cwd, entry.pathAfter)));
				contentHash = await options.contentStore.put(bytes);
			} catch {
				contentHash = undefined;
			}
			const summary: ReviewFileSummary = {
				fileId: reviewFileId({
					status: "added",
					pathAfter: entry.pathAfter,
					newBlobOid: blob,
				}),
				status: "added",
				binary: false,
				tooLargeForInline: false,
				pathAfter: entry.pathAfter,
				newBlobOid: blob,
				newMode: "100644",
				additions: 0,
				deletions: 0,
				...(contentHash === undefined ? {} : { newContentHash: contentHash }),
			};
			files.push(summary);
			locators.push({
				fileId: summary.fileId,
				pathAfter: entry.pathAfter,
				worktree: true,
				untracked: true,
			});
		}
		return { files, locators };
	};

	const worktreeHash = async (
		cwd: string,
		signal?: AbortSignal,
	): Promise<string> => {
		const status = await runGit(
			["status", "--porcelain=v2", "-z", "--untracked-files=all"],
			cwd,
			signal,
		);
		return sha256Hex(status);
	};

	const resolveTarget = async (
		input: ReviewTarget,
		signal?: AbortSignal,
	): Promise<ReviewTarget> => {
		if (input.kind === "working-tree") {
			const cwd = input.repositoryRoot;
			return {
				...input,
				baseCommitOid: await revParse("HEAD", cwd, signal),
				indexTreeOid: await writeTree(cwd, signal),
				worktreeManifestHash: await worktreeHash(cwd, signal),
			};
		}
		if (input.kind === "index") {
			const cwd = input.repositoryRoot;
			return {
				...input,
				baseCommitOid: await revParse("HEAD", cwd, signal),
				indexTreeOid: await writeTree(cwd, signal),
			};
		}
		if (input.kind === "commit") {
			const cwd = input.repositoryRoot;
			const commitOid = await revParse(input.commitOid, cwd, signal);
			let parentCommitOid = input.parentCommitOid;
			try {
				parentCommitOid = await revParse(input.parentCommitOid, cwd, signal);
			} catch {
				parentCommitOid = EMPTY_TREE;
			}
			return { ...input, commitOid, parentCommitOid };
		}
		if (input.kind === "range") {
			const cwd = input.repositoryRoot;
			const baseCommitOid = await revParse(input.requestedBaseRef, cwd, signal);
			const headCommitOid = await revParse(input.requestedHeadRef, cwd, signal);
			const mergeBaseOid = await mergeBase(
				baseCommitOid,
				headCommitOid,
				cwd,
				signal,
			);
			return {
				...input,
				baseCommitOid,
				headCommitOid,
				mergeBaseOid,
			};
		}
		if (input.kind === "pull-request") {
			const cwd = options.repositoryRoot;
			if (!cwd) {
				throw reviewError(
					"malformed-input",
					"pull-request reviews need a local repository root",
				);
			}
			const gitDir = await ensureIsolatedPr(input, cwd, signal);
			const key = sha256Hex(
				`${input.host}/${input.repository}#${input.number}`,
			).slice(0, 16);
			const baseCommitOid = await revParse(
				`${HOBO_REVIEW_REF_NAMESPACE}/${key}/base`,
				cwd,
				signal,
				gitDir,
			);
			const headCommitOid = await revParse(
				`${HOBO_REVIEW_REF_NAMESPACE}/${key}/head`,
				cwd,
				signal,
				gitDir,
			);
			const mergeBaseOid = await mergeBase(
				baseCommitOid,
				headCommitOid,
				cwd,
				signal,
				gitDir,
			);
			if (
				!placeholderOid(input.headCommitOid) &&
				input.headCommitOid !== headCommitOid
			) {
				throw reviewError(
					"provider-drift",
					"pull-request head oid drifted from the fetched ref",
					{ expected: input.headCommitOid, found: headCommitOid },
				);
			}
			if (
				!placeholderOid(input.baseCommitOid) &&
				input.baseCommitOid !== baseCommitOid
			) {
				throw reviewError(
					"provider-drift",
					"pull-request base oid drifted from the fetched ref",
					{ expected: input.baseCommitOid, found: baseCommitOid },
				);
			}
			return {
				...input,
				baseCommitOid,
				headCommitOid,
				mergeBaseOid,
			};
		}
		const cwd = options.repositoryRoot;
		if (!cwd) {
			throw reviewError(
				"malformed-input",
				"stack reviews need a local repository root",
			);
		}
		const members = [];
		for (const member of input.members) {
			const mergeBaseOid = await mergeBase(
				member.baseCommitOid,
				member.headCommitOid,
				cwd,
				signal,
			);
			members.push({ ...member, mergeBaseOid });
		}
		const first = members[0];
		const last = members[members.length - 1];
		return {
			...input,
			members,
			aggregateBaseOid: first?.mergeBaseOid ?? input.aggregateBaseOid,
			aggregateHeadOid: last?.headCommitOid ?? input.aggregateHeadOid,
		};
	};

	const buildGenerationFiles = async (
		target: ReviewTarget,
		signal?: AbortSignal,
	): Promise<{
		readonly files: ReviewFileSummary[];
		readonly locators: ReviewFileLocator[];
		readonly isolatedGitDir?: string;
		readonly repositoryRoot: string;
	}> => {
		if (target.kind === "working-tree") {
			const tracked = await collectDiff({
				cwd: target.repositoryRoot,
				args: [target.baseCommitOid],
				signal,
				locator: { oldRev: target.baseCommitOid, worktree: true },
			});
			const untracked = await collectUntracked(target.repositoryRoot, signal);
			return {
				files: [...tracked.files, ...untracked.files],
				locators: [...tracked.locators, ...untracked.locators],
				repositoryRoot: target.repositoryRoot,
			};
		}
		if (target.kind === "index") {
			const collected = await collectDiff({
				cwd: target.repositoryRoot,
				args: ["--cached", target.baseCommitOid],
				signal,
				locator: { oldRev: target.baseCommitOid, cached: true },
			});
			return { ...collected, repositoryRoot: target.repositoryRoot };
		}
		if (target.kind === "commit") {
			const collected = await collectDiff({
				cwd: target.repositoryRoot,
				args: [target.parentCommitOid, target.commitOid],
				signal,
				locator: { oldRev: target.parentCommitOid, newRev: target.commitOid },
			});
			return { ...collected, repositoryRoot: target.repositoryRoot };
		}
		if (target.kind === "range") {
			const collected = await collectDiff({
				cwd: target.repositoryRoot,
				args: [target.mergeBaseOid, target.headCommitOid],
				signal,
				locator: { oldRev: target.mergeBaseOid, newRev: target.headCommitOid },
			});
			return { ...collected, repositoryRoot: target.repositoryRoot };
		}
		if (target.kind === "pull-request") {
			const cwd = options.repositoryRoot ?? process.cwd();
			const gitDir = await ensureIsolatedPr(target, cwd, signal);
			const collected = await collectDiff({
				cwd,
				gitDir,
				args: [target.mergeBaseOid, target.headCommitOid],
				signal,
				locator: {
					oldRev: target.mergeBaseOid,
					newRev: target.headCommitOid,
					gitDir,
				},
			});
			return { ...collected, isolatedGitDir: gitDir, repositoryRoot: cwd };
		}
		const cwd = options.repositoryRoot ?? process.cwd();
		const files: ReviewFileSummary[] = [];
		const locators: ReviewFileLocator[] = [];
		for (const member of target.members) {
			const collected = await collectDiff({
				cwd,
				args: [member.mergeBaseOid, member.headCommitOid],
				signal,
				memberId: member.memberId,
				locator: {
					oldRev: member.mergeBaseOid,
					newRev: member.headCommitOid,
				},
			});
			files.push(...collected.files);
			locators.push(...collected.locators);
		}
		return { files, locators, repositoryRoot: cwd };
	};

	const requireRecord = (generationId: string) => {
		const record = cache.get(generationId);
		if (!record)
			throw reviewError("not-found", "review generation does not exist", {
				generationId,
			});
		if (record.cancelled || record.abort.signal.aborted)
			throw cancelled(generationId);
		return record;
	};

	return {
		async resolveTarget(input) {
			return resolveTarget(input);
		},
		async createGeneration(input) {
			const id = options.createId?.() ?? randomUUID();
			const abort = new AbortController();
			cache.cancelReview(input.reviewId, id);
			const predecessor = cache.latest(input.reviewId);
			const ordinal = (predecessor?.generation.ordinal ?? 0) + 1;
			const createdAt = options.now?.() ?? new Date().toISOString();
			const stub: ReviewGeneration = {
				id,
				reviewId: input.reviewId,
				ordinal,
				target: input.target,
				createdAt,
				createdBy: input.actorId,
				manifestHash: ZERO_OID + ZERO_OID.slice(0, 24),
				diffOptionsHash: DIFF_OPTIONS_HASH,
				...(input.predecessorGenerationId === undefined
					? {}
					: { predecessorGenerationId: input.predecessorGenerationId }),
			};
			const record = {
				generation: stub,
				files: [] as ReviewFileSummary[],
				locators: [] as ReviewFileLocator[],
				cursorSecret: randomBytes(32).toString("hex"),
				repositoryRoot: repositoryRootOf(input.target),
				cancelled: false,
				ready: false,
				abort,
			};
			cache.put(record);
			try {
				throwIfAborted(record);
				const target = await resolveTarget(input.target, abort.signal);
				throwIfAborted(record);
				const built = await buildGenerationFiles(target, abort.signal);
				throwIfAborted(record);
				const generation: ReviewGeneration = {
					...stub,
					target,
					manifestHash: hashReviewManifest(built.files),
					...(target.kind === "pull-request"
						? {
								providerSnapshotHash: sha256Hex(
									`${target.mergeBaseOid}:${target.headCommitOid}`,
								),
							}
						: {}),
				};
				cache.put({
					...record,
					generation,
					files: built.files,
					locators: built.locators,
					repositoryRoot: built.repositoryRoot,
					ready: true,
					...(built.isolatedGitDir === undefined
						? {}
						: { isolatedGitDir: built.isolatedGitDir }),
				});
				return generation;
			} catch (error) {
				cache.cancel(id);
				throw error;
			}
		},
		async loadManifest(generationId, cursor) {
			const record = requireRecord(generationId);
			return pageReviewManifest({
				generationId,
				manifestHash: record.generation.manifestHash,
				files: record.files,
				secret: record.cursorSecret,
				pageSize,
				...(cursor === undefined ? {} : { cursor }),
			});
		},
		async loadChunk(generationId, fileId, cursor) {
			const record = requireRecord(generationId);
			const locator = (record.locators ?? []).find(
				(item) => item.fileId === fileId,
			);
			const file = record.files.find((item) => item.fileId === fileId);
			if (!locator || !file) {
				throw reviewError(
					"not-found",
					"review file is not in this generation",
					{
						fileId,
					},
				);
			}
			const offset =
				cursor === undefined
					? 0
					: decodeReviewCursor(cursor, {
							secret: record.cursorSecret,
							generationId,
							kind: "chunk",
							fileId,
						}).offset;
			if (file.binary) {
				return { generationId, fileId, chunkId: `${fileId}:0`, hunks: [] };
			}
			const paths = [locator.pathBefore, locator.pathAfter].filter(
				(path): path is string => typeof path === "string" && path.length > 0,
			);
			const uniquePaths = [...new Set(paths)];
			const args: string[] = [
				...gitDirArgs(locator.gitDir),
				"diff",
				...DIFF_SAFETY,
			];
			if (locator.untracked) {
				args.push(
					"--no-index",
					"--unified=3",
					"--",
					"/dev/null",
					locator.pathAfter ?? "",
				);
			} else {
				if (locator.cached) args.push("--cached");
				args.push("-M", "-C", "--unified=3");
				if (locator.oldRev) args.push(locator.oldRev);
				if (locator.newRev) args.push(locator.newRev);
				args.push("--", ...uniquePaths);
			}
			const stdout = await runGit(
				args,
				record.repositoryRoot,
				record.abort.signal,
				locator.untracked ? [0, 1] : [0],
			);
			const parsed = parseUnifiedDiff(stdout);
			const hunks = parsed.files.flatMap((item) => item.hunks);
			const page = hunks.slice(offset, offset + chunkPageSize);
			const nextOffset = offset + page.length;
			return {
				generationId,
				fileId,
				chunkId: `${fileId}:${offset}`,
				hunks: page,
				...(nextOffset < hunks.length
					? {
							nextCursor: encodeReviewCursor(
								{
									kind: "chunk",
									generationId,
									offset: nextOffset,
									fileId,
								},
								record.cursorSecret,
							),
						}
					: {}),
			};
		},
		cancel(generationId) {
			cache.cancel(generationId);
		},
	};
}
