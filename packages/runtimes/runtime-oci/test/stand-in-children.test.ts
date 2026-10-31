/**
 * The reaping the port-forward tests rely on (`stand-in-children.ts`): a
 * stand-in that stays alive is stopped, and one whose parent is gone stops by
 * itself.
 */
import { spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { reapStandIns, standInPreamble } from "./stand-in-children.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-stand-in-reap-"));
const dirs: string[] = [];
afterAll(async () => {
	await reapStandIns(dirs);
	rmSync(scratch, { recursive: true, force: true });
});

/** A stand-in that never exits on its own, as a port-forward does. */
function longLived() {
	const dir = join(scratch, `stand-in-${dirs.length + 1}`);
	mkdirSync(dir, { recursive: true });
	dirs.push(dir);
	const bin = join(dir, "kubectl");
	writeFileSync(
		bin,
		[
			"#!/usr/bin/env node",
			...standInPreamble(dir),
			"setInterval(() => {}, 1000);",
		].join("\n"),
		{ mode: 0o755 },
	);
	chmodSync(bin, 0o755);
	return { dir, bin };
}

const pause = (ms: number) =>
	new Promise<void>((done) => {
		setTimeout(done, ms);
	});

/** Waits until the stand-in in `dir` has recorded its pid. */
async function started(dir: string): Promise<number> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const pids = existsSync(join(dir, "pids"))
			? readdirSync(join(dir, "pids"))
			: [];
		if (pids.length > 0) return Number(pids[0]);
		await pause(25);
	}
	throw new Error(`stand-in in ${dir} never started`);
}

/** Whether `pid` runs; an exited child its new parent has not reaped yet does not. */
function alive(pid: number): boolean {
	if (existsSync("/proc/self")) {
		try {
			const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
			return (
				stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z"
			);
		} catch {
			return false;
		}
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe("reaping stand-ins", () => {
	it("stops one that would run forever, and reports none left", async () => {
		const { dir, bin } = longLived();
		const child = spawn(process.execPath, [bin, "port-forward"], {
			stdio: "ignore",
		});
		const exited = new Promise((done) => child.once("exit", done));
		const pid = await started(dir);
		expect(alive(pid)).toBe(true);
		expect(await reapStandIns([dir])).toEqual([]);
		await exited;
		expect(alive(pid)).toBe(false);
	});

	it("a stand-in whose parent is gone stops by itself", async () => {
		// A worker killed mid-test runs no afterEach; its children must not
		// outlive it.
		const { dir, bin } = longLived();
		const parent = spawn(
			process.execPath,
			[
				"-e",
				`require("node:child_process").spawn(process.execPath, [${JSON.stringify(bin)}], { stdio: "ignore" }).unref(); setTimeout(() => process.exit(0), 500);`,
			],
			{ stdio: "ignore" },
		);
		const pid = await started(dir);
		await new Promise((done) => parent.once("exit", done));
		for (let attempt = 0; attempt < 100 && alive(pid); attempt += 1)
			await pause(50);
		expect(alive(pid)).toBe(false);
	});

	it("leaves nothing to reap where no stand-in ran", async () => {
		expect(await reapStandIns([join(scratch, "never-made")])).toEqual([]);
	});
});
