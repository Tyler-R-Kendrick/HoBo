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
import { netTimeout } from "./pins-net.ts";

export interface GitResult {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Run git in its own process group under a deadline, from a small node
 * parent: when the deadline passes the whole group gets SIGTERM, then
 * SIGKILL, so no transport helper outlives the call holding a pipe or a
 * connection. A signal the parent gets is passed on to the group. Exit 124
 * means the deadline passed.
 */
const UNDER_DEADLINE = `
const { spawn } = require("node:child_process");
const [ms, ...args] = process.argv.slice(1);
const child = spawn("git", args, { stdio: "inherit", detached: true });
const group = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(name, () => group(name));
let late = false;
const timer = setTimeout(() => {
	late = true;
	group("SIGTERM");
	setTimeout(() => { group("SIGKILL"); process.exit(124); }, 2000).unref();
}, Number(ms));
child.on("error", (error) => { console.error(error.message); process.exit(127); });
child.on("exit", (code, signal) => {
	clearTimeout(timer);
	process.exit(late ? 124 : (code ?? (signal === null ? 1 : 128)));
});
`;

/** A git call with a deadline: how long, and what to call it in the error. */
export interface Deadline {
	readonly ms: number;
	readonly what: string;
}

export function git(
	cwd: string,
	args: readonly string[],
	visible = false,
	env: NodeJS.ProcessEnv = {},
	deadline?: Deadline,
): GitResult {
	const [command, argv] =
		deadline === undefined
			? ["git", [...args]]
			: [
					process.execPath,
					["-e", UNDER_DEADLINE, String(deadline.ms), ...args],
				];
	const result = spawnSync(command, argv, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: visible ? ["ignore", "inherit", "inherit"] : "pipe",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", ...env },
		// The group is killed at the deadline; this only bounds the parent.
		...(deadline === undefined ? {} : { timeout: deadline.ms + 10_000 }),
	});
	if (
		deadline !== undefined &&
		(result.status === 124 || isTimeout(result.error))
	) {
		throw netTimeout(deadline.what, deadline.ms);
	}
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

function isTimeout(error: Error | undefined): boolean {
	return error !== undefined && "code" in error && error.code === "ETIMEDOUT";
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
	if (git(root, ["rev-parse", "--is-inside-work-tree"]).stdout !== "true") {
		throw new PinsError(
			"SUBMODULE_STATE",
			`${root} is not a git checkout (a zip download has no submodules); clone with git: git clone --recurse-submodules <the repository>`,
		);
	}
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

/**
 * Whether any branch, tag, remote-tracking ref or `refs/pins/*` contains
 * `commit`: if none does, the only thing holding it is the reflog.
 */
export function onAnyRef(root: string, path: string, commit: string): boolean {
	return (
		git(join(root, path), [
			"for-each-ref",
			"--contains",
			commit,
			"--count=1",
			"--format=%(refname)",
		]).stdout !== ""
	);
}

/**
 * Remember a commit the pins put the submodule on. A shallow clone does not
 * have it in any remote-tracking ref's history, so without this a later move
 * off it would look like abandoning unpushed work.
 */
export function keepPin(root: string, path: string, commit: string): void {
	must(
		join(root, path),
		["update-ref", `refs/pins/${commit}`, commit],
		"recording the pinned commit",
	);
}

export function isShallow(root: string, path: string): boolean {
	return (
		git(join(root, path), ["rev-parse", "--is-shallow-repository"]).stdout ===
		"true"
	);
}

export interface ModulesEntry {
	/** The submodule's name in `.gitmodules` (often, not always, its path). */
	readonly name: string;
	readonly url: string;
}

/** `.gitmodules` that git could read differently from the script: refused, with the fix. */
export class GitmodulesError extends PinsError {
	readonly problem: string;
	readonly fix: string;
	constructor(problem: string, fix: string) {
		super("GITMODULES_AMBIGUOUS", `${problem}\nfix: ${fix}`);
		this.problem = problem;
		this.fix = fix;
	}
}

function hasControl(value: string): boolean {
	return [...value].some((char) => {
		const code = char.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
}

/** `./a//b/` and `a/b` name the same directory. */
function samePath(left: string, right: string): boolean {
	const normal = (value: string): string =>
		value
			.replace(/^(\.\/)+/u, "")
			.replace(/\/{2,}/gu, "/")
			.replace(/\/+$/u, "");
	return normal(left) === normal(right);
}

/** Every `submodule.<name>.<key>` value, NUL-separated so no value can forge a line. */
function modulesValues(root: string): Map<string, Map<string, string[]>> {
	const out = git(root, [
		"config",
		"-z",
		"-f",
		".gitmodules",
		"--get-regexp",
		"^submodule\\.",
	]).stdout;
	const sections = new Map<string, Map<string, string[]>>();
	for (const entry of out.split("\0")) {
		if (entry === "") continue;
		const cut = entry.indexOf("\n");
		const key = cut === -1 ? entry : entry.slice(0, cut);
		const value = cut === -1 ? "" : entry.slice(cut + 1);
		if (hasControl(key) || hasControl(value)) {
			throw new GitmodulesError(
				`.gitmodules: ${key.slice(0, 80)} holds a line break or another control character, which git reads from an escape such as \\n; such a value is refused`,
				`remove the escape from that value in .gitmodules`,
			);
		}
		const dot = key.lastIndexOf(".");
		const name = key.slice("submodule.".length, dot);
		const values = sections.get(name) ?? new Map<string, string[]>();
		values.set(key.slice(dot + 1), [
			...(values.get(key.slice(dot + 1)) ?? []),
			value,
		]);
		sections.set(name, values);
	}
	return sections;
}

/**
 * What `.gitmodules` records for the submodule at `path`, read the way git
 * reads it (`git config -z`). Refused (GITMODULES_AMBIGUOUS) when git could
 * pick a repository the script did not compare: two sections naming the path,
 * a path or url set twice in one section, or a value with a control character.
 */
export function modulesEntry(root: string, path: string): ModulesEntry | null {
	const sections = modulesValues(root);
	const naming = [...sections].filter(([, values]) =>
		(values.get("path") ?? []).some((value) => samePath(value, path)),
	);
	if (naming.length > 1) {
		throw new GitmodulesError(
			`.gitmodules has ${naming.length} sections for ${path} (${naming.map(([name]) => `"${name}"`).join(", ")}); git uses one of them, so which repository it would contact is not certain`,
			`keep one [submodule] section for ${path} in .gitmodules`,
		);
	}
	const [found] = naming;
	if (found === undefined) return null;
	const [name, values] = found;
	for (const key of ["path", "url"]) {
		if ((values.get(key) ?? []).length > 1) {
			throw new GitmodulesError(
				`.gitmodules sets submodule.${name}.${key} more than once`,
				`keep one ${key} line in the [submodule "${name}"] section of .gitmodules`,
			);
		}
	}
	const url = values.get("url")?.[0];
	return values.get("path")?.[0] === path && url !== undefined
		? { name, url }
		: null;
}

/** The url `.gitmodules` records for the submodule at `path`, if any. */
export function modulesUrl(root: string, path: string): string | null {
	return modulesEntry(root, path)?.url ?? null;
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
