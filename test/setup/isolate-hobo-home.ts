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
 * A `HOBO_HOME` the runner exported is never kept, wherever it points: the
 * product's docs tell users to export `$HOME/.hobo`, and `$HOME/.local/state/hobo`
 * or any other is just as likely to be someone's real state. Each file gets a
 * fresh home either way, and the real-home guard (`packages/code`) watches the
 * one that was replaced. `HOBO_TEST_HOBO_HOME` is the one deliberate override:
 * it points a run at any home, a real one included.
 *
 * Each file gets a home of its own inside the run's root, which the global
 * setup `test/setup/hobo-test-homes.ts` makes and removes when the run ends.
 * The variable is never unset: a write that outlives its file (a timer, a
 * child, a module that read the home when it loaded) still lands in a
 * directory that exists, inside that root. Under a config without that global
 * setup, each file gets a throwaway directory under the temp dir, and nothing
 * removes it.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DELIBERATE_HOME_ENV, HOMES_ROOT_ENV } from "./hobo-test-homes.js";

const root = process.env[HOMES_ROOT_ENV];
const deliberate = process.env[DELIBERATE_HOME_ENV]?.trim();

if (deliberate) {
	process.env.HOBO_HOME = deliberate;
} else {
	process.env.HOBO_HOME = mkdtempSync(
		root ? join(root, "home-") : join(tmpdir(), "hobo-test-home-"),
	);
}
