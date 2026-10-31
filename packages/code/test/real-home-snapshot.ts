/**
 * Snapshots of the homes the real-home guard watches (`real-home-guard.ts`),
 * and what changed between two of them.
 */
import {
	lstatSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	type Stats,
	statSync,
} from "node:fs";
import { isAbsolute, join, relative } from "node:path";

/** One path under a watched home, as the walk found it. */
export interface HomeEntry {
	/** `gone`: listed in its directory, then removed before it could be read. */
	readonly kind: "dir" | "file" | "symlink" | "other" | "gone";
	readonly size: number;
	readonly mtimeMs: number;
	/**
	 * Moves with every write and every `utimes`, so a file overwritten and
	 * given back its size and mtime still differs here.
	 */
	readonly ctimeMs: number;
	/** A file renamed over this one has another inode. */
	readonly ino: number;
	readonly mode: number;
	/** A symlink's target (`readlink`); "" for anything else. */
	readonly target: string;
}

/** What one watched home held, by path relative to it: `null` when it did not exist. */
export type HomeSnapshot = ReadonlyMap<
	string,
	ReadonlyMap<string, HomeEntry> | null
>;

const GONE: HomeEntry = {
	kind: "gone",
	size: 0,
	mtimeMs: 0,
	ctimeMs: 0,
	ino: 0,
	mode: 0,
	target: "",
};

/** The errno code of a filesystem failure, or "" for anything else. */
function errorCode(error: Error): string {
	return "code" in error ? String(error.code) : "";
}

/** `lstat`, or `stat` with `follow`; `null` for a path that is not there. */
function statOrNull(path: string, follow = false): Stats | null {
	try {
		return follow ? statSync(path) : lstatSync(path);
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		const code = errorCode(error);
		if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP")
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
			if (!(error instanceof Error)) throw error;
			const code = errorCode(error);
			if (code === "EACCES" || code === "EPERM") return [];
			if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
			if (!statOrNull(dir, true)?.isDirectory()) return null;
		}
	}
	return null;
}

function kindOf(stats: Stats): HomeEntry["kind"] {
	if (stats.isDirectory()) return "dir";
	if (stats.isFile()) return "file";
	if (stats.isSymbolicLink()) return "symlink";
	return "other";
}

function readlinkOrEmpty(path: string): string {
	try {
		return readlinkSync(path, { encoding: "utf8" });
	} catch {
		return ""; // gone again, or no longer a symlink: the next walk sees which
	}
}

function entryOf(path: string, stats: Stats): HomeEntry {
	const kind = kindOf(stats);
	return {
		kind,
		size: stats.size,
		mtimeMs: stats.mtimeMs,
		ctimeMs: stats.ctimeMs,
		ino: stats.ino,
		mode: stats.mode,
		target: kind === "symlink" ? readlinkOrEmpty(path) : "",
	};
}

/** Whether `dir` is `inside` or one of its ancestors. */
function holds(dir: string, inside: string): boolean {
	const path = relative(dir, inside);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * Every path under `home`, walked one directory at a time. A symlink is an
 * entry of its own, by its target; one to a directory is walked as well, since
 * a write through it lands in the home, but each directory only once (by
 * device and inode), and never one that holds the home itself, so a link back
 * into the home or up to an ancestor ends the walk there.
 */
function walk(home: string): ReadonlyMap<string, HomeEntry> {
	const entries = new Map<string, HomeEntry>();
	const seen = new Set<string>();
	const first = (stats: Stats) => {
		const key = `${stats.dev}:${stats.ino}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	};
	const top = statOrNull(home, true);
	if (top !== null) first(top);
	const throughLink = (path: string): boolean => {
		const target = statOrNull(path, true);
		if (!target?.isDirectory() || !first(target)) return false;
		try {
			return !holds(realpathSync(path), home);
		} catch {
			return false;
		}
	};
	const visit = (relativePath: string) => {
		const names = namesIn(
			relativePath === "" ? home : join(home, relativePath),
		);
		if (names === null) {
			if (relativePath !== "") entries.set(relativePath, GONE);
			return;
		}
		for (const name of names) {
			const path = relativePath === "" ? name : join(relativePath, name);
			const absolute = join(home, path);
			const stats = statOrNull(absolute);
			if (stats === null) {
				entries.set(path, GONE);
				continue;
			}
			entries.set(path, entryOf(absolute, stats));
			if (
				stats.isDirectory()
					? first(stats)
					: stats.isSymbolicLink() && throughLink(absolute)
			)
				visit(path);
		}
	};
	visit("");
	return entries;
}

/** Every path under each home, relative to it; `null` for a home that is not there. */
export function snapshotHomes(homes: readonly string[]): HomeSnapshot {
	const snapshot = new Map<string, ReadonlyMap<string, HomeEntry> | null>();
	for (const home of homes)
		snapshot.set(home, statOrNull(home)?.isDirectory() ? walk(home) : null);
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

/**
 * Whether an entry is not what it was: another kind or inode (replaced), mode
 * (`chmod`), symlink target, or, for anything but a directory, size, mtime or
 * ctime. A directory's own times move with its entries, which are compared on
 * their own.
 */
function differs(old: HomeEntry, now: HomeEntry): boolean {
	if (old.kind !== now.kind || old.ino !== now.ino || old.mode !== now.mode)
		return true;
	if (now.kind === "symlink") return old.target !== now.target;
	if (now.kind === "dir") return false;
	return (
		old.size !== now.size ||
		old.mtimeMs !== now.mtimeMs ||
		old.ctimeMs !== now.ctimeMs
	);
}

/** Entries that were there before and after the run and are not what they were. */
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
			if (differs(old, entry)) changed.push(join(home, path));
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
