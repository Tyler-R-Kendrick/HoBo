/**
 * The stand-in `kubectl` scripts the transport tests write run as real child
 * processes, and a `port-forward` one stays alive by design, as kubectl's
 * does. The transport kills a forward only when its resource is deleted or it
 * never became ready, so a test that opened one and then ended (passing,
 * failing or timing out) used to leave the child running after the suite, one
 * per test, each holding a loopback port.
 *
 * Every stand-in now starts with `standInPreamble`: it records its pid in its
 * own directory, and exits by itself once its parent is gone (a worker killed
 * mid-test). Each test file's `afterEach` calls `reapStandIns` on the
 * directories it made, which stops every child still running and answers with
 * any that would not stop, so the suite fails rather than leaks.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** How long a stopped child has to exit before it counts as a survivor. */
const REAP_MS = 5_000;

/** JavaScript lines a stand-in runs first, after its shebang. */
export function standInPreamble(dir: string): string[] {
	const pids = JSON.stringify(join(dir, "pids"));
	return [
		"{",
		"  const fs = require('node:fs');",
		`  fs.mkdirSync(${pids}, { recursive: true });`,
		`  fs.writeFileSync(require('node:path').join(${pids}, String(process.pid)), '');`,
		// Orphaned: the parent that would have stopped it is gone.
		"  const parent = process.ppid;",
		"  setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 200).unref();",
		"}",
	];
}

function recordedPids(dir: string): number[] {
	try {
		return readdirSync(join(dir, "pids"))
			.map(Number)
			.filter((pid) => Number.isInteger(pid) && pid > 0);
	} catch {
		return []; // the stand-in never ran
	}
}

/**
 * Whether `pid` is still the stand-in from `dir`, not an exited one's pid
 * taken by an unrelated process: its command line names the stand-in. An
 * exited child not yet reaped has an empty command line, so it is not.
 */
function isStandIn(pid: number, dir: string): boolean {
	if (existsSync("/proc/self")) {
		try {
			return readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(dir);
		} catch {
			return false; // gone
		}
	}
	const ps = spawnSync("ps", ["-o", "args=", "-p", String(pid)], {
		encoding: "utf8",
	});
	return ps.status === 0 && ps.stdout.includes(dir);
}

function stop(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(pid, signal);
	} catch {
		// exited between the check and the signal
	}
}

const pause = (ms: number) =>
	new Promise<void>((done) => {
		setTimeout(done, ms);
	});

/**
 * Stops every stand-in started from `dirs` that is still running: SIGTERM,
 * then, halfway to the deadline, SIGKILL for one that ignored it. Answers
 * with the pids still running once `REAP_MS` has passed, which should always
 * be none.
 */
export async function reapStandIns(dirs: readonly string[]): Promise<number[]> {
	const running = () =>
		dirs.flatMap((dir) =>
			recordedPids(dir).filter((pid) => isStandIn(pid, dir)),
		);
	for (const pid of running()) stop(pid, "SIGTERM");
	const deadline = Date.now() + REAP_MS;
	let left = running();
	while (left.length > 0 && Date.now() < deadline) {
		if (Date.now() > deadline - REAP_MS / 2)
			for (const pid of left) stop(pid, "SIGKILL");
		await pause(50);
		left = running();
	}
	return left;
}
