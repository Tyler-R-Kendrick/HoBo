/**
 * `hobo <verb> --home <dir>` runs against that home, and only that home.
 *
 * The composed binary prepares the HoBo home and puts its Yard runtime in it
 * before a verb runs. It used the environment's home whatever `--home` said, so
 * an account whose HOME cannot hold one (`nobody`, under /nonexistent) could not
 * run a verb against `--home`, and a normal user got `~/.hobo` created (with
 * the runtime in it) and a legacy-home notice about a home the verb never used.
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

const BIN = fileURLToPath(new URL("../dist/bin/hobo.js", import.meta.url));

const scratch = mkdtempSync(join(tmpdir(), "hobo-home-flag-"));
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

describe("hobo --home", () => {
	it("uses --home where HOME cannot hold a home", () => {
		const { root, temp, flagged } = layout();
		writeFileSync(join(root, "file"), "");
		const result = run(
			["yard", "status", "--home", flagged, "--json"],
			join(root, "file", "home"),
			temp,
		);
		expect(result.stderr).not.toMatch(/cannot use a HoBo home/u);
		expect(existsSync(join(flagged, "runtime"))).toBe(true);
	});

	it("leaves HOME alone and says nothing about a legacy home", () => {
		const { root, temp, flagged } = layout();
		const home = join(root, "home");
		mkdirSync(home);
		mkdirSync(join(temp, ".hobo", "durable"), { recursive: true });
		const result = run(
			["yard", "status", "--home", flagged, "--json"],
			home,
			temp,
		);
		expect(readdirSync(home)).toEqual([]);
		expect(result.stderr).not.toMatch(/HoBo state now lives/u);
		expect(existsSync(join(flagged, "runtime"))).toBe(true);
	});
});
