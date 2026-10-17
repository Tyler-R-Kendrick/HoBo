/**
 * The git primitives the pin code is built on: running git as an argument
 * vector, reading the index's gitlink and the submodule's state. The
 * submodule's HEAD, and the checks before it, are in pins-git-head.ts.
 * Nothing here moves a submodule or touches the network.
 *
 * Erasable TypeScript with node builtins only.
 */
import {
	type SpawnSyncOptionsWithStringEncoding,
	spawnSync,
} from "node:child_process";
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
 * connection. A signal the parent gets is passed on to the group. The
 * listeners exist before git does: git runs in a session of its own, so a
 * signal that found the parent with no listener would end the parent and
 * leave git running. git starts on the event loop's check phase, after any
 * signal already pending has been handled, and a signal handled before git
 * exists ends the parent with 128 + its number (130 for SIGINT) without
 * starting git. Exit 124 means the deadline passed.
 */
export const UNDER_DEADLINE = `
const { spawn } = require("node:child_process");
const { signals } = require("node:os").constants;
const [ms, ...args] = process.argv.slice(1);
let child;
const group = (signal) => {
	if (child === undefined) process.exit(128 + signals[signal]);
	try { process.kill(-child.pid, signal); } catch {}
};
for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(name, () => group(name));
setImmediate(() => {
	child = spawn("git", args, { stdio: "inherit", detached: true });
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

/** git 2.31: `rev-parse --path-format=absolute` (`config --show-scope` is 2.26). */
const MIN_GIT = { major: 2, minor: 31 } as const;
let gitChecked = false;

/**
 * Refuses, once per process, a git older than the pins need. A version git
 * prints in another form is let through: every read that needs a newer git
 * also fails closed on its own.
 */
export function requireGit(root: string): void {
	if (gitChecked) return;
	const said = git(root, ["--version"]).stdout;
	const match = /^git version (\d+)\.(\d+)/u.exec(said);
	if (match !== null) {
		const [major, minor] = [Number(match[1]), Number(match[2])];
		if (
			major < MIN_GIT.major ||
			(major === MIN_GIT.major && minor < MIN_GIT.minor)
		) {
			throw new PinsError(
				"GIT_FAILED",
				`${said} is older than ${MIN_GIT.major}.${MIN_GIT.minor}, which the pins need (git rev-parse --path-format=absolute, git config --show-scope); install git ${MIN_GIT.major}.${MIN_GIT.minor} or newer`,
			);
		}
	}
	gitChecked = true;
}

/** The commit the index pins `path` at: the first git call of every git verb, after the version check. */
export function gitlinkOf(root: string, path: string): string {
	requireGit(root);
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
