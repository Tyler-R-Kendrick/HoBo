/**
 * The URL git's configuration gives a submodule, read the way
 * `git submodule update` reads it, and what to say when it is not the one
 * `.gitmodules` names: where it came from, and the fix that works there.
 *
 * Erasable TypeScript with node builtins only.
 */
import { git, gitFailure, sameRepo } from "./pins-git-core.ts";

/** A problem with the configured URL, and its fix. */
export interface UrlProblem {
	readonly problem: string;
	readonly fix: string;
}

/** `value` as one shell word: as it is when plain, else single-quoted. */
export function shellWord(value: string): string {
	return /^[\w./:@%+=,-]+$/u.test(value)
		? value
		: `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Read with no scope, so every one is read, as `git submodule update` reads
 * them: the system and global files and what they include, this clone's own,
 * a worktree's `config.worktree`, and the command line (`git -c`, which a
 * child git gets as GIT_CONFIG_COUNT or GIT_CONFIG_PARAMETERS), the last one
 * winning. GIT_CONFIG is dropped, so nothing redirects the read;
 * `--show-scope` and `--show-origin` say where the fix goes. An exit other
 * than 0 (a value) or 1 (none set), a death by a signal included, is git
 * failing to answer, and that is a problem too, never "nothing is
 * configured".
 */
export function configuredUrlProblem(
	root: string,
	path: string,
	name: string,
	wanted: string,
): UrlProblem | null {
	const key = `submodule.${name}.url`;
	const read = git(root, [
		"config",
		"-z",
		"--show-scope",
		"--show-origin",
		"--get",
		key,
	]);
	if (read.status !== 0 && read.status !== 1) {
		return {
			problem: `cannot read the URL git's configuration gives ${path} (${gitFailure("git config", read)})`,
			fix: `run git config --show-scope --show-origin --get ${shellWord(key)} to see why; the pins need git 2.31 or newer`,
		};
	}
	const [scope = "", origin = "", configured = ""] = read.stdout.split("\0");
	if (configured === "" || sameRepo(configured, wanted)) return null;
	const where = staleUrl(path, key, scope, origin);
	return {
		problem: `${where.said} ${configured}, not ${wanted}${where.why}`,
		fix: where.fix,
	};
}

interface StaleUrl {
	/** Comes before the URL. */
	readonly said: string;
	/** Comes after the URL `.gitmodules` names. */
	readonly why: string;
	readonly fix: string;
}

function staleUrl(
	path: string,
	key: string,
	scope: string,
	origin: string,
): StaleUrl {
	const sync = `git submodule sync -- ${path}`;
	if (scope === "local") {
		return {
			said: `this clone's configured URL for ${path} is`,
			why: ' (a stale "git submodule init")',
			fix: sync,
		};
	}
	// `config.worktree` is read after `.git/config`, so sync, which writes
	// the latter, would change nothing.
	if (scope === "worktree") {
		return {
			said: `this worktree's configured URL for ${path} (config.worktree) is`,
			why: "",
			fix: `git config --worktree --unset ${shellWord(key)}`,
		};
	}
	if (scope === "global" || scope === "system") {
		// The file it is set in, which an `include.path` makes another file.
		const file = origin.startsWith("file:")
			? `-f ${shellWord(origin.slice("file:".length))}`
			: `--${scope}`;
		return {
			said: `the ${scope} git config sets the URL for ${path} to`,
			why: "",
			fix: `${sync}   (this clone's URL then overrides it; or: git config ${file} --unset ${shellWord(key)})`,
		};
	}
	const from = "git -c, GIT_CONFIG_COUNT or GIT_CONFIG_PARAMETERS";
	return {
		said: `the command line (${from}) sets the URL for ${path} to`,
		why: "",
		fix: `drop ${key} from ${from}`,
	};
}
