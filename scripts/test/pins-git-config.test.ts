/**
 * GIT_CONFIG names the file the `git config` command reads when it is given
 * no scope; it configures nothing git does. The pins drop it (as git does for
 * a submodule) and read this clone's configured URL with `--local`, so a
 * GIT_CONFIG pointing elsewhere cannot hide a stale `git submodule init` URL
 * from the refusal that comes before any network call.
 */
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	git,
	makeRemote,
	makeWork,
	runBootstrap,
	scratch,
} from "./support/pins-support.ts";

describe("a stale configured URL with GIT_CONFIG pointing elsewhere", () => {
	it("is still refused by status and by fetch, before anything is cloned", () => {
		const dir = scratch("gitconfig");
		const remote = makeRemote(dir);
		const work = makeWork(dir, remote, 1);
		git(work, ["submodule", "init", "--", "external/lib"]);
		const stale = join(dir, "stale");
		git(dir, ["clone", "-q", "--bare", remote.dir, stale]);
		git(work, ["config", "submodule.external/lib.url", stale]);
		const empty = join(dir, "empty.cfg");
		writeFileSync(empty, "");
		const env = { GIT_CONFIG: empty };
		const status = runBootstrap(work, ["--status", "--offline"], env);
		assert.equal(status.status, 1, status.stdout);
		assert.match(
			status.stdout,
			/this clone's configured URL for external\/lib is .*stale/u,
		);
		const fetch = runBootstrap(work, ["--fetch", "lib"], env);
		assert.equal(fetch.status, 1, `${fetch.stdout}${fetch.stderr}`);
		assert.match(fetch.stderr, /SUBMODULE_STATE: this clone's configured URL/u);
		assert.equal(
			existsSync(join(work, "external/lib/.git")),
			false,
			"nothing was cloned",
		);
	});
});
