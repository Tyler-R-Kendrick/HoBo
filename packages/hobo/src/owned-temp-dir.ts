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
	on(
		event: NodeJS.Signals,
		listener: (signal: NodeJS.Signals) => void,
	): void;
	off(
		event: NodeJS.Signals,
		listener: (signal: NodeJS.Signals) => void,
	): void;
	listenerCount(event: NodeJS.Signals): number;
	kill(pid: number, signal: NodeJS.Signals): void;
}

/** Make `<TMPDIR>/<prefix>XXXXXX`, removed when `owner` ends; returns its path. */
export function ownedTempDir(
	prefix: string,
	owner: DirOwner = process,
): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	const remove = () => {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// Best effort while the process ends: a throw here would skip the exit listeners after this one.
		}
	};
	const onSignal = (signal: NodeJS.Signals) => {
		if (owner.listenerCount(signal) > 1) return;
		for (const name of ENDING_SIGNALS) owner.off(name, onSignal);
		remove();
		owner.kill(owner.pid, signal);
	};
	owner.on("exit", remove);
	for (const name of ENDING_SIGNALS) owner.on(name, onSignal);
	return dir;
}
