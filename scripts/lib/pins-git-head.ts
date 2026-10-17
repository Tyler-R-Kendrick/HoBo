/**
 * The submodule's HEAD, read only from the submodule's own repository: the
 * checks that come before any git runs in a submodule path (no symbolic
 * link on the way, git's top level is the path, the repository is the
 * submodule's own and not the superproject's or another checkout's).
 *
 * Erasable TypeScript with node builtins only.
 */
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";

import { git, Refusal } from "./pins-git-core.ts";
import { modulesEntry } from "./pins-gitmodules.ts";

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
	refuseForeignRepository(root, path, sub);
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

interface Repository {
	/** `git rev-parse --absolute-git-dir`, resolved. */
	readonly gitDir: string;
	/** `git rev-parse --git-common-dir`, resolved. */
	readonly common: string;
}

function repositoryOf(dir: string): Repository | null {
	const result = git(dir, [
		"rev-parse",
		"--absolute-git-dir",
		"--path-format=absolute",
		"--git-common-dir",
	]);
	const [gitDir, common] = result.stdout.split("\n");
	if (result.status !== 0 || gitDir === undefined || common === undefined)
		return null;
	return { gitDir: realOr(gitDir), common: realOr(common) };
}

function within(path: string, dir: string): boolean {
	return path === dir || path.startsWith(`${dir}${sep}`);
}

/**
 * Why the repository a submodule's `.git` names is not the submodule's own,
 * or null when it is. git keeps a submodule's repository at
 * `<superproject git dir>/modules/<name>`, also when the superproject was
 * cloned with --separate-git-dir, is itself a submodule, or is a linked
 * worktree (whose `modules/` is its own, not the common directory's). An
 * older git, or a plain clone, keeps it in the path's own `.git` directory.
 * A hand-made `git clone --separate-git-dir` keeps it in a directory that
 * serves no other work tree: not named `.git` (that is the repository of the
 * directory holding it), not a linked worktree, outside the superproject's
 * git directory, and with no core.worktree naming another directory.
 * Anything else belongs to another checkout, and a fetch there would move
 * that one.
 */
function foreignReason(
	root: string,
	path: string,
	sub: Repository,
): string | null {
	if (sub.common !== sub.gitDir)
		return `is a linked worktree of the repository at ${sub.common}`;
	if (sub.gitDir === realOr(join(root, path, ".git"))) return null;
	const owner = repositoryOf(root);
	const name = modulesEntry(root, path)?.name;
	const modules =
		owner === null || name === undefined
			? null
			: realOr(join(owner.gitDir, "modules", name));
	if (sub.gitDir === modules) return null;
	if (basename(sub.gitDir) === ".git")
		return `is the repository of another working tree (${dirname(sub.gitDir)})`;
	for (const dir of [owner?.gitDir, owner?.common]) {
		if (dir !== undefined && within(sub.gitDir, dir)) {
			const own = modules ?? `no .gitmodules entry names ${path}`;
			return `is inside the superproject's git directory but is not this submodule's (${own})`;
		}
	}
	// core.worktree needs no check: it decides git's top level, which
	// headOf has already found to be this path.
	return null;
}

/** A `.git` file naming another checkout's repository is refused. */
function refuseForeignRepository(
	root: string,
	path: string,
	dir: string,
): void {
	const sub = repositoryOf(dir);
	if (sub === null) return; // The top-level check has already refused it.
	const reason = foreignReason(root, path, sub);
	if (reason === null) return;
	throw new Refusal(
		"SUBMODULE_STATE",
		`${path}/.git names ${sub.gitDir}, which ${reason}; nothing is run in it`,
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
