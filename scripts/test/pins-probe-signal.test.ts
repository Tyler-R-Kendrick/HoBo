/**
 * The throwaway repository the server is asked from (`.probe-*` under the
 * cache root) never outlives the run that made it: SIGINT, SIGTERM and SIGHUP
 * during the probe remove it and end the probe's git, and one a harder kill
 * left is swept, older than an hour, by the next probe (a git-only run, with
 * no asset to download, included). The sweep never follows a link.
 *
 * A `git` on PATH holds the probe's fetch (and only that) until it is
 * signalled, and records its pid: the test signals once the hold has begun.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	lutimesSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	makeRemote,
	makeWork,
	runBootstrap,
	scratch,
	spawnBootstrap,
	waitUntil,
} from "./support/pins-support.ts";

const REAL_GIT = execFileSync("sh", ["-c", "command -v git"], {
	encoding: "utf8",
}).trim();

/** A directory holding a `git` that stalls a fetch run inside a probe repository. */
function holdingGit(dir: string): string {
	const bin = join(dir, "bin");
	mkdirSync(bin);
	writeFileSync(
		join(bin, "git"),
		`#!/bin/sh\ncase "$(pwd)" in */.probe-*) case " $* " in *" fetch "*) echo $$ > "$PROBE_MARK"; exec sleep 30;; esac;; esac\nexec '${REAL_GIT}' "$@"\n`,
		{ mode: 0o755 },
	);
	return bin;
}

function probes(work: string): string[] {
	const cache = join(work, ".cache/siblings");
	return existsSync(cache)
		? readdirSync(cache).filter((name) => name.startsWith(".probe-"))
		: [];
}

/** Gone, or a zombie nobody has reaped yet: either way it is not running. */
function running(pid: number): boolean {
	try {
		process.kill(pid, 0);
	} catch {
		return false;
	}
	try {
		return !/^\d+ \(.*\) Z/u.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
	} catch {
		return false;
	}
}

describe("a signal during the probe leaves no probe repository", () => {
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		it(`${signal} removes it and ends the probe's git`, async () => {
			const dir = scratch("probe-signal");
			const remote = makeRemote(dir);
			// Pinned at a commit that is not the tip, so the server is asked.
			const work = makeWork(dir, remote, 1);
			assert.equal(runBootstrap(work, []).status, 0);
			const mark = join(dir, "probe-git.pid");
			const run = spawnBootstrap(work, ["--status", "--online"], {
				PATH: `${holdingGit(dir)}:${process.env.PATH ?? ""}`,
				PROBE_MARK: mark,
			});
			const pid = await waitUntil("the probe's fetch to begin", () =>
				existsSync(mark) && readFileSync(mark, "utf8").trim() !== ""
					? Number(readFileSync(mark, "utf8"))
					: undefined,
			);
			assert.equal(probes(work).length, 1, "the probe repository exists");
			run.child.kill(signal);
			const ended = await run.done;
			assert.equal(ended.signal, signal, `${ended.stdout}${ended.stderr}`);
			assert.deepEqual(probes(work), [], "no probe repository is left");
			await waitUntil("the probe's git to end", () =>
				running(pid) ? undefined : true,
			);
		});
	}
});

describe("a probe repository a killed run left", () => {
	it("is swept by the next probe when it is older than an hour; a young one and a link are not", () => {
		const dir = scratch("probe-leftover");
		const remote = makeRemote(dir);
		const work = makeWork(dir, remote, 1);
		assert.equal(runBootstrap(work, []).status, 0);
		const cache = join(work, ".cache/siblings");
		mkdirSync(cache, { recursive: true, mode: 0o700 });
		const hours = new Date(Date.now() - 2 * 3_600_000);
		const old = join(cache, ".probe-AbCd12");
		mkdirSync(join(old, "objects"), { recursive: true });
		utimesSync(old, hours, hours);
		const young = join(cache, ".probe-ZyXw98");
		mkdirSync(young);
		const target = join(dir, "not-a-probe");
		mkdirSync(target);
		writeFileSync(join(target, "keep"), "x");
		const link = join(cache, ".probe-LnKk00");
		symlinkSync(target, link);
		lutimesSync(link, hours, hours);
		const run = runBootstrap(work, ["--status", "--online"]);
		assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
		assert.equal(existsSync(old), false, "the two-hour-old one is gone");
		assert.equal(
			existsSync(young),
			true,
			"a young one may be a probe running now",
		);
		assert.equal(existsSync(link), true, "a link is not a probe repository");
		assert.equal(
			existsSync(join(target, "keep")),
			true,
			"and is never followed",
		);
	});
});
