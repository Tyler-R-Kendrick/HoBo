/**
 * `hobo-code --home <dir>` runs against that home, and only that home.
 *
 * The binary prepares the HoBo home before a verb runs. It used to prepare the
 * environment's home even when `--home` named another, so an account whose
 * HOME cannot hold one (`nobody`, under /nonexistent) failed a command the CLI
 * itself would run against `--home`, and a normal user got `~/.hobo` created
 * and a legacy-home notice about a home the command never used. The product
 * passes `--home` to itself (the resident session starts the Git pane so).
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin/hobo-code.js", import.meta.url));

const scratch = mkdtempSync(join(tmpdir(), "hobo-code-home-flag-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

let runs = 0;

/** Runs the built binary with only HOME and TMPDIR of the case's own. */
function run(args: readonly string[], home: string, temp: string) {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) => key !== "HOBO_HOME" && !key.startsWith("HOBO_TEST_"),
		),
	);
	return spawnSync(process.execPath, [BIN, ...args], {
		env: { ...env, HOME: home, TMPDIR: temp },
		encoding: "utf8",
	});
}

function layout() {
	runs += 1;
	const root = join(scratch, `run-${runs}`);
	const temp = join(root, "tmp");
	const flagged = join(root, "flagged");
	mkdirSync(temp, { recursive: true });
	return { root, temp, flagged };
}

describe("hobo-code --home", () => {
	it.each([
		["--home", "space"],
		["--home=", "equals"],
	])("uses %s<dir> where HOME cannot hold a home (%s)", (flag) => {
		const { root, temp, flagged } = layout();
		// A HOME under a regular file: nothing can be created there, as for
		// `nobody` under /nonexistent.
		writeFileSync(join(root, "file"), "");
		const args =
			flag === "--home"
				? ["env", "--json", "--home", flagged]
				: ["env", "--json", `--home=${flagged}`];
		const result = run(args, join(root, "file", "home"), temp);
		expect(result.stderr).not.toMatch(/cannot use a HoBo home/u);
		expect(result.status).toBe(0);
		expect(existsSync(flagged)).toBe(true);
	});

	it("leaves HOME alone and says nothing about a legacy home", () => {
		const { root, temp, flagged } = layout();
		const home = join(root, "home");
		mkdirSync(home);
		// An earlier HoBo's temp-dir home, this user's own.
		mkdirSync(join(temp, ".hobo", "durable"), { recursive: true });
		const result = run(["env", "--json", "--home", flagged], home, temp);
		expect(result.status).toBe(0);
		expect(readdirSync(home)).toEqual([]);
		expect(result.stderr).not.toMatch(/HoBo state now lives/u);
	});
});
