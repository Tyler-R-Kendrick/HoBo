/**
 * Workspace resolution and per-agent trees.
 *
 * Panes used to open in `process.cwd()` — wherever the shell happened to be —
 * and the "rift backend" created an empty directory holding a JSON marker, so
 * an agent opening it found nothing at all. These pin the replacements.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	allocateAgentWorkspaces,
	findGitRoot,
} from "../src/agent-workspaces.js";
import { parseCreatedPath, probeRift, type RiftRunner } from "../src/rift.js";
import { findWorkspaceRoot } from "../src/workspace.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
/** A PATH containing a stand-in `rift`, so capability probing is exercised. */
function fakeRiftBin(): string {
	const bin = tmp();
	writeFileSync(join(bin, "rift"), "#!/bin/sh\nexit 0\n");
	return bin;
}

function tmp(): string {
	const d = mkdtempSync(join(tmpdir(), "ws-test-"));
	dirs.push(d);
	return d;
}

describe("workspace root", () => {
	it("prefers an active devenv shell", () => {
		const root = tmp();
		expect(
			findWorkspaceRoot("/anywhere", { DEVENV_ROOT: root }, () => true).source,
		).toBe("DEVENV_ROOT");
	});

	it("finds the nearest ancestor declaring devenv", () => {
		const root = tmp();
		const nested = join(root, "a", "b");
		mkdirSync(nested, { recursive: true });
		writeFileSync(join(root, "devenv.nix"), "{}");
		const found = findWorkspaceRoot(nested, {});
		expect(found.path).toBe(root);
		expect(found.source).toBe("devenv-config");
	});

	it("falls back to the git root, then cwd", () => {
		// Injected existence: /tmp/.git exists on some machines, which would
		// otherwise make "no repo anywhere" untestable.
		const onlyRepo = (p: string) => p === "/repo/.git";
		expect(findWorkspaceRoot("/repo/pkg", {}, onlyRepo)).toEqual({
			path: "/repo",
			source: "git-root",
		});
		expect(findWorkspaceRoot("/bare/dir", {}, () => false)).toEqual({
			path: "/bare/dir",
			source: "cwd",
		});
	});
});

describe("rift capability", () => {
	it("reads the created workspace path from stdout", () => {
		expect(parseCreatedPath("noise\n/tmp/rifts/parser-fix\n")).toBe(
			"/tmp/rifts/parser-fix",
		);
		expect(parseCreatedPath("no path here")).toBeNull();
	});

	it("refuses to claim rift when the platform ships no binary", async () => {
		// The npm package installs happily without a binary for your platform;
		// presence on PATH is not capability.
		const runner: RiftRunner = {
			run: async () => ({
				code: 1,
				stdout: "",
				stderr: "Unable to locate the Rift binary for linux-arm64.",
			}),
		};
		const cap = await probeRift("/ws", runner, { PATH: fakeRiftBin() });
		expect(cap.usable).toBe(false);
		expect(cap.reason).toMatch(/no binary for this platform/);
	});

	it("reports plainly when rift is not installed", async () => {
		const cap = await probeRift(
			"/ws",
			{ run: async () => ({ code: 0, stdout: "", stderr: "" }) },
			{ PATH: "" },
		);
		expect(cap.usable).toBe(false);
		expect(cap.reason).toMatch(/not installed/);
	});
});

describe("per-agent workspaces", () => {
	it("uses rift when it works, one tree per agent", async () => {
		const created: string[] = [];
		const runner: RiftRunner = {
			run: async (args) => {
				if (args[0] === "list") return { code: 0, stdout: "", stderr: "" };
				if (args[0] === "init") return { code: 0, stdout: "", stderr: "" };
				const name = args[args.indexOf("--name") + 1]!;
				created.push(name);
				return { code: 0, stdout: `/rifts/${name}\n`, stderr: "" };
			},
		};
		const result = await allocateAgentWorkspaces({
			workspaceRoot: "/ws",
			agentIds: ["claude", "codex"],
			fallbackRoot: "/fallback",
			runner,
			env: { PATH: fakeRiftBin() },
			git: async () => ({ code: 0, stderr: "" }),
		});
		expect(result.backend).toBe("rift");
		expect(created).toEqual(["claude", "codex"]);
		expect(result.workspaces.map((w) => w.path)).toEqual([
			"/rifts/claude",
			"/rifts/codex",
		]);
	});

	it("falls back to git worktrees and says why", async () => {
		const repo = tmp();
		mkdirSync(join(repo, ".git"), { recursive: true });
		const pkg = join(repo, "packages", "code");
		mkdirSync(pkg, { recursive: true });
		const fallback = join(tmp(), "workspaces");
		const cuts: string[] = [];
		const result = await allocateAgentWorkspaces({
			// The devenv workspace is a package inside the repo — the worktree
			// must still be cut from the enclosing git root.
			workspaceRoot: pkg,
			agentIds: ["claude"],
			fallbackRoot: fallback,
			runner: { run: async () => ({ code: 0, stdout: "", stderr: "" }) },
			env: { PATH: "" },
			git: async (args, cwd) => {
				cuts.push(cwd);
				mkdirSync(args[args.length - 2]!, { recursive: true });
				return { code: 0, stderr: "" };
			},
		});
		expect(result.backend).toBe("git-worktree");
		expect(cuts).toEqual([repo]);
		expect(result.reason).toMatch(/not installed/);
		expect(result.workspaces[0]!.path).toBe(join(fallback, "claude"));
	});

	it("shares the workspace only when asked", async () => {
		const result = await allocateAgentWorkspaces({
			workspaceRoot: "/ws",
			agentIds: ["a", "b"],
			fallbackRoot: "/fallback",
			shared: true,
		});
		expect(result.backend).toBe("shared");
		expect(result.workspaces.every((w) => w.path === "/ws")).toBe(true);
	});

	it("findGitRoot walks up to the enclosing repository", () => {
		const repo = tmp();
		mkdirSync(join(repo, ".git"), { recursive: true });
		const deep = join(repo, "a", "b", "c");
		mkdirSync(deep, { recursive: true });
		expect(findGitRoot(deep)).toBe(repo);
		expect(findGitRoot("/nowhere/at/all", () => false)).toBeNull();
	});
});
