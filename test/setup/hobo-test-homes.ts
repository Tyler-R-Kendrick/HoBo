/**
 * One directory per vitest run that holds every test file's throwaway
 * `HOBO_HOME` (`test/setup/isolate-hobo-home.ts`), removed when the run ends.
 *
 * A file's own `afterAll` cannot do it. Vitest runs none for a file whose every
 * test is skipped, or one that fails to load, and a timer, promise or child that
 * outlives its file can still write. Keeping every file's home until the run
 * ends, and never unsetting `HOBO_HOME`, means such a write lands in a directory
 * that exists, never in the developer's real `~/.hobo`, and is removed with the
 * rest.
 *
 * A `HOBO_HOME` the runner exported is replaced for every file, wherever it
 * points: `$HOME/.hobo`, which the product's docs tell users to export,
 * `$HOME/.local/state/hobo`, or anything else, may be someone's real state.
 * `HOBO_TEST_HOBO_HOME` is the one deliberate way to point a run at a home.
 * The exported one is recorded (`HOBO_TEST_AMBIENT_HOBO_HOME`) so the
 * real-home guard can watch it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Names the run's root for the setup file; workers inherit it from this process. */
export const HOMES_ROOT_ENV = "HOBO_TEST_HOMES";

/**
 * The runner's own HOME, recorded before any setup file moves HOME, so a
 * worker can still tell which `.hobo` is the real one.
 */
export const REAL_HOME_ENV = "HOBO_TEST_REAL_HOME";

/** A HOBO_HOME a run is deliberately pointed at, real home or not. */
export const DELIBERATE_HOME_ENV = "HOBO_TEST_HOBO_HOME";

/**
 * The HOBO_HOME the runner exported, recorded before any setup file replaces
 * it, so the guard watches the home a test would otherwise have written.
 */
export const AMBIENT_HOME_ENV = "HOBO_TEST_AMBIENT_HOBO_HOME";

/**
 * Records, once and before anything moves them, the runner's HOME and the
 * HOBO_HOME it exported, for workers and the guard.
 */
export function recordRealHome(env: NodeJS.ProcessEnv = process.env): void {
	if (!env[REAL_HOME_ENV]?.trim() && env.HOME?.trim())
		env[REAL_HOME_ENV] = env.HOME;
	if (env[AMBIENT_HOME_ENV] === undefined && env.HOBO_HOME?.trim())
		env[AMBIENT_HOME_ENV] = env.HOBO_HOME.trim();
}

export default function setup(): () => void {
	recordRealHome();
	const root = mkdtempSync(join(tmpdir(), "hobo-test-homes-"));
	process.env[HOMES_ROOT_ENV] = root;
	return () => {
		rmSync(root, { recursive: true, force: true });
	};
}
