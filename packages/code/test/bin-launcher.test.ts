import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

	it("forwards a PID-only termination signal to a live dev child", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-launcher-signal-"));
		const child = spawn(
			process.execPath,
			[
				launcher,
				"dev",
				"--cwd",
				join(pkgRoot, "templates", "openui-astryx-bindle"),
				"--port",
				"0",
				"--debug-port",
				"0",
			],
			{
				cwd: pkgRoot,
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					HOBO_CODE_SKIP_STALE_REBUILD: "1",
					HOBO_HOME: hoboHome,
				},
			},
		);
		try {
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error("dev launcher did not become ready")),
					5_000,
				);
				child.once("error", reject);
				child.stdout?.on("data", (chunk) => {
					if (!String(chunk).includes("browser")) return;
					clearTimeout(timeout);
					resolve();
				});
			});
			if (child.pid === undefined)
				throw new Error("launcher has no process id");
			process.kill(child.pid, "SIGTERM");
			const [status] = (await once(child, "exit")) as [
				number | null,
				string | null,
			];
			expect(status).toBe(143);
		} finally {
			if (child.exitCode === null) child.kill("SIGKILL");
			rmSync(hoboHome, { recursive: true, force: true });
		}
	}, 10_000);
});
