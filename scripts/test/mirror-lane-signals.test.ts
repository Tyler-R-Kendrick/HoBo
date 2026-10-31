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
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, afterEach, describe, it } from "node:test";

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
	// A red run must not leave its stand-ins running. Only a stand-in whose
	// beacon socket is still open is signalled: that pid is still ours.
	for (const reported of started.splice(0)) {
		if (!reported.hasEnded()) process.kill(reported.pid, "SIGKILL");
	}
	await Promise.all(open.splice(0).map((listener) => listener.close()));
});

/** The runner under test, and everything it printed so far. */
interface Lane {
	readonly child: ChildProcess;
	readonly output: () => string;
	/** Resolves once the runner has printed a line matching `pattern`. */
	readonly printed: (pattern: RegExp) => Promise<void>;
}

/** The runner's TMPDIR: whatever it writes there must be gone when it has exited. */
const TEMP = mkdtempSync(join(tmpdir(), "mirror-lane-signals-"));

/** What the lane left in TEMP; tsx's own compile cache (`tsx-<uid>`) is the loader's, not the lane's. */
function laneLeftovers(): readonly string[] {
	return readdirSync(TEMP).filter((name) => !name.startsWith("tsx-"));
}

after(() => {
	const left = laneLeftovers();
	rmSync(TEMP, { recursive: true, force: true });
	assert.deepEqual(left, [], "the runner left files in its TMPDIR");
});

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
			env: { ...process.env, NODE_OPTIONS: "", CI: "", TMPDIR: TEMP, ...env },
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
	const printed = (pattern: RegExp) =>
		new Promise<void>((resolvePrinted) => {
			const check = () => {
				if (!pattern.test(output)) return;
				child.stdout?.off("data", check);
				child.stderr?.off("data", check);
				resolvePrinted();
			};
			child.stdout?.on("data", check);
			child.stderr?.on("data", check);
			check();
		});
	return { child, output: () => output, printed };
}

async function reported(listener: Beacon, role: string): Promise<Reported> {
	const report = await listener.next(role);
	started.push(report);
	return report;
}

describe("run-mirror-lane.mts, stopped early: by a signal, its mirror gone, its stdout closed", () => {
	for (const [signal, code] of [
		["SIGTERM", 143],
		["SIGINT", 130],
		// A closed terminal or a dropped ssh session: the detached children
		// never see it, so the runner must stop them.
		["SIGHUP", 129],
		["SIGQUIT", 131],
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

	for (const [signal, code] of [
		["SIGTERM", 143],
		["SIGHUP", 129],
	] as const) {
		it(`${signal} while a package runs stops the package run, its process group, and mirror`, async () => {
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
			lane.child.kill(signal);
			const [exitCode] = await exit;

			assert.equal(exitCode, code, lane.output());
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
		});
	}

	it("the lane fails, stopping the package run, when its mirror exits while packages run", {
		timeout: 60_000,
	}, async () => {
		const listener = await beacon();
		open.push(listener);
		const lane = runner({
			MIRROR_BIN: fakeMirror(),
			FAKE_BEACON: String(listener.port),
			PATH: `${fakePnpmDir()}${delimiter}${process.env.PATH ?? ""}`,
		});
		const exit = once(lane.child, "exit");

		const mirror = await reported(listener, "mirror");
		const pnpm = await reported(listener, "pnpm");
		const worker = await reported(listener, "worker");
		mirror.tell("exit");
		const [exitCode] = await exit;

		assert.equal(exitCode, 1, lane.output());
		assert.match(lane.output(), /fail {2}test:mirror — MIRROR_EXITED/u);
		await Promise.all([pnpm.ended, worker.ended]);
	});

	it("fails when its stdout is closed before it finishes, as `| head -1` closes it", async () => {
		const listener = await beacon();
		open.push(listener);
		const lane = runner({
			MIRROR_BIN: fakeMirror(),
			FAKE_BEACON: String(listener.port),
			PATH: `${fakePnpmDir()}${delimiter}${process.env.PATH ?? ""}`,
		});
		const exit = once(lane.child, "exit");

		await reported(listener, "mirror");
		const pnpm = await reported(listener, "pnpm");
		// Whatever reads the runner's output stops reading; then the package
		// run passes, and the runner has its report still to write.
		lane.child.stdout?.destroy();
		pnpm.tell("pass");
		const [exitCode] = await exit;

		assert.equal(exitCode, 1, lane.output());
		assert.match(lane.output(), /stdout closed before the lane finished/u);
	});

	it("a second SIGINT during the grace period kills everything at once and exits", async () => {
		const listener = await beacon();
		open.push(listener);
		const lane = runner({
			MIRROR_BIN: fakeMirror(),
			FAKE_MIRROR_MODE: "no-banner",
			// Mirror ignores SIGTERM and the first stop's grace outlasts the
			// test, so only the second SIGINT can end the run.
			FAKE_MIRROR_IGNORE_TERM: "1",
			HOBO_MIRROR_LANE_STOP_GRACE_MS: "86400000",
			FAKE_BEACON: String(listener.port),
		});
		const exit = once(lane.child, "exit");

		const mirror = await reported(listener, "mirror");
		const stopping = lane.printed(/SIGINT: stopping/u);
		lane.child.kill("SIGINT");
		await stopping;
		lane.child.kill("SIGINT");
		const [exitCode, killedBy] = await exit;

		// The runner exited by its own hand (130), not by the second SIGINT's
		// default action, and mirror's group was killed on the way out.
		assert.deepEqual([exitCode, killedBy], [130, null], lane.output());
		assert.match(lane.output(), /SIGINT again/u);
		assert.deepEqual(laneLeftovers(), [], "the emergency exit left files");
		await mirror.ended;
	});
});
