/**
 * `git submodule update` takes `submodule.<name>.url` from every scope git
 * reads: the system and global files, this clone's `.git/config`, and the
 * command line (`git -c`, which reaches a child git as `GIT_CONFIG_COUNT` or
 * `GIT_CONFIG_PARAMETERS`), the command line winning. The stale-URL refusal
 * reads the same set with an unscoped `git config --get`, so a URL from any of
 * them is compared before anything is cloned, and the fix names where it came
 * from. GIT_CONFIG, which would redirect that read to another file, is
 * dropped from the environment (as git does for a submodule).
 */
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	type GitConfig,
	git,
	gitEnv,
	makeRemote,
	makeWork,
	runBootstrap,
	scratch,
} from "./support/pins-support.ts";

interface Source {
	readonly label: string;
	/** Puts the stale URL where this source keeps it; answers how to run the script. */
	readonly arrange: (
		dir: string,
		work: string,
		stale: string,
	) => { env: NodeJS.ProcessEnv; more: GitConfig };
	/** What status says about the URL, and the fix it gives. */
	readonly said: RegExp;
	readonly fix: RegExp;
	/** Does what the fix says, as the user would; answers the command line after it. */
	readonly repair: (work: string, env: NodeJS.ProcessEnv) => GitConfig;
}

const SYNC = (work: string, env: NodeJS.ProcessEnv): GitConfig => {
	git(work, ["submodule", "sync", "--", "external/lib"], gitEnv(env));
	return [];
};

const SOURCES: readonly Source[] = [
	{
		label: "this clone's .git/config, with GIT_CONFIG pointing elsewhere",
		arrange: (dir, work, stale) => {
			git(work, ["submodule", "init", "--", "external/lib"]);
			git(work, ["config", "submodule.external/lib.url", stale]);
			const empty = join(dir, "empty.cfg");
			writeFileSync(empty, "");
			return { env: { GIT_CONFIG: empty }, more: [] };
		},
		said: /this clone's configured URL for external\/lib is .*stale/u,
		fix: /fix: git submodule sync -- external\/lib\n/u,
		repair: SYNC,
	},
	{
		label: "the command line (git -c, GIT_CONFIG_COUNT)",
		arrange: (_dir, _work, stale) => ({
			env: {},
			more: [["submodule.external/lib.url", stale]],
		}),
		said: /the command line \(git -c, GIT_CONFIG_COUNT or GIT_CONFIG_PARAMETERS\) sets the URL for external\/lib to .*stale/u,
		fix: /fix: drop submodule\.external\/lib\.url from git -c, GIT_CONFIG_COUNT or GIT_CONFIG_PARAMETERS/u,
		repair: () => [],
	},
	{
		label: "a global config file (GIT_CONFIG_GLOBAL)",
		arrange: (dir, _work, stale) => {
			const file = join(dir, "global.cfg");
			writeFileSync(file, `[submodule "external/lib"]\n\turl = ${stale}\n`);
			return { env: { GIT_CONFIG_GLOBAL: file }, more: [] };
		},
		said: /the global git config sets the URL for external\/lib to .*stale/u,
		fix: /fix: git submodule sync -- external\/lib {3}\(this clone's URL then overrides it; or: git config --global --unset submodule\.external\/lib\.url\)/u,
		repair: SYNC,
	},
];

describe("a stale submodule URL from any scope git reads", () => {
	for (const { label, arrange, said, fix, repair } of SOURCES) {
		it(`${label}: refused by status and by fetch, before anything is cloned`, () => {
			const dir = scratch("gitconfig");
			const remote = makeRemote(dir);
			const work = makeWork(dir, remote, 1);
			const stale = join(dir, "stale");
			git(dir, ["clone", "-q", "--bare", remote.dir, stale]);
			const { env, more } = arrange(dir, work, stale);
			const status = runBootstrap(work, ["--status", "--offline"], env, more);
			assert.equal(status.status, 1, status.stdout);
			assert.match(status.stdout, said);
			assert.match(status.stdout, fix);
			const fetch = runBootstrap(work, ["--fetch", "lib"], env, more);
			assert.equal(fetch.status, 1, `${fetch.stdout}${fetch.stderr}`);
			assert.match(fetch.stderr, /SUBMODULE_STATE: /u);
			assert.match(fetch.stderr, said);
			assert.equal(
				existsSync(join(work, "external/lib/.git")),
				false,
				"nothing was cloned",
			);
			const fixed = repair(work, env);
			const after = runBootstrap(work, ["--status", "--offline"], env, fixed);
			assert.doesNotMatch(after.stdout, /URL for external\/lib/u, "fixed");
		});
	}
});
