import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { reviewError } from "./review-errors.js";
import {
	applyCachedPatchToIndexFile,
	gitText,
	type ReviewProcessRunner,
	type ReviewRepoIdentity,
	readIndexBlob,
	readReviewRepoIdentity,
	reviewProcessRunner,
	simulateCachedApply,
} from "./review-index-simulator.js";
import {
	assertSafeRepositoryRelPath,
	buildReviewPatch,
	hashBytes,
	hashUtf8,
	type ReviewPatchFile,
} from "./review-patch.js";
import type {
	ReviewFileSummary,
	ReviewGeneration,
	ReviewHunk,
	ReviewPatchExecutor,
} from "./review-ports.js";
import {
	assertSafeRepositoryPath,
	buildSuggestionPatch,
	expectedPreimageFromHunks,
	parseGitHubSuggestion,
	worktreeJoin,
} from "./review-suggestions.js";

export interface ReviewPatchCatalogRecord {
	readonly generation: ReviewGeneration;
	readonly file: ReviewFileSummary;
	readonly hunks: readonly ReviewHunk[];
}

export interface ReviewPatchCatalog {
	get(generationId: string, fileId: string): Promise<ReviewPatchCatalogRecord>;
}

export interface MutableReviewPatchCatalog extends ReviewPatchCatalog {
	add(record: ReviewPatchCatalogRecord): void;
}

export interface ReviewPatchExecutorOptions {
	readonly catalog: ReviewPatchCatalog;
	readonly runner?: ReviewProcessRunner;
	readonly permittedWorktrees?: readonly string[];
}

interface PendingReviewPatch {
	readonly direction: "stage" | "unstage" | "suggestion";
	readonly patchText: string;
	readonly patchHash: string;
	readonly preimageHash: string;
	readonly worktreeHash: string;
	readonly worktreeNext?: string;
	readonly path: string;
	readonly repositoryRoot: string;
	readonly identity: ReviewRepoIdentity;
	readonly preIndexTreeOid: string;
	readonly postIndexTreeOid: string;
	readonly digest: string;
	readonly generationId: string;
	readonly fileId: string;
}

export function createReviewPatchCatalog(): MutableReviewPatchCatalog {
	const records = new Map<string, ReviewPatchCatalogRecord>();
	return {
		add(record) {
			records.set(catalogKey(record.generation.id, record.file.fileId), record);
		},
		async get(generationId, fileId) {
			const record = records.get(catalogKey(generationId, fileId));
			if (!record)
				throw reviewError("not-found", "generation-bound file was not found", {
					generationId,
					fileId,
				});
			return record;
		},
	};
}

export function computeReviewPatchApprovalDigest(input: {
	readonly operation:
		| "stage-review-selection"
		| "unstage-review-selection"
		| "apply-review-suggestion";
	readonly patchHash: string;
	readonly preIndexTreeOid: string;
	readonly postIndexTreeOid: string;
	readonly preimageHash: string;
	readonly headOid: string;
	readonly repositoryRoot: string;
	readonly path: string;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				schemaVersion: "hobo.code.review-effect/v1",
				operation: input.operation,
				details: {
					patchHash: input.patchHash,
					preIndexTreeOid: input.preIndexTreeOid,
					postIndexTreeOid: input.postIndexTreeOid,
					preimageHash: input.preimageHash,
					headOid: input.headOid,
					repositoryRoot: input.repositoryRoot,
					path: input.path,
				},
			}),
		)
		.digest("hex");
}

export function createReviewPatchExecutor(
	options: ReviewPatchExecutorOptions,
): ReviewPatchExecutor {
	const runner = options.runner ?? reviewProcessRunner();
	const pending = new Map<string, PendingReviewPatch>();

	return {
		async simulate(input) {
			const record = await options.catalog.get(
				input.generationId,
				input.fileId,
			);
			const repositoryRoot = assertPermittedWorktree(
				input.repositoryRoot,
				record.generation,
				options.permittedWorktrees,
			);
			const identity = await readReviewRepoIdentity(repositoryRoot, runner);
			assertRepoIdentityMatchesGeneration(
				record.generation,
				identity,
				repositoryRoot,
			);
			const path = assertSafeRepositoryPath(
				repositoryRoot,
				record.file.pathAfter ?? record.file.pathBefore ?? "",
			);
			const indexBlob = await readIndexBlob(repositoryRoot, path, runner);
			const preimageHash = hashBytes(indexBlob);
			const worktreePath = worktreeJoin(repositoryRoot, path);
			const worktreeBytes = existsSync(worktreePath)
				? readFileSync(worktreePath)
				: Buffer.alloc(0);
			const worktreeHash = hashBytes(worktreeBytes);
			const built = buildDirectionPatch({
				direction: input.direction,
				file: { file: record.file, hunks: record.hunks },
				worktreeText: worktreeBytes.toString("utf8"),
				...(input.hunkId === undefined ? {} : { hunkId: input.hunkId }),
				...(input.startLine === undefined
					? {}
					: { startLine: input.startLine }),
				...(input.endLine === undefined ? {} : { endLine: input.endLine }),
				...(input.suggestionBody === undefined
					? {}
					: { suggestionBody: input.suggestionBody }),
			});
			const simulated = await simulateCachedApply({
				repositoryRoot,
				patchText: built.text,
				reverse: input.direction === "unstage",
				runner,
			});
			const operation =
				input.direction === "stage"
					? "stage-review-selection"
					: input.direction === "unstage"
						? "unstage-review-selection"
						: "apply-review-suggestion";
			const digest = computeReviewPatchApprovalDigest({
				operation,
				patchHash: built.hash,
				preIndexTreeOid: simulated.preIndexTreeOid,
				postIndexTreeOid: simulated.postIndexTreeOid,
				preimageHash,
				headOid: identity.headOid,
				repositoryRoot: identity.toplevel,
				path,
			});
			const stored: PendingReviewPatch = {
				direction: input.direction,
				patchText: built.text,
				patchHash: built.hash,
				preimageHash,
				worktreeHash,
				...(built.worktreeNext === undefined
					? {}
					: { worktreeNext: built.worktreeNext }),
				path,
				repositoryRoot: identity.toplevel,
				identity,
				preIndexTreeOid: simulated.preIndexTreeOid,
				postIndexTreeOid: simulated.postIndexTreeOid,
				digest,
				generationId: input.generationId,
				fileId: input.fileId,
			};
			pending.set(pendingKey(built.hash, simulated.postIndexTreeOid), stored);
			return {
				preIndexTreeOid: simulated.preIndexTreeOid,
				postIndexTreeOid: simulated.postIndexTreeOid,
				patchHash: built.hash,
				preimageHash,
			};
		},

		async apply(input) {
			if (input.approvalDigest.length === 0)
				throw reviewError(
					"approval-required",
					"human exact-effect approval digest is required",
				);
			const stored = pending.get(
				pendingKey(input.patchHash, input.expectedPostIndexTreeOid),
			);
			if (!stored)
				throw reviewError("not-found", "approved patch is not pending", {
					patchHash: input.patchHash,
				});
			if (stored.digest !== input.approvalDigest)
				throw reviewError(
					"approval-mismatch",
					"approval digest does not match the simulated exact effect",
				);
			if (stored.postIndexTreeOid !== input.expectedPostIndexTreeOid)
				throw reviewError(
					"approval-mismatch",
					"expected tree does not match the simulated exact effect",
				);
			const repositoryRoot = assertPermittedWorktree(
				input.repositoryRoot,
				undefined,
				options.permittedWorktrees,
				stored.repositoryRoot,
			);
			await revalidateBeforeApply({
				repositoryRoot,
				stored,
				runner,
			});
			const resultTreeOid = await installApprovedIndex({
				repositoryRoot,
				stored,
				runner,
			});
			if (resultTreeOid !== stored.postIndexTreeOid) {
				throw reviewError(
					"ambiguous-outcome",
					"resulting index tree does not match the approved expected tree",
					{ resultTreeOid, expected: stored.postIndexTreeOid },
				);
			}
			const headAfter = await gitText(
				runner,
				["rev-parse", "HEAD"],
				repositoryRoot,
			);
			if (headAfter !== stored.identity.headOid)
				throw reviewError(
					"ambiguous-outcome",
					"apply must not create or move a commit",
					{ head: headAfter },
				);
			pending.delete(pendingKey(stored.patchHash, stored.postIndexTreeOid));
			return { resultTreeOid };
		},
	};
}

function catalogKey(generationId: string, fileId: string): string {
	return `${generationId}\0${fileId}`;
}

function pendingKey(patchHash: string, postIndexTreeOid: string): string {
	return `${patchHash}:${postIndexTreeOid}`;
}

function buildDirectionPatch(input: {
	readonly direction: "stage" | "unstage" | "suggestion";
	readonly file: ReviewPatchFile;
	readonly hunkId?: string;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly suggestionBody?: string;
	readonly worktreeText: string;
}): {
	readonly text: string;
	readonly hash: string;
	readonly worktreeNext?: string;
} {
	if (input.direction === "suggestion") {
		if (input.suggestionBody === undefined)
			throw reviewError("malformed-input", "suggestion body is required");
		if (input.startLine === undefined || input.endLine === undefined)
			throw reviewError(
				"malformed-input",
				"suggestion apply requires a line range",
			);
		const parsed = parseGitHubSuggestion(input.suggestionBody);
		const expected = expectedPreimageFromHunks(
			input.file.hunks,
			input.startLine,
			input.endLine,
			input.worktreeText.includes("\r\n") ? "\r\n" : "\n",
		);
		const built = buildSuggestionPatch({
			file: input.file.file,
			original: input.worktreeText,
			startLine: input.startLine,
			endLine: input.endLine,
			replacement: parsed.replacement,
			...(expected === undefined ? {} : { expectedPreimage: expected }),
		});
		return {
			text: built.text,
			hash: hashUtf8(built.text),
			worktreeNext: built.preview.next,
		};
	}
	const built = buildReviewPatch(input.file, {
		...(input.hunkId === undefined ? {} : { hunkId: input.hunkId }),
		...(input.startLine === undefined ? {} : { startLine: input.startLine }),
		...(input.endLine === undefined ? {} : { endLine: input.endLine }),
	});
	return { text: built.text, hash: built.hash };
}

function assertPermittedWorktree(
	repositoryRoot: string,
	generation: ReviewGeneration | undefined,
	permitted: readonly string[] | undefined,
	expectedRoot?: string,
): string {
	let resolved: string;
	try {
		resolved = realpathSync(repositoryRoot);
	} catch {
		throw reviewError("not-found", "repository root does not exist", {
			repositoryRoot,
		});
	}
	if (expectedRoot && realpathSync(expectedRoot) !== resolved)
		throw reviewError("approval-mismatch", "repository identity changed", {
			repositoryRoot,
		});
	const generationRoot =
		generation?.target && "repositoryRoot" in generation.target
			? generation.target.repositoryRoot
			: undefined;
	if (generationRoot && realpathSync(generationRoot) !== resolved)
		throw reviewError(
			"stale-generation",
			"generation is bound to a different repository worktree",
			{ repositoryRoot },
		);
	if (permitted && permitted.length > 0) {
		const allowed = permitted.map((path) => realpathSync(path));
		if (!allowed.includes(resolved))
			throw reviewError(
				"auth-denied",
				"suggestion and patch apply are only permitted in an approved worktree",
				{ repositoryRoot },
			);
	}
	return resolved;
}

function assertRepoIdentityMatchesGeneration(
	generation: ReviewGeneration,
	identity: ReviewRepoIdentity,
	repositoryRoot: string,
): void {
	const target = generation.target;
	if (!("repositoryRoot" in target))
		throw reviewError(
			"unsupported-capability",
			"generation target has no local worktree",
		);
	if (realpathSync(target.repositoryRoot) !== repositoryRoot)
		throw reviewError(
			"stale-generation",
			"repository root no longer matches generation",
		);
	if ("baseCommitOid" in target && target.baseCommitOid !== identity.headOid)
		throw reviewError(
			"stale-generation",
			"HEAD no longer matches the generation base",
			{
				head: identity.headOid,
				base: target.baseCommitOid,
			},
		);
}

async function revalidateBeforeApply(input: {
	readonly repositoryRoot: string;
	readonly stored: PendingReviewPatch;
	readonly runner: ReviewProcessRunner;
}): Promise<void> {
	const identity = await readReviewRepoIdentity(
		input.repositoryRoot,
		input.runner,
	);
	if (identity.headOid !== input.stored.identity.headOid)
		throw reviewError("patch-conflict", "HEAD changed after approval", {
			head: identity.headOid,
		});
	if (identity.gitDir !== input.stored.identity.gitDir)
		throw reviewError(
			"patch-conflict",
			"repository identity changed after approval",
		);
	if (identity.toplevel !== input.stored.identity.toplevel)
		throw reviewError(
			"patch-conflict",
			"worktree identity changed after approval",
		);
	if (identity.indexTreeOid !== input.stored.preIndexTreeOid)
		throw reviewError("patch-conflict", "index changed after approval", {
			indexTreeOid: identity.indexTreeOid,
		});
	const indexBlob = await readIndexBlob(
		input.repositoryRoot,
		input.stored.path,
		input.runner,
	);
	if (hashBytes(indexBlob) !== input.stored.preimageHash)
		throw reviewError(
			"patch-conflict",
			"index preimage changed after approval",
		);
	const worktreePath = worktreeJoin(input.repositoryRoot, input.stored.path);
	const worktreeBytes = existsSync(worktreePath)
		? readFileSync(worktreePath)
		: Buffer.alloc(0);
	if (hashBytes(worktreeBytes) !== input.stored.worktreeHash)
		throw reviewError("patch-conflict", "worktree changed after approval");
}

async function installApprovedIndex(input: {
	readonly repositoryRoot: string;
	readonly stored: PendingReviewPatch;
	readonly runner: ReviewProcessRunner;
}): Promise<string> {
	const liveIndex = await gitText(
		input.runner,
		["rev-parse", "--path-format=absolute", "--git-path", "index"],
		input.repositoryRoot,
	);
	const replacement = `${liveIndex}.hobo-review-${randomUUID()}`;
	const worktreePath = worktreeJoin(input.repositoryRoot, input.stored.path);
	const worktreeBackup = `${worktreePath}.hobo-review-${randomUUID()}`;
	let wroteWorktree = false;
	try {
		if (existsSync(liveIndex)) copyFileSync(liveIndex, replacement);
		const tree = await applyCachedPatchToIndexFile({
			repositoryRoot: input.repositoryRoot,
			indexPath: replacement,
			patchText: input.stored.patchText,
			reverse: input.stored.direction === "unstage",
			runner: input.runner,
		});
		if (tree !== input.stored.postIndexTreeOid)
			throw reviewError(
				"ambiguous-outcome",
				"simulated apply no longer produces the approved tree",
				{ tree, expected: input.stored.postIndexTreeOid },
			);
		await revalidateBeforeApply(input);
		if (input.stored.direction === "suggestion") {
			if (input.stored.worktreeNext === undefined)
				throw reviewError(
					"corrupted-state",
					"suggestion apply is missing worktree bytes",
				);
			if (existsSync(worktreePath)) copyFileSync(worktreePath, worktreeBackup);
			const mode = existsSync(worktreePath)
				? statSync(worktreePath).mode
				: undefined;
			writeFileSync(worktreePath, input.stored.worktreeNext);
			if (mode !== undefined) chmodSync(worktreePath, mode);
			wroteWorktree = true;
		}
		renameSync(replacement, liveIndex);
		const result = await gitText(
			input.runner,
			["write-tree"],
			input.repositoryRoot,
		);
		return result;
	} catch (error) {
		if (wroteWorktree && existsSync(worktreeBackup))
			renameSync(worktreeBackup, worktreePath);
		throw error;
	} finally {
		rmSync(replacement, { force: true });
		rmSync(worktreeBackup, { force: true });
	}
}

export function catalogRecordFromPatchFile(
	generation: ReviewGeneration,
	file: ReviewPatchFile,
): ReviewPatchCatalogRecord {
	assertSafeRepositoryRelPath(
		file.file.pathAfter ?? file.file.pathBefore ?? "",
	);
	return {
		generation,
		file: file.file,
		hunks: file.hunks,
	};
}
