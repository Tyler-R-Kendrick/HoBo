import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	PaneLifecycleState,
	SessionLifecycleState,
} from "../src/_generated/code_harness_pb.js";
import { type MuxRunner, tmuxRunner } from "../src/mux.js";
import { createResidentSessionRuntime } from "../src/resident-session-runtime.js";
import { sessionSnapshotJson } from "../src/session-contract.js";

const roots: string[] = [];
const tmuxServers: string[] = [];
const lockWorker = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures/session-lock-worker.mts",
);

function runLockWorker(
	dataDir: string,
	marker: string,
): Promise<number | null> {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			["--import", "tsx", lockWorker, dataDir, marker],
			{ stdio: "ignore" },
		);
		child.once("exit", resolve);
	});
}

afterEach(() => {
	for (const server of tmuxServers.splice(0)) {
		spawnSync("tmux", ["-L", server, "kill-server"]);
	}
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-code-resident-"));
	roots.push(root);
	return root;
}

function fakeTmux(): MuxRunner & { calls: string[][] } {
	const calls: string[][] = [];
	let pane = 0;
	let lastInputCommand = "";
	const sessions = new Set<string>();
	return {
		calls,
		async run(args) {
			calls.push([...args]);
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
			if (args[0] === "show-options") {
				return {
					code: lastInputCommand ? 0 : 1,
					stdout: lastInputCommand,
				};
			}
			if (args[0] === "send-keys" && args.includes("set-option")) {
				lastInputCommand = args.at(-1) ?? "";
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

function realTmux(server: string): MuxRunner {
	tmuxServers.push(server);
	return tmuxRunner(["-L", server]);
}

describe("resident session runtime", () => {
	it("keeps one tmux session durable across runtime restarts", async () => {
		const dataDir = tempRoot();
		const tmux = fakeTmux();
		const first = createResidentSessionRuntime({
			dataDir,
			tmux,
			now: () => "2026-08-10T20:00:00.000Z",
		});
		const created = await first.create({
			id: "task-1",
			name: "review",
			projectRoot: "/repo",
			worktreePath: "/repo/.worktrees/review",
			branch: "code/review",
			clientId: "cli-1",
		});
		expect(created.session?.lifecycleState).toBe(2);
		expect(created.tabs).toHaveLength(1);
		expect(created.panes[0]?.runtimeId).toBe("%1");
		first.close();

		const reopened = createResidentSessionRuntime({ dataDir, tmux });
		const restored = await reopened.load("task-1");
		expect(restored?.session?.branch).toBe("code/review");
		expect(restored?.panes[0]?.runtimeId).toBe("%1");
		expect(await reopened.list()).toHaveLength(1);
		reopened.close();
	});

	it("creates, focuses, controls, and closes real tmux-backed panes", async () => {
		const tmux = fakeTmux();
		const runtime = createResidentSessionRuntime({ dataDir: tempRoot(), tmux });
		const initial = await runtime.create({
			id: "task-2",
			name: "build",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/build",
			clientId: "cli-1",
		});
		const tab = await runtime.createTab("task-2", initial.revision, "tests");
		const split = await runtime.splitPane(
			"task-2",
			tab.revision,
			tab.focusedPaneId,
			"vertical",
			"agent",
			["codex"],
		);
		const focused = await runtime.focusPane(
			"task-2",
			split.revision,
			split.focusedPaneId,
		);
		await runtime.sendInput(
			"task-2",
			focused.revision,
			focused.focusedPaneId,
			"review",
		);
		const detached = await runtime.detach("task-2", focused.revision, "cli-1");
		expect(detached.attachedClientIds).toEqual([]);
		const attached = await runtime.reattach(
			"task-2",
			detached.revision,
			"web-1",
		);
		expect(attached.attachedClientIds).toEqual(["web-1"]);
		const closed = await runtime.closePane(
			"task-2",
			attached.revision,
			attached.focusedPaneId,
		);
		await runtime.stop("task-2", closed.revision);

		expect(tmux.calls.map((call) => call[0])).toEqual(
			expect.arrayContaining([
				"new-session",
				"new-window",
				"split-window",
				"select-pane",
				"send-keys",
				"kill-pane",
				"kill-session",
			]),
		);
		runtime.close();
	});

	it("deduplicates acknowledged pane input without inventing a state revision", async () => {
		const tmux = fakeTmux();
		const runtime = createResidentSessionRuntime({ dataDir: tempRoot(), tmux });
		const created = await runtime.create({
			id: "task-input",
			name: "input",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/input",
			clientId: "cli",
		});
		const first = await runtime.sendInput(
			"task-input",
			created.revision,
			created.focusedPaneId,
			"approve",
			"command-input-1",
		);
		const replayed = await runtime.sendInput(
			"task-input",
			created.revision,
			created.focusedPaneId,
			"approve",
			"command-input-1",
		);
		expect(first.revision).toBe(created.revision);
		expect(replayed.revision).toBe(created.revision);
		expect(tmux.calls.filter((call) => call[0] === "send-keys")).toHaveLength(
			1,
		);
		runtime.close();
	});

	it("adopts a metadata-bearing tmux session left before its first event", async () => {
		const metadata = Buffer.from(
			JSON.stringify({
				paneId: "orphan-pane",
				tabId: "orphan-tab",
				paneTitle: "shell",
				tabTitle: "main",
				workingDirectory: "/worktree",
			}),
		).toString("base64url");
		const calls: string[][] = [];
		const runtime = createResidentSessionRuntime({
			dataDir: tempRoot(),
			tmux: {
				async run(args) {
					calls.push([...args]);
					if (args[0] === "has-session") return { code: 0, stdout: "" };
					if (args[0] === "list-panes") {
						return {
							code: 0,
							stdout: `%7\t1\t1\tenv HOBO_PANE_META=${metadata} sh -c true\n`,
						};
					}
					return { code: 0, stdout: "" };
				},
			},
		});
		const adopted = await runtime.create({
			id: "task-orphan",
			name: "orphan",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/orphan",
			clientId: "cli",
		});
		expect(adopted.panes[0]?.id).toBe("orphan-pane");
		expect(adopted.panes[0]?.runtimeId).toBe("%7");
		expect(calls.some((call) => call[0] === "new-session")).toBe(false);
		runtime.close();
	});

	it("rejects stale writers before mutating tmux", async () => {
		const tmux = fakeTmux();
		const runtime = createResidentSessionRuntime({ dataDir: tempRoot(), tmux });
		await runtime.create({
			id: "task-3",
			name: "race",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/race",
			clientId: "cli-1",
		});
		const before = tmux.calls.length;
		await expect(runtime.createTab("task-3", 0n, "stale")).rejects.toThrow(
			"expected revision",
		);
		expect(tmux.calls).toHaveLength(before);
		runtime.close();
	});

	it("serializes concurrent writers before either can orphan a pane", async () => {
		const dataDir = tempRoot();
		const tmux = fakeTmux();
		const first = createResidentSessionRuntime({ dataDir, tmux });
		const created = await first.create({
			id: "task-lock",
			name: "lock",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/lock",
			clientId: "cli",
		});
		const second = createResidentSessionRuntime({ dataDir, tmux });
		const results = await Promise.allSettled([
			first.createTab("task-lock", created.revision, "one"),
			second.createTab("task-lock", created.revision, "two"),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(tmux.calls.filter((call) => call[0] === "new-window")).toHaveLength(
			1,
		);
		first.close();
		second.close();
	});

	it("publishes the lock owner atomically across processes", async () => {
		const dataDir = tempRoot();
		const marker = join(dataDir, "mutations.log");
		const first = createResidentSessionRuntime({ dataDir, tmux: fakeTmux() });
		await first.create({
			id: "task-process-lock",
			name: "lock",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/process-lock",
			clientId: "cli",
		});
		first.close();
		const statuses = await Promise.all([
			runLockWorker(dataDir, marker),
			runLockWorker(dataDir, marker),
		]);
		expect(statuses.sort()).toEqual([0, 2]);
		expect(readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(1);
	});

	it("replays an event written after the last SQLite snapshot", async () => {
		const dataDir = tempRoot();
		const tmux = fakeTmux();
		const runtime = createResidentSessionRuntime({ dataDir, tmux });
		const created = await runtime.create({
			id: "task-tail",
			name: "tail",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/tail",
			clientId: "cli",
		});
		runtime.close();
		created.revision = 2n;
		if (created.session) created.session.updatedAt = "2026-08-10T21:00:00Z";
		const store = createRuntimeLocalEventStore({ dataDir });
		await store.append(
			"code-session:task-tail",
			[
				{
					type: "code.SessionChanged",
					data: { snapshot: sessionSnapshotJson(created) },
				},
			],
			{
				expectedSeq: 1,
				actor: { kind: "system", id: "test" },
				tenant: "local",
			},
		);
		store.close();

		const reopened = createResidentSessionRuntime({
			dataDir,
			tmux,
		});
		expect((await reopened.load("task-tail"))?.revision).toBe(2n);
		reopened.close();
	});

	it("marks a vanished tmux session missing and permits recreation", async () => {
		const dataDir = tempRoot();
		const first = createResidentSessionRuntime({ dataDir, tmux: fakeTmux() });
		await first.create({
			id: "task-recover",
			name: "recover",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/recover",
			clientId: "cli",
		});
		first.close();
		const restarted = createResidentSessionRuntime({
			dataDir,
			tmux: {
				run: async () => ({
					code: 1,
					stdout: "",
					stderr: "can't find session: h-task-recover",
				}),
			},
		});
		const missing = await restarted.load("task-recover");
		expect(missing?.session?.lifecycleState).toBe(SessionLifecycleState.FAILED);
		expect(missing?.panes[0]?.lifecycleState).toBe(PaneLifecycleState.MISSING);
		restarted.close();

		const recovered = createResidentSessionRuntime({
			dataDir,
			tmux: fakeTmux(),
		});
		const recreated = await recovered.create({
			id: "task-recover",
			name: "recover",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/recover",
			clientId: "cli",
		});
		expect(recreated.session?.lifecycleState).toBe(
			SessionLifecycleState.RUNNING,
		);
		expect(recreated.revision).toBe(3n);
		recovered.close();
	});

	it("reconciles a tmux pane created before its event was appended", async () => {
		const dataDir = tempRoot();
		const first = createResidentSessionRuntime({ dataDir, tmux: fakeTmux() });
		await first.create({
			id: "task-drift",
			name: "drift",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/drift",
			clientId: "cli",
		});
		first.close();
		const metadata = Buffer.from(
			JSON.stringify({
				paneId: "pane-after-crash",
				tabId: "tab-after-crash",
				paneTitle: "review",
				tabTitle: "review",
				workingDirectory: "/worktree",
			}),
		).toString("base64url");
		const tmux: MuxRunner = {
			run: async (args) =>
				args[0] === "has-session"
					? { code: 0, stdout: "" }
					: {
							code: 0,
							stdout: `%99\t1\t1\tenv HOBO_PANE_META=${metadata} sh -c true\n`,
						},
		};
		const restarted = createResidentSessionRuntime({ dataDir, tmux });
		const reconciled = await restarted.load("task-drift");
		expect(
			reconciled?.panes.some((pane) => pane.id === "pane-after-crash"),
		).toBe(true);
		expect(reconciled?.focusedPaneId).toBe("pane-after-crash");
		expect(reconciled?.revision).toBe(2n);
		restarted.close();
	});

	it("ignores malformed tmux pane metadata instead of persisting it", async () => {
		const dataDir = tempRoot();
		const first = createResidentSessionRuntime({ dataDir, tmux: fakeTmux() });
		await first.create({
			id: "task-malformed",
			name: "malformed",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/malformed",
			clientId: "cli",
		});
		first.close();
		const restarted = createResidentSessionRuntime({
			dataDir,
			tmux: {
				run: async (args) =>
					args[0] === "has-session"
						? { code: 0, stdout: "" }
						: {
								code: 0,
								stdout: "%1\t1\t1\tenv HOBO_PANE_META=e30 sh -c true\n",
							},
			},
		});
		const restored = await restarted.load("task-malformed");
		expect(restored?.revision).toBe(1n);
		expect(restored?.panes[0]?.id).not.toBe("");
		restarted.close();
	});

	it("does not persist failure when tmux availability is unknown", async () => {
		const dataDir = tempRoot();
		const tmux = fakeTmux();
		const first = createResidentSessionRuntime({ dataDir, tmux });
		await first.create({
			id: "task-probe",
			name: "probe",
			projectRoot: "/repo",
			worktreePath: "/worktree",
			branch: "code/probe",
			clientId: "cli",
		});
		first.close();
		const unavailable = createResidentSessionRuntime({
			dataDir,
			tmux: {
				run: async () => ({
					code: 1,
					stdout: "",
					stderr: "Operation not permitted",
				}),
			},
		});
		await expect(unavailable.load("task-probe")).rejects.toThrow(
			"availability unknown",
		);
		unavailable.close();

		const healthy = createResidentSessionRuntime({ dataDir, tmux });
		const restored = await healthy.load("task-probe");
		expect(restored?.session?.lifecycleState).toBe(
			SessionLifecycleState.RUNNING,
		);
		expect(restored?.revision).toBe(1n);
		healthy.close();
	});

	it("keeps long session IDs unique in tmux", async () => {
		const tmux = fakeTmux();
		const runtime = createResidentSessionRuntime({ dataDir: tempRoot(), tmux });
		for (const id of [
			"same-very-long-session-name-one",
			"same-very-long-session-name-two",
		]) {
			await runtime.create({
				id,
				name: id,
				projectRoot: "/repo",
				worktreePath: "/worktree",
				branch: `code/${id}`,
				clientId: "cli",
			});
		}
		const names = tmux.calls
			.filter((call) => call[0] === "new-session")
			.map((call) => call[call.indexOf("-s") + 1]);
		expect(new Set(names).size).toBe(2);
		runtime.close();
	});

	it("drives a real detachable tmux server", async ({ skip }) => {
		if (
			process.platform === "win32" ||
			spawnSync("tmux", ["-V"]).status !== 0
		) {
			skip();
			return;
		}
		const dataDir = tempRoot();
		const tmux = realTmux(`hobo-code-test-${process.pid}`);
		const probe = await tmux.run([
			"new-session",
			"-d",
			"-P",
			"-F",
			"#{pane_id}",
			"-s",
			"probe",
			"sleep 30",
		]);
		if (probe.code !== 0) {
			skip();
			return;
		}
		await tmux.run(["kill-session", "-t", "probe"]);
		const runtime = createResidentSessionRuntime({
			dataDir,
			tmux,
			shell: ["sh"],
		});
		const created = await runtime.create({
			id: "real",
			name: "real",
			projectRoot: dataDir,
			worktreePath: dataDir,
			branch: "code/real",
			clientId: "test",
		});
		const tabbed = await runtime.createTab("real", created.revision, "review", [
			"sh",
		]);
		const split = await runtime.splitPane(
			"real",
			tabbed.revision,
			tabbed.focusedPaneId,
			"horizontal",
			"agent",
			["sh"],
		);
		const panes = await tmux.run(["list-panes", "-a", "-F", "#{pane_id}"]);
		expect(panes.stdout.trim().split("\n")).toHaveLength(3);
		await runtime.sendInput(
			"real",
			split.revision,
			split.focusedPaneId,
			"dedupe-token",
			"real-input-1",
		);
		await runtime.sendInput(
			"real",
			split.revision,
			split.focusedPaneId,
			"dedupe-token",
			"real-input-1",
		);
		const captured = await tmux.run([
			"capture-pane",
			"-p",
			"-t",
			split.panes.find((pane) => pane.id === split.focusedPaneId)?.runtimeId ??
				"",
		]);
		expect(captured.stdout.match(/dedupe-token/gu)).toHaveLength(1);
		runtime.close();

		const reopened = createResidentSessionRuntime({ dataDir, tmux });
		const restored = await reopened.load("real");
		expect(restored?.revision).toBe(split.revision);
		await reopened.stop("real", split.revision);
		reopened.close();
	});
});
