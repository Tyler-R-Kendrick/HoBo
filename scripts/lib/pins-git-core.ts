/**
 * The git primitives the pin code is built on: running git as an argument
 * vector, reading the index's gitlink, the submodule's HEAD and state, and
 * `.gitmodules`. Nothing here moves a submodule or touches the network.
 *
 * Erasable TypeScript with node builtins only.
 */
import {
	type SpawnSyncOptionsWithStringEncoding,
	spawnSync,
} from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { PinsError, type PinsErrorCode } from "./pins.ts";
import { netTimeout } from "./pins-net.ts";

export { sameRepo } from "./pins-repo-url.ts";

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

/**
 * The variables that tell git which repository to use. They beat the working
 * directory, and git exports some of them to every hook (GIT_DIR and
 * GIT_INDEX_FILE in a linked worktree), so a pins verb run from a hook would
 * act on the superproject instead of the submodule or the probe. Git drops
 * the same set when it runs a command in a submodule (`local_repo_env`).
 * GIT_CONFIG_* stay: they configure git, they do not locate a repository.
 */
const REPOSITORY_LOCATORS = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_COMMON_DIR",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_SHALLOW_FILE",
	"GIT_GRAFT_FILE",
	"GIT_PREFIX",
	"GIT_IMPLICIT_WORK_TREE",
	"GIT_NAMESPACE",
] as const;

/** This process's environment without the repository-locating variables. */
export function gitEnvironment(
	from: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const env = { ...from };
	for (const name of REPOSITORY_LOCATORS) delete env[name];
	return env;
}

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
	const options: SpawnSyncOptionsWithStringEncoding = {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: visible ? ["ignore", "inherit", "inherit"] : "pipe",
		env: { ...gitEnvironment(), GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", ...env },
	};
	// The group is killed at the deadline; this only bounds the parent.
	if (deadline !== undefined) options.timeout = deadline.ms + 10_000;
	const result = spawnSync(command, argv, options);
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

/** A refusal that `status` prints as a problem with its fix, and the other verbs throw. */
export class Refusal extends PinsError {
	readonly problem: string;
	readonly fix: string;
	constructor(code: PinsErrorCode, problem: string, fix: string) {
		super(code, `${problem}\nfix: ${fix}`);
		this.problem = problem;
		this.fix = fix;
	}
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

function realOr(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/**
 * HEAD of the submodule's own repository, or null when it is not fetched yet.
 * Only a repository whose top level is the submodule's path answers: an empty
 * `.git` directory makes git walk up to the superproject, and a `.git` file
 * whose module directory is gone makes it fail, and both are refused here,
 * before any command runs in what git would take for the submodule.
 */
export function headOf(root: string, path: string): string | null {
	const sub = join(root, path);
	if (!existsSync(join(sub, ".git"))) return null;
	const top = git(sub, ["rev-parse", "--show-toplevel"]);
	if (top.status !== 0 || realOr(top.stdout) !== realOr(sub)) {
		const answer =
			top.status === 0
				? `git answers for ${top.stdout} instead`
				: `git says: ${top.stderr.split("\n")[0] ?? ""}`;
		throw new Refusal(
			"SUBMODULE_STATE",
			`${path}/.git is not a usable repository of its own (${answer}); nothing is run in it`,
			`rm -rf ${path} && git submodule update --init -- ${path}   (deletes ${path}: copy out anything you need first)`,
		);
	}
	const result = git(sub, ["rev-parse", "--verify", "HEAD"]);
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
			throw new Refusal(
				"GITMODULES_AMBIGUOUS",
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
		throw new Refusal(
			"GITMODULES_AMBIGUOUS",
			`.gitmodules has ${naming.length} sections for ${path} (${naming.map(([name]) => `"${name}"`).join(", ")}); git uses one of them, so which repository it would contact is not certain`,
			`keep one [submodule] section for ${path} in .gitmodules`,
		);
	}
	const [found] = naming;
	if (found === undefined) return null;
	const [name, values] = found;
	for (const key of ["path", "url"]) {
		if ((values.get(key) ?? []).length > 1) {
			throw new Refusal(
				"GITMODULES_AMBIGUOUS",
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
