/**
 * Watches the real HoBo homes while a run goes on, for the guard
 * (`real-home-guard.ts`). A file written and removed again during the run, or a
 * home made and removed again, leaves nothing a snapshot after the run can
 * see; a watch hears it happen.
 *
 * Each directory in a home is watched on its own (inotify on Linux), and one
 * that appears is watched as it does: Node's own `recursive` watch on Linux
 * misses a file written and removed in quick succession. A file written into a
 * directory in the instant before that directory's watch starts can still be
 * missed; the directory itself is not. A home that does not exist yet is
 * watched through its parent, for its name only. A symlinked directory is not
 * followed here; the snapshot walks it.
 */
import { type FSWatcher, lstatSync, readdirSync, watch } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface HomeWatch {
	/** Every path an event named during the watch, sorted. */
	touched(): string[];
	/** Homes, or directories in them, that could not be watched, and why. */
	readonly unwatched: readonly string[];
	close(): void;
}

function isDirectory(path: string): boolean {
	try {
		return lstatSync(path).isDirectory();
	} catch {
		return false;
	}
}

function errorCode(error: unknown): string {
	return error instanceof Error && "code" in error ? String(error.code) : "";
}

export function watchHomes(homes: readonly string[]): HomeWatch {
	const touched = new Set<string>();
	const watchers = new Map<string, FSWatcher>();
	const unwatched: string[] = [];
	const heard = (path: string) => {
		touched.add(path);
		if (isDirectory(path)) watchTree(path);
	};
	const watchDirectory = (
		dir: string,
		onName: (name: string) => void,
		key = dir,
	) => {
		if (watchers.has(key)) return;
		try {
			const watcher = watch(
				dir,
				{ persistent: false, encoding: "utf8" },
				(_event, name) => onName(name ?? ""),
			);
			// A watched directory that is removed ends its watch; the parent's
			// watch has already heard the removal.
			watcher.on("error", () => {
				watcher.close();
				watchers.delete(key);
			});
			watchers.set(key, watcher);
		} catch (error) {
			unwatched.push(`${dir} (${errorCode(error) || String(error)})`);
		}
	};
	const watchTree = (dir: string) => {
		watchDirectory(dir, (name) => heard(name === "" ? dir : join(dir, name)));
		let names: string[];
		try {
			names = readdirSync(dir, { encoding: "utf8" });
		} catch {
			return; // gone again, or unreadable: nothing below it to watch
		}
		for (const name of names)
			if (isDirectory(join(dir, name))) watchTree(join(dir, name));
	};
	for (const home of homes) {
		if (isDirectory(home)) {
			watchTree(home);
			continue;
		}
		const name = basename(home);
		const parent = dirname(home);
		if (!isDirectory(parent)) continue;
		watchDirectory(
			parent,
			(entry) => {
				if (entry === name) heard(home);
			},
			`${parent}\0${name}`,
		);
	}
	return {
		touched: () => [...touched].sort(),
		unwatched,
		close: () => {
			for (const watcher of watchers.values()) watcher.close();
			watchers.clear();
		},
	};
}
