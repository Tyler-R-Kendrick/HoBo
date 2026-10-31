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
 * It only looks for new entries: a file that was already there and changed is
 * not reported. It cannot tell who wrote an entry, so a HoBo session, or
 * another checkout's suite without this isolation, writing there during the
 * run fails it too; the chat and session files it names carry the `cwd` of
 * the process that wrote them.
 *
 * A HOBO_HOME the runner set on purpose is not watched: a developer debugging
 * against a real home has chosen to write there.
 */
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { HOMES_ROOT_ENV } from "../../../test/setup/hobo-test-homes.js";

/** What one watched home held: `null` when it did not exist. */
export type HomeSnapshot = ReadonlyMap<string, ReadonlySet<string> | null>;

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/** The real HoBo homes a stray write lands in, for this process's environment. */
export function watchedHomes(env: NodeJS.ProcessEnv = process.env): string[] {
	const candidates = [
		"/tmp/.hobo",
		join(tmpdir(), ".hobo"),
		join(env.HOME && env.HOME.length > 0 ? env.HOME : homedir(), ".hobo"),
		join(userInfo().homedir, ".hobo"),
	].map(canonical);
	const chosen =
		env.HOBO_HOME && env.HOBO_HOME.length > 0
			? canonical(env.HOBO_HOME)
			: undefined;
	return [...new Set(candidates)].filter((dir) => dir !== chosen);
}

/**
 * The paths under one home, relative to it. A subdirectory this user cannot
 * read (another account's `keys/`) leaves the listing at the top level rather
 * than failing the run before a test has started.
 */
function entriesOf(home: string): ReadonlySet<string> {
	try {
		return new Set(readdirSync(home, { recursive: true, encoding: "utf8" }));
	} catch {
		try {
			return new Set(readdirSync(home, { encoding: "utf8" }));
		} catch {
			return new Set();
		}
	}
}

/** Every path under each home, relative to it; `null` for a home that is not there. */
export function snapshotHomes(homes: readonly string[]): HomeSnapshot {
	const snapshot = new Map<string, ReadonlySet<string> | null>();
	for (const home of homes)
		snapshot.set(home, existsSync(home) ? entriesOf(home) : null);
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
		for (const entry of now) {
			if (!was?.has(entry)) gained.push(join(home, entry));
		}
	}
	return gained.sort();
}

/** How many gained paths the failure names before it summarises the rest. */
const LISTED = 20;

export function describeGained(gained: readonly string[]): string {
	const listed = gained.slice(0, LISTED).map((path) => `  ${path}`);
	if (gained.length > LISTED)
		listed.push(`  … and ${gained.length - LISTED} more`);
	return [
		"packages/code tests wrote into a real HoBo home. Give the test its own",
		"hoboHome (or HOME) in a temp dir it removes; these appeared during the run:",
		...listed,
	].join("\n");
}

export default function setup(): () => void {
	const homes = watchedHomes();
	const before = snapshotHomes(homes);
	const root = mkdtempSync(join(tmpdir(), "hobo-code-test-homes-"));
	process.env[HOMES_ROOT_ENV] = root;
	return () => {
		rmSync(root, { recursive: true, force: true });
		const gained = gainedEntries(before, snapshotHomes(homes));
		if (gained.length === 0) return;
		const message = describeGained(gained);
		// Vitest logs a teardown error but keeps the exit status it already had.
		process.exitCode = 1;
		throw new Error(message);
	};
}
