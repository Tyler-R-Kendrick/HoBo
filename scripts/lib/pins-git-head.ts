/**
 * The submodule's HEAD, read only from the submodule's own repository: the
 * checks that come before any git runs in a submodule path (no symbolic
 * link on the way, git's top level is the path, the repository is the
 * submodule's own and not the superproject's or another checkout's).
 *
 * Erasable TypeScript with node builtins only.
 */
import { existsSync, lstatSync, realpathSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";

import { inside, sameFile } from "./pins-file-identity.ts";
import { git, Refusal, sameRepo, shellWord } from "./pins-git-core.ts";
import {
	gitIgnoresName,
	type ModulesEntry,
	modulesEntry,
	modulesSectionNames,
} from "./pins-gitmodules.ts";

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
			moveAside(path),
		);
	}
	refuseSharedRepository(root, path, sub);
	refuseForeignRepository(root, path, sub);
	const result = git(sub, ["rev-parse", "--verify", "HEAD"]);
	return result.status === 0 ? result.stdout : null;
}

/**
 * The fix for a submodule whose repository cannot be used: move the checkout
 * aside and clone again. Nothing is deleted, so an uncommitted change in it,
 * or a commit only its repository holds, is still there to take back.
 */
function moveAside(path: string): string {
	return `mv ${path} ${path}.kept && git submodule update --init -- ${path}   (keeps the old checkout, and any work in it, at ${path}.kept)`;
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
 * before anything runs there. Repositories are compared by identity, so a
 * bind mount, or `../../.GIT` on a case-insensitive filesystem, is the same.
 */
function refuseSharedRepository(root: string, path: string, sub: string): void {
	const shared = commonDir(sub);
	const own = commonDir(root);
	if (shared === null || own === null || !sameFile(shared, own)) return;
	throw new Refusal(
		"SUBMODULE_STATE",
		`${path}/.git names the superproject's own repository (${shared}); nothing is run in it`,
		moveAside(path),
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

/** Why the repository a `.git` names is not the submodule's own, and the fix that keeps the work. */
interface Foreign {
	readonly reason: string;
	readonly fix: string;
}

/**
 * Why the repository a submodule's `.git` names is not the submodule's own,
 * or null when it is. git keeps a submodule's repository at
 * `<superproject git dir>/modules/<name>`, also when the superproject was
 * cloned with --separate-git-dir, is itself a submodule, or is a linked
 * worktree (whose `modules/` is its own, not the common directory's), and
 * keeps using the one it cloned when the section is later renamed: a module
 * directory whose `core.worktree` is this path was made for this path, and
 * is taken as the submodule's own when its `remote.origin.url` is also the
 * repository `.gitmodules` names for the path. `core.worktree` says which
 * path git made it for and nothing about whose repository it is, so a
 * renamed section whose URL changed to another upstream finds the old
 * upstream's clone refused, not adopted and moved to the new upstream's
 * commit. An older git, or a plain clone, keeps it in the path's own `.git`
 * directory. A hand-made `git clone --separate-git-dir` keeps it in a
 * directory that serves no other work tree: not named `.git` (that is the
 * repository of the directory holding it), not a linked worktree, outside
 * the superproject's git directory, and with no core.worktree naming another
 * directory. Anything else belongs to another checkout, and a fetch there
 * would move that one. Directories are compared by identity and `.git`
 * without case: a path string misses a bind mount and a case-insensitive
 * filesystem.
 */
function foreignReason(
	root: string,
	path: string,
	sub: Repository,
): Foreign | null {
	const fix = moveAside(path);
	if (!sameFile(sub.common, sub.gitDir))
		return {
			reason: `is a linked worktree of the repository at ${sub.common}`,
			fix,
		};
	if (sameFile(sub.gitDir, join(root, path, ".git"))) return null;
	const owner = repositoryOf(root);
	const entry = entryOf(root, path);
	const modules =
		owner === null || entry === undefined
			? null
			: realOr(join(owner.gitDir, "modules", entry.name));
	if (modules !== null && sameFile(sub.gitDir, modules)) return null;
	if (basename(sub.gitDir).toLowerCase() === ".git")
		return {
			reason: `is the repository of another working tree (${dirname(sub.gitDir)})`,
			fix,
		};
	// Without the name there is no module directory to tell the submodule's
	// own from another's; `coherence` refuses that `.gitmodules`, so status
	// says it once and fetch and bump stop on it first.
	if (owner === null || entry === undefined || modules === null) return null;
	// core.worktree needs no check outside the superproject's git directory:
	// it decides git's top level, which headOf has already found to be this path.
	if (!insideEither(sub.gitDir, owner)) return null;
	const moduleDirs = join(owner.gitDir, "modules");
	const named = moduleNameOf(moduleDirs, sub.gitDir);
	const theirs = !originIs(root, sub.gitDir, entry.url);
	if (
		!theirs &&
		inside(sub.gitDir, moduleDirs) &&
		worktreeIs(root, sub.gitDir, path)
	)
		return null;
	if (theirs)
		return {
			reason: `belongs to another repository: its remote.origin.url is not ${entry.url}, the URL .gitmodules gives ${path}`,
			fix,
		};
	return {
		reason: `is inside the superproject's git directory but is not this submodule's (${modules})`,
		fix: existsSync(modules)
			? fix
			: (renameFix(root, entry.name, named) ?? fix),
	};
}

function insideEither(gitDir: string, owner: Repository): boolean {
	return [owner.gitDir, owner.common].some((dir) => inside(gitDir, dir));
}

/** Whether the repository's `remote.origin.url` is the repository `wanted` names. */
function originIs(root: string, gitDir: string, wanted: string): boolean {
	const origin = git(root, [
		"config",
		"-f",
		join(gitDir, "config"),
		"--get",
		"remote.origin.url",
	]);
	return origin.status === 0 && sameRepo(origin.stdout, wanted);
}

/** Whether the repository's own `core.worktree` names `path`: git made it for this path. */
function worktreeIs(root: string, gitDir: string, path: string): boolean {
	const set = git(root, [
		"config",
		"-f",
		join(gitDir, "config"),
		"--get",
		"core.worktree",
	]);
	return (
		set.status === 0 && sameFile(resolve(gitDir, set.stdout), join(root, path))
	);
}

/** The name git gave a module directory: its path under `<git dir>/modules`, or null outside it. */
function moduleNameOf(moduleDirs: string, gitDir: string): string | null {
	const name = relative(realOr(moduleDirs), gitDir).split(sep).join("/");
	return name === "" || name.startsWith("..") || isAbsolute(name) ? null : name;
}

/**
 * A `.git` naming a module directory git made under another name,
 * `modules/<X>`, that no other section claims, while the section's own
 * `modules/<name>` does not exist (the section was renamed after cloning):
 * renaming the section back to X makes it the submodule's own again, and
 * keeps the clone and its work. Offered only for this repository's own
 * clone: the caller has checked its origin.
 */
function renameFix(
	root: string,
	name: string,
	other: string | null,
): string | null {
	if (other === null) return null;
	if (gitIgnoresName(other) || modulesSectionNames(root).includes(other))
		return null;
	return `git config -f .gitmodules --rename-section ${shellWord(`submodule.${name}`)} ${shellWord(`submodule.${other}`)}`;
}

/** The submodule at `path` in `.gitmodules`, or undefined when it names none or is refused. */
function entryOf(root: string, path: string): ModulesEntry | undefined {
	try {
		return modulesEntry(root, path) ?? undefined;
	} catch (error) {
		if (error instanceof Refusal) return undefined;
		throw error;
	}
}

/** A `.git` file naming another checkout's repository is refused. */
function refuseForeignRepository(
	root: string,
	path: string,
	dir: string,
): void {
	const sub = repositoryOf(dir);
	if (sub === null) return; // The top-level check has already refused it.
	const foreign = foreignReason(root, path, sub);
	if (foreign === null) return;
	throw new Refusal(
		"SUBMODULE_STATE",
		`${path}/.git names ${sub.gitDir}, which ${foreign.reason}; nothing is run in it`,
		foreign.fix,
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
				moveAside(path),
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
