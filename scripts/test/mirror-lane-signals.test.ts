/**
 * The runner (scripts/run-mirror-lane.mts) stops what it started when it is
 * stopped itself: SIGTERM while mirror is still starting, and SIGTERM while a
 * package's test:mirror runs, leave no process behind, the package run's
 * process group included (ADR-0174, decision 1).
 *
 * Stand-ins play mirror and pnpm (support/mirror-fakes.ts). Each reports its
 * pid to a beacon the moment it starts; the test signals the runner only then,
 * and decides from events: the runner's own `exit`, and each stand-in's beacon
 * socket closing when it ends. The runner's direct children must already be
 * gone when it exits, since it waits for their `exit` events before it does.
 */
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { delimiter, join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	type Beacon,
	beacon,
	fakeMirror,
	fakePnpmDir,
	type Reported,
	stillRunning,
} from "./support/mirror-fakes.ts";
import { REPO_ROOT } from "./support/pins-support.ts";

const open: Beacon[] = [];
const started: Reported[] = [];

afterEach(async () => {
	// A red run must not leave its stand-ins running: they are ours, by pid.
	for (const reported of started.splice(0)) {
		if (stillRunning(reported.pid)) process.kill(reported.pid, "SIGKILL");
	}
	await Promise.all(open.splice(0).map((listener) => listener.close()));
});

/** The runner under test, and everything it printed so far. */
interface Lane {
	readonly child: ChildProcess;
	readonly output: () => string;
}

function runner(env: NodeJS.ProcessEnv): Lane {
	const child = spawn(
		process.execPath,
		[
			"--import",
			"tsx",
			join(REPO_ROOT, "scripts/run-mirror-lane.mts"),
			"--package",
			"@hobo/provider-vercel",
		],
		{
			env: { ...process.env, NODE_OPTIONS: "", CI: "", ...env },
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let output = "";
	child.stdout?.on("data", (chunk: Buffer) => {
		output += chunk.toString("utf8");
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		output += chunk.toString("utf8");
	});
	return { child, output: () => output };
}

async function reported(listener: Beacon, role: string): Promise<Reported> {
	const report = await listener.next(role);
	started.push(report);
	return report;
}

describe("run-mirror-lane.mts, stopped by a signal", () => {
	for (const [signal, code] of [
		["SIGTERM", 143],
		["SIGINT", 130],
	] as const) {
		it(`${signal} while mirror is still starting stops mirror before the runner exits`, async () => {
			const listener = await beacon();
			open.push(listener);
			const lane = runner({
				MIRROR_BIN: fakeMirror(),
				// Mirror never says it is listening: the runner is still waiting for it.
				FAKE_MIRROR_MODE: "no-banner",
				FAKE_BEACON: String(listener.port),
			});
			const exit = once(lane.child, "exit");

			const mirror = await reported(listener, "mirror");
			lane.child.kill(signal);
			const [exitCode] = await exit;

			assert.equal(exitCode, code, lane.output());
			assert.equal(
				stillRunning(mirror.pid),
				false,
				`mirror pid ${mirror.pid} outlived the runner:\n${lane.output()}`,
			);
			await mirror.ended;
			assert.match(lane.output(), new RegExp(`${signal}: stopping`, "u"));
			assert.doesNotMatch(lane.output(), /fail {2}test:mirror/u);
		});
	}

	it("SIGTERM while a package runs stops the package run, its process group, and mirror", async () => {
		const listener = await beacon();
		open.push(listener);
		const lane = runner({
			MIRROR_BIN: fakeMirror(),
			FAKE_BEACON: String(listener.port),
			// pnpm --filter ... run test:mirror is the stand-in, first on PATH.
			PATH: `${fakePnpmDir()}${delimiter}${process.env.PATH ?? ""}`,
		});
		const exit = once(lane.child, "exit");

		const mirror = await reported(listener, "mirror");
		const pnpm = await reported(listener, "pnpm");
		const worker = await reported(listener, "worker");
		lane.child.kill("SIGTERM");
		const [code] = await exit;

		assert.equal(code, 143, lane.output());
		for (const child of [mirror, pnpm]) {
			assert.equal(
				stillRunning(child.pid),
				false,
				`${child.role} pid ${child.pid} outlived the runner:\n${lane.output()}`,
			);
		}
		// The worker is pnpm's child and ignores SIGTERM: only the SIGKILL the
		// runner sends to pnpm's process group ends it.
		await Promise.all([mirror.ended, pnpm.ended, worker.ended]);
		assert.equal(stillRunning(worker.pid), false);
	});
});
