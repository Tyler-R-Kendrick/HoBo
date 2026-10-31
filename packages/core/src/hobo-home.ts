/**
 * Where HoBo keeps a user's own state: auth sessions, evidence, chats,
 * stations, downloaded tools. One rule, used by every package that needs it:
 *
 *   `HOBO_HOME` when it is set and non-empty, else `.hobo` in the user's home
 *   directory — `HOME` from the given environment, or `os.homedir()` when that
 *   environment names none.
 *
 * There is deliberately no temp-directory fallback. `/tmp` is world-writable:
 * another local user can create `/tmp/.hobo` before HoBo does, own it, and
 * then read or replace every auth session and evidence file written into it.
 * An environment without `HOME` (a test's `env: {}`, a stripped child
 * environment) still belongs to a user, so it falls back to `os.homedir()`:
 * the process's own `HOME`, or the account's home from the password database
 * when the process has none.
 *
 * Node-only (it reads `os.homedir()`), so it is the `@hobo/core/hobo-home`
 * subpath rather than part of the portable root export. Pure: it reads the
 * environment and the account, and touches no file.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** The directory name under the user's home that holds HoBo's state. */
export const HOBO_HOME_DIRNAME = ".hobo";

/** The variables the rule reads. `process.env` fits, and so does `{}`. */
export type HoboHomeEnv = Readonly<Record<string, string | undefined>>;

/** `HOBO_HOME`, or `<HOME or os.homedir()>/.hobo`. Never a temp directory. */
export function resolveHoboHome(env: HoboHomeEnv = process.env): string {
	const explicit = env.HOBO_HOME;
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const home = env.HOME;
	return join(
		home !== undefined && home.length > 0 ? home : homedir(),
		HOBO_HOME_DIRNAME,
	);
}
