/**
 * What the Linux process table says of a process group, for the poll that
 * stops ai-bdd's group (ADR-0172, src/ai-bdd-process.ts). kill(-pgid, 0)
 * finds a zombie as readily as a live process, and a PID 1 or subreaper that
 * never reaps would otherwise hold every stop for the whole grace period.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The kernel's process table; a test names a directory laid out like it. */
const PROC_ROOT = "/proc";

/**
 * Whether the process table at `procRoot` shows group `pgid` holding no
 * process that is not a zombie. Without a readable table it is not gone.
 */
export function procShowsGroupGone(
	pgid: number,
	procRoot: string = PROC_ROOT,
): boolean {
	let entries: string[];
	try {
		entries = readdirSync(procRoot);
	} catch {
		return false;
	}
	return !entries.some((entry) => {
		if (!/^\d+$/u.test(entry)) return false;
		let stat: string;
		try {
			stat = readFileSync(join(procRoot, entry, "stat"), "utf8");
		} catch {
			return false;
		}
		// "pid (comm) state ppid pgrp ...": comm may hold spaces and parentheses.
		const [state, , pgrp] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
		return Number(pgrp) === pgid && state !== "Z";
	});
}
