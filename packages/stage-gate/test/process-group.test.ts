/**
 * scanGroup (ADR-0172): what the process table shows of ai-bdd's group once
 * kill(-pgid, 0) has found a member. Most cases read a process table laid out
 * in a temp dir; the odd comm reads the real one.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { scanGroup } from "../src/process-group.js";
import { PGID, procTables, zombie } from "./helpers/proc-table.js";

const tables = procTables();
afterAll(tables.remove);
const { table } = tables;
const scratch = tables.dir;

describe("scanGroup", () => {
	it("is zombies for a group whose members are all zombies of one thread", () => {
		expect(scanGroup(PGID, table([zombie(100), zombie(101)]))).toBe("zombies");
	});

	it("is live while a member whose main thread exited still runs other threads", () => {
		// Linux shows such a thread-group leader as Z, with num_threads above 1.
		const leaderExited = { ...zombie(101), comm: "python3", threads: 2 };
		expect(scanGroup(PGID, table([zombie(100), leaderExited]))).toBe("live");
	});

	it("is live when the table shows no member, as a /proc of another PID namespace does", () => {
		// kill(-pgid, 0) has just found a member: a table that shows none cannot say it is gone.
		const elsewhere = { ...zombie(100), state: "S", pgrp: 7 };
		expect(scanGroup(PGID, table([elsewhere]))).toBe("live");
		expect(scanGroup(PGID, table([]))).toBe("live");
	});

	it("is live when an entry's stat cannot be read for a reason other than its process being gone", () => {
		// EISDIR here; EACCES under hidepid=1 for another user's process, EMFILE at the fd limit.
		// Such an entry may be a member the scan cannot see, so beside a zombie it is not a group of zombies.
		const root = table([zombie(100)]);
		mkdirSync(join(root, "101", "stat"), { recursive: true });
		expect(scanGroup(PGID, root)).toBe("live");
	});

	it("is live without a readable table", () => {
		expect(scanGroup(PGID, join(scratch, "no-such-proc"))).toBe("live");
	});

	it.runIf(process.platform === "linux")(
		"reads the fields after the last ')': a live process named 'a) Z 1 2 (b' beside a zombie is live",
		async () => {
			// comm is the basename of the file exec'd. The process this starts leads a group
			// of its own (detached), and never reaps the `sleep 0` it started first.
			const named = join(scratch, "a) Z 1 2 (b");
			symlinkSync(process.execPath, named);
			const leader = spawn(
				"sh",
				[
					"-c",
					'sleep 0 & echo $!; exec "$0" -e "setTimeout(() => {}, 20000)"',
					named,
				],
				{ detached: true, stdio: ["ignore", "pipe", "ignore"] },
			);
			const pgid = leader.pid ?? 0;
			try {
				const zombiePid = await new Promise<string>((done) => {
					leader.stdout.once("data", (chunk: Buffer) =>
						done(chunk.toString("utf8").trim()),
					);
				});
				const ready = () =>
					stateOf(String(pgid)).comm === "a) Z 1 2 (b" &&
					stateOf(zombiePid).state === "Z";
				for (let tries = 0; tries < 50 && !ready(); tries += 1) {
					await new Promise((done) => setTimeout(done, 100));
				}
				expect(ready()).toBe(true);
				expect(scanGroup(pgid, "/proc")).toBe("live");
			} finally {
				process.kill(-pgid, "SIGKILL");
			}
		},
		20_000,
	);
});

interface ProcState {
	readonly comm: string;
	readonly state: string;
}

/** The comm and state of a real process, read independently of scanGroup. */
function stateOf(pid: string): ProcState {
	let stat: string;
	try {
		stat = readFileSync(`/proc/${pid}/stat`, "utf8");
	} catch {
		return { comm: "", state: "" };
	}
	const close = stat.lastIndexOf(")");
	return {
		comm: stat.slice(stat.indexOf("(") + 1, close),
		state: stat.slice(close + 2, close + 3),
	};
}
