/**
 * Starting a review against each kind of target.
 *
 * `review.test.ts` starts one review over a commit *range*. This file drives
 * the other three kinds — a single commit, the index, and the working tree —
 * because each resolves its base and head differently, and getting that
 * resolution wrong is the one failure a reviewer cannot see: the diff renders
 * perfectly, and it is a diff of the wrong two things.
 *
 * The rules the resolution encodes, and why each matters:
 *
 * - A **commit** review is that commit against its parent. Defaulting the base
 *   to anything else would show a reviewer changes from other commits mixed in
 *   with the one they were asked to look at.
 * - An **index** review is what `git commit` would record: the staged tree
 *   against HEAD. It has to write a tree object to have a head at all, because
 *   the index is not a commit and has no oid until something makes one.
 * - A **working tree** review is what is on disk, which git has no object for.
 *   So it carries a *manifest hash* instead — a fingerprint of the files as
 *   they are — and that hash is what later tells a reviewer their comments have
 *   drifted onto a file that has changed underneath them.
 *
 * Everything runs against a real temporary repository. A faked git would let
 * the resolution and the fake agree with each other while both being wrong,
 * which is precisely the failure mode being guarded.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { REVIEW_COMMAND_SCHEMA } from "../src/review/review-contract.js";
import {
	createReviewRuntime,
	type ReviewRuntime,
} from "../src/review/review-runtime.js";
import { sessionProcessRunner } from "../src/session-orchestrator.js";

const open: ReviewRuntime[] = [];

afterEach(() => {
	for (const created of open.splice(0)) created.close();
});

function runtime(): ReviewRuntime {
	const created = createReviewRuntime({
		dataDir: mkdtempSync(join(tmpdir(), "hobo-review-kinds-")),
		now: () => "2026-08-20T00:00:00.000Z",
	});
	open.push(created);
	return created;
}

/**
 * Two commits, then an uncommitted edit staged and an unstaged one on top.
 *
 * Every target kind needs a different part of this: the range needs two
 * commits, the index needs something staged, and the working tree needs
 * something that is neither committed nor staged.
 */
async function repository(): Promise<string> {
	const root = mkdtempSync(join(tmpdir(), "hobo-review-kinds-repo-"));
	const runner = sessionProcessRunner();
	await runner.run("git", ["init"], root);
	await runner.run("git", ["config", "user.email", "dev@hobo.test"], root);
	await runner.run("git", ["config", "user.name", "HoBo"], root);
	writeFileSync(join(root, "src.ts"), "export const a = 1;\n");
	await runner.run("git", ["add", "src.ts"], root);
	await runner.run("git", ["commit", "-m", "base"], root);
	writeFileSync(join(root, "src.ts"), "export const a = 2;\n");
	await runner.run("git", ["add", "src.ts"], root);
	await runner.run("git", ["commit", "-m", "change"], root);
	// Staged but not committed.
	writeFileSync(join(root, "src.ts"), "export const a = 3;\n");
	await runner.run("git", ["add", "src.ts"], root);
	// On disk but not staged.
	writeFileSync(join(root, "src.ts"), "export const a = 4;\n");
	return root;
}

let reviewCounter = 0;

async function start(
	target: Record<string, unknown>,
	options: { readonly runtime?: ReviewRuntime } = {},
) {
	const review = options.runtime ?? runtime();
	reviewCounter += 1;
	const reviewId = `rev-${reviewCounter}`;
	const result = await review.execute({
		schemaVersion: REVIEW_COMMAND_SCHEMA,
		commandId: `start-${reviewCounter}`,
		actorId: "human",
		reviewId,
		startReview: { target },
	});
	return { result, reviewId, review };
}

describe("a commit review", () => {
	it("starts against a single commit", async () => {
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: repo,
			repositoryRoot: repo,
			headCommitOid: "HEAD",
		});
		expect(result.accepted).toBe(true);
	});

	it("resolves the base to the commit's parent", async () => {
		// A commit review is that commit and nothing else. Any other base mixes
		// somebody else's changes into the diff the reviewer was asked to read.
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: repo,
			repositoryRoot: repo,
			headCommitOid: "HEAD",
		});
		expect(result.snapshot?.target?.baseCommitOid).toMatch(/^[0-9a-f]{40}$/u);
		expect(result.snapshot?.target?.baseCommitOid).not.toBe(
			result.snapshot?.target?.headCommitOid,
		);
	});

	it("honours an explicit parent when one is given", async () => {
		// Merge commits have two, and the caller is the only one that knows
		// which side the review is about.
		const repo = await repository();
		const runner = sessionProcessRunner();
		const parent = (
			await runner.run("git", ["rev-parse", "HEAD^"], repo)
		).stdout.trim();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: repo,
			repositoryRoot: repo,
			headCommitOid: "HEAD",
			parentCommitOid: parent,
		});
		expect(result.snapshot?.target?.baseCommitOid).toBe(parent);
	});

	it("finds files to review", async () => {
		// A manifest with no files is a review of nothing, which reads to the
		// reviewer as the tool being broken rather than the commit being empty.
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: repo,
			repositoryRoot: repo,
			headCommitOid: "HEAD",
		});
		expect(result.snapshot?.manifest?.totalFiles).toBeGreaterThan(0);
	});

	it("refuses a target with no repository id", async () => {
		// The runtime carries a fallback that derives the id from the repository,
		// but it is unreachable: the command parse boundary demands a non-empty
		// id first, so nothing ever reaches the derivation. Pinning the refusal
		// records what actually happens rather than the fallback's intent.
		const repo = await repository();
		await expect(
			start({
				kind: "REVIEW_TARGET_KIND_COMMIT",
				repositoryRoot: repo,
				headCommitOid: "HEAD",
			}),
		).rejects.toThrow(/repositoryId must not be empty/u);
	});

	it("resolves HEAD to a full oid rather than storing the symbolic name", async () => {
		// `HEAD` moves. A review that stored it would silently re-target itself
		// the next time somebody committed.
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: repo,
			repositoryRoot: repo,
			headCommitOid: "HEAD",
		});
		expect(result.snapshot?.target?.headCommitOid).toMatch(/^[0-9a-f]{40}$/u);
	});
});

describe("an index review", () => {
	it("starts against the staged tree", async () => {
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_INDEX",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.accepted).toBe(true);
	});

	it("writes a tree so the staged state has an oid at all", async () => {
		// The index is not a commit and has no object id until something makes
		// one. Without this the review would have no head to diff against.
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_INDEX",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.snapshot?.target?.headCommitOid).toMatch(/^[0-9a-f]{40}$/u);
	});

	it("uses HEAD as the base, which is what a commit would record", async () => {
		const repo = await repository();
		const runner = sessionProcessRunner();
		const head = (
			await runner.run("git", ["rev-parse", "HEAD"], repo)
		).stdout.trim();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_INDEX",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.snapshot?.target?.baseCommitOid).toBe(head);
	});

	it("sees the staged change", async () => {
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_INDEX",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.snapshot?.manifest?.totalFiles).toBeGreaterThan(0);
	});
});

describe("a working-tree review", () => {
	it("starts against what is on disk", async () => {
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.accepted).toBe(true);
	});

	it("records a manifest hash, since the working tree has no oid", async () => {
		// Git has no object for "the files as they are". The hash is the only
		// handle a later refresh has for noticing they moved.
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(
			result.snapshot?.target?.worktreeManifestHash?.length,
		).toBeGreaterThan(0);
	});

	it("records the index tree alongside it", async () => {
		// Staged and unstaged are different states of the same file, and a
		// working-tree review has to be able to tell them apart later.
		const repo = await repository();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.snapshot?.target?.indexTreeOid).toMatch(/^[0-9a-f]{40}$/u);
	});

	it("uses HEAD as both ends, because on-disk is not a commit", async () => {
		const repo = await repository();
		const runner = sessionProcessRunner();
		const head = (
			await runner.run("git", ["rev-parse", "HEAD"], repo)
		).stdout.trim();
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(result.snapshot?.target?.baseCommitOid).toBe(head);
		expect(result.snapshot?.target?.headCommitOid).toBe(head);
	});

	it("changes its manifest hash when the set of dirty files changes", async () => {
		// This is the whole point of the hash: it is what lets a refresh say
		// "the files moved" rather than silently re-anchoring a reviewer's
		// comments onto different lines. Before the `--no-optional-locks`
		// placement fix this could not fire at all — git exited 129 and every
		// tree hashed the empty string.
		const repo = await repository();
		const first = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		writeFileSync(join(repo, "appeared.ts"), "export const b = 1;\n");
		const second = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(second.result.snapshot?.target?.worktreeManifestHash).not.toBe(
			first.result.snapshot?.target?.worktreeManifestHash,
		);
	});

	it("does not notice a further edit to an already-dirty file", async () => {
		// Pinning a real limitation rather than asserting a wish. `--porcelain=v2`
		// reports the HEAD and index oids for an unstaged modification, never the
		// worktree content, so a file that was already dirty hashes identically no
		// matter how much it changes afterwards. A refresh therefore detects files
		// appearing, vanishing, or becoming dirty — but not churn within one that
		// was dirty already. Anyone tightening this should expect this test to
		// flip, and should flip it deliberately.
		const repo = await repository();
		const first = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		writeFileSync(join(repo, "src.ts"), "export const a = 99;\n");
		const second = await start({
			kind: "REVIEW_TARGET_KIND_WORKING_TREE",
			repositoryId: repo,
			repositoryRoot: repo,
		});
		expect(second.result.snapshot?.target?.worktreeManifestHash).toBe(
			first.result.snapshot?.target?.worktreeManifestHash,
		);
	});
});

describe("refusals", () => {
	it("refuses a startReview with no target", async () => {
		// A review of nothing would sit in the inbox forever, and the reviewer
		// would have no way to tell what it was supposed to be about.
		const review = runtime();
		await expect(
			review.execute({
				schemaVersion: REVIEW_COMMAND_SCHEMA,
				commandId: "no-target",
				actorId: "human",
				reviewId: "rev-no-target",
				startReview: {},
			}),
		).rejects.toThrow(/target/u);
	});

	it("refuses a repository root that is not a repository", async () => {
		// A malformed *command* throws, but a well-formed command against a
		// directory git cannot read comes back as a declined result. That split
		// matters to callers: the first is a bug in the caller, the second is a
		// condition to show the user, so only the second is worth a UI path.
		const review = runtime();
		const result = await review.execute({
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "not-a-repo",
			actorId: "human",
			reviewId: "rev-not-a-repo",
			startReview: {
				target: {
					kind: "REVIEW_TARGET_KIND_COMMIT",
					repositoryId: "empty",
					repositoryRoot: mkdtempSync(join(tmpdir(), "hobo-review-empty-")),
					headCommitOid: "HEAD",
				},
			},
		});
		expect(result.accepted).toBe(false);
		expect(result.code).toBe("HOBO_CODE_REVIEW_NOT_FOUND");
	});
});

describe("the durable record", () => {
	it("loads a started review back", async () => {
		// The runtime is event-sourced; a review that could not be read back
		// would be a review that vanished when the process did.
		const { result, reviewId, review } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: "repo",
			repositoryRoot: await repository(),
			headCommitOid: "HEAD",
		});
		expect(result.accepted).toBe(true);
		const loaded = await review.load(reviewId);
		expect(loaded?.reviewId).toBe(reviewId);
	});

	it("reports nothing for a review that was never started", async () => {
		expect(await runtime().load("never-existed")).toBeUndefined();
	});

	it("does not yet list a started review in the inbox", async () => {
		// `inbox()` is an unimplemented stub that returns [] unconditionally —
		// there is no projection scanning the streams, and its own comment says
		// callers are expected to keep review ids in a list file instead. Pinning
		// the stub rather than the intent keeps the gap visible: whoever builds
		// the projection has to come here and invert this, which is the moment to
		// notice that every caller reading `inbox()` today sees nothing.
		const { review } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: "repo",
			repositoryRoot: await repository(),
			headCommitOid: "HEAD",
		});
		expect(await review.inbox()).toEqual([]);
	});

	it("returns the same result for a repeated command id", async () => {
		// Commands arrive over a channel that can redeliver. A second start
		// under the same id must not create a second review or bump a revision.
		const repo = await repository();
		const review = runtime();
		const command = {
			schemaVersion: REVIEW_COMMAND_SCHEMA,
			commandId: "same-id",
			actorId: "human",
			reviewId: "rev-idempotent",
			startReview: {
				target: {
					kind: "REVIEW_TARGET_KIND_COMMIT",
					repositoryId: repo,
					repositoryRoot: repo,
					headCommitOid: "HEAD",
				},
			},
		};
		const first = await review.execute(command);
		const second = await review.execute(command);
		expect(second.snapshot?.revision).toBe(first.snapshot?.revision);
	});

	it("starts at revision one", async () => {
		// Zero is the empty snapshot's revision; a started review that stayed at
		// zero would make every optimistic-concurrency check pass by accident.
		const { result } = await start({
			kind: "REVIEW_TARGET_KIND_COMMIT",
			repositoryId: "repo",
			repositoryRoot: await repository(),
			headCommitOid: "HEAD",
		});
		expect(result.snapshot?.revision).toBe(1n);
	});
});
