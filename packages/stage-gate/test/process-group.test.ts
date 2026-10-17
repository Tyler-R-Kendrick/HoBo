/**
 * procShowsGroupGone (ADR-0172): when the stop of ai-bdd's group may stop
 * waiting although kill(-pgid, 0) still finds a member. Most cases read a
 * process table laid out in a temp dir; the odd comm reads the real one.
 */
import { spawn } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { procShowsGroupGone } from "../src/process-group.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-process-group-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

const PGID = 4242;

interface Entry {
	readonly pid: number;
	readonly comm: string;
	readonly state: string;
	readonly pgrp: number;
	/** num_threads, field 20. */
	readonly threads: number;
}

/** A /proc/<pid>/stat line as Linux writes it: 52 fields, comm unescaped in parentheses. */
function statLine({ pid, comm, state, pgrp, threads }: Entry): string {
	const flags = "0 -1 4227084 91 0 0 0 0 0 0 0 20 0";
	const rest = `0 414627 0 0 18446744073709551615${" 0".repeat(13)} 17${" 0".repeat(13)}`;
	return `${pid} (${comm}) ${state} 1 ${pgrp} ${pgrp} ${flags} ${threads} ${rest}\n`;
}

let tables = 0;

/** A directory laid out like /proc, holding `entries` and a non-pid entry. */
function table(entries: readonly Entry[]): string {
	tables += 1;
	const root = join(scratch, `proc-${tables}`);
	mkdirSync(join(root, "self"), { recursive: true });
	for (const entry of entries) {
		mkdirSync(join(root, String(entry.pid)));
		writeFileSync(join(root, String(entry.pid), "stat"), statLine(entry));
	}
	return root;
}

const zombie = (pid: number): Entry => ({
	pid,
	comm: "sleep",
	state: "Z",
	pgrp: PGID,
	threads: 1,
});

describe("procShowsGroupGone", () => {
	it("is true for a group whose members are all zombies of one thread", () => {
		expect(procShowsGroupGone(PGID, table([zombie(100), zombie(101)]))).toBe(
			true,
		);
	});

	it("is false while a member whose main thread exited still runs other threads", () => {
		// Linux shows such a thread-group leader as Z, with num_threads above 1.
		const leaderExited = { ...zombie(101), comm: "python3", threads: 2 };
		expect(procShowsGroupGone(PGID, table([zombie(100), leaderExited]))).toBe(
			false,
		);
	});

	it("is false when the table shows no member, as a /proc of another PID namespace does", () => {
		// kill(-pgid, 0) has just found a member: a table that shows none cannot say it is gone.
		const elsewhere = { ...zombie(100), state: "S", pgrp: 7 };
		expect(procShowsGroupGone(PGID, table([elsewhere]))).toBe(false);
		expect(procShowsGroupGone(PGID, table([]))).toBe(false);
	});

	it("is false without a readable table", () => {
		expect(procShowsGroupGone(PGID, join(scratch, "no-such-proc"))).toBe(false);
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
				expect(procShowsGroupGone(pgid)).toBe(false);
			} finally {
				process.kill(-pgid, "SIGKILL");
			}
		},
		20_000,
	);
});

/** The comm and state of a real process, read independently of procShowsGroupGone. */
function stateOf(pid: string): {
	readonly comm: string;
	readonly state: string;
} {
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
