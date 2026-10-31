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
 * subpath rather than part of the portable root export. `resolveHoboHome` is
 * pure: it reads the environment and the account, and touches no file.
 * `prepareHoboHome` is what an entry point calls before it writes: it creates
 * the home, says so clearly when it cannot, and tells a user whose state an
 * earlier HoBo left in a temp directory where it lives now.
 */
import {
	lstatSync,
	mkdirSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

	constructor(
		reason: string,
		options: { readonly cause?: unknown; readonly remedy?: string } = {},
	) {
		super(
			`cannot use a HoBo home: ${reason}; ${options.remedy ?? "set HOBO_HOME or HOME"}`,
			options.cause === undefined ? undefined : { cause: options.cause },
		);
		this.name = "HoboHomeUnavailable";
	}
}

/** Asks the system for the account's home: `os.homedir()` unless a caller supplies one. */
export type AccountHome = () => string;

/**
 * `HOBO_HOME`, or `<HOME or os.homedir()>/.hobo`. Never a temp directory. An
 * empty or blank (whitespace-only) value counts as unset: `HOBO_HOME= hobo …`
 * is how a shell unsets it for one command. `account` is how the account's
 * home is asked for when the environment names none.
 */
export function resolveHoboHome(
	env: HoboHomeEnv = process.env,
	account: AccountHome = homedir,
): string {
	const explicit = env.HOBO_HOME;
	if (isSet(explicit)) return explicit;
	const home = env.HOME;
	if (isSet(home)) return join(home, HOBO_HOME_DIRNAME);
	return join(accountHome(account), HOBO_HOME_DIRNAME);
}

function isSet(value: string | undefined): value is string {
	return value !== undefined && value.trim().length > 0;
}

function accountHome(account: AccountHome): string {
	try {
		return account();
	} catch (error) {
		throw new HoboHomeUnavailable(
			"HOBO_HOME and HOME are unset and this account has no home directory",
			{ cause: error },
		);
	}
}

/** The temp-directory homes earlier HoBo versions fell back to without HOME. */
export function legacyHoboHomes(): readonly string[] {
	return [...new Set(["/tmp/.hobo", join(tmpdir(), HOBO_HOME_DIRNAME)])];
}

/**
 * The marker a home keeps once it has told its user about a legacy home. A
 * dotfile, so CLI discovery still classifies the home by its other entries.
 */
export const LEGACY_NOTICE_MARKER = ".legacy-home-notice";

export interface PrepareHoboHomeOptions {
	readonly env?: HoboHomeEnv;
	/** Where the one-time notice goes, a line at a time; stderr by default. */
	readonly warn?: (line: string) => void;
	/** The uid whose legacy home counts; `process.getuid()` by default. */
	readonly uid?: number;
	/** The legacy homes to look for; `legacyHoboHomes()` by default. */
	readonly legacyHomes?: readonly string[];
}

/**
 * Resolve and create the HoBo home, for an entry point about to write to it.
 *
 * - The home is created (mode 0700) here, so a home that cannot be made
 *   fails with `HoboHomeUnavailable` naming the path and `HOBO_HOME`, not
 *   with libuv's EACCES from whichever write came first. That is the account
 *   `nobody`, whose passwd home is `/nonexistent`.
 * - Earlier versions fell back to `/tmp/.hobo` or `$(os.tmpdir())/.hobo` when
 *   HOME was unset. That state is never read now. When such a directory
 *   exists, belongs to this uid, is not a symlink and is not the resolved home,
 *   the user is told once where state lives now and how to bring it along;
 *   a dotfile marker in the new home records that the notice was shown. Only
 *   when HOBO_HOME is unset: the fallback never applied to a user who set it.
 */
export function prepareHoboHome(options: PrepareHoboHomeOptions = {}): string {
	const env = options.env ?? process.env;
	const home = resolveHoboHome(env);
	try {
		mkdirSync(home, { recursive: true, mode: 0o700 });
	} catch (error) {
		const code = error instanceof Error && "code" in error ? error.code : "";
		throw new HoboHomeUnavailable(
			`cannot create ${home} (${String(code) || String(error)})`,
			{ cause: error, remedy: "set HOBO_HOME to a directory you can write" },
		);
	}
	if (!isSet(env.HOBO_HOME)) noticeLegacyHomes(home, options);
	return home;
}

function noticeLegacyHomes(home: string, options: PrepareHoboHomeOptions) {
	const marker = join(home, LEGACY_NOTICE_MARKER);
	if (existsQuietly(marker)) return;
	const uid = options.uid ?? process.getuid?.();
	const ours = (options.legacyHomes ?? legacyHoboHomes()).filter((legacy) =>
		isOwnLegacyHome(legacy, home, uid),
	);
	if (ours.length === 0) return;
	const warn =
		options.warn ?? ((line: string) => process.stderr.write(`${line}\n`));
	for (const legacy of ours) {
		warn(
			`hobo: HoBo state now lives in ${home}. ${legacy} holds state an earlier HoBo kept there when HOME was unset, and it is no longer read. To keep it, move its contents into ${home}, or set HOBO_HOME=${legacy} to go on using it (a temp directory is a riskier home).`,
		);
	}
	writeFileSync(marker, `${ours.join("\n")}\n`, { mode: 0o600 });
}

function existsQuietly(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

/** A real directory (not a symlink) this uid owns, other than the home itself. */
function isOwnLegacyHome(
	legacy: string,
	home: string,
	uid: number | undefined,
): boolean {
	let stats: ReturnType<typeof lstatSync>;
	try {
		stats = lstatSync(legacy);
	} catch {
		return false;
	}
	if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
	if (uid !== undefined && stats.uid !== uid) return false;
	return canonical(legacy) !== canonical(home);
}

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}
