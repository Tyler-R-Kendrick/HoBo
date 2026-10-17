import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { JsonValue } from "../lib/inspectable.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tag = Object.prototype.toString;

function isRecord(
	value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
	return tag.call(value) === "[object Object]";
}

function isText(value: JsonValue | undefined): value is string {
	return tag.call(value) === "[object String]";
}

/** The command of the first SessionStart hook in `.claude/settings.json`. */
function sessionStartCommand(): string {
	const settings: JsonValue = JSON.parse(
		readFileSync(join(root, ".claude/settings.json"), "utf8"),
	);
	const hooks = isRecord(settings) ? settings.hooks : undefined;
	const groups = isRecord(hooks) ? hooks.SessionStart : undefined;
	const group = Array.isArray(groups) ? groups[0] : undefined;
	const entries = isRecord(group) ? group.hooks : undefined;
	const entry = Array.isArray(entries) ? entries[0] : undefined;
	const command = isRecord(entry) ? entry.command : undefined;
	if (!isText(command)) {
		assert.fail(".claude/settings.json has no SessionStart hook command");
	}
	return command;
}

const scratch: string[] = [];
after(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-session-hooks-"));
	scratch.push(dir);
	return dir;
}

// Only the fixture repository's own config counts: no global or system file,
// no CI marker and no opt-out inherited from whoever runs the suite.
const isolated = tempDir();
const globalConfig = join(isolated, "gitconfig");
writeFileSync(globalConfig, "");
const env = Object.fromEntries(
	Object.entries(process.env).filter(
		([name]) => name !== "CI" && name !== "HOBO_SKIP_HOOKS",
	),
);
Object.assign(env, {
	GIT_CONFIG_GLOBAL: globalConfig,
	GIT_CONFIG_NOSYSTEM: "1",
});

function git(cwd: string, args: string[]) {
	return spawnSync("git", args, { cwd, encoding: "utf8", env });
}

/** A repository (no commits) whose tree carries a `.githooks` directory. */
function repoWithHooks(): string {
	const dir = tempDir();
	assert.equal(git(dir, ["init", "--quiet"]).status, 0);
	mkdirSync(join(dir, ".githooks"));
	return dir;
}

function hooksPath(repo: string): string {
	return git(repo, [
		"config",
		"--file",
		".git/config",
		"--get",
		"core.hooksPath",
	]).stdout.trim();
}

function runHook(projectDir: string, extra: Record<string, string> = {}) {
	return spawnSync("sh", ["-c", sessionStartCommand()], {
		cwd: tempDir(),
		encoding: "utf8",
		env: { ...env, ...extra, CLAUDE_PROJECT_DIR: projectDir },
	});
}

// Commits in agent sessions met no hook: `core.hooksPath` is set only by the
// root `prepare` script, which an install without lifecycle scripts (or a
// worktree sharing another checkout's node_modules) never runs. The session
// hook closes that, and must never get in a session's way doing it.
describe("the SessionStart hook that installs the git hooks", () => {
	it("points an unset core.hooksPath at .githooks, silently", () => {
		const repo = repoWithHooks();
		const result = runHook(repo);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout + result.stderr, "");
		assert.equal(hooksPath(repo), ".githooks");
	});

	it("is idempotent", () => {
		const repo = repoWithHooks();
		runHook(repo);
		const again = runHook(repo);
		assert.equal(again.status, 0, again.stderr);
		assert.equal(hooksPath(repo), ".githooks");
	});

	it("writes the shared config from a worktree", () => {
		const repo = repoWithHooks();
		const worktree = join(tempDir(), "wt");
		const added = git(repo, [
			"worktree",
			"add",
			"--quiet",
			"--orphan",
			"-b",
			"side",
			worktree,
		]);
		assert.equal(added.status, 0, added.stderr);
		mkdirSync(join(worktree, ".githooks"));
		assert.equal(runHook(worktree).status, 0);
		assert.equal(hooksPath(repo), ".githooks");
	});

	it("never replaces a hooks path someone already chose", () => {
		const repo = repoWithHooks();
		git(repo, ["config", "core.hooksPath", "my-hooks"]);
		assert.equal(runHook(repo).status, 0);
		assert.equal(hooksPath(repo), "my-hooks");
	});

	it("honours the opt-outs scripts/install-hooks.mts honours", () => {
		for (const optOut of [{ HOBO_SKIP_HOOKS: "1" }, { CI: "true" }]) {
			const repo = repoWithHooks();
			assert.equal(runHook(repo, optOut).status, 0);
			assert.equal(hooksPath(repo), "");
		}
	});

	it("succeeds silently outside a repository", () => {
		const dir = tempDir();
		mkdirSync(join(dir, ".githooks"));
		const result = runHook(dir);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout + result.stderr, "");
	});
});
