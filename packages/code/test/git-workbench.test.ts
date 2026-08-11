import { describe, expect, it } from "vitest";

import {
	readGitWorkbenchSnapshot,
	runGitWorkbenchAction,
} from "../src/git-workbench.js";
import type { SessionProcessRunner } from "../src/session-orchestrator.js";

describe("Git workbench", () => {
	it("reads branch divergence and changed-file state from porcelain output", async () => {
		const calls: Array<{
			command: string;
			args: readonly string[];
			cwd: string;
		}> = [];
		const runner: SessionProcessRunner = {
			async run(command, args, cwd) {
				calls.push({ command, args, cwd });
				if (args[0] === "status") {
					return {
						code: 0,
						stdout: [
							"# branch.head feature/workbench",
							"# branch.upstream origin/feature/workbench",
							"# branch.ab +2 -1",
							"1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb staged.txt",
							"1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa notes with spaces.md",
							"? new.txt",
							"",
						].join("\0"),
						stderr: "",
					};
				}
				return { code: 0, stdout: "", stderr: "" };
			},
		};

		const snapshot = await readGitWorkbenchSnapshot("/repo", runner);

		expect(snapshot).toMatchObject({
			branch: "feature/workbench",
			upstream: "origin/feature/workbench",
			ahead: 2,
			behind: 1,
			files: [
				{
					path: "staged.txt",
					staged: true,
					unstaged: false,
					untracked: false,
				},
				{
					path: "notes with spaces.md",
					staged: false,
					unstaged: true,
					untracked: false,
				},
				{
					path: "new.txt",
					staged: false,
					unstaged: false,
					untracked: true,
				},
			],
		});
		expect(calls[0]).toEqual({
			command: "git",
			args: [
				"status",
				"--porcelain=v2",
				"--branch",
				"-z",
				"--untracked-files=all",
			],
			cwd: "/repo",
		});
		expect(
			calls.every(
				({ command, args }) => command === "git" && Array.isArray(args),
			),
		).toBe(true);
	});

	it("reads bounded local branches, commit graph rows, and stashes", async () => {
		const calls: readonly string[][] = [];
		const mutableCalls = calls as string[][];
		const runner: SessionProcessRunner = {
			async run(_command, args) {
				mutableCalls.push([...args]);
				if (args[0] === "status") {
					return {
						code: 0,
						stdout: "# branch.head main\0# branch.ab +0 -0\0",
						stderr: "",
					};
				}
				if (args[0] === "for-each-ref") {
					return {
						code: 0,
						stdout: [
							"main\0abc123\0origin/main\0*\0Base commit",
							"feature\0def456\0\0 \0Feature work",
						].join("\n"),
						stderr: "",
					};
				}
				if (args[0] === "log") {
					return {
						code: 0,
						stdout: `* \u001e${[
							"abcdef",
							"abc123",
							"parent-a parent-b",
							"HEAD -> main",
							"Ship workbench",
							"Ada",
							"2026-08-11T10:00:00Z",
						].join("\0")}`,
						stderr: "",
					};
				}
				return {
					code: 0,
					stdout: [
						"stash@{0}",
						"fedcba",
						"WIP on main: abc123 workbench",
						"2026-08-11T09:00:00Z",
					].join("\0"),
					stderr: "",
				};
			},
		};

		const snapshot = await readGitWorkbenchSnapshot("/repo", runner);

		expect(snapshot.branches).toEqual([
			{
				name: "main",
				oid: "abc123",
				upstream: "origin/main",
				current: true,
				subject: "Base commit",
			},
			{
				name: "feature",
				oid: "def456",
				upstream: undefined,
				current: false,
				subject: "Feature work",
			},
		]);
		expect(snapshot.commits).toEqual([
			{
				oid: "abcdef",
				shortOid: "abc123",
				parents: ["parent-a", "parent-b"],
				decorations: "HEAD -> main",
				subject: "Ship workbench",
				author: "Ada",
				authoredAt: "2026-08-11T10:00:00Z",
				graph: "* ",
			},
		]);
		expect(snapshot.stashes).toEqual([
			{
				ref: "stash@{0}",
				oid: "fedcba",
				subject: "WIP on main: abc123 workbench",
				authoredAt: "2026-08-11T09:00:00Z",
			},
		]);
		expect(mutableCalls).toContainEqual([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(HEAD)%00%(subject)",
			"refs/heads/",
		]);
		expect(mutableCalls).toContainEqual([
			"log",
			"--max-count=101",
			"--date-order",
			"--decorate=short",
			"--graph",
			"--format=%x1e%H%x00%h%x00%P%x00%D%x00%s%x00%an%x00%aI",
		]);
		expect(mutableCalls).toContainEqual([
			"stash",
			"list",
			"--max-count=21",
			"--format=%gd%x00%H%x00%gs%x00%aI",
		]);
	});

	it("reads a changed tracked file diff with a path-safe argv command", async () => {
		const calls: string[][] = [];
		const runner: SessionProcessRunner = {
			async run(_command, args) {
				calls.push([...args]);
				if (args[0] === "status") {
					return {
						code: 0,
						stdout: [
							"# branch.head main",
							"1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa docs/name; echo unsafe.md",
							"",
						].join("\0"),
						stderr: "",
					};
				}
				if (args[0] === "diff") {
					return { code: 0, stdout: "@@ -1 +1 @@\n-old\n+new\n", stderr: "" };
				}
				return { code: 0, stdout: "", stderr: "" };
			},
		};

		const snapshot = await readGitWorkbenchSnapshot(
			"/repo",
			runner,
			"docs/name; echo unsafe.md",
		);

		expect(snapshot.selectedDiff).toEqual({
			path: "docs/name; echo unsafe.md",
			text: "@@ -1 +1 @@\n-old\n+new\n",
			truncated: false,
		});
		expect(calls).toContainEqual([
			"diff",
			"--no-ext-diff",
			"--no-color",
			"--unified=3",
			"HEAD",
			"--",
			"docs/name; echo unsafe.md",
		]);
	});

	it("rejects a selected path that is not reported as changed", async () => {
		const calls: string[][] = [];
		const runner: SessionProcessRunner = {
			async run(_command, args) {
				calls.push([...args]);
				return {
					code: 0,
					stdout: ["# branch.head main", "? changed.txt", ""].join("\0"),
					stderr: "",
				};
			},
		};

		await expect(
			readGitWorkbenchSnapshot("/repo", runner, "unchanged.txt"),
		).rejects.toThrow("selected path is not changed: unchanged.txt");
		expect(calls).toHaveLength(1);
	});

	it("bounds collection rows and an untracked-file diff", async () => {
		const calls: string[][] = [];
		const runner: SessionProcessRunner = {
			async run(_command, args) {
				calls.push([...args]);
				if (args[0] === "status") {
					return {
						code: 0,
						stdout: [
							"# branch.head main",
							...Array.from(
								{ length: 201 },
								(_, index) => `? file-${index}.txt`,
							),
							"",
						].join("\0"),
						stderr: "",
					};
				}
				if (args[0] === "for-each-ref") {
					return {
						code: 0,
						stdout: Array.from({ length: 51 }, (_, index) =>
							index === 50
								? "main\0current\0origin/main\0*\0current subject"
								: `branch-${index}\0${index}\0\0 \0subject`,
						).join("\n"),
						stderr: "",
					};
				}
				if (args[0] === "log") {
					return {
						code: 0,
						stdout: Array.from(
							{ length: 101 },
							(_, index) =>
								`* \u001e${[`oid-${index}`, `${index}`, "", "", "subject", "Ada", "now"].join("\0")}`,
						).join("\n"),
						stderr: "",
					};
				}
				if (args[0] === "stash") {
					return {
						code: 0,
						stdout: Array.from({ length: 21 }, (_, index) =>
							[`stash@{${index}}`, `${index}`, "subject", "now"].join("\0"),
						).join("\n"),
						stderr: "",
					};
				}
				return {
					code: 1,
					stdout: "x".repeat(128 * 1_024 + 1),
					stderr: "",
				};
			},
		};

		const snapshot = await readGitWorkbenchSnapshot(
			"/repo",
			runner,
			"file-0.txt",
		);

		expect(snapshot.files).toHaveLength(200);
		expect(snapshot.branches).toHaveLength(50);
		expect(snapshot.branches.at(-1)).toMatchObject({
			name: "main",
			current: true,
		});
		expect(snapshot.commits).toHaveLength(100);
		expect(snapshot.stashes).toHaveLength(20);
		expect(snapshot.truncated).toEqual({
			files: true,
			branches: true,
			commits: true,
			stashes: true,
		});
		expect(Buffer.byteLength(snapshot.selectedDiff?.text ?? "")).toBe(
			128 * 1_024,
		);
		expect(snapshot.selectedDiff?.truncated).toBe(true);
		expect(calls).toContainEqual([
			"diff",
			"--no-index",
			"--no-ext-diff",
			"--no-color",
			"--unified=3",
			"--",
			"/dev/null",
			"file-0.txt",
		]);
	});

	it("runs validated local Git actions with argv-safe selections", async () => {
		const calls: string[][] = [];
		const runner: SessionProcessRunner = {
			async run(_command, args) {
				calls.push([...args]);
				if (args[0] === "status")
					return {
						code: 0,
						stdout: [
							"# branch.head main",
							"1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa tracked; safe.txt",
							"? untracked; safe.txt",
							"",
						].join("\0"),
						stderr: "",
					};
				if (args[0] === "for-each-ref")
					return {
						code: 0,
						stdout: [
							"main\0aaa\0origin/main\0*\0main",
							"topic; safe\0bbb\0\0 \0topic",
						].join("\n"),
						stderr: "",
					};
				if (args[0] === "log")
					return args[1] === "-1"
						? { code: 0, stdout: "branch preview", stderr: "" }
						: {
								code: 0,
								stdout: `* \u001e${["commit-oid", "abc123", "", "", "subject", "Ada", "now"].join("\0")}`,
								stderr: "",
							};
				if (args[0] === "stash" && args[1] === "list")
					return {
						code: 0,
						stdout: ["stash@{0}", "stash-oid", "subject", "now"].join("\0"),
						stderr: "",
					};
				if (
					args[0] === "diff" ||
					(args[0] === "stash" && args[1] === "show") ||
					args[0] === "show"
				)
					return { code: 0, stdout: "preview", stderr: "" };
				return { code: 0, stdout: "", stderr: "" };
			},
		};

		await runGitWorkbenchAction("/repo", runner, {
			action: "file-discard",
			selection: { kind: "file", value: "tracked; safe.txt" },
		});
		expect(calls.at(-1)).toEqual([
			"restore",
			"--source=HEAD",
			"--staged",
			"--worktree",
			"--",
			"tracked; safe.txt",
		]);

		await runGitWorkbenchAction("/repo", runner, {
			action: "branch-delete",
			selection: { kind: "branch", value: "topic; safe" },
		});
		expect(calls.at(-1)).toEqual(["branch", "-d", "--", "topic; safe"]);

		await runGitWorkbenchAction("/repo", runner, {
			action: "stash-pop",
			selection: { kind: "stash", value: "stash@{0}" },
		});
		expect(calls.at(-1)).toEqual(["stash", "pop", "stash@{0}"]);

		await runGitWorkbenchAction("/repo", runner, {
			action: "commit-revert",
			selection: { kind: "commit", value: "commit-oid" },
		});
		expect(calls.at(-1)).toEqual(["revert", "--no-edit", "commit-oid"]);
	});

	it("previews only a branch visible in the bounded workbench", async () => {
		const calls: string[][] = [];
		const runner: SessionProcessRunner = {
			async run(_command, args) {
				calls.push([...args]);
				if (args[0] === "status")
					return {
						code: 0,
						stdout: "# branch.head main\0",
						stderr: "",
					};
				if (args[0] === "for-each-ref")
					return {
						code: 0,
						stdout: "main\0abc123\0origin/main\0*\0Base",
						stderr: "",
					};
				if (args[0] === "log" && args.includes("--graph"))
					return {
						code: 0,
						stdout: "* \u001eabcdef\0abc123\0\0\0Base\0Ada\u0416-01-01",
						stderr: "",
					};
				if (args[0] === "log")
					return {
						code: 0,
						stdout: "commit abc123\n 1 file changed",
						stderr: "",
					};
				return { code: 0, stdout: "", stderr: "" };
			},
		};

		const snapshot = await readGitWorkbenchSnapshot("/repo", runner, {
			kind: "branch",
			value: "main",
		});

		expect(snapshot.selectedDiff).toMatchObject({
			path: "branch:main",
			text: "commit abc123\n 1 file changed",
		});
		expect(calls).toContainEqual([
			"log",
			"-1",
			"--stat",
			"--decorate=short",
			"refs/heads/main",
		]);
		await expect(
			readGitWorkbenchSnapshot("/repo", runner, {
				kind: "branch",
				value: "not-visible",
			}),
		).rejects.toThrow("selected branch is not visible");
	});
});
