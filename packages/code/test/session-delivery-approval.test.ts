/**
 * What exactly the user is being asked to approve.
 *
 * Every delivery operation — commit, push, open PR, stack PR, merge PR —
 * stops at `authorize` and hands it a frozen `SessionDeliveryApproval`. That
 * descriptor is the entire security boundary: it is what a human reads, what
 * gets hashed into the ledger, and what later reconciliation compares the
 * world against. So the properties that matter are not "does it ask" but
 * *what it asks about*:
 *
 * **The descriptor pins the git state the operation was approved against.**
 * A commit approval carries the head, the index tree and the working tree; a
 * push carries the head; a merge carries the PR's head SHA. Without those an
 * approval is a blank cheque — the user approves "commit this work", the tree
 * changes underneath, and the commit that lands is not the one they read.
 * `session-orchestrator.test.ts` beside this file proves the *enforcement*
 * (an operation refuses once its approved head moves); this file proves the
 * descriptor carries enough to enforce against in the first place.
 *
 * **The descriptor is frozen, and so are its details.** It is handed to
 * caller-supplied code before being hashed into the ledger. A mutable
 * descriptor would let an authorizer approve one thing and record another.
 *
 * **The digest covers every field.** It is what detects a command id reused
 * for a different action, so any field that changes the effect has to change
 * the hash — including `expectedRevision`, which is a bigint and would
 * silently throw in `JSON.stringify` without the replacer.
 *
 * Nothing here lets an operation through: `authorize` returns false
 * throughout, so no git effect runs and the descriptor is all that is under
 * test.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { JsonObject } from "../src/json.js";
import type { MuxRunner } from "../src/mux.js";
import { createResidentSessionRuntime } from "../src/resident-session-runtime.js";
import {
	createSessionOrchestrator,
	SessionApprovalRequiredError,
	type SessionDeliveryApproval,
	type SessionProcessRunner,
	sessionDeliveryApprovalDigest,
	sessionProcessRunner,
} from "../src/session-orchestrator.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	roots.push(path);
	return path;
}

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync("git", [...args], { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout.trim();
}

function repository(): string {
	const root = temp("hobo-code-approval-repo-");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "user.name", "Test"]);
	writeFileSync(join(root, "tracked.txt"), "base\n");
	git(root, ["add", "-A"]);
	git(root, ["commit", "-qm", "base"]);
	return root;
}

/**
 * A tmux that accepts everything — no pane behaviour is under test here.
 *
 * `has-session` must answer with tmux's own "can't find session" on stderr,
 * not a bare non-zero exit: the runtime distinguishes "tmux says no such
 * session" from "the probe itself failed", and only the first is a usable
 * answer. A bare `{ code: 1 }` reads as the second and refuses to start.
 */
function silentTmux(): MuxRunner {
	let pane = 0;
	const sessions = new Set<string>();
	return {
		async run(args) {
			if (args[0] === "has-session") {
				const target = args[args.indexOf("-t") + 1] ?? "";
				return {
					code: sessions.has(target) ? 0 : 1,
					stdout: "",
					stderr: "can't find session",
				};
			}
			if (
				["new-session", "new-window", "split-window"].includes(args[0] ?? "")
			) {
				if (args[0] === "new-session")
					sessions.add(args[args.indexOf("-s") + 1] ?? "");
				pane += 1;
				return { code: 0, stdout: `%${pane}\n` };
			}
			if (args[0] === "show-options") return { code: 1, stdout: "" };
			return { code: 0, stdout: "" };
		},
	};
}

function envelope(
	revision: bigint,
	command: string,
	value: JsonObject,
	commandId = `command-${command}-${revision}`,
): JsonObject {
	return {
		schemaVersion: "hobo.code.session-command/v1",
		commandId,
		actorId: "test-client",
		sessionId: "session-1",
		expectedRevision: String(revision),
		[command]: value,
	};
}

/**
 * Stand a session up, then ask for one delivery operation with `authorize`
 * refusing. Returns whatever the orchestrator handed the authorizer and
 * whatever it threw, so a caller can assert on either.
 */
async function driveDelivery(
	command: string,
	value: JsonObject,
	options: { readonly dirty?: boolean; readonly commandId?: string } = {},
): Promise<{
	readonly seen: readonly SessionDeliveryApproval[];
	readonly thrown: unknown;
}> {
	const repo = repository();
	const dataDir = temp("hobo-code-approval-data-");
	const runtime = createResidentSessionRuntime({ dataDir, tmux: silentTmux() });
	const seen: SessionDeliveryApproval[] = [];
	const base = sessionProcessRunner();
	// The PR operations establish pre-effect provider state before they ask
	// for approval — they have to, or the descriptor could not name the PR
	// head being acted on. `gh` is not going to answer in a test, so this
	// stands in with "no pull request exists yet", which is the state a first
	// open or stack is approved against.
	const runner: SessionProcessRunner = {
		async run(command, args, cwd, env) {
			if (command !== "gh") return base.run(command, args, cwd, env);
			if (args[0] === "pr" && args[1] === "list")
				return { code: 0, stdout: "[]", stderr: "" };
			if (args[0] === "pr" && args[1] === "view")
				return {
					code: 0,
					stdout: JSON.stringify({
						headRefOid: "a".repeat(40),
						url: "https://github.test/o/r/pull/42",
					}),
					stderr: "",
				};
			if (args[0] === "repo" && args[1] === "view")
				return { code: 0, stdout: "main\n", stderr: "" };
			if (args[0] === "stack" && args[1] === "view")
				return {
					code: 0,
					stdout: JSON.stringify({ branches: [] }),
					stderr: "",
				};
			return { code: 0, stdout: "", stderr: "" };
		},
	};
	const orchestrator = createSessionOrchestrator({
		runtime,
		worktreesDir: join(dataDir, "worktrees"),
		runner,
		authorize: (approval) => {
			seen.push(approval);
			return false;
		},
	});
	try {
		const created = await orchestrator.execute(
			envelope(0n, "createSession", {
				name: "review",
				projectRoot: repo,
				branch: "code/review",
				clientId: "test-client",
			}),
		);
		const cwd = created.session?.worktreePath ?? "";
		if (options.dirty !== false)
			writeFileSync(join(cwd, "new.txt"), "change\n");
		let thrown: unknown;
		try {
			await orchestrator.execute(
				envelope(
					created.revision ?? 0n,
					command,
					value,
					options.commandId ?? `command-${command}`,
				),
			);
		} catch (error) {
			thrown = error;
		}
		return { seen, thrown };
	} finally {
		runtime.close();
	}
}

/**
 * The descriptor a delivery operation handed to `authorize` before being
 * refused. Fails loudly if the command never reached the approval gate — a
 * silent empty descriptor would let a test pass against an operation that
 * errored out well before it ever asked.
 */
async function approvalFor(
	command: string,
	value: JsonObject,
	options: { readonly dirty?: boolean; readonly commandId?: string } = {},
): Promise<SessionDeliveryApproval> {
	const { seen, thrown } = await driveDelivery(command, value, options);
	const approval = seen[0];
	if (!approval)
		throw new Error(
			`authorize was never consulted; ${command} failed first with: ${String(thrown)}`,
		);
	expect(thrown).toBeInstanceOf(SessionApprovalRequiredError);
	return approval;
}

/** The error a delivery command produced, for the cases that never get as far
 * as an approval. */
async function failureFor(command: string, value: JsonObject): Promise<never> {
	const { thrown } = await driveDelivery(command, value);
	throw thrown ?? new Error(`${command} unexpectedly succeeded`);
}

describe("the approval every delivery operation stops at", () => {
	it("names the operation it is asking about", async () => {
		// The authorizer renders this to a human; "approve?" with no verb is
		// not a question anyone can answer.
		expect((await approvalFor("commit", { message: "change" })).operation).toBe(
			"commit",
		);
	});

	it("carries the command id so a decision cannot be replayed onto another", async () => {
		expect((await approvalFor("commit", { message: "change" })).commandId).toBe(
			"command-commit",
		);
	});

	it("names the actor that asked", async () => {
		// Two clients driving one session is the normal case; an approval with
		// no actor cannot be attributed after the fact.
		expect((await approvalFor("commit", { message: "change" })).actorId).toBe(
			"test-client",
		);
	});

	it("names the session it applies to", async () => {
		expect((await approvalFor("commit", { message: "change" })).sessionId).toBe(
			"session-1",
		);
	});

	it("carries the revision the command expected", async () => {
		// Approving against a revision is what makes the approval stale rather
		// than merely old when the session moves on.
		expect(
			typeof (await approvalFor("commit", { message: "change" }))
				.expectedRevision,
		).toBe("bigint");
	});
});

describe("what a commit approval discloses", () => {
	const commitApproval = (value: JsonObject = { message: "change" }) =>
		approvalFor("commit", value);

	it("shows the message that will land", async () => {
		expect((await commitApproval()).details.message).toBe("change");
	});

	it("shows whether only staged paths are committed", async () => {
		// "commit everything" and "commit what I staged" are different actions
		// on a dirty tree; collapsing them would have the user approve one and
		// get the other.
		expect((await commitApproval()).details.stagedOnly).toBe(false);
	});

	it("reports an explicit staged-only commit as such", async () => {
		expect(
			(await commitApproval({ message: "change", stagedOnly: true })).details
				.stagedOnly,
		).toBe(true);
	});

	it("pins the head the commit will sit on", async () => {
		// Without it the approval is a blank cheque: the branch moves, and the
		// commit lands on a parent the user never saw.
		expect((await commitApproval()).details.gitHead).toMatch(/^[0-9a-f]{40}$/);
	});

	it("pins the index tree", async () => {
		expect((await commitApproval()).details.gitIndexTree).toMatch(
			/^[0-9a-f]{40}$/,
		);
	});

	it("pins the working tree that was approved", async () => {
		// The tree is the content. Head and index alone would let the files
		// change between approval and commit without invalidating anything.
		expect((await commitApproval()).details.gitTree).toMatch(/^[0-9a-f]{40}$/);
	});

	it("discloses no field beyond the ones a reader needs", async () => {
		// Every extra field is something a human has to skim past; more
		// importantly it is something that changes the digest for no change in
		// effect, invalidating resumable ledgers on unrelated edits.
		expect(Object.keys((await commitApproval()).details).sort()).toStrictEqual([
			"gitHead",
			"gitIndexTree",
			"gitTree",
			"message",
			"stagedOnly",
		]);
	});
});

describe("what a push approval discloses", () => {
	const pushApproval = () => approvalFor("push", { remote: "origin" });

	it("names the remote the commits leave for", async () => {
		// This is the field that distinguishes an internal mirror from a public
		// fork; a push approval without it approves publishing to anywhere.
		expect((await pushApproval()).details.remote).toBe("origin");
	});

	it("pins the head that will be published", async () => {
		expect((await pushApproval()).details.gitHead).toMatch(/^[0-9a-f]{40}$/);
	});

	it("does not carry commit-shaped fields it has no use for", async () => {
		expect(Object.keys((await pushApproval()).details).sort()).toStrictEqual([
			"gitHead",
			"remote",
		]);
	});
});

describe("what an open-pull-request approval discloses", () => {
	const prApproval = (
		value: JsonObject = { title: "t", body: "b", draft: false },
	) => approvalFor("openPullRequest", value);

	it("shows the title that will be published", async () => {
		expect((await prApproval()).details.title).toBe("t");
	});

	it("shows the body that will be published", async () => {
		// A PR body is public prose written by an agent; approving a title
		// alone would let arbitrary text through unread.
		expect((await prApproval()).details.body).toBe("b");
	});

	it("shows whether it opens as a draft", async () => {
		// Draft versus ready decides whether reviewers are notified — a
		// different action, not a formatting detail.
		expect((await prApproval()).details.draft).toBe(false);
	});

	it("refuses a command that leaves draft unstated rather than assuming ready", async () => {
		// The orchestrator has a `?? false` default, but the parser never lets
		// it fire: `draft` is required on the wire. That is the safer of the
		// two — defaulting would silently notify every reviewer on a PR the
		// caller thought it was opening quietly.
		await expect(
			failureFor("openPullRequest", { title: "t", body: "b" }),
		).rejects.toThrow(/openPullRequest\.draft must be specified/);
	});

	it("reports an explicit draft as such", async () => {
		expect(
			(await prApproval({ title: "t", body: "b", draft: true })).details.draft,
		).toBe(true);
	});

	it("names the branch it will target", async () => {
		expect(typeof (await prApproval()).details.parentBranch).toBe("string");
	});

	it("pins the head the pull request will propose", async () => {
		expect((await prApproval()).details.gitHead).toMatch(/^[0-9a-f]{40}$/);
	});
});

describe("what a stacked-pull-request approval discloses", () => {
	const stackApproval = () =>
		approvalFor("stackPullRequest", {
			parentBranch: "code/base",
			title: "t",
			body: "b",
		});

	it("names the parent branch the layer stacks on", async () => {
		// The parent decides what the diff contains. Stacking on the wrong one
		// silently widens the PR to include another layer's work.
		expect((await stackApproval()).details.parentBranch).toBe("code/base");
	});

	it("shows the title and body", async () => {
		const details = (await stackApproval()).details;
		expect(details.title).toBe("t");
		expect(details.body).toBe("b");
	});

	it("pins the head being stacked", async () => {
		expect((await stackApproval()).details.gitHead).toMatch(/^[0-9a-f]{40}$/);
	});

	it("takes the parent from the command, not the session's own parent", async () => {
		// Unlike openPullRequest, which reads the parent out of session
		// context, a stacked layer is told where it belongs.
		expect(Object.keys((await stackApproval()).details).sort()).toStrictEqual([
			"body",
			"gitHead",
			"parentBranch",
			"title",
		]);
	});
});

describe("what a merge approval discloses", () => {
	const mergeApproval = () =>
		approvalFor("mergePullRequest", { pullRequestNumber: 42 });

	it("names the pull request number", async () => {
		expect((await mergeApproval()).details.pullRequestNumber).toBe("42");
	});

	it("renders the number as a string rather than leaking a number type", async () => {
		// `details` is a flat string/boolean record so the digest is stable
		// across JSON round-trips; a bare number would hash differently after
		// a ledger reload.
		expect(typeof (await mergeApproval()).details.pullRequestNumber).toBe(
			"string",
		);
	});

	it("pins the provider head being merged", async () => {
		// The merge happens on GitHub's copy, not the local one — so the SHA
		// that has to be pinned is the provider's.
		expect(typeof (await mergeApproval()).details.pullRequestHeadSha).toBe(
			"string",
		);
	});

	it("carries the pull request url for the reader", async () => {
		expect(typeof (await mergeApproval()).details.pullRequestUrl).toBe(
			"string",
		);
	});

	it("carries no local git head — the local branch is not what merges", async () => {
		expect(Object.keys((await mergeApproval()).details).sort()).toStrictEqual([
			"pullRequestHeadSha",
			"pullRequestNumber",
			"pullRequestUrl",
		]);
	});
});

describe("the approval object itself", () => {
	it("is frozen before it reaches the authorizer", async () => {
		// It is handed to caller-supplied code before being hashed into the
		// ledger; a mutable descriptor would let an authorizer approve one
		// thing and have another recorded.
		expect(
			Object.isFrozen(await approvalFor("commit", { message: "change" })),
		).toBe(true);
	});

	it("freezes the details too, not just the wrapper", async () => {
		// A shallow freeze would leave exactly the fields that describe the
		// effect writable.
		expect(
			Object.isFrozen(
				(await approvalFor("commit", { message: "change" })).details,
			),
		).toBe(true);
	});

	it("travels on the refusal so a caller can render what was refused", async () => {
		// Without it the caller knows only that *something* needed approval,
		// and cannot re-ask.
		const repo = repository();
		const dataDir = temp("hobo-code-approval-error-");
		const runtime = createResidentSessionRuntime({
			dataDir,
			tmux: silentTmux(),
		});
		const orchestrator = createSessionOrchestrator({
			runtime,
			worktreesDir: join(dataDir, "worktrees"),
			authorize: () => false,
		});
		try {
			const created = await orchestrator.execute(
				envelope(0n, "createSession", {
					name: "review",
					projectRoot: repo,
					branch: "code/review",
					clientId: "test-client",
				}),
			);
			writeFileSync(
				join(created.session?.worktreePath ?? "", "new.txt"),
				"change\n",
			);
			await orchestrator.execute(
				envelope(created.revision ?? 0n, "commit", { message: "change" }),
			);
			expect.unreachable("an unapproved commit must throw");
		} catch (error) {
			expect(error).toBeInstanceOf(SessionApprovalRequiredError);
			// SAFETY: the instanceof assertion above establishes the type.
			expect((error as SessionApprovalRequiredError).approval.operation).toBe(
				"commit",
			);
		} finally {
			runtime.close();
		}
	});

	it("says which operation needs approval in the message", async () => {
		const repo = repository();
		const dataDir = temp("hobo-code-approval-message-");
		const runtime = createResidentSessionRuntime({
			dataDir,
			tmux: silentTmux(),
		});
		const orchestrator = createSessionOrchestrator({
			runtime,
			worktreesDir: join(dataDir, "worktrees"),
			authorize: () => false,
		});
		try {
			const created = await orchestrator.execute(
				envelope(0n, "createSession", {
					name: "review",
					projectRoot: repo,
					branch: "code/review",
					clientId: "test-client",
				}),
			);
			await expect(
				orchestrator.execute(
					envelope(created.revision ?? 0n, "push", { remote: "origin" }),
				),
			).rejects.toThrow(/push requires explicit approval/);
		} finally {
			runtime.close();
		}
	});

	it("fails closed when no authorizer is configured at all", async () => {
		// The default is refusal, not permission: a deployment that forgot to
		// wire an authorizer must not silently self-approve every push.
		const repo = repository();
		const dataDir = temp("hobo-code-approval-none-");
		const runtime = createResidentSessionRuntime({
			dataDir,
			tmux: silentTmux(),
		});
		const orchestrator = createSessionOrchestrator({
			runtime,
			worktreesDir: join(dataDir, "worktrees"),
		});
		try {
			const created = await orchestrator.execute(
				envelope(0n, "createSession", {
					name: "review",
					projectRoot: repo,
					branch: "code/review",
					clientId: "test-client",
				}),
			);
			await expect(
				orchestrator.execute(
					envelope(created.revision ?? 0n, "push", { remote: "origin" }),
				),
			).rejects.toThrow(SessionApprovalRequiredError);
		} finally {
			runtime.close();
		}
	});
});

describe("the approval digest", () => {
	const base: SessionDeliveryApproval = Object.freeze({
		operation: "commit",
		commandId: "c1",
		actorId: "a1",
		sessionId: "s1",
		expectedRevision: 3n,
		details: Object.freeze({ message: "m", stagedOnly: false }),
	});

	const digestWith = (patch: Partial<SessionDeliveryApproval>) =>
		sessionDeliveryApprovalDigest({ ...base, ...patch });

	it("hashes a bigint revision rather than throwing on it", async () => {
		// `JSON.stringify` throws on a bigint. Without the replacer this whole
		// path would fail at the first approval rather than at a test.
		expect(sessionDeliveryApprovalDigest(base)).toMatch(/^[0-9a-f]{64}$/);
	});

	it("is stable for the same approval", () => {
		// It is the ledger key. An unstable digest would read every resumed
		// delivery as a command-id reuse.
		expect(sessionDeliveryApprovalDigest(base)).toBe(
			sessionDeliveryApprovalDigest(base),
		);
	});

	it("changes when the operation changes", () => {
		// The whole point: a command id reused for a different action must not
		// match the ledger it would otherwise resume.
		expect(digestWith({ operation: "push" })).not.toBe(
			sessionDeliveryApprovalDigest(base),
		);
	});

	it("changes when the actor changes", () => {
		expect(digestWith({ actorId: "someone-else" })).not.toBe(
			sessionDeliveryApprovalDigest(base),
		);
	});

	it("changes when the session changes", () => {
		expect(digestWith({ sessionId: "s2" })).not.toBe(
			sessionDeliveryApprovalDigest(base),
		);
	});

	it("changes when the expected revision changes", () => {
		// The bigint field is the one most likely to be dropped by a naive
		// serializer, which would make two approvals at different revisions
		// hash identically.
		expect(digestWith({ expectedRevision: 4n })).not.toBe(
			sessionDeliveryApprovalDigest(base),
		);
	});

	it("changes when a detail changes", () => {
		expect(
			digestWith({ details: Object.freeze({ message: "other" }) }),
		).not.toBe(sessionDeliveryApprovalDigest(base));
	});

	it("changes when a boolean detail flips", () => {
		// stagedOnly false to true is a different commit, not a different
		// rendering of the same one.
		expect(
			digestWith({
				details: Object.freeze({ message: "m", stagedOnly: true }),
			}),
		).not.toBe(sessionDeliveryApprovalDigest(base));
	});

	it("produces a hex sha256, not a truncated or encoded form", () => {
		// It goes into a JSON ledger and is compared as a string; any encoding
		// change would invalidate every ledger on disk.
		expect(sessionDeliveryApprovalDigest(base)).toHaveLength(64);
	});
});
