/**
 * The git primitives the pin code is built on: running git as an argument
 * vector, reading the index's gitlink, the submodule's HEAD and state, and
 * `.gitmodules`. Nothing here moves a submodule or touches the network.
 *
 * Erasable TypeScript with node builtins only.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { PinsError } from "./pins.ts";

export interface GitResult {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

export function git(
	cwd: string,
	args: readonly string[],
	visible = false,
): GitResult {
	const result = spawnSync("git", [...args], {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: visible ? ["ignore", "inherit", "inherit"] : "pipe",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
	});
	if (result.error !== undefined) {
		throw new PinsError(
			"GIT_FAILED",
			`cannot run git: ${result.error.message}`,
		);
	}
	return {
		status: result.status ?? 1,
		stdout: (result.stdout ?? "").trim(),
		stderr: (result.stderr ?? "").trim(),
	};
}

export function must(
	cwd: string,
	args: readonly string[],
	what: string,
): string {
	const result = git(cwd, args);
	if (result.status !== 0) {
		throw new PinsError(
			"GIT_FAILED",
			`${what} failed: git ${args.join(" ")}\n${result.stderr}`,
		);
	}
	return result.stdout;
}

export function short(commit: string): string {
	return commit.slice(0, 7);
}

const GITLINK = /^160000 ([0-9a-f]{40}) 0\t/u;

/** The commit the index pins `path` at. */
export function gitlinkOf(root: string, path: string): string {
	const line = git(root, ["ls-files", "-s", "--", path]).stdout;
	const commit = GITLINK.exec(line)?.[1];
	if (commit === undefined) {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${path} is not a submodule gitlink in this repository's index`,
		);
	}
	return commit;
}

/** HEAD of the submodule's own repository, or null when it is not fetched yet. */
export function headOf(root: string, path: string): string | null {
	if (!existsSync(join(root, path, ".git"))) return null;
	const result = git(join(root, path), ["rev-parse", "--verify", "HEAD"]);
	return result.status === 0 ? result.stdout : null;
}

/** Uncommitted changes to tracked files (untracked build output is ignored). */
export function isDirty(root: string, path: string): boolean {
	return (
		git(join(root, path), ["status", "--porcelain", "--untracked-files=no"])
			.stdout !== ""
	);
}

export function isShallow(root: string, path: string): boolean {
	return (
		git(join(root, path), ["rev-parse", "--is-shallow-repository"]).stdout ===
		"true"
	);
}

const MODULES_LINE = /^submodule\.(.+)\.(path|url) (.*)$/u;

/** The url `.gitmodules` records for the submodule at `path`, if any. */
export function modulesUrl(root: string, path: string): string | null {
	const lines = git(root, [
		"config",
		"-f",
		".gitmodules",
		"--get-regexp",
		"^submodule\\.",
	]).stdout;
	const paths = new Map<string, string>();
	const urls = new Map<string, string>();
	for (const line of lines.split("\n")) {
		const match = MODULES_LINE.exec(line);
		const name = match?.[1];
		const value = match?.[3];
		if (name === undefined || value === undefined) continue;
		(match?.[2] === "path" ? paths : urls).set(name, value);
	}
	for (const [name, recorded] of paths) {
		if (recorded === path) return urls.get(name) ?? null;
	}
	return null;
}

/** `https://Host/a/b.git/`, `file:///a/b` and `/a/b` compare by what they name. */
export function sameRepo(left: string, right: string): boolean {
	const normal = (value: string): string => {
		const bare = value
			.replace(/^file:\/\//u, "")
			.replace(/\/+$/u, "")
			.replace(/\.git$/u, "");
		return /^https?:\/\//iu.test(bare) ? bare.toLowerCase() : bare;
	};
	return normal(left) === normal(right);
}
