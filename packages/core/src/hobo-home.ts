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

/**
 * The top-level entries of a user-level HoBo home, and nothing a project's own
 * `.hobo/` holds (`session.json`, `generated/`, `build/`, `sources/`, `data/`,
 * `recordings/`, …). A `.hobo` directory holding only these (dotfiles such as
 * `.DS_Store` aside) is a HoBo home that happens to sit there, not a project:
 * CLI discovery skips it. `test/hobo-home-entries.test.ts` scans every
 * package's sources and fails on a name joined directly under a HoBo home that
 * is missing here, so a new entry is added here when it is added there.
 */
export const HOBO_HOME_ENTRIES: ReadonlySet<string> = new Set([
	"auth-md",
	"broker-runtime.json",
	"claims",
	"connections",
	"durable",
	"evidence",
	"hobo.broker.json",
	"identity-migrations",
	"installed-runtimes.json",
	"keys",
	"oci",
	"profile.json",
	"runtime",
	"sandboxes",
	"stations",
	"tools",
	"trust-roots",
	"workspaces",
	"worktrees",
	"worlds",
	"yard.json",
	"yards",
]);

/** The variables the rule reads. `process.env` fits, and so does `{}`. */
export type HoboHomeEnv = Readonly<Record<string, string | undefined>>;

/**
 * No HoBo home can be named: the environment sets neither `HOBO_HOME` nor
 * `HOME`, and the account has no home either (a uid with no password-database
 * entry, where `os.homedir()` fails). The message says what to set, in place of
 * libuv's `uv_os_homedir returned ENOENT`.
 */
export class HoboHomeUnavailable extends Error {
	readonly code = "HOBO_HOME_UNAVAILABLE";

	constructor(reason: string, options?: { readonly cause?: unknown }) {
		super(`cannot use a HoBo home: ${reason}; set HOBO_HOME or HOME`, options);
		this.name = "HoboHomeUnavailable";
	}
}

/** `HOBO_HOME`, or `<HOME or os.homedir()>/.hobo`. Never a temp directory. */
export function resolveHoboHome(env: HoboHomeEnv = process.env): string {
	const explicit = env.HOBO_HOME;
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const home = env.HOME;
	if (home !== undefined && home.length > 0)
		return join(home, HOBO_HOME_DIRNAME);
	return join(accountHome(), HOBO_HOME_DIRNAME);
}

function accountHome(): string {
	try {
		return homedir();
	} catch (error) {
		throw new HoboHomeUnavailable(
			"HOBO_HOME and HOME are unset and this account has no home directory",
			{ cause: error },
		);
	}
}
