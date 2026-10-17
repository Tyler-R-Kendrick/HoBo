/**
 * `pins:bump <name> <ref>` resolves a tag or a branch whose name looks like a
 * commit id (`beefcafe`, `20241013`) as the tag or branch it is: a short id
 * this clone (or the --reference clone) has comes first, then
 * `refs/tags/<name>^{commit}` on the server, then `refs/heads/<name>`.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	git,
	makeRemote,
	makeWork,
	runBootstrap,
	scratch,
} from "./support/pins-support.ts";

describe("bump to a ref whose name is all hex", () => {
	it("an annotated tag and a branch named like commit ids move the pin", () => {
		const dir = scratch("refs-hex");
		const remote = makeRemote(dir);
		git(remote.dir, [
			"tag",
			"-a",
			"-m",
			"a tag",
			"beefcafe",
			remote.shas[0] ?? "",
		]);
		git(remote.dir, ["branch", "20241013", remote.shas[1] ?? ""]);
		const work = makeWork(dir, remote, 2);
		assert.equal(runBootstrap(work, []).status, 0);
		for (const [ref, want] of [
			["beefcafe", remote.shas[0]],
			["20241013", remote.shas[1]],
		] as const) {
			const run = runBootstrap(work, ["--bump", "lib", ref]);
			assert.equal(run.status, 0, `${ref}: ${run.stdout}${run.stderr}`);
			assert.equal(
				git(join(work, "external/lib"), ["rev-parse", "HEAD"]),
				want,
			);
			assert.match(
				git(work, ["ls-files", "-s", "external/lib"]),
				new RegExp(`^160000 ${want} `, "u"),
			);
		}
	});

	it("an all-hex name that is neither a commit here nor a ref there names the ways out", () => {
		const dir = scratch("refs-none");
		const remote = makeRemote(dir);
		const work = makeWork(dir, remote, 2);
		assert.equal(runBootstrap(work, []).status, 0);
		const run = runBootstrap(work, ["--bump", "lib", "facade42"]);
		assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
		assert.match(
			run.stderr,
			/cannot resolve facade42 to a commit: give a full 40-character id, a branch or a tag/u,
		);
		assert.equal(git(work, ["diff", "--cached", "--name-only"]), "");
	});
});
