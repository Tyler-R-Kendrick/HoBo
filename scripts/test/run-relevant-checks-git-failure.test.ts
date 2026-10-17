import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const runner = join(root, "scripts/run-relevant-checks.ts");
// The runner imports `./relevant-check-policy.js`, which only tsx maps to the
// `.ts` source. Resolved here, because `--import tsx` would resolve from the
// scratch directory the runner is started in.
const tsx = import.meta.resolve("tsx");

const scratch: string[] = [];
after(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function emptyDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-agent-check-"));
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

function runChecks(cwd: string, flag: string) {
	return spawnSync(process.execPath, ["--import", tsx, runner, flag], {
		cwd,
		encoding: "utf8",
	});
}

// `agent:check` chooses every gate from the changed-file list, so a list it
// could not read must stop it. It used to read a git failure as "no changed
// files", print "ok", and run nothing. Every case here ends before a check runs.
describe("agent:check when git cannot list the changed files", () => {
	it("fails, naming the base, when the base does not resolve", () => {
		const result = runChecks(emptyRepo(), "--base=origin/no-such-branch");
		assert.equal(result.status, 2, result.stdout + result.stderr);
		assert.match(
			result.stderr,
			/could not diff against origin\/no-such-branch/u,
		);
		assert.doesNotMatch(result.stdout, /^ok /mu);
	});

	it("fails outside a git work tree", () => {
		const result = runChecks(emptyDir(), "--staged");
		assert.equal(result.status, 2, result.stdout + result.stderr);
		assert.match(result.stderr, /could not list the staged files/u);
	});

	it("still reports an empty but readable diff as nothing to check", () => {
		// The control: nothing staged in a real repository is a genuine empty
		// scope, not a failure to look.
		const result = runChecks(emptyRepo(), "--staged");
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /nothing to validate for this scope/u);
	});
});
