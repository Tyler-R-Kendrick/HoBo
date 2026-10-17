/**
 * The suite must not write into the developer's real HoBo home.
 *
 * Much of this workspace resolves its state directory as
 * `process.env.HOBO_HOME ?? join(HOME, ".hobo")`, so a test that calls such an
 * API without an explicit `hoboHome` writes where a real session would. That
 * happened: a clean run of `packages/code` left 33 files under `~/.hobo/durable`
 * — chats, evidence, and an auth session written by a test whose only assertion
 * was that `auth --help` prints a help page.
 *
 * `test/setup/isolate-hobo-home.ts` fixes it by pointing every test file's
 * `HOBO_HOME` at a throwaway directory. This file is the guard on that fix: the
 * point of the setup is that the next test somebody writes cannot reintroduce
 * the fault, and a guarantee nothing checks is a guarantee that quietly stops
 * holding.
 *
 * It asserts the *mechanism* rather than the absence of files in the real home,
 * because the real home may legitimately contain a developer's own data — this
 * suite is not entitled to look at it, let alone assert about its contents.
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

describe("HOBO_HOME isolation", () => {
	it("is set for every test file", () => {
		// Unset is the dangerous state: it is what makes the default resolve to
		// the real home.
		expect(process.env.HOBO_HOME).toBeTruthy();
	});

	it("does not point at the developer's real home", () => {
		// The specific failure this guards: `~/.hobo`.
		expect(resolve(String(process.env.HOBO_HOME))).not.toBe(
			resolve(join(homedir(), ".hobo")),
		);
	});

	it("does not point anywhere inside the developer's home directory", () => {
		// A sibling like `~/.hobo-test` would still put test state in a place a
		// developer backs up and syncs.
		expect(
			resolve(String(process.env.HOBO_HOME)).startsWith(resolve(homedir())),
		).toBe(false);
	});

	it("points at a directory that exists, so a write does not fail", () => {
		// An isolated home that is not there just moves the failure rather than
		// removing it.
		expect(existsSync(String(process.env.HOBO_HOME))).toBe(true);
	});

	it("is not the repository itself", () => {
		// State written into the working tree shows up as uncommitted changes and
		// gets committed by accident.
		expect(resolve(String(process.env.HOBO_HOME))).not.toBe(
			resolve(process.cwd()),
		);
	});
});

const SETUP = fileURLToPath(
	new URL("./setup/isolate-hobo-home.ts", import.meta.url),
);
const scratch = mkdtempSync(join(tmpdir(), "hobo-home-teardown-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

let projects = 0;

/**
 * Runs two test files, one after the other in one worker as the root config
 * runs files (isolate: false), with only the setup file under test, a TMPDIR
 * of their own, and `env`. Each records the HOBO_HOME it saw and whether it
 * existed. Returns those lines and what is left in that TMPDIR.
 */
function runTwoFiles(env: NodeJS.ProcessEnv): {
	status: number | null;
	seen: string[];
	left: string[];
} {
	projects += 1;
	const project = join(scratch, `project-${projects}`);
	const temp = join(project, "tmp");
	const seenFile = join(project, "seen.txt");
	mkdirSync(temp, { recursive: true });
	writeFileSync(seenFile, "");
	const probe = `import { appendFileSync, existsSync } from "node:fs";
it("records its home", () => {
	const home = process.env.HOBO_HOME ?? "";
	appendFileSync(process.env.SEEN_FILE ?? "", home + " " + existsSync(home) + "\\n");
});
`;
	writeFileSync(join(project, "a.probe.test.mjs"), probe);
	writeFileSync(join(project, "b.probe.test.mjs"), probe);
	writeFileSync(
		join(project, "vitest.config.mjs"),
		`export default { test: { globals: true, isolate: false, pool: "threads", fileParallelism: false, maxWorkers: 1, include: ["*.probe.test.mjs"], setupFiles: [${JSON.stringify(SETUP)}] } };\n`,
	);
	const vitest = join(
		dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
		"vitest.mjs",
	);
	// Another vitest run of its own: none of this one's VITEST_* settings or HOBO_HOME.
	const inherited = Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) => !key.startsWith("VITEST") && key !== "HOBO_HOME",
		),
	);
	const run = spawnSync(
		process.execPath,
		[vitest, "run", "--root", project, "--config", "vitest.config.mjs"],
		{
			cwd: project,
			env: { ...inherited, TMPDIR: temp, SEEN_FILE: seenFile, ...env },
			encoding: "utf8",
			timeout: 60_000,
		},
	);
	return {
		status: run.status,
		seen: readFileSync(seenFile, "utf8").split("\n").filter(Boolean),
		left: readdirSync(temp).filter((name) =>
			name.startsWith("hobo-test-home-"),
		),
	};
}

describe("the throwaway HOBO_HOME", () => {
	it("is removed once each file is done, and the next file gets one of its own", () => {
		const { status, seen, left } = runTwoFiles({});
		expect(status).toBe(0);
		expect(seen).toHaveLength(2);
		for (const line of seen) {
			expect(line).toMatch(/\/hobo-test-home-[^/ ]+ true$/u);
		}
		expect(left).toEqual([]);
	}, 60_000);

	it("is never one the runner set: that one is left as it was", () => {
		const own = join(scratch, "own-home");
		mkdirSync(own);
		const { status, seen } = runTwoFiles({ HOBO_HOME: own });
		expect(status).toBe(0);
		expect(seen).toEqual([`${own} true`, `${own} true`]);
		expect(existsSync(own)).toBe(true);
	}, 60_000);
});
