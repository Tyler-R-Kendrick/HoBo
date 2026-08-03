/**
 * Promotion safety.
 *
 * The original promote wrote an audit file, deleted the sandbox worktree and
 * force-deleted its branch, applied nothing, and reported "N file(s) applied".
 * The first fix then introduced a half-apply that left conflict markers in the
 * user's tree while reporting failure, and a gate runner whose timeout never
 * fired. Each of those failures gets a test here, because every one of them
 * was found by review rather than by the suite.
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createIsolationContext } from "../src/isolation.js";
import { runProjectGates } from "../src/promotion-gates.js";
import { applySandboxDiff } from "../src/sandbox-promote.js";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(d);
	return d;
}

function gitRepo(): string {
	const dir = tmp("promo-safety-");
	spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
	spawnSync("git", ["config", "user.email", "t@e.com"], { cwd: dir });
	spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
	writeFileSync(join(dir, "clean.txt"), "ORIGINAL\n");
	writeFileSync(join(dir, "conflict.txt"), "a\nb\nc\n");
	spawnSync("git", ["add", "-A"], { cwd: dir });
	spawnSync("git", ["commit", "-qm", "base"], { cwd: dir });
	return dir;
}

describe("applySandboxDiff", () => {
	it("carries edits, additions and deletions into the project", async () => {
		const project = gitRepo();
		const home = tmp("promo-home-");
		const ctx = await createIsolationContext({
			projectRoot: project,
			hoboHome: home,
			runId: "carry",
			forceWorktree: true,
		});
		writeFileSync(join(ctx.rootPath, "clean.txt"), "EDITED\n");
		writeFileSync(join(ctx.rootPath, "added.ts"), "export const a = 1;\n");
		rmSync(join(ctx.rootPath, "conflict.txt"));

		const r = await applySandboxDiff(ctx.rootPath, project);
		expect(r.ok).toBe(true);
		expect(r.dirtied).toBe(false);
		expect(readFileSync(join(project, "clean.txt"), "utf8")).toBe("EDITED\n");
		expect(existsSync(join(project, "added.ts"))).toBe(true);
		expect(existsSync(join(project, "conflict.txt"))).toBe(false);
	});

	it("refuses when the patch collides with uncommitted local work, touching nothing", async () => {
		const project = gitRepo();
		const home = tmp("promo-home-");
		const ctx = await createIsolationContext({
			projectRoot: project,
			hoboHome: home,
			runId: "collide",
			forceWorktree: true,
		});
		writeFileSync(join(ctx.rootPath, "clean.txt"), "SANDBOX\n");
		writeFileSync(join(ctx.rootPath, "conflict.txt"), "a\nSANDBOX\nc\n");
		// The user is mid-edit on one of the same files.
		writeFileSync(join(project, "conflict.txt"), "a\nUSER-LOCAL\nc\n");

		const r = await applySandboxDiff(ctx.rootPath, project);
		expect(r.ok).toBe(false);
		// Critically: the project must be untouched, not half-applied.
		expect(r.dirtied).toBe(false);
		expect(r.detail).toMatch(/uncommitted local changes/);
		expect(r.detail).toMatch(/conflict\.txt/);
		expect(readFileSync(join(project, "clean.txt"), "utf8")).toBe("ORIGINAL\n");
		expect(readFileSync(join(project, "conflict.txt"), "utf8")).toContain(
			"USER-LOCAL",
		);
		expect(readFileSync(join(project, "conflict.txt"), "utf8")).not.toContain(
			"<<<<<<<",
		);
	});

	it("fails closed when the sandbox has nothing to promote", async () => {
		const project = gitRepo();
		const home = tmp("promo-home-");
		const ctx = await createIsolationContext({
			projectRoot: project,
			hoboHome: home,
			runId: "empty",
			forceWorktree: true,
		});
		const r = await applySandboxDiff(ctx.rootPath, project);
		expect(r.ok).toBe(false);
		expect(r.dirtied).toBe(false);
		expect(r.detail).toMatch(/no changes/);
		// The sandbox survives a refusal — promotion never destroys unapplied work.
		expect(existsSync(ctx.rootPath)).toBe(true);
	});

	it("fails closed when the sandbox is not a git worktree", async () => {
		const project = gitRepo();
		const notAWorktree = tmp("promo-nonrepo-");
		const r = await applySandboxDiff(notAWorktree, project);
		expect(r.ok).toBe(false);
		expect(r.dirtied).toBe(false);
	});
});

describe("runProjectGates", () => {
	it("fails closed when the project cannot be verified", async () => {
		const bare = tmp("promo-bare-");
		const gates = await runProjectGates(bare, { timeoutMs: 5000 });
		expect(gates).toHaveLength(4);
		expect(gates.every((g) => !g.pass)).toBe(true);
		expect(gates[0]!.detail).toMatch(/no package\.json/);
	});

	it("releases stdio so a gate that leaves a daemon cannot hang the exit", async () => {
		const project = tmp("promo-daemon-");
		writeFileSync(
			join(project, "package.json"),
			JSON.stringify({
				name: "daemon-demo",
				version: "1.0.0",
				scripts: {
					// Exits 0 immediately but leaves a child holding the inherited
					// pipes. Resolving without destroying them left the handles
					// ref'd, so the CLI printed its result and then hung.
					"architecture:guard": "sleep 20 & exit 0",
					"standards:check": "exit 0",
					"check:relevant": "exit 0",
					"docs:freshness": "exit 0",
				},
			}),
		);
		const started = Date.now();
		const gates = await runProjectGates(project, { timeoutMs: 15_000 });
		// Settles on the script's own exit, nowhere near the 15s timeout and
		// nowhere near the 20s daemon.
		expect(Date.now() - started).toBeLessThan(12_000);
		expect(gates.every((g) => g.pass)).toBe(true);
	}, 30_000);

	it("settles (and says so) when a gate spawns a grandchild and stalls", async () => {
		const project = tmp("promo-hang-");
		writeFileSync(
			join(project, "package.json"),
			JSON.stringify({
				name: "hang-demo",
				version: "1.0.0",
				scripts: {
					// A backgrounded child inherits the stdio pipes, so `close`
					// never fires — this used to hang the promote path forever.
					"architecture:guard": "sleep 60 & sleep 60",
					"standards:check": "exit 0",
					"check:relevant": "exit 0",
					"docs:freshness": "exit 0",
				},
			}),
		);
		const started = Date.now();
		const gates = await runProjectGates(project, { timeoutMs: 2000 });
		const elapsed = Date.now() - started;
		expect(elapsed).toBeLessThan(30_000);
		const guard = gates.find((g) => g.name === "architecture:guard")!;
		expect(guard.pass).toBe(false);
		// A timeout must not masquerade as a spawn failure.
		expect(guard.detail).toMatch(/timed out/);
	}, 45_000);
});
