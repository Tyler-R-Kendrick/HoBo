/**
 * The release-gate suites' own helpers (test/helpers/release-gate.ts): what
 * their assertions about processes rest on.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { gone } from "./helpers/release-gate.js";

/** The state letter of a process, or "" once it cannot be read. */
function stateOf(pid: number): string {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
	} catch {
		return "";
	}
}

describe("gone", () => {
	it.runIf(process.platform === "linux")(
		"counts a process that has exited as gone, although its parent has not reaped it",
		async () => {
			// `sleep 0` exits at once; the shell then becomes `sleep 20`, which never reaps it.
			// kill(pid, 0) still finds such a zombie, as it does an orphan init has not reaped yet.
			const parent = spawn("sh", ["-c", "sleep 0 & echo $!; exec sleep 20"], {
				stdio: ["ignore", "pipe", "ignore"],
			});
			try {
				const zombie = await new Promise<number>((done) => {
					parent.stdout.once("data", (chunk: Buffer) =>
						done(Number(chunk.toString("utf8").trim())),
					);
				});
				const until = Date.now() + 20_000;
				while (stateOf(zombie) !== "Z" && Date.now() < until) {
					await new Promise((done) => setTimeout(done, 50));
				}
				expect(stateOf(zombie)).toBe("Z");
				const started = Date.now();
				expect(await gone(zombie)).toBe(true);
				expect(Date.now() - started).toBeLessThan(1000);
			} finally {
				parent.kill("SIGKILL");
			}
		},
		40_000,
	);

	it("is false for a process that is still running", async () => {
		expect(await gone(process.pid, 3)).toBe(false);
	});
});
