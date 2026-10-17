/**
 * What the Linux process table says of a process group, for the poll that
 * stops ai-bdd's group (ADR-0172, src/ai-bdd-process.ts). The poll asks the
 * kernel first, with kill(-pgid, 0), and reads this only while the kernel
 * still finds a member: a group that is gone costs no scan. kill(-pgid, 0)
 * finds a zombie as readily as a live process, and a PID 1 or subreaper that
 * never reaps would otherwise hold every stop for the whole grace period.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The kernel's process table; a test names a directory laid out like it. */
const PROC_ROOT = "/proc";

/**
 * The fields of `<procRoot>/<pid>/stat` after its comm, or undefined once the
 * process is gone. "pid (comm) state ppid pgrp ...": comm may hold spaces and
 * parentheses, so the fields start after the last ")".
 */
function statFields(procRoot: string, pid: string): string[] | undefined {
	let stat: string;
	try {
		stat = readFileSync(join(procRoot, pid, "stat"), "utf8");
	} catch {
		return undefined;
	}
	return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
}

/**
 * Whether the process table at `procRoot` shows group `pgid` as gone: it
 * shows at least one member, and every member it shows is a zombie of one
 * thread (state Z, num_threads 1). Anything else is live, and the stop goes
 * on to SIGKILL:
 * - a process whose main thread exited while its other threads run shows Z
 *   with num_threads above 1;
 * - a /proc of another PID namespace shows no member, although the kernel
 *   has just found one;
 * - an unreadable /proc shows nothing.
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
	let seen = false;
	for (const entry of entries) {
		if (!/^\d+$/u.test(entry)) continue;
		const fields = statFields(procRoot, entry);
		// state is field 3, pgrp field 5 and num_threads field 20 of the line.
		if (fields === undefined || Number(fields[2]) !== pgid) continue;
		seen = true;
		if (fields[0] !== "Z" || Number(fields[17]) !== 1) return false;
	}
	return seen;
}
