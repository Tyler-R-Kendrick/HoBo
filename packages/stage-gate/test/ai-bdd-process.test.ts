/**
 * runAiBdd on its own (ADR-0172): how one ai-bdd command is stopped. The
 * release-gate suites drive it through the gate; these give it commands that
 * misbehave in one way each.
 */
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";
import { runAiBdd } from "../src/ai-bdd-process.js";
import { killQuietly, REPO_ROOT } from "./helpers/release-gate.js";

const STOP_SCRIPT = join(
	dirname(fileURLToPath(import.meta.url)),
	"helpers",
	"stop-ai-bdd.mts",
);

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

describe("runAiBdd on Linux, where a group can hold only zombies", () => {
	it.runIf(process.platform === "linux")(
		"is done with a group whose only member is a zombie its parent never reaps",
		async () => {
			// The inner shell leaves `sleep 0.1` in ai-bdd's group, then moves itself to a
			// session of its own (setsid) as `sleep 8`, which never waits for it: once
			// ai-bdd exits, the group holds one zombie, as under a PID 1 or subreaper that
			// does not reap.
			const started = Date.now();
			const run = await runAiBdd(
				{
					command: [
						"sh",
						"-c",
						"sh -c 'sleep 0.1 & echo holder $$; exec setsid sleep 8 >/dev/null 2>&1' & sleep 0.3; exit 0",
					],
					cwd: tmpdir(),
					env: process.env,
					timeoutMs: 20_000,
					graceMs: 5000,
					relay: () => undefined,
				},
				[],
			);
			const took = Date.now() - started;
			killQuietly(Number(/holder (\d+)/u.exec(run.tail)?.[1] ?? 0));
			expect(run.status).toBe(0);
			// Not the 5 s grace: a zombie is not a member to wait for.
			expect(took).toBeLessThan(3000);
		},
		30_000,
	);
});

interface StopOutcome {
	readonly stopMs: number;
	readonly tail: string;
	readonly afterStatus: number | null;
	readonly afterUnstartable: string;
}

describe("stopRunningAiBdd, as the check calls it on its own SIGINT or SIGTERM", () => {
	it("passes that signal on, is done once the group is gone, and starts no ai-bdd after", async () => {
		const answer = (signal: string) =>
			`process.on('${signal}', () => { console.log('got ${signal}'); process.exit(0); });`;
		const { stdout } = await promisify(execFile)(
			process.execPath,
			[
				"--import",
				"tsx",
				STOP_SCRIPT,
				"SIGINT",
				"20000",
				JSON.stringify(
					nodeCommand(
						`${answer("SIGINT")} ${answer("SIGTERM")} console.log('up'); setInterval(() => {}, 1000)`,
					),
				),
				JSON.stringify(nodeCommand("process.exit(0)")),
			],
			{ cwd: REPO_ROOT, timeout: 60_000 },
		);
		// SAFETY: stop-ai-bdd.mts prints one StopOutcome as JSON.
		const outcome = JSON.parse(stdout) as StopOutcome;
		// The signal the check got, not SIGTERM in its place.
		expect(outcome.tail).toContain("got SIGINT");
		// The group was gone at once: the 20 s grace was not waited out.
		expect(outcome.stopMs).toBeLessThan(5000);
		expect(outcome).toMatchObject({
			afterStatus: null,
			afterUnstartable: "not started: the check was stopped by SIGINT",
		});
	}, 60_000);
});
