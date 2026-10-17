/**
 * A person at a terminal sees git's progress while the submodule is fetched,
 * as it arrives: when the script's stderr is a terminal, the visible git gets
 * `--progress` and its stderr is passed on live (a bounded tail is kept for
 * the failure hint). Without a terminal nothing changes: no progress meter,
 * and git's messages are printed once the call returns.
 *
 * The terminal is a real pseudo-terminal, made by `script(1)`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	gitEnv,
	makeRemote,
	makeWork,
	runBootstrap,
	SCRIPT,
	scratch,
} from "./support/pins-support.ts";

const PROGRESS = /Enumerating objects|Counting objects|Receiving objects/u;

describe("git's progress during pins:fetch", () => {
	it("is shown live on a terminal", () => {
		const dir = scratch("progress-tty");
		const remote = makeRemote(dir);
		const work = makeWork(dir, remote, 1);
		const command = `'${process.execPath}' --experimental-strip-types '${SCRIPT}' --root '${work}' --fetch lib`;
		const run = spawnSync("script", ["-qec", command, "/dev/null"], {
			cwd: work,
			encoding: "utf8",
			env: gitEnv({
				NODE_OPTIONS: "",
				NODE_NO_WARNINGS: "1",
				HOME: join(work, ".home"),
				XDG_CACHE_HOME: join(work, ".cache"),
				HOBO_PINS_ALLOW_LOCAL: "1",
				GIT_PROGRESS_DELAY: "0",
			}),
		});
		assert.equal(run.status, 0, run.stdout);
		const lines = run.stdout.replace(/\r/gu, "\n").split("\n");
		const progress = lines.filter((line) => PROGRESS.test(line));
		assert.ok(
			progress.length >= 2,
			`progress lines: ${progress.length}\n${run.stdout}`,
		);
		const cloning = lines.findIndex((line) => line.includes("Cloning into"));
		const checkedOut = lines.findIndex((line) =>
			line.includes("Submodule path 'external/lib': checked out"),
		);
		assert.ok(
			cloning >= 0 && cloning < checkedOut,
			`"Cloning into" comes as it happens, before "checked out":\n${run.stdout}`,
		);
	});

	it("is not shown without a terminal, where git's messages still arrive", () => {
		const dir = scratch("progress-pipe");
		const remote = makeRemote(dir);
		const work = makeWork(dir, remote, 1);
		const run = runBootstrap(work, ["--fetch", "lib"], {
			GIT_PROGRESS_DELAY: "0",
		});
		assert.equal(run.status, 0, run.stderr);
		assert.doesNotMatch(run.stderr, PROGRESS);
		assert.match(run.stderr, /Cloning into/u);
	});
});
