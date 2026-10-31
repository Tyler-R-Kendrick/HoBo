/**
 * Give every test file a throwaway `HOBO_HOME`.
 *
 * Much of this workspace resolves its state directory as
 * `process.env.HOBO_HOME ?? join(HOME, ".hobo")`. A test that calls such an API
 * without passing an explicit `hoboHome` therefore writes into the *developer's
 * own* `~/.hobo` — the same directory a real `hobo-code` session persists chats,
 * auth sessions and evidence to.
 *
 * That was not hypothetical. A clean run of `packages/code`'s suite left 33
 * files under `~/.hobo/durable`, including an auth session written by a test
 * whose whole assertion was that `auth --help` prints a topic-scoped help page.
 *
 * Three things are wrong with that, in increasing order of seriousness:
 *
 *  1. It mutates a directory outside the repository that the developer uses for
 *     real work.
 *  2. State leaks *between test files and between runs*, so a suite can pass on
 *     one machine and fail on another, or pass for the wrong reason — a test
 *     asserting "logged in" may be reading a session an earlier file wrote.
 *  3. It hides real defects: a test that only passes because the ambient home
 *     already had the right shape would fail on a fresh CI image, and nobody
 *     would know until it did.
 *
 * Setting the variable here fixes all three at once, and — unlike fixing each
 * call site — cannot be forgotten by the next test somebody writes. A test that
 * wants its own directory still passes one explicitly; this only decides where
 * an *unset* home points.
 *
 * `HOBO_HOME` is deliberately left alone when the runner already set one, so a
 * developer debugging against a specific home keeps it, unless that home is a
 * real HoBo home or inside one (`$HOME/.hobo`, the account's `~/.hobo`): the
 * product's docs tell users to export exactly that, and a suite run with it
 * would write their real state. Such a home is replaced like an unset one.
 * `HOBO_TEST_HOBO_HOME` points a run at any home on purpose, a real one
 * included.
 *
 * Each file gets a home of its own inside the run's root, which the global
 * setup `test/setup/hobo-test-homes.ts` makes and removes when the run ends.
 * The variable is never unset: a write that outlives its file (a timer, a
 * child, a module that read the home when it loaded) still lands in a
 * directory that exists, inside that root. A home already inside the root is
 * the previous file's in this worker (`isolate: false`) and is replaced; one
 * outside it is the runner's and is kept. Under a config without that global
 * setup, an unset home gets one throwaway directory per worker, as before,
 * and nothing removes it.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import {
	DELIBERATE_HOME_ENV,
	HOMES_ROOT_ENV,
	isInRealHoboHome,
} from "./hobo-test-homes.js";

const root = process.env[HOMES_ROOT_ENV];
const deliberate = process.env[DELIBERATE_HOME_ENV]?.trim()
	? process.env[DELIBERATE_HOME_ENV]
	: undefined;
const runnerHome = process.env.HOBO_HOME?.trim()
	? process.env.HOBO_HOME
	: undefined;
/** The runner's home, unless it is a real one; a real one counts as unset. */
const current =
	runnerHome && !isInRealHoboHome(runnerHome) ? runnerHome : undefined;

/** Whether `dir` is inside the run's root. */
function inRoot(dir: string, homes: string): boolean {
	const path = relative(homes, dir);
	return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

if (deliberate) {
	process.env.HOBO_HOME = deliberate;
} else if (root && (!current || inRoot(current, root))) {
	process.env.HOBO_HOME = mkdtempSync(join(root, "home-"));
} else if (!current) {
	process.env.HOBO_HOME = mkdtempSync(join(tmpdir(), "hobo-test-home-"));
}
