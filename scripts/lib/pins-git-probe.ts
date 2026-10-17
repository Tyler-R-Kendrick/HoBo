/**
 * Whether a server serves a commit, asked from a repository nobody uses.
 *
 * Fetching a commit, even with `--dry-run`, downloads its pack and, with
 * `--depth`, writes `shallow`: run in the superproject or the submodule it
 * would turn a full clone shallow and add objects to the user's repository.
 * So the question is asked from a new, empty bare repository under the cache
 * root (private, checked like the asset cache), which is removed as soon as
 * the answer is in; a leftover of a killed run is swept after an hour.
 *
 * Erasable TypeScript with node builtins only.
 */
import { lstatSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PinsError } from "./pins.ts";
import { cacheDir } from "./pins-assets.ts";
import { dirProblem } from "./pins-cache.ts";
import { git } from "./pins-git-core.ts";

/** The prefix of a probe repository's directory in the cache root. */
export const PROBE_PREFIX = ".probe-";

function assertPrivate(cache: string): void {
	try {
		mkdirSync(cache, { recursive: true, mode: 0o700 });
	} catch {
		// A file where the directory belongs is reported below.
	}
	const info = lstatSync(cache);
	const problem = dirProblem(
		{ uid: info.uid, mode: info.mode, directory: info.isDirectory() },
		process.getuid?.() ?? info.uid,
		cache,
	);
	if (problem !== null) {
		throw new PinsError(
			"CACHE_UNSAFE",
			`${problem.problem}; the server is asked from a throwaway repository there, so nothing is written to it. fix: ${problem.fix}`,
		);
	}
}

/** Run `ask` in a new, empty bare repository that is removed afterwards. */
export function withProbeRepo<T>(
	ask: (repo: string) => T,
	cache: string = cacheDir(),
): T {
	assertPrivate(cache);
	const repo = mkdtempSync(join(cache, PROBE_PREFIX));
	try {
		// No template: no hook of anyone's can run in it.
		const init = git(repo, ["init", "--quiet", "--bare", "--template=", "."]);
		if (init.status !== 0) {
			throw new PinsError(
				"GIT_FAILED",
				`cannot create a probe repository: ${init.stderr}`,
			);
		}
		return ask(repo);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
}
