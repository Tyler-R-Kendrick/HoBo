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
 * A `HOBO_HOME` the runner set is left alone, and then no root is made, unless
 * it is (or is inside) a real HoBo home: `$HOME/.hobo` or the account's
 * `~/.hobo`, which the product's own docs tell users to export. A test never
 * runs against one of those; `HOBO_TEST_HOBO_HOME` is the deliberate way to
 * point a run at a real home.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Names the run's root for the setup file; workers inherit it from this process. */
export const HOMES_ROOT_ENV = "HOBO_TEST_HOMES";

/**
 * The runner's own HOME, recorded before any setup file moves HOME, so a
 * worker can still tell which `.hobo` is the real one.
 */
export const REAL_HOME_ENV = "HOBO_TEST_REAL_HOME";

/** A HOBO_HOME a run is deliberately pointed at, real home or not. */
export const DELIBERATE_HOME_ENV = "HOBO_TEST_HOBO_HOME";

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function accountHome(): string | undefined {
	try {
		return userInfo().homedir || undefined;
	} catch {
		return undefined; // a uid with no passwd entry has no account home
	}
}

/** Records the runner's HOME for workers, once, before anything moves it. */
export function recordRealHome(env: NodeJS.ProcessEnv = process.env): void {
	if (!env[REAL_HOME_ENV]?.trim() && env.HOME?.trim())
		env[REAL_HOME_ENV] = env.HOME;
}

/** The real HoBo homes: the runner's `$HOME/.hobo` and the account's `~/.hobo`. */
export function realHoboHomes(env: NodeJS.ProcessEnv = process.env): string[] {
	const homes = [env[REAL_HOME_ENV]?.trim() ? env[REAL_HOME_ENV] : env.HOME];
	homes.push(accountHome());
	return [
		...new Set(
			homes
				.filter((home): home is string => Boolean(home?.trim()))
				.map((home) => canonical(join(home, ".hobo"))),
		),
	];
}

/** Whether `dir` is a real HoBo home or inside one. */
export function isInRealHoboHome(
	dir: string,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	const target = canonical(dir);
	return realHoboHomes(env).some((home) => {
		const path = relative(home, target);
		return path === "" || (!path.startsWith("..") && !isAbsolute(path));
	});
}

export default function setup(): (() => void) | undefined {
	recordRealHome();
	const runnerHome = process.env.HOBO_HOME;
	if (runnerHome && !isInRealHoboHome(runnerHome)) return undefined;
	const root = mkdtempSync(join(tmpdir(), "hobo-test-homes-"));
	process.env[HOMES_ROOT_ENV] = root;
	return () => {
		rmSync(root, { recursive: true, force: true });
	};
}
