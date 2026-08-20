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
 * developer debugging against a specific home keeps it.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.HOBO_HOME) {
	process.env.HOBO_HOME = mkdtempSync(join(tmpdir(), "hobo-test-home-"));
}
