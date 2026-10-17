import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const lane = join(root, "scripts/lint-slop-changed.mts");

const scratch: string[] = [];
after(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function emptyDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-slop-lane-"));
	scratch.push(dir);
	return dir;
}

/** A repository with no commits and nothing staged. */
function emptyRepo(): string {
	const dir = emptyDir();
	const init = spawnSync("git", ["init", "--quiet"], { cwd: dir });
	assert.equal(init.status, 0, String(init.stderr));
	return dir;
}

function runLane(cwd: string, flag: string) {
	return spawnSync(
		process.execPath,
		["--experimental-strip-types", "--no-warnings", lane, flag],
		{ cwd, encoding: "utf8" },
	);
}

// The lane is the only anti-slop gate a commit meets, so it must never report
// itself clean for a diff it could not read. It used to: a git failure became
// an empty file list, and the lane printed "ok". Nothing here reaches oxlint;
// every case is decided by whether git could list the changed files.
describe("lint:slop:changed when git cannot list the changed files", () => {
	it("fails, naming the base, when the base does not resolve", () => {
		const result = runLane(emptyRepo(), "--base=origin/no-such-branch");
		assert.equal(result.status, 2, result.stdout + result.stderr);
		assert.match(
			result.stderr,
			/could not diff against origin\/no-such-branch/u,
		);
		assert.doesNotMatch(result.stdout, /^ok /mu);
	});

	it("fails outside a git work tree", () => {
		const result = runLane(emptyDir(), "--staged");
		assert.equal(result.status, 2, result.stdout + result.stderr);
		assert.match(result.stderr, /could not list the staged files/u);
	});

	it("still passes an empty but readable diff", () => {
		// The control: nothing staged in a real repository is a genuine "nothing
		// to lint", not a failure to look.
		const result = runLane(emptyRepo(), "--staged");
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /no changed lintable files/u);
	});
});
