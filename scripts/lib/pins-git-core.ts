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
import { existsSync, lstatSync, realpathSync } from "node:fs";
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
export const UNDER_DEADLINE = `
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
 * git's own `local_repo_env`: exactly the names `git rev-parse
 * --local-env-vars` prints on git 2.43, the set git clears before it runs a
 * command in a submodule, plus GIT_NAMESPACE. They beat the working
 * directory, and git exports some of them to every hook (GIT_DIR and
 * GIT_INDEX_FILE in a linked worktree), so a pins verb run from a hook would
 * otherwise act on the superproject instead of the submodule or the probe.
 * `pins-git-env.test.ts` checks the list against the installed git.
 */
export const LOCAL_REPO_ENV = [
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_CONFIG",
	"GIT_CONFIG_PARAMETERS",
	"GIT_CONFIG_COUNT",
	"GIT_OBJECT_DIRECTORY",
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_IMPLICIT_WORK_TREE",
	"GIT_GRAFT_FILE",
	"GIT_INDEX_FILE",
	"GIT_NO_REPLACE_OBJECTS",
	"GIT_REPLACE_REF_BASE",
	"GIT_PREFIX",
	"GIT_SHALLOW_FILE",
	"GIT_COMMON_DIR",
	"GIT_NAMESPACE",
] as const;

/**
 * In git's list, but kept: they carry the invoking user's configuration
 * (`git -c`, and GIT_CONFIG_KEY_n/GIT_CONFIG_VALUE_n through
 * GIT_CONFIG_COUNT), which git itself passes to a submodule's commands; CI
 * credentials and the tests' hermetic configuration travel this way (ADR-0169
 * says why that is in scope). GIT_CONFIG is not kept: it only redirects the
 * `git config` command, and git drops it for a submodule too.
 * GIT_CEILING_DIRECTORIES is not in git's list and stays: it only narrows.
 */
const KEPT_CONFIGURATION: ReadonlySet<string> = new Set([
	"GIT_CONFIG_PARAMETERS",
	"GIT_CONFIG_COUNT",
]);

/** This process's environment without the repository-locating variables. */
export function gitEnvironment(
	from: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const env = { ...from };
	for (const name of LOCAL_REPO_ENV) {
		if (!KEPT_CONFIGURATION.has(name)) delete env[name];
	}
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
		stdio: "pipe",
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
 * The path (and its `.git`) must not be or pass through a symbolic link, the
 * repository must not be the superproject's, and only a repository
 * whose top level is the submodule's path answers: an empty
 * `.git` directory makes git walk up to the superproject, and a `.git` file
 * whose module directory is gone makes it fail, and both are refused here,
 * before any command runs in what git would take for the submodule.
 */
export function headOf(root: string, path: string): string | null {
	refuseLinkedPath(root, path);
	const sub = join(root, path);
	if (!existsSync(join(sub, ".git"))) return null;
	const top = git(sub, ["rev-parse", "--show-toplevel"]);
	// Against the path under the root's real location, never the path's own
	// target: a link that resolves to the superproject must not match it.
	if (top.status !== 0 || realOr(top.stdout) !== join(realOr(root), path)) {
		const answer =
			top.status === 0
				? `git answers for ${top.stdout} instead`
				: `git says: ${top.stderr.split("\n")[0] ?? ""}`;
		throw new Refusal(
			"SUBMODULE_STATE",
			`${path}/.git is not a usable repository of its own (${answer}); nothing is run in it`,
			reclone(path),
		);
	}
	refuseSharedRepository(root, path, sub);
	const result = git(sub, ["rev-parse", "--verify", "HEAD"]);
	return result.status === 0 ? result.stdout : null;
}

/** The fix for a submodule whose repository cannot be used: clone it again. */
function reclone(path: string): string {
	return `rm -rf ${path} && git submodule update --init -- ${path}   (deletes ${path}: copy out anything you need first)`;
}

/** The repository a directory's git uses (its common directory), resolved. */
function commonDir(dir: string): string | null {
	const result = git(dir, [
		"rev-parse",
		"--path-format=absolute",
		"--git-common-dir",
	]);
	return result.status === 0 ? realOr(result.stdout) : null;
}

/**
 * A `.git` file can name any repository: `gitdir: ../../.git` makes git work
 * on the superproject's while its top level is the submodule's path. Refused
 * before anything runs there.
 */
function refuseSharedRepository(root: string, path: string, sub: string): void {
	const shared = commonDir(sub);
	if (shared === null || shared !== commonDir(root)) return;
	throw new Refusal(
		"SUBMODULE_STATE",
		`${path}/.git names the superproject's own repository (${shared}); nothing is run in it`,
		reclone(path),
	);
}

/** The first part of `path` under `root` that is a symbolic link, if any. */
function linkOnPath(root: string, path: string): string | null {
	const parts = path.split("/");
	for (let end = 1; end <= parts.length; end += 1) {
		const prefix = parts.slice(0, end).join("/");
		try {
			if (lstatSync(join(root, prefix)).isSymbolicLink()) return prefix;
		} catch {
			return null; // Not there (yet): nothing further down can be a link.
		}
	}
	return null;
}

/**
 * A submodule path is a directory of this checkout. A link there (or in a
 * directory above it) points git at whatever it names, the superproject
 * included, so it is refused before anything runs.
 */
function refuseLinkedPath(root: string, path: string): void {
	const link = linkOnPath(root, path);
	if (link === null) {
		// A submodule's `.git` is its own: a link there can name any repository.
		if (linkOnPath(root, `${path}/.git`) === `${path}/.git`) {
			throw new Refusal(
				"SUBMODULE_STATE",
				`${path}/.git is a symbolic link; a submodule's .git is its own, so nothing is run in it`,
				reclone(path),
			);
		}
		return;
	}
	throw new Refusal(
		"SUBMODULE_STATE",
		`${link} is a symbolic link; ${path} must be a directory of this checkout, so nothing is run in it`,
		link === path
			? `rm ${path} && git submodule update --init -- ${path}`
			: `rm ${link} && git checkout -- ${link} && git submodule update --init -- ${path}`,
	);
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
