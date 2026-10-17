import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { withoutPackageManager } from "../lib/env.ts";

const root = "/repo";
const scripts = {
	build: "tsc",
	pretest: "build",
	test: "vitest",
	lint: "biome",
};
const posix = (command: string, args: string[]) =>
	withoutPackageManager(command, args, { root, scripts, platform: "linux" });

// The relevant-check policy names its gates as `pnpm run …` / `pnpm exec …`.
// The pre-commit hook runs them on machines with no usable pnpm, so the
// runner rewrites them to what Node and the checkout already provide.
describe("running a pnpm-shaped check without pnpm", () => {
	it("runs a script through node --run, arguments after --", () => {
		assert.deepEqual(posix("pnpm", ["run", "lint", "--", "--staged"]), {
			command: process.execPath,
			args: ["--run", "lint", "--", "--staged"],
		});
		assert.deepEqual(posix("pnpm", ["run", "lint"]), {
			command: process.execPath,
			args: ["--run", "lint"],
		});
	});

	it("puts bare script arguments after -- as pnpm would pass them", () => {
		assert.deepEqual(posix("pnpm", ["run", "lint", "--fix"]), {
			command: process.execPath,
			args: ["--run", "lint", "--", "--fix"],
		});
	});

	it("runs an exec'd binary straight from node_modules/.bin", () => {
		assert.deepEqual(
			posix("pnpm", ["exec", "oxlint", "--deny-warnings", "a.ts"]),
			{
				command: join(root, "node_modules", ".bin", "oxlint"),
				args: ["--deny-warnings", "a.ts"],
			},
		);
	});

	it("keeps pnpm for a script with lifecycle hooks node --run would skip", () => {
		assert.deepEqual(posix("pnpm", ["run", "test"]), {
			command: "pnpm",
			args: ["run", "test"],
		});
	});

	it("keeps pnpm for anything that is a package-manager operation", () => {
		for (const args of [
			["install", "--frozen-lockfile"],
			["--filter", "@hobo/x", "run", "test"],
			["run", "no-such-script"],
		]) {
			assert.deepEqual(posix("pnpm", args), { command: "pnpm", args });
		}
	});

	it("leaves other commands alone", () => {
		assert.deepEqual(posix("git", ["status"]), {
			command: "git",
			args: ["status"],
		});
	});
});
