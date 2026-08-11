import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	AgentLifecycleState,
	DeliveryLifecycleState,
	SessionLifecycleState,
} from "../src/_generated/code_harness_pb.js";
import type { MuxRunner } from "../src/mux.js";
import { createResidentSessionRuntime } from "../src/resident-session-runtime.js";
import {
	createSessionOrchestrator,
	type SessionDeliveryApproval,
	type SessionProcessRunner,
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
	const root = temp("hobo-code-orchestrator-repo-");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "user.name", "Test"]);
	writeFileSync(join(root, "staged.txt"), "base\n");
	writeFileSync(join(root, "unstaged.txt"), "base\n");
	git(root, ["add", "-A"]);
	git(root, ["commit", "-qm", "base"]);
	return root;
}

function fakeTmux(): MuxRunner & { calls: string[][] } {
	const calls: string[][] = [];
	let pane = 0;
	const sessions = new Set<string>();
	let agentRunId = "";
	let agentExit = "";
	return {
		calls,
		async run(args) {
			calls.push([...args]);
			if (args[0] === "show-options") {
				const value =
					args.at(-1) === "@hobo_agent_exit" ? agentExit : agentRunId;
				return { code: value ? 0 : 1, stdout: value };
			}
			if (args[0] === "respawn-pane") {
				agentRunId = args[args.indexOf("@hobo_agent_run") + 1] ?? "";
				agentExit = "";
				return { code: 0, stdout: "" };
			}
			if (args[0] === "send-keys" && args.at(-1) === "C-c") {
				agentExit = `${agentRunId}:130`;
			}
			if (args[0] === "has-session") {
				const target = args[args.indexOf("-t") + 1] ?? "";
				return {
					code: sessions.has(target) ? 0 : 1,
					stdout: "",
					stderr: "can't find session",
				};
			}
			if (args[0] === "kill-session") {
				sessions.delete(args[args.indexOf("-t") + 1] ?? "");
			}
			if (
				["new-session", "new-window", "split-window"].includes(args[0] ?? "")
			) {
				if (args[0] === "new-session") {
					sessions.add(args[args.indexOf("-s") + 1] ?? "");
				}
				pane += 1;
				return { code: 0, stdout: `%${pane}\n` };
			}
			return { code: 0, stdout: "" };
		},
	};
}

function envelope(
	sessionId: string,
	revision: bigint,
	command: string,
	value: Record<string, unknown>,
): Record<string, unknown> {
	return {
		schemaVersion: "hobo.code.session-command/v1",
		commandId: `command-${command}-${revision}`,
		actorId: "test-client",
		sessionId,
		expectedRevision: String(revision),
		[command]: value,
	};
}

async function createHarness(repo = repository()) {
	const dataDir = temp("hobo-code-orchestrator-data-");
	const tmux = fakeTmux();
	const runtime = createResidentSessionRuntime({ dataDir, tmux });
	const orchestrator = createSessionOrchestrator({
		runtime,
		worktreesDir: join(dataDir, "worktrees"),
	});
	const created = await orchestrator.execute(
		envelope("session-1", 0n, "createSession", {
			name: "review",
			projectRoot: repo,
			branch: "code/review",
			clientId: "test-client",
		}),
	);
	return { repo, dataDir, tmux, runtime, orchestrator, created };
}

describe("session orchestrator", () => {
	it("creates one real branch and worktree per resident session", async () => {
		const { repo, runtime, created } = await createHarness();
		expect(created.session?.worktreePath).not.toBe(repo);
		expect(existsSync(join(created.session?.worktreePath ?? "", ".git"))).toBe(
			true,
		);
		expect(
			git(created.session?.worktreePath ?? "", ["branch", "--show-current"]),
		).toBe("code/review");
		expect(created.gitState?.headSha).toBe(git(repo, ["rev-parse", "HEAD"]));
		runtime.close();
	});

	it("resumes an exact orphaned branch worktree before runtime adoption", async () => {
		const repo = repository();
		const dataDir = temp("hobo-code-orphan-data-");
		const worktreesDir = join(dataDir, "worktrees");
		const worktreePath = join(
			worktreesDir,
			`session-1-${createHash("sha256").update("session-1").digest("hex").slice(0, 8)}`,
		);
		git(repo, ["worktree", "add", "-b", "code/review", worktreePath, "HEAD"]);
		const runtime = createResidentSessionRuntime({ dataDir, tmux: fakeTmux() });
		const orchestrator = createSessionOrchestrator({ runtime, worktreesDir });
		const resumed = await orchestrator.execute(
			envelope("session-1", 0n, "createSession", {
				name: "review",
				projectRoot: repo,
				branch: "code/review",
				clientId: "test-client",
			}),
		);
		expect(resumed.session?.worktreePath).toBe(worktreePath);
		runtime.close();
	});

	it("reuses an existing branch when a prior create died before persistence", async () => {
		const repo = repository();
		git(repo, ["branch", "code/retry"]);
		const dataDir = temp("hobo-code-existing-branch-");
		const runtime = createResidentSessionRuntime({ dataDir, tmux: fakeTmux() });
		const orchestrator = createSessionOrchestrator({
			runtime,
			worktreesDir: join(dataDir, "worktrees"),
		});
		const created = await orchestrator.execute(
			envelope("session-retry", 0n, "createSession", {
				name: "retry",
				projectRoot: repo,
				branch: "code/retry",
				clientId: "test-client",
			}),
		);
		expect(
			git(created.session?.worktreePath ?? "", ["branch", "--show-current"]),
		).toBe("code/retry");
		runtime.close();
	});

	it("preserves a running session and worktree when post-create Git refresh fails", async () => {
		const repo = repository();
		const dataDir = temp("hobo-code-refresh-failure-");
		const tmux = fakeTmux();
		const runtime = createResidentSessionRuntime({ dataDir, tmux });
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			run(command, args, cwd) {
				if (
					command === "git" &&
					args[0] === "status" &&
					args.includes("--untracked-files=all")
				) {
					return Promise.resolve({
						code: 1,
						stdout: "",
						stderr: "refresh failed",
					});
				}
				return base.run(command, args, cwd);
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime,
			worktreesDir: join(dataDir, "worktrees"),
			runner,
		});
		await expect(
			orchestrator.execute(
				envelope("session-1", 0n, "createSession", {
					name: "review",
					projectRoot: repo,
					branch: "code/review",
					clientId: "test-client",
				}),
			),
		).rejects.toThrow("refresh failed");
		const stored = await runtime.load("session-1");
		expect(existsSync(stored?.session?.worktreePath ?? "")).toBe(true);
		expect(tmux.calls.some((call) => call[0] === "kill-session")).toBe(false);
		runtime.close();
	});

	it("starts and stops an agent harness in an existing pane", async () => {
		const { tmux, runtime, orchestrator, created } = await createHarness();
		const started = await orchestrator.execute(
			envelope("session-1", created.revision ?? 0n, "startAgent", {
				paneId: created.focusedPaneId,
				provider: "codex",
				command: ["codex", "exec"],
				prompt: "review this safely",
			}),
		);
		expect(started.agentRuns[0]?.lifecycleState).toBe(
			AgentLifecycleState.WORKING,
		);
		expect(
			tmux.calls
				.find((call) => call[0] === "respawn-pane")
				?.find((argument) => argument.includes("HOBO_PANE_META=")),
		).toContain("HOBO_PANE_META=");
		const stopped = await orchestrator.execute(
			envelope("session-1", started.revision ?? 0n, "stopAgent", {
				agentRunId: started.agentRuns[0]?.id,
			}),
		);
		expect(stopped.agentRuns[0]?.lifecycleState).toBe(
			AgentLifecycleState.STOPPED,
		);
		expect(tmux.calls.some((call) => call.at(-1) === "C-c")).toBe(true);
		runtime.close();
	});

	it("checkpoints and restores staged, unstaged, and untracked changes without moving HEAD", async () => {
		const { runtime, orchestrator, created } = await createHarness();
		const cwd = created.session?.worktreePath ?? "";
		const head = git(cwd, ["rev-parse", "HEAD"]);
		writeFileSync(join(cwd, "staged.txt"), "staged\n");
		git(cwd, ["add", "staged.txt"]);
		writeFileSync(join(cwd, "unstaged.txt"), "unstaged\n");
		writeFileSync(join(cwd, "untracked.txt"), "untracked\n");

		const saved = await orchestrator.execute(
			envelope("session-1", created.revision ?? 0n, "createCheckpoint", {
				label: "before-review",
			}),
		);
		expect(saved.gitState?.stagedPaths).toContain("staged.txt");
		expect(saved.gitState?.unstagedPaths).toContain("unstaged.txt");
		expect(saved.gitState?.untrackedPaths).toContain("untracked.txt");
		expect(git(cwd, ["rev-parse", "HEAD"])).toBe(head);
		const checkpointRef = `refs/hobo/checkpoints/${createHash("sha256").update("session-1").digest("hex")}/${saved.checkpoints[0]?.id}`;
		expect(git(cwd, ["rev-parse", checkpointRef])).toBe(
			saved.checkpoints[0]?.gitCommit,
		);
		expect(
			spawnSync("git", ["rev-parse", "--verify", "refs/stash"], {
				cwd,
			}).status,
		).not.toBe(0);

		git(cwd, ["reset", "--hard", "HEAD"]);
		git(cwd, ["clean", "-fd"]);
		const restored = await orchestrator.execute(
			envelope("session-1", saved.revision ?? 0n, "restoreCheckpoint", {
				checkpointId: saved.checkpoints[0]?.id,
			}),
		);
		expect(readFileSync(join(cwd, "staged.txt"), "utf8")).toBe("staged\n");
		expect(readFileSync(join(cwd, "unstaged.txt"), "utf8")).toBe("unstaged\n");
		expect(readFileSync(join(cwd, "untracked.txt"), "utf8")).toBe(
			"untracked\n",
		);
		expect(restored.gitState?.stagedPaths).toContain("staged.txt");
		expect(git(cwd, ["rev-parse", "HEAD"])).toBe(head);
		git(cwd, ["reset", "--hard", "HEAD"]);
		git(cwd, ["clean", "-fd"]);
		await orchestrator.execute(
			envelope("session-1", restored.revision ?? 0n, "stopSession", {
				removeWorktree: true,
			}),
		);
		expect(
			spawnSync("git", ["rev-parse", "--verify", checkpointRef], {
				cwd: created.session?.projectRoot,
			}).status,
		).not.toBe(0);
		runtime.close();
	});

	it("keeps checkpoint refs when worktree removal fails", async () => {
		const harness = await createHarness();
		const saved = await harness.orchestrator.execute(
			envelope(
				"session-1",
				harness.created.revision ?? 0n,
				"createCheckpoint",
				{
					label: "keep-until-removed",
				},
			),
		);
		const checkpointRef = `refs/hobo/checkpoints/${createHash("sha256").update("session-1").digest("hex")}/${saved.checkpoints[0]?.id}`;
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			run(command, args, cwd, env) {
				if (
					command === "git" &&
					args[0] === "worktree" &&
					args[1] === "remove"
				) {
					return Promise.resolve({
						code: 1,
						stdout: "",
						stderr: "remove failed",
					});
				}
				return base.run(command, args, cwd, env);
			},
		};
		await expect(
			createSessionOrchestrator({
				runtime: harness.runtime,
				worktreesDir: join(harness.dataDir, "worktrees"),
				runner,
			}).execute(
				envelope("session-1", saved.revision ?? 0n, "stopSession", {
					removeWorktree: true,
				}),
			),
		).rejects.toThrow("remove failed");
		expect(git(harness.repo, ["rev-parse", checkpointRef])).toBe(
			saved.checkpoints[0]?.gitCommit,
		);
		harness.runtime.close();
	});

	it("fails closed before commit, push, PR, stack, or merge without approval", async () => {
		const { runtime, orchestrator, created } = await createHarness();
		const cwd = created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "new.txt"), "change\n");
		await expect(
			orchestrator.execute(
				envelope("session-1", created.revision ?? 0n, "commit", {
					message: "change",
				}),
			),
		).rejects.toThrow("explicit approval");
		expect(git(cwd, ["log", "-1", "--pretty=%s"])).toBe("base");
		runtime.close();
	});

	it("runs approved commit, push, stacked PR, and squash merge operations", async () => {
		const harness = await createHarness();
		const calls: Array<{ command: string; args: readonly string[] }> = [];
		const approvals: SessionDeliveryApproval[] = [];
		let pullRequestCreated = false;
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			async run(command, args, cwd, env) {
				calls.push({ command, args });
				if (command === "gh" && args[0] === "stack" && args[1] === "view") {
					return {
						code: 0,
						stdout: JSON.stringify({
							branches: [{ name: "code/review", pr: { number: 42 } }],
						}),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "stack" && args[1] === "submit") {
					pullRequestCreated = true;
					return { code: 0, stdout: "", stderr: "" };
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "list") {
					return {
						code: 0,
						stdout: JSON.stringify(
							pullRequestCreated
								? [
										{
											number: 42,
											url: "https://github.test/o/r/pull/42",
											state: "OPEN",
											title: "approved",
											body: "body",
											baseRefName: "main",
										},
									]
								: [],
						),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "view") {
					return {
						code: 0,
						stdout: args.includes("headRefOid,url")
							? JSON.stringify({
									headRefOid: "a".repeat(40),
									url: "https://github.test/o/r/pull/42",
								})
							: args.includes("state")
								? JSON.stringify({ state: "MERGED" })
								: "https://github.test/o/r/pull/42\n",
						stderr: "",
					};
				}
				if (command === "gh") return { code: 0, stdout: "", stderr: "" };
				return base.run(command, args, cwd, env);
			},
		};
		const remote = temp("hobo-code-orchestrator-remote-");
		git(remote, ["init", "--bare", "-q"]);
		git(harness.created.session?.worktreePath ?? "", [
			"remote",
			"add",
			"origin",
			remote,
		]);
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: (action) => {
				approvals.push(action);
				return true;
			},
		});
		const cwd = harness.created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "approved.txt"), "approved\n");
		const committed = await orchestrator.execute(
			envelope("session-1", harness.created.revision ?? 0n, "commit", {
				message: "approved",
			}),
		);
		const pushed = await orchestrator.execute(
			envelope("session-1", committed.revision ?? 0n, "push", {
				remote: "origin",
			}),
		);
		const stacked = await orchestrator.execute(
			envelope("session-1", pushed.revision ?? 0n, "stackPullRequest", {
				parentBranch: "main",
				title: "approved",
				body: "body",
			}),
		);
		expect(stacked.deliveryState?.pullRequestNumber).toBe(42n);
		expect(stacked.deliveryState?.stackParentBranch).toBe("main");
		const mergeCommand = envelope(
			"session-1",
			stacked.revision ?? 0n,
			"mergePullRequest",
			{
				pullRequestNumber: "42",
			},
		);
		const merged = await orchestrator.execute(mergeCommand);
		await expect(orchestrator.execute(mergeCommand)).resolves.toMatchObject({
			deliveryState: { lifecycleState: DeliveryLifecycleState.MERGED },
		});
		expect(merged.deliveryState?.lifecycleState).toBe(
			DeliveryLifecycleState.MERGED,
		);
		expect(
			calls.some((call) =>
				call.args.join(" ").includes("stack init --base main code/review"),
			),
		).toBe(true);
		expect(
			calls.some(
				(call) => call.args.join(" ") === "stack submit --auto --open",
			),
		).toBe(true);
		expect(
			calls.some((call) =>
				call.args
					.join(" ")
					.includes(
						`pr merge 42 --squash --match-head-commit ${"a".repeat(40)}`,
					),
			),
		).toBe(true);
		expect(
			calls.filter((call) =>
				call.args.join(" ").includes("pr merge 42 --squash"),
			),
		).toHaveLength(1);
		expect(approvals.at(-1)).toMatchObject({
			operation: "merge-pull-request",
			commandId: mergeCommand.commandId,
			actorId: "test-client",
			details: { pullRequestNumber: "42" },
		});
		harness.runtime.close();
	});

	it("scopes delivery replay to the full command envelope and session", async () => {
		const harness = await createHarness();
		let merges = 0;
		const runner: SessionProcessRunner = {
			async run(command, args, cwd) {
				if (command === "gh" && args.includes("headRefOid,url")) {
					return {
						code: 0,
						stdout: JSON.stringify({
							headRefOid: "a".repeat(40),
							url: "https://github.test/o/r/pull/42",
						}),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
					merges += 1;
					return { code: 0, stdout: "", stderr: "" };
				}
				return sessionProcessRunner().run(command, args, cwd);
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		});
		const first = {
			...envelope(
				"session-1",
				harness.created.revision ?? 0n,
				"mergePullRequest",
				{ pullRequestNumber: "42" },
			),
			commandId: "shared-command-id",
		};
		await orchestrator.execute(first);
		await expect(
			orchestrator.execute({ ...first, actorId: "different-actor" }),
		).rejects.toThrow("reused");

		const second = await orchestrator.execute(
			envelope("session-2", 0n, "createSession", {
				name: "second",
				projectRoot: harness.repo,
				branch: "code/second",
				clientId: "test-client",
			}),
		);
		await orchestrator.execute({
			...envelope("session-2", second.revision ?? 0n, "mergePullRequest", {
				pullRequestNumber: "42",
			}),
			commandId: "shared-command-id",
		});
		expect(merges).toBe(2);
		harness.runtime.close();
	});

	it("refuses to merge a pull request whose head changed after approval", async () => {
		const harness = await createHarness();
		let head = "a".repeat(40);
		let merges = 0;
		let approval: SessionDeliveryApproval | undefined;
		const runner: SessionProcessRunner = {
			async run(command, args) {
				if (command === "gh" && args.includes("headRefOid,url")) {
					return {
						code: 0,
						stdout: JSON.stringify({
							headRefOid: head,
							url: "https://github.test/o/r/pull/42",
						}),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
					merges += 1;
					return { code: 0, stdout: "", stderr: "" };
				}
				return {
					code: 0,
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
				};
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: (candidate) => {
				approval = candidate;
				head = "b".repeat(40);
				return true;
			},
		});
		await expect(
			orchestrator.execute(
				envelope(
					"session-1",
					harness.created.revision ?? 0n,
					"mergePullRequest",
					{ pullRequestNumber: "42" },
				),
			),
		).rejects.toThrow("pull request changed after merge approval");
		expect(merges).toBe(0);
		expect(approval?.details).toMatchObject({
			pullRequestHeadSha: "a".repeat(40),
			pullRequestUrl: "https://github.test/o/r/pull/42",
		});
		harness.runtime.close();
	});

	it("retries a confirmed pre-effect delivery failure with the same command ID", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "retry.txt"), "retry\n");
		let failCommit = true;
		let retryLedgerStatus = "";
		const retryApprovals: SessionDeliveryApproval[] = [];
		const ledgerPath = join(
			harness.dataDir,
			"worktrees",
			".commands",
			createHash("sha256").update("session-1").digest("hex"),
			`${createHash("sha256").update("retry-command").digest("hex")}.json`,
		);
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			run(command, args, workdir, env) {
				if (command === "git" && args[0] === "commit-tree" && failCommit) {
					failCommit = false;
					return Promise.resolve({
						code: 1,
						stdout: "",
						stderr: "hook rejected before commit",
					});
				}
				if (command === "git" && args[0] === "commit-tree") {
					retryLedgerStatus = (
						JSON.parse(readFileSync(ledgerPath, "utf8")) as { status: string }
					).status;
				}
				return base.run(command, args, workdir, env);
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: (action) => {
				retryApprovals.push(action);
				return true;
			},
		});
		const command = {
			...envelope("session-1", harness.created.revision ?? 0n, "commit", {
				message: "retry safely",
			}),
			commandId: "retry-command",
		};
		await expect(orchestrator.execute(command)).rejects.toThrow(
			"hook rejected before commit",
		);
		expect(git(cwd, ["ls-files"])).toBe("staged.txt\nunstaged.txt");
		const retried = await orchestrator.execute(command);
		expect(git(cwd, ["rev-parse", "HEAD^{tree}"])).toBe(
			retryApprovals[0]?.details.gitTree,
		);
		expect(git(cwd, ["ls-files"])).toBe("retry.txt\nstaged.txt\nunstaged.txt");
		expect(retried.gitState?.dirty).toBe(false);
		expect(retryLedgerStatus).toBe("pending");
		expect(retryApprovals).toHaveLength(1);
		expect(git(cwd, ["log", "-1", "--pretty=%s"])).toBe("retry safely");
		harness.runtime.close();
	});

	it("does not reconcile an unrelated commit as the approved commit", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "expected.txt"), "expected\n");
		let commitAttempts = 0;
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			async run(command, args, workdir, env) {
				if (
					command === "git" &&
					args[0] === "update-ref" &&
					++commitAttempts === 1
				) {
					const head = git(workdir, ["rev-parse", "HEAD"]);
					const unrelated = git(workdir, [
						"commit-tree",
						`${head}^{tree}`,
						"-p",
						head,
						"-m",
						"unrelated",
					]);
					git(workdir, [
						"update-ref",
						"refs/heads/code/review",
						unrelated,
						head,
					]);
					return { code: 1, stdout: "", stderr: "approved commit failed" };
				}
				return base.run(command, args, workdir, env);
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		});
		const command = {
			...envelope("session-1", harness.created.revision ?? 0n, "commit", {
				message: "approved",
			}),
			commandId: "ambiguous-commit",
		};
		await expect(orchestrator.execute(command)).rejects.toThrow(
			"approved commit failed",
		);
		await expect(orchestrator.execute(command)).rejects.toThrow(
			"unknown prior outcome",
		);
		expect(git(cwd, ["log", "-1", "--pretty=%s"])).toBe("unrelated");
		expect(commitAttempts).toBe(1);
		harness.runtime.close();
	});

	it("commits only the tree included in the approval descriptor", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "approved.txt"), "approved\n");
		let approval: SessionDeliveryApproval | undefined;
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			authorize(action) {
				approval = action;
				writeFileSync(join(cwd, "after-approval.txt"), "later\n");
				return true;
			},
		});
		const committed = await orchestrator.execute(
			envelope("session-1", harness.created.revision ?? 0n, "commit", {
				message: "approved tree",
			}),
		);
		expect(approval?.details.gitHead).toBeDefined();
		expect(approval?.details.gitTree).toBe(
			git(cwd, ["rev-parse", "HEAD^{tree}"]),
		);
		expect(
			spawnSync("git", ["cat-file", "-e", "HEAD:after-approval.txt"], {
				cwd,
			}).status,
		).not.toBe(0);
		expect(committed.gitState?.untrackedPaths).toContain("after-approval.txt");
		harness.runtime.close();
	});

	it("fails closed without discarding index changes made after approval", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		const approvedHead = git(cwd, ["rev-parse", "HEAD"]);
		writeFileSync(join(cwd, "approved.txt"), "approved\n");
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			authorize() {
				writeFileSync(join(cwd, "after-approval.txt"), "later\n");
				git(cwd, ["add", "after-approval.txt"]);
				return true;
			},
		});
		await expect(
			orchestrator.execute(
				envelope("session-1", harness.created.revision ?? 0n, "commit", {
					message: "approved tree",
				}),
			),
		).rejects.toThrow("Git index changed after delivery approval");
		expect(git(cwd, ["rev-parse", "HEAD"])).toBe(approvedHead);
		expect(git(cwd, ["diff", "--cached", "--name-only"])).toBe(
			"after-approval.txt",
		);
		harness.runtime.close();
	});

	it("recovers only HoBo-owned stale Git index locks", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		const indexLock = `${git(cwd, [
			"rev-parse",
			"--path-format=absolute",
			"--git-path",
			"index",
		])}.lock`;
		const staleOwner = "2147483647-00000000-0000-0000-0000-000000000000";
		const staleMarker = `hobo:${staleOwner}\n`;
		const staleOwnerPath = `${indexLock}.hobo-${staleOwner}`;
		writeFileSync(staleOwnerPath, staleMarker);
		linkSync(staleOwnerPath, indexLock);
		writeFileSync(join(cwd, "approved.txt"), "approved\n");
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			authorize: () => true,
		});
		const committed = await orchestrator.execute(
			envelope("session-1", harness.created.revision ?? 0n, "commit", {
				message: "recover stale lock",
			}),
		);
		expect(existsSync(indexLock)).toBe(false);
		const head = git(cwd, ["rev-parse", "HEAD"]);
		writeFileSync(indexLock, "external Git lock");
		writeFileSync(join(cwd, "blocked.txt"), "blocked\n");
		await expect(
			orchestrator.execute(
				envelope("session-1", committed.revision ?? 0n, "commit", {
					message: "must remain blocked",
				}),
			),
		).rejects.toThrow("Git index is busy");
		expect(readFileSync(indexLock, "utf8")).toBe("external Git lock");
		expect(git(cwd, ["rev-parse", "HEAD"])).toBe(head);
		harness.runtime.close();
	});

	it("does not remove claimed or unknown operation locks", async () => {
		const harness = await createHarness();
		const lockPath = join(
			harness.dataDir,
			"worktrees",
			".operation-locks",
			`${createHash("sha256").update("session-1").digest("hex")}.lock`,
		);
		mkdirSync(join(lockPath, ".."), { recursive: true });
		const staleOwner = "2147483647-00000000-0000-0000-0000-000000000000";
		const marker = `hobo:${staleOwner}\n`;
		const ownerPath = `${lockPath}.hobo-${staleOwner}`;
		const claimPath = `${ownerPath}.reclaim-${process.pid}-00000000-0000-0000-0000-000000000001`;
		writeFileSync(ownerPath, marker);
		linkSync(ownerPath, lockPath);
		renameSync(ownerPath, claimPath);

		await expect(
			harness.orchestrator.execute(
				envelope("session-1", harness.created.revision ?? 0n, "focusPane", {
					paneId: harness.created.focusedPaneId,
				}),
			),
		).rejects.toThrow("operation is busy");
		expect(readFileSync(lockPath, "utf8")).toBe(marker);
		expect(readFileSync(claimPath, "utf8")).toBe(marker);
		rmSync(lockPath);
		rmSync(claimPath);
		writeFileSync(lockPath, "external lock");
		await expect(
			harness.orchestrator.execute(
				envelope("session-1", harness.created.revision ?? 0n, "focusPane", {
					paneId: harness.created.focusedPaneId,
				}),
			),
		).rejects.toThrow("operation is busy");
		expect(readFileSync(lockPath, "utf8")).toBe("external lock");
		harness.runtime.close();
	});

	it("reconciles a committed multiline approval by its full message", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "approved.txt"), "approved\n");
		let failRefresh = true;
		const runtime = new Proxy(harness.runtime, {
			get(target, property, receiver) {
				if (property !== "update")
					return Reflect.get(target, property, receiver);
				return async (...args: Parameters<typeof target.update>) => {
					if (failRefresh) {
						failRefresh = false;
						throw new Error("crash after commit publication");
					}
					return target.update(...args);
				};
			},
		});
		const committed = await createSessionOrchestrator({
			runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			authorize: () => true,
		}).execute(
			envelope("session-1", harness.created.revision ?? 0n, "commit", {
				message: "approved subject\n\napproved body",
			}),
		);
		expect(committed.gitState?.dirty).toBe(false);
		expect(git(cwd, ["show", "-s", "--format=%B", "HEAD"])).toBe(
			"approved subject\n\napproved body",
		);
		harness.runtime.close();
	});

	it("pushes only the commit included in the approval descriptor", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		const remote = temp("hobo-code-approved-push-remote-");
		git(remote, ["init", "--bare", "-q"]);
		git(cwd, ["remote", "add", "origin", remote]);
		const approvedHead = git(cwd, ["rev-parse", "HEAD"]);
		let approval: SessionDeliveryApproval | undefined;
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			authorize(action) {
				approval = action;
				writeFileSync(join(cwd, "after-approval.txt"), "later\n");
				git(cwd, ["add", "-A"]);
				git(cwd, ["commit", "-qm", "after approval"]);
				return true;
			},
		});
		await orchestrator.execute(
			envelope("session-1", harness.created.revision ?? 0n, "push", {
				remote: "origin",
			}),
		);
		expect(approval?.details.gitHead).toBe(approvedHead);
		expect(git(remote, ["rev-parse", "refs/heads/code/review"])).toBe(
			approvedHead,
		);
		expect(git(cwd, ["rev-parse", "HEAD"])).not.toBe(approvedHead);
		harness.runtime.close();
	});

	it("reconciles a pending push as not applied after restart, then retries exactly once", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		const remote = temp("hobo-code-pending-push-remote-");
		git(remote, ["init", "--bare", "-q"]);
		git(cwd, ["remote", "add", "origin", remote]);
		let pushes = 0;
		let probes = 0;
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			run(command, args, workdir, env) {
				if (command === "git" && args[0] === "push" && ++pushes === 1) {
					return Promise.resolve({
						code: 1,
						stdout: "",
						stderr: "connection lost before push",
					});
				}
				if (command === "git" && args[0] === "ls-remote" && ++probes === 1) {
					return Promise.resolve({
						code: 1,
						stdout: "",
						stderr: "provider unavailable",
					});
				}
				return base.run(command, args, workdir, env);
			},
		};
		const options = {
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		};
		const command = {
			...envelope("session-1", harness.created.revision ?? 0n, "push", {
				remote: "origin",
			}),
			commandId: "pending-push",
		};
		await expect(
			createSessionOrchestrator(options).execute(command),
		).rejects.toThrow("connection lost before push");
		await expect(
			createSessionOrchestrator(options).execute(command),
		).resolves.toMatchObject({
			deliveryState: { lifecycleState: DeliveryLifecycleState.READY },
		});
		expect(pushes).toBe(2);
		harness.runtime.close();
	});

	it("repairs approved stack metadata after submit before completing reconciliation", async () => {
		const harness = await createHarness();
		let edits = 0;
		const editTargets: string[] = [];
		let submitted = false;
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			run(command, args, cwd, env) {
				if (command !== "gh") return base.run(command, args, cwd, env);
				if (args[0] === "stack") {
					if (args[1] === "view")
						return Promise.resolve({
							code: 0,
							stdout: JSON.stringify({
								branches: [{ name: "code/review", pr: { number: 42 } }],
							}),
							stderr: "",
						});
					if (args[1] === "submit") submitted = true;
					return Promise.resolve({ code: 0, stdout: "", stderr: "" });
				}
				if (args[0] === "pr" && args[1] === "edit") {
					edits += 1;
					editTargets.push(args[2] ?? "");
					return Promise.resolve({
						code: edits === 1 ? 1 : 0,
						stdout: "",
						stderr: edits === 1 ? "connection lost after submit" : "",
					});
				}
				if (args[0] === "pr" && args[1] === "list") {
					return Promise.resolve({
						code: 0,
						stdout: JSON.stringify(
							submitted
								? [
										{
											number: 42,
											url: "https://github.test/o/r/pull/42",
											state: "OPEN",
											title: edits >= 2 ? "approved" : "old",
											body: edits >= 2 ? "approved body" : "old",
											baseRefName: edits >= 2 ? "main" : "old-parent",
										},
									]
								: [
										{
											number: 41,
											url: "https://github.test/o/r/pull/41",
											state: "MERGED",
											title: "historical",
											body: "historical",
											baseRefName: "main",
										},
									],
						),
						stderr: "",
					});
				}
				return Promise.resolve({
					code: 0,
					stdout: JSON.stringify({
						number: 42,
						url: "https://github.test/o/r/pull/42",
					}),
					stderr: "",
				});
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		});
		const command = envelope(
			"session-1",
			harness.created.revision ?? 0n,
			"stackPullRequest",
			{ parentBranch: "main", title: "approved", body: "approved body" },
		);
		await expect(orchestrator.execute(command)).rejects.toThrow(
			"connection lost after submit",
		);
		const stacked = await orchestrator.execute(command);
		expect(edits).toBe(2);
		expect(stacked.deliveryState?.stackParentBranch).toBe("main");
		expect(stacked.deliveryState?.pullRequestNumber).toBe(42n);
		expect(editTargets).toEqual(["42", "42"]);
		harness.runtime.close();
	});

	it("does not reconcile an unrelated pull request created during delivery", async () => {
		const harness = await createHarness();
		let creates = 0;
		let created = false;
		let approval: SessionDeliveryApproval | undefined;
		const runner: SessionProcessRunner = {
			async run(command, args) {
				if (command === "gh" && args[0] === "repo")
					return { code: 0, stdout: "main\n", stderr: "" };
				if (command === "gh" && args[0] === "pr" && args[1] === "list") {
					return {
						code: 0,
						stdout: JSON.stringify(
							created
								? [
										{
											number: 41,
											url: "https://github.test/o/r/pull/41",
											state: "OPEN",
											title: "approved",
											body: "approved body",
											isDraft: false,
											baseRefName: "wrong-base",
										},
									]
								: [],
						),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "create") {
					creates += 1;
					created = true;
					return { code: 1, stdout: "", stderr: "create failed" };
				}
				return { code: 1, stdout: "", stderr: "unexpected command" };
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: (action) => {
				approval = action;
				return true;
			},
		});
		await expect(
			orchestrator.execute(
				envelope(
					"session-1",
					harness.created.revision ?? 0n,
					"openPullRequest",
					{ title: "approved", body: "approved body", draft: false },
				),
			),
		).rejects.toThrow("create failed");
		expect(creates).toBe(1);
		expect(approval?.details.parentBranch).toBe("main");
		expect(
			(await harness.runtime.load("session-1"))?.deliveryState
				?.pullRequestNumber,
		).toBeUndefined();
		harness.runtime.close();
	});

	it("does not adopt an identical pull request that predates approval", async () => {
		const harness = await createHarness();
		const runner: SessionProcessRunner = {
			async run(command, args) {
				if (command === "gh" && args[0] === "repo")
					return { code: 0, stdout: "main\n", stderr: "" };
				if (command === "gh" && args[0] === "pr" && args[1] === "list")
					return {
						code: 0,
						stdout: JSON.stringify([
							{
								number: 40,
								url: "https://github.test/o/r/pull/40",
								state: "OPEN",
								title: "approved",
								body: "approved body",
								isDraft: false,
								baseRefName: "main",
							},
						]),
						stderr: "",
					};
				if (command === "gh" && args[0] === "pr" && args[1] === "create")
					return { code: 1, stdout: "", stderr: "create failed" };
				return { code: 1, stdout: "", stderr: "unexpected command" };
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		});
		await expect(
			orchestrator.execute(
				envelope(
					"session-1",
					harness.created.revision ?? 0n,
					"openPullRequest",
					{ title: "approved", body: "approved body", draft: false },
				),
			),
		).rejects.toThrow("create failed");
		expect(
			(await harness.runtime.load("session-1"))?.deliveryState
				?.pullRequestNumber,
		).toBeUndefined();
		harness.runtime.close();
	});

	it("retries local reconciliation before marking provider work complete", async () => {
		const harness = await createHarness();
		let failReconciliation = true;
		const runtime = new Proxy(harness.runtime, {
			get(target, property, receiver) {
				if (property !== "update")
					return Reflect.get(target, property, receiver);
				return async (...args: Parameters<typeof target.update>) => {
					if (failReconciliation) {
						failReconciliation = false;
						throw new Error("local reconciliation failed");
					}
					return target.update(...args);
				};
			},
		});
		const runner: SessionProcessRunner = {
			async run(command, args) {
				if (command === "gh" && args.includes("headRefOid,url")) {
					return {
						code: 0,
						stdout: JSON.stringify({
							headRefOid: "a".repeat(40),
							url: "https://github.test/o/r/pull/42",
						}),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
					return { code: 1, stdout: "", stderr: "connection lost after merge" };
				}
				return {
					code: 0,
					stdout: JSON.stringify({ state: "MERGED" }),
					stderr: "",
				};
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		});
		const command = envelope(
			"session-1",
			harness.created.revision ?? 0n,
			"mergePullRequest",
			{ pullRequestNumber: "42" },
		);
		await expect(orchestrator.execute(command)).rejects.toThrow(
			"local reconciliation failed",
		);
		await expect(orchestrator.execute(command)).resolves.toMatchObject({
			deliveryState: { lifecycleState: DeliveryLifecycleState.MERGED },
		});
		harness.runtime.close();
	});

	it("finishes close-on-merge when provider reconciliation observes MERGED", async () => {
		const harness = await createHarness();
		const closable = await harness.runtime.update(
			"session-1",
			harness.created.revision ?? 0n,
			(snapshot) => {
				if (snapshot.session) snapshot.session.closeOnMerge = true;
			},
		);
		const runner: SessionProcessRunner = {
			async run(command, args) {
				if (command === "gh" && args.includes("headRefOid,url")) {
					return {
						code: 0,
						stdout: JSON.stringify({
							headRefOid: "a".repeat(40),
							url: "https://github.test/o/r/pull/42",
						}),
						stderr: "",
					};
				}
				if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
					return {
						code: 1,
						stdout: "",
						stderr: "connection lost after merge",
					};
				}
				return {
					code: 0,
					stdout: JSON.stringify({ state: "MERGED" }),
					stderr: "",
				};
			},
		};
		const orchestrator = createSessionOrchestrator({
			runtime: harness.runtime,
			worktreesDir: join(harness.dataDir, "worktrees"),
			runner,
			authorize: () => true,
		});
		const merged = await orchestrator.execute(
			envelope("session-1", closable.revision ?? 0n, "mergePullRequest", {
				pullRequestNumber: "42",
			}),
		);
		expect(merged.deliveryState?.lifecycleState).toBe(
			DeliveryLifecycleState.MERGED,
		);
		expect(merged.session?.lifecycleState).toBe(SessionLifecycleState.STOPPED);
		harness.runtime.close();
	});
});
