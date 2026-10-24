/**
 * A temporary directory a process makes for itself and removes on every way
 * out a handler can reach. The composed binaries keep their throwaway event
 * store in one (`hobo-yard-*`); made by `createDefaultYardRuntime`'s default,
 * it was left in TMPDIR by every run.
 *
 * - A normal end, and an uncaught error, which Node ends through the same
 *   `exit` event: the directory is removed there.
 * - SIGTERM, SIGHUP, SIGINT and SIGQUIT: when nothing else in the process
 *   listens for the signal, the directory is removed and the signal raised
 *   again with these handlers off, so the process still ends by it (status
 *   128+n), as it would have. When something else listens (a server's graceful
 *   stop, installed after this), that handler decides how the process ends, and
 *   the `exit` event removes the directory then.
 *
 * Every directory an owner holds is removed by one set of handlers.
 *
 * What no handler can reach: SIGKILL, and a crash of the process itself.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENDING_SIGNALS: readonly NodeJS.Signals[] = [
	"SIGTERM",
	"SIGHUP",
	"SIGINT",
	"SIGQUIT",
];

/** The part of a process the directory's removal is tied to. `process` is one. */
export interface DirOwner {
	readonly pid: number;
	on(event: "exit", listener: () => void): void;
	on(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
	off(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
	listenerCount(event: NodeJS.Signals): number;
	kill(pid: number, signal: NodeJS.Signals): void;
}

function removeDir(dir: string): void {
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {
		// Best effort while the process ends: a throw here would skip the exit listeners after this one.
	}
}

/**
 * The directories each owner holds, and its one set of handlers. One set, not one
 * per directory: with a handler each, every handler saw the others as "something
 * else listens" and left the signal alone, so a process holding two directories
 * did not end on SIGTERM at all.
 */
const owned = new WeakMap<DirOwner, Set<string>>();

function guard(owner: DirOwner): Set<string> {
	const known = owned.get(owner);
	if (known !== undefined) return known;
	const dirs = new Set<string>();
	owned.set(owner, dirs);
	const removeAll = () => {
		for (const dir of dirs) removeDir(dir);
		dirs.clear();
	};
	const onSignal = (signal: NodeJS.Signals) => {
		if (owner.listenerCount(signal) > 1) return;
		for (const name of ENDING_SIGNALS) owner.off(name, onSignal);
		owned.delete(owner);
		removeAll();
		owner.kill(owner.pid, signal);
	};
	owner.on("exit", removeAll);
	for (const name of ENDING_SIGNALS) owner.on(name, onSignal);
	return dirs;
}

/** Make `<TMPDIR>/<prefix>XXXXXX`, removed when `owner` ends; returns its path. */
export function ownedTempDir(
	prefix: string,
	owner: DirOwner = process,
): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	guard(owner).add(dir);
	return dir;
}
