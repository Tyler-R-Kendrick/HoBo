/**
 * Stopping ai-bdd's process group (ADR-0172, src/ai-bdd-process.ts): a signal
 * to all of it, SIGKILL to what is left after the grace period, and a typed
 * answer of how the stop ended.
 *
 * Between the two, each poll asks the kernel first, with kill(-pgid, 0), and
 * reads the Linux process table only while the kernel still finds a member: a
 * group that is gone costs no scan. kill(-pgid, 0) finds a zombie as readily
 * as a live process, and a PID 1 or subreaper that never reaps would otherwise
 * hold every stop for the whole grace period: a group the table shows holding
 * only zombies is SIGKILLed at once.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** process.kill's shape; a test passes one that answers as the kernel would. */
export type Kill = (pid: number, signal: NodeJS.Signals | 0) => unknown;

/** What one signal to the group did. */
export type GroupSignal = { readonly kind: "sent" } | { readonly kind: "gone" };

/** What the kernel, then /proc, say of the group between signals. */
export type GroupProbe =
	| { readonly kind: "gone" }
	| { readonly kind: "zombies" }
	| { readonly kind: "live" };

/** How a stop ended. */
export type GroupStop =
	| { readonly kind: "gone" }
	| { readonly kind: "killed" }
	| { readonly kind: "unconfirmed"; readonly reason: string };

/** A process group as a stop sees it: how to signal it, and how to ask what is left of it. */
export interface StopTarget {
	readonly signal: (signal: NodeJS.Signals) => GroupSignal;
	readonly probe: () => GroupProbe;
}

export interface GroupSeams {
	/** process.kill unless set. */
	readonly kill?: Kill;
	/** The process table to read (Linux); without one, a member the kernel finds is live. */
	readonly procRoot?: string;
}

/** Between two probes of a group being stopped. */
export const POLL_MS = 100;

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
 * What the process table at `procRoot` shows of group `pgid`: "zombies" when
 * it shows at least one member and every member it shows is a zombie of one
 * thread (state Z, num_threads 1); "live" otherwise:
 * - a process whose main thread exited while its other threads run shows Z
 *   with num_threads above 1;
 * - a /proc of another PID namespace shows no member, although the kernel
 *   has just found one;
 * - an unreadable /proc shows nothing.
 */
export function scanGroup(pgid: number, procRoot: string): "zombies" | "live" {
	let entries: string[];
	try {
		entries = readdirSync(procRoot);
	} catch {
		return "live";
	}
	let seen = false;
	for (const entry of entries) {
		if (!/^\d+$/u.test(entry)) continue;
		const fields = statFields(procRoot, entry);
		// state is field 3, pgrp field 5 and num_threads field 20 of the line.
		if (fields === undefined || Number(fields[2]) !== pgid) continue;
		seen = true;
		if (fields[0] !== "Z" || Number(fields[17]) !== 1) return "live";
	}
	return seen ? "zombies" : "live";
}

/** `signal` (0 only asks) to every member of group `pgid`. */
function signalPgid(kill: Kill, pgid: number, signal: NodeJS.Signals | 0) {
	try {
		kill(-pgid, signal);
	} catch {
		return { kind: "gone" } as const;
	}
	return { kind: "sent" } as const;
}

/** A process group (POSIX), as ai-bdd's is when it is spawned. */
export interface ProcessGroup {
	readonly pgid: number;
}

/** How a stop signals `group`, and asks what is left of it. */
export function groupTarget(
	{ pgid }: ProcessGroup,
	seams: GroupSeams = {},
): StopTarget {
	const kill = seams.kill ?? process.kill;
	const { procRoot } = seams;
	return {
		signal: (signal) => signalPgid(kill, pgid, signal),
		probe() {
			const asked = signalPgid(kill, pgid, 0);
			if (asked.kind === "gone") return asked;
			if (procRoot === undefined) return { kind: "live" };
			return { kind: scanGroup(pgid, procRoot) };
		},
	};
}

const sleep = (ms: number) =>
	new Promise<void>((done) => {
		setTimeout(done, ms);
	});

/**
 * Stop a group: `signal` to all of it, then SIGKILL to what is left after
 * graceMs, or at once when /proc shows only zombies. Resolves once none of
 * the group is left, or it was killed.
 */
export async function stopGroup(
	target: StopTarget,
	signal: NodeJS.Signals,
	graceMs: number,
): Promise<GroupStop> {
	if (target.signal(signal).kind === "gone") return { kind: "gone" };
	const deadline = Date.now() + graceMs;
	while (Date.now() < deadline) {
		await sleep(POLL_MS);
		const probe = target.probe();
		if (probe.kind === "gone") return { kind: "gone" };
		// The scan can miss a member forked while it ran. The kernel's group signal
		// cannot: it is atomic with fork, it reaches that member, and zombies ignore it.
		if (probe.kind === "zombies") break;
	}
	target.signal("SIGKILL");
	return { kind: "killed" };
}
