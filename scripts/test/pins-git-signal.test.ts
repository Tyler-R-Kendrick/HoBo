/**
 * A git ended by a signal is `128 + its number` and "killed by SIG..." however
 * it was run: directly, under the deadline wrapper (`git()` with a deadline),
 * or streamed (`netGitWatched`). Through the wrapper the signal used to
 * become a plain exit 128, so the same OOM kill read as "exited 128: " there
 * and "killed by SIGKILL" on a direct call. A real exit status is left alone:
 * 129 is git's usage error, not a SIGHUP.
 *
 * A stand-in `git` first on PATH ends itself the way the test says.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { constants } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import {
	git,
	makeRemote,
	makeWork,
	REPO_ROOT,
	runBootstrap,
	scratch,
} from "./support/pins-support.ts";

const REAL_GIT = spawnSync("sh", ["-c", "command -v git"], {
	encoding: "utf8",
}).stdout.trim();

const SIGNALS = ["SIGKILL", "SIGTERM", "SIGSEGV"] as const;

/** A directory holding a `git` that does `STANDIN_ACTION` (`kill:<SIG>` or `exit:<n>`). */
function standIn(dir: string): string {
	const bin = join(dir, "bin");
	mkdirSync(bin);
	writeFileSync(
		join(bin, "git"),
		`#!/bin/sh
case "$STANDIN_ACTION" in
  kill:SIG*) kill -s "\${STANDIN_ACTION#kill:SIG}" $$ ;;
  exit:*) exit "\${STANDIN_ACTION#exit:}" ;;
esac
exec '${REAL_GIT}' "$@"
`,
	);
	chmodSync(join(bin, "git"), 0o755);
	return bin;
}

const lib = (name: string) =>
	JSON.stringify(pathToFileURL(join(REPO_ROOT, "scripts/lib", name)).href);

/** One program: the same stand-in git run directly, under the wrapper, and streamed. */
const PROGRAM = `
const core = await import(${lib("pins-git-core.ts")});
const stream = await import(${lib("pins-git-stream.ts")});
const row = (what, r) => ({ status: r.status, signal: r.signal ?? null, said: core.gitFailure(what, r) });
const direct = core.git(process.cwd(), ["status"]);
const wrapped = core.git(process.cwd(), ["ls-remote", "x"], {}, { ms: 30000, what: "ls-remote" });
const streamed = await stream.netGitWatched(process.cwd(), ["fetch", "x"], { allowLocal: true }, false);
console.log(JSON.stringify({ direct: row("git status", direct), wrapped: row("git ls-remote", wrapped), streamed: row("git fetch", streamed) }));
`;

interface Row {
	readonly status: number;
	readonly signal: string | null;
	readonly said: string;
}

function runAll(
	action: string,
): Record<"direct" | "wrapped" | "streamed", Row> {
	const dir = scratch("signal");
	const run = spawnSync(
		process.execPath,
		["--experimental-strip-types", "--input-type=module", "-e", PROGRAM],
		{
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				NODE_OPTIONS: "",
				NODE_NO_WARNINGS: "1",
				PATH: `${standIn(dir)}:${process.env.PATH ?? ""}`,
				STANDIN_ACTION: action,
			},
		},
	);
	assert.equal(run.status, 0, run.stderr);
	return JSON.parse(run.stdout);
}

describe("a git ended by a signal, however it was run", () => {
	for (const signal of SIGNALS) {
		it(`${signal}: direct, under the deadline wrapper and streamed all say 128 + its number and the signal`, () => {
			const number = constants.signals[signal];
			const rows = runAll(`kill:${signal}`);
			for (const [how, row] of Object.entries(rows)) {
				assert.equal(
					row.status,
					128 + number,
					`${how}: ${JSON.stringify(row)}`,
				);
				assert.equal(row.signal, signal, `${how}: ${JSON.stringify(row)}`);
				assert.match(
					row.said,
					new RegExp(`was killed by ${signal}$`, "u"),
					how,
				);
			}
		});
	}

	for (const code of [3, 128, 129, 137]) {
		it(`exit ${code} is an exit, not a signal, however it was run`, () => {
			const rows = runAll(`exit:${code}`);
			for (const [how, row] of Object.entries(rows)) {
				assert.equal(row.status, code, `${how}: ${JSON.stringify(row)}`);
				assert.equal(row.signal, null, `${how}: ${JSON.stringify(row)}`);
				assert.match(row.said, new RegExp(`exited ${code}:`, "u"), how);
			}
		});
	}
});

describe("a stale-URL read ended by a signal still refuses before any network call", () => {
	for (const signal of SIGNALS) {
		it(`${signal}: status, fetch and setup exit 1 and run no network git`, () => {
			const dir = scratch("signal-e2e");
			const remote = makeRemote(dir);
			const work = makeWork(dir, remote, 1);
			const bin = join(dir, "calls-bin");
			mkdirSync(bin);
			const calls = join(dir, "calls.log");
			writeFileSync(
				join(bin, "git"),
				`#!/bin/sh
echo "$*" >> '${calls}'
case "$*" in *--show-scope*submodule.*.url*) kill -s ${signal.slice(3)} $$ ;; esac
exec '${REAL_GIT}' "$@"
`,
			);
			chmodSync(join(bin, "git"), 0o755);
			const env = { PATH: `${bin}:${process.env.PATH ?? ""}` };
			for (const args of [["--status", "--offline"], ["--fetch", "lib"], []]) {
				const run = runBootstrap(work, args, env);
				assert.equal(
					run.status,
					1,
					`${args.join(" ")}: ${run.stdout}${run.stderr}`,
				);
				assert.match(
					`${run.stdout}${run.stderr}`,
					new RegExp(`git config was killed by ${signal}`, "u"),
				);
			}
			const made = existsSync(calls) ? readFileSync(calls, "utf8") : "";
			assert.doesNotMatch(
				made,
				/protocol\.allow|ls-remote|clone|fetch|submodule update/u,
				"no call that can reach the network",
			);
			assert.equal(existsSync(join(work, "external/lib/.git")), false);
			assert.equal(git(work, ["status", "--porcelain"]).includes("lib"), false);
		});
	}
});
