import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(pkgRoot, "bin", "hobo-code.mjs");

describe("hobo-code bin launcher", () => {
	it("bin/hobo-code.mjs exists and is the package bin entry", () => {
		expect(existsSync(launcher)).toBe(true);
	});

	it("runs help via launcher with current dist (skip rebuild)", () => {
		const r = spawnSync(process.execPath, [launcher, "help"], {
			cwd: pkgRoot,
			encoding: "utf8",
			env: { ...process.env, HOBO_CODE_SKIP_STALE_REBUILD: "1" },
		});
		expect(r.status).toBe(0);
		expect(r.stdout).toMatch(/hobo-code/);
		expect(r.stdout).toMatch(/Start here:|plain by default/i);
	});

	it("plain status via launcher is English hierarchy not only glyph box", () => {
		const r = spawnSync(process.execPath, [launcher, "status"], {
			cwd: pkgRoot,
			encoding: "utf8",
			env: { ...process.env, HOBO_CODE_SKIP_STALE_REBUILD: "1" },
		});
		expect(r.status).toBe(0);
		expect(r.stdout).toMatch(/session status|Agents:/i);
		expect(r.stdout).not.toMatch(/┌─+┐/);
	});
});
