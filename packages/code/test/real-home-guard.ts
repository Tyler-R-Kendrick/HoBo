/**
 * Global setup for this package's suite: one root for every throwaway home,
 * and a guard that fails the run when anything was written into a real one.
 *
 * `test/isolate-user-home.ts` and the root's `test/setup/isolate-hobo-home.ts`
 * point HOME and HOBO_HOME at directories inside the root this makes, so an
 * in-process call that omits its home lands there. That cannot reach a child
 * process started with an environment of its own, or a path built from a
 * literal. The guard covers both: before the run it lists what is already in
 * each real HoBo home, and after the run it names whatever appeared.
 *
 * The homes it watches are the ones a stray write lands in:
 *  - `/tmp/.hobo` and `<os.tmpdir()>/.hobo`, the old fallbacks for an
 *    environment with no HOME;
 *  - `<HOME>/.hobo` for the HOME this run was started with, and
 *    `<account home>/.hobo` for a child whose environment names no HOME.
 *
 * They may already hold a developer's own state, and on a shared machine they
 * may hold evidence of an earlier leak, so the guard compares against what was
 * there when the run started and never requires them to be absent or empty.
 * It walks each home one directory at a time: a directory a live session
 * removed between being listed and being read is listed again if it is back
 * and recorded as gone if not, so one vanished `sandboxes/<runId>` never turns
 * the rest of the home into "new" entries. It still reports any entry that was
 * not there when its first walk passed.
 * It reports entries that appeared, files whose size or modification time
 * changed (a directory's own mtime moves with its entries, so only those are
 * reported), and entries that were removed. It cannot tell who wrote an
 * entry, so a HoBo session, or
 * another checkout's suite without this isolation, writing there during the
 * run fails it too; the chat and session files it names carry the `cwd` of
 * the process that wrote them.
 *
 * The account's home and the runner's real HOME are watched whatever
 * HOBO_HOME says: a runner that exports `HOBO_HOME=$HOME/.hobo`, as the
 * product's docs suggest, gets a throwaway home per file anyway
 * (`test/setup/isolate-hobo-home.ts`), and a write into the real one still
 * fails the run. `HOBO_TEST_HOBO_HOME` is the deliberate way to run against a
 * real home, and the guard reports what that run wrote there.
 */
import {
	lstatSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	type Stats,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import {
	HOMES_ROOT_ENV,
	REAL_HOME_ENV,
	recordRealHome,
} from "../../../test/setup/hobo-test-homes.js";

/** One path under a watched home, as the walk found it. */
export interface HomeEntry {
	/** `gone`: listed in its directory, then removed before it could be read. */
	readonly kind: "dir" | "file" | "other" | "gone";
	readonly size: number;
	readonly mtimeMs: number;
}

/** What one watched home held, by path relative to it: `null` when it did not exist. */
export type HomeSnapshot = ReadonlyMap<
	string,
	ReadonlyMap<string, HomeEntry> | null
>;

const GONE: HomeEntry = { kind: "gone", size: 0, mtimeMs: 0 };

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/**
 * The account's home from the password database, or none: a uid with no
 * passwd entry (a container's `--user 4242`) has no account home to watch
 * beyond HOME, and `os.userInfo()` throws for it.
 */
function accountHome(): string | undefined {
	try {
		return userInfo().homedir || undefined;
	} catch {
		return undefined;
	}
}

/** The real HoBo homes a stray write lands in, for this process's environment. */
export function watchedHomes(env: NodeJS.ProcessEnv = process.env): string[] {
	const account = accountHome();
	const recorded = env[REAL_HOME_ENV]?.trim() ? env[REAL_HOME_ENV] : undefined;
	const home = recorded ?? (env.HOME?.trim() ? env.HOME : account);
	const candidates = [
		"/tmp/.hobo",
		join(tmpdir(), ".hobo"),
		...(home ? [join(home, ".hobo")] : []),
		...(account ? [join(account, ".hobo")] : []),
	].map(canonical);
	return [...new Set(candidates)];
}

function errorCode(error: unknown): string {
	return error instanceof Error && "code" in error ? String(error.code) : "";
}

function lstatOrNull(path: string): Stats | null {
	try {
		return lstatSync(path);
	} catch (error) {
		if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR")
			return null;
		throw error;
	}
}

/** How often a directory that vanished mid-walk is listed again if it is back. */
const RELISTS = 5;

/**
 * A directory's names, or `null` when it is gone. A live HoBo session removes
 * and recreates directories (`sandboxes/<runId>`) while the guard walks; one
 * that vanished between being listed and being read is listed again if it is
 * a directory again, and otherwise reported gone. A directory this user cannot
 * read lists as empty, before the run and after it alike, so nothing below it
 * is seen; the walk never falls back to a coarser listing of anything else.
 */
function namesIn(dir: string): string[] | null {
	for (let attempt = 0; attempt <= RELISTS; attempt += 1) {
		try {
			return readdirSync(dir, { encoding: "utf8" }).sort();
		} catch (error) {
			const code = errorCode(error);
			if (code === "EACCES" || code === "EPERM") return [];
			if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
			if (!lstatOrNull(dir)?.isDirectory()) return null;
		}
	}
	return null;
}

function kindOf(stats: Stats): HomeEntry["kind"] {
	if (stats.isDirectory()) return "dir";
	if (stats.isFile()) return "file";
	return "other";
}

function entryOf(stats: Stats): HomeEntry {
	return { kind: kindOf(stats), size: stats.size, mtimeMs: stats.mtimeMs };
}

/** Every path under `home`, walked one directory at a time. */
function walk(home: string): ReadonlyMap<string, HomeEntry> {
	const entries = new Map<string, HomeEntry>();
	const visit = (relative: string) => {
		const names = namesIn(relative === "" ? home : join(home, relative));
		if (names === null) {
			if (relative !== "") entries.set(relative, GONE);
			return;
		}
		for (const name of names) {
			const path = relative === "" ? name : join(relative, name);
			const stats = lstatOrNull(join(home, path));
			if (stats === null) {
				entries.set(path, GONE);
				continue;
			}
			entries.set(path, entryOf(stats));
			if (stats.isDirectory()) visit(path);
		}
	};
	visit("");
	return entries;
}

/** Every path under each home, relative to it; `null` for a home that is not there. */
export function snapshotHomes(homes: readonly string[]): HomeSnapshot {
	const snapshot = new Map<string, ReadonlyMap<string, HomeEntry> | null>();
	for (const home of homes)
		snapshot.set(home, lstatOrNull(home)?.isDirectory() ? walk(home) : null);
	return snapshot;
}

/** The paths that appeared between two snapshots of the same homes. */
export function gainedEntries(
	before: HomeSnapshot,
	after: HomeSnapshot,
): string[] {
	const gained: string[] = [];
	for (const [home, now] of after) {
		if (now === null) continue;
		const was = before.get(home) ?? null;
		if (was === null) gained.push(home);
		// An entry the first walk saw listed counts as there, though it was gone
		// before the walk could read it.
		for (const path of now.keys()) {
			if (!was?.has(path)) gained.push(join(home, path));
		}
	}
	return gained.sort();
}

/** Files whose size or modification time changed, or that changed kind. */
export function changedEntries(
	before: HomeSnapshot,
	after: HomeSnapshot,
): string[] {
	const changed: string[] = [];
	for (const [home, now] of after) {
		const was = before.get(home) ?? null;
		if (now === null || was === null) continue;
		for (const [path, entry] of now) {
			const old = was.get(path);
			if (old === undefined || old.kind === "gone" || entry.kind === "gone")
				continue;
			const kindChanged = old.kind !== entry.kind;
			const fileChanged =
				entry.kind === "file" &&
				(old.size !== entry.size || old.mtimeMs !== entry.mtimeMs);
			if (kindChanged || fileChanged) changed.push(join(home, path));
		}
	}
	return changed.sort();
}

/** Paths that were there before the run and are not after it (a home included). */
export function removedEntries(
	before: HomeSnapshot,
	after: HomeSnapshot,
): string[] {
	const removed: string[] = [];
	for (const [home, was] of before) {
		if (was === null) continue;
		const now = after.get(home) ?? null;
		if (now === null) {
			removed.push(home);
			continue;
		}
		for (const [path, entry] of was) {
			if (entry.kind !== "gone" && !now.has(path))
				removed.push(join(home, path));
		}
	}
	return removed.sort();
}

/** How many paths of each kind the failure names before it summarises the rest. */
const LISTED = 20;

function section(title: string, paths: readonly string[]): string[] {
	if (paths.length === 0) return [];
	const listed = paths.slice(0, LISTED).map((path) => `  ${path}`);
	if (paths.length > LISTED)
		listed.push(`  … and ${paths.length - LISTED} more`);
	return [`${title}:`, ...listed];
}

export function describeChanges(changes: {
	readonly gained: readonly string[];
	readonly changed: readonly string[];
	readonly removed: readonly string[];
}): string {
	return [
		"packages/code tests wrote into a real HoBo home. Give the test its own",
		"hoboHome (or HOME) in a temp dir it removes. During the run:",
		...section("appeared", changes.gained),
		...section("changed", changes.changed),
		...section("removed", changes.removed),
	].join("\n");
}

export default function setup(): () => void {
	recordRealHome();
	const homes = watchedHomes();
	const before = snapshotHomes(homes);
	const root = mkdtempSync(join(tmpdir(), "hobo-code-test-homes-"));
	process.env[HOMES_ROOT_ENV] = root;
	return () => {
		rmSync(root, { recursive: true, force: true });
		const after = snapshotHomes(homes);
		const changes = {
			gained: gainedEntries(before, after),
			changed: changedEntries(before, after),
			removed: removedEntries(before, after),
		};
		if (
			changes.gained.length +
				changes.changed.length +
				changes.removed.length ===
			0
		)
			return;
		// Vitest logs a teardown error but keeps the exit status it already had.
		process.exitCode = 1;
		throw new Error(describeChanges(changes));
	};
}
