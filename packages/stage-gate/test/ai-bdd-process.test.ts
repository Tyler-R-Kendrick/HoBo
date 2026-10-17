/**
 * runAiBdd on its own (ADR-0172): how one ai-bdd command is stopped. The
 * release-gate suites drive it through the gate; these give it commands that
 * misbehave in one way each.
 */
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";
import { runAiBdd } from "../src/ai-bdd-process.js";
import { killQuietly } from "./helpers/release-gate.js";

function nodeCommand(source: string): readonly string[] {
	return [process.execPath, "-e", source];
}

describe("runAiBdd stops a command that outlives its bound", () => {
	it("with SIGTERM to its group, then SIGKILL once the grace period ends", async () => {
		const started = Date.now();
		const run = await runAiBdd(
			{
				command: nodeCommand(
					"process.on('SIGTERM', () => console.log('SIGTERM ignored')); setInterval(() => {}, 1000)",
				),
				cwd: tmpdir(),
				env: process.env,
				timeoutMs: 500,
				graceMs: 1500,
				relay: () => undefined,
			},
			[],
		);
		const took = Date.now() - started;
		expect(run.timedOut).toBe(true);
		expect(run.status).toBeNull();
		// It was asked first, and killed only when it did not go.
		expect(run.tail).toContain("SIGTERM ignored");
		expect(took).toBeGreaterThanOrEqual(1900);
		expect(took).toBeLessThan(10_000);
	}, 30_000);
});

describe("runAiBdd settles when the command exits", () => {
	it("although a process outside its group still holds its output open", async () => {
		const started = Date.now();
		const run = await runAiBdd(
			{
				// It exits at once, leaving a detached child that inherited its stdout and stderr.
				command: nodeCommand(
					"const c = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { detached: true, stdio: 'inherit' }); console.log('holder ' + c.pid); c.unref()",
				),
				cwd: tmpdir(),
				env: process.env,
				timeoutMs: 20_000,
				graceMs: 1000,
				relay: () => undefined,
			},
			[],
		);
		const holder = Number(/holder (\d+)/u.exec(run.tail)?.[1] ?? 0);
		try {
			expect(run).toMatchObject({ status: 0, timedOut: false });
			expect(Date.now() - started).toBeLessThan(10_000);
		} finally {
			killQuietly(holder);
		}
	}, 40_000);
});
