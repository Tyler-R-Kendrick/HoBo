/**
 * runAiBdd on its own (ADR-0172): how one ai-bdd command is stopped. The
 * release-gate suites drive it through the gate; these give it commands that
 * misbehave in one way each.
 */
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";
import { runAiBdd } from "../src/ai-bdd-process.js";

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
