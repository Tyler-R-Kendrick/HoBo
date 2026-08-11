import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	AgentLifecycleState,
	DeliveryLifecycleState,
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
		runtime.close();
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
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			async run(command, args, cwd) {
				calls.push({ command, args });
				if (command === "gh" && args[0] === "pr") {
					return {
						code: 0,
						stdout: "https://github.test/o/r/pull/42\n",
						stderr: "",
					};
				}
				if (command === "gh") return { code: 0, stdout: "", stderr: "" };
				return base.run(command, args, cwd);
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
				call.args.join(" ").includes("stack merge 42 --yes --squash"),
			),
		).toBe(true);
		expect(
			calls.filter((call) =>
				call.args.join(" ").includes("stack merge 42 --yes --squash"),
			),
		).toHaveLength(1);
		expect(approvals.at(-1)).toMatchObject({
			operation: "merge-pull-request",
			commandId: mergeCommand.commandId,
			details: { pullRequestNumber: "42" },
		});
		harness.runtime.close();
	});

	it("scopes delivery replay to the full command envelope and session", async () => {
		const harness = await createHarness();
		let merges = 0;
		const runner: SessionProcessRunner = {
			async run(command, args, cwd) {
				if (command === "gh" && args[0] === "stack") {
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

	it("retries a confirmed pre-effect delivery failure with the same command ID", async () => {
		const harness = await createHarness();
		const cwd = harness.created.session?.worktreePath ?? "";
		writeFileSync(join(cwd, "retry.txt"), "retry\n");
		let failCommit = true;
		const base = sessionProcessRunner();
		const runner: SessionProcessRunner = {
			run(command, args, workdir, env) {
				if (command === "git" && args[0] === "commit" && failCommit) {
					failCommit = false;
					return Promise.resolve({
						code: 1,
						stdout: "",
						stderr: "hook rejected before commit",
					});
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
				message: "retry safely",
			}),
			commandId: "retry-command",
		};
		await expect(orchestrator.execute(command)).rejects.toThrow(
			"hook rejected before commit",
		);
		await expect(orchestrator.execute(command)).resolves.toMatchObject({
			gitState: { dirty: false },
		});
		expect(git(cwd, ["log", "-1", "--pretty=%s"])).toBe("retry safely");
		harness.runtime.close();
	});
});
