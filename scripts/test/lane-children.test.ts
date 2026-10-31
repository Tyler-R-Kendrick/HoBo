/**
 * scripts/lib/lane-children.ts signals a process group only while its leader
 * is alive or in the leader's own `exit` handler, never later: once a leader
 * has exited and been reaped, its pid (and so the group id) can be handed to
 * an unrelated process, and pids on this machine wrap (pid_max 32768).
 *
 * `process.kill` is intercepted to see every signal the module sends. Each
 * case waits on events (the child's `exit`, a beacon socket closing), never
 * on a clock.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import process from "node:process";
import { afterEach, beforeEach, describe, it } from "node:test";

import { LaneChildren, MAX_STOP_GRACE_MS } from "../lib/lane-children.ts";
import { beacon } from "./support/mirror-fakes.ts";

/** Every `process.kill(pid, signal)` the code under test made. */
let sent: (readonly [number, string | number | undefined])[] = [];
const realKill = process.kill;

beforeEach(() => {
	sent = [];
	// SAFETY: the wrapper takes process.kill's own parameters and returns what it returns.
	process.kill = ((pid: number, signal?: string | number) => {
		sent.push([pid, signal]);
		return realKill.call(process, pid, signal);
	}) as typeof process.kill;
});

afterEach(() => {
	process.kill = realKill;
});

/** A node child that runs `code`. */
function node(children: LaneChildren, code: string) {
	return children.spawn(process.execPath, ["-e", code], { stdio: "ignore" });
}

const toGroup = (pid: number | undefined) =>
	sent.filter(([target]) => pid !== undefined && target === -pid);

describe("LaneChildren", () => {
	it("sends nothing to a group after its leader exited on its own, however often it is stopped", async () => {
		const children = new LaneChildren();
		const child = node(children, "process.exit(0)");
		await once(child, "exit");
		sent = [];

		await children.stop(child);
		await children.stop(child);
		await children.stopAll();
		children.killAllNow();

		assert.deepEqual(sent, []);
	});

	it("sends nothing more once a stopped child has exited, on a repeated stop", async () => {
		const children = new LaneChildren();
		const child = node(children, "setInterval(() => {}, 1 << 30)");
		await once(child, "spawn");

		const first = children.stop(child);
		const again = children.stop(child);
		await Promise.all([first, again]);
		const duringStop = toGroup(child.pid).map(([, signal]) => signal);
		sent = [];
		await children.stop(child);
		children.killAllNow();

		// One SIGTERM, then the sweep in the exit handler; the second stop added none.
		assert.deepEqual(duringStop, ["SIGTERM", "SIGKILL"]);
		assert.deepEqual(sent, []);
	});

	it("waits the grace it was constructed with before it sends SIGKILL to a child that ignores SIGTERM", async (t) => {
		const listener = await beacon();
		try {
			const children = new LaneChildren({ graceMs: 60_000 });
			const child = node(
				children,
				[
					"process.on('SIGTERM', () => {});",
					`const socket = require('node:net').connect(${listener.port}, '127.0.0.1', () => socket.write(JSON.stringify({ role: 'stubborn', pid: process.pid }) + '\\n'));`,
					"setInterval(() => {}, 1 << 30);",
				].join("\n"),
			);
			// Its SIGTERM handler is installed before it reports.
			await listener.next("stubborn");
			t.mock.timers.enable({ apis: ["setTimeout"] });
			const stopped = children.stop(child);
			t.mock.timers.tick(59_999);
			const beforeGrace = toGroup(child.pid).map(([, signal]) => signal);
			t.mock.timers.tick(1);
			t.mock.timers.reset();
			await stopped;

			assert.deepEqual(beforeGrace, ["SIGTERM"]);
			// The grace's SIGKILL, then the exit handler's sweep.
			assert.deepEqual(
				toGroup(child.pid).map(([, signal]) => signal),
				["SIGTERM", "SIGKILL", "SIGKILL"],
			);
		} finally {
			await listener.close();
		}
	});

	it("when a leader exits on its own, its exit handler kills what it left in its group", async () => {
		const listener = await beacon();
		try {
			const children = new LaneChildren();
			// The leader starts a straggler in its own group that ignores SIGTERM
			// and reports to the beacon; then the leader is ended by something
			// other than the lane (a signal to it alone).
			const straggler = [
				"process.on('SIGTERM', () => {});",
				`const socket = require('node:net').connect(${listener.port}, '127.0.0.1', () => socket.write(JSON.stringify({ role: 'straggler', pid: process.pid }) + '\\n'));`,
				"setInterval(() => {}, 1 << 30);",
			].join("\n");
			const child = node(
				children,
				[
					`require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(straggler)}], { stdio: 'ignore' });`,
					"setInterval(() => {}, 1 << 30);",
				].join("\n"),
			);
			const left = await listener.next("straggler");
			const exit = once(child, "exit");
			child.kill("SIGUSR2");
			await exit;

			const swept = toGroup(child.pid).map(([, signal]) => signal);
			if (swept.length === 0 && !left.hasEnded()) {
				// Red: nothing swept the group, and the straggler's socket is still
				// open, so its pid is still ours to end.
				realKill.call(process, left.pid, "SIGKILL");
			}
			// Sent by the time the exit event reaches the test: the handler the
			// lane registered first ran before this one.
			assert.deepEqual(swept, ["SIGKILL"]);
			// Its beacon socket closes only when the straggler has ended.
			await left.ended;
		} finally {
			await listener.close();
		}
	});
});

/** A refusal of `graceMs` that says what a grace may be, and names the value. */
function refusesGrace(graceMs: number) {
	return (error: Error) =>
		error instanceof RangeError &&
		error.message.includes(
			"graceMs must be a whole number of milliseconds from 0 to 2147483647",
		) &&
		error.message.includes(String(graceMs));
}

describe("LaneChildren's stop grace: what a timer holds, or a refusal", () => {
	// Node runs a timer longer than 2147483647 ms after 1 ms (TimeoutOverflowWarning),
	// so such a grace would SIGKILL at once.
	for (const graceMs of [
		3e9,
		MAX_STOP_GRACE_MS + 1,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	]) {
		it(`refuses a grace of ${graceMs} ms when constructed`, () => {
			assert.throws(() => new LaneChildren({ graceMs }), refusesGrace(graceMs));
		});
	}

	it("takes a grace of 0 and of MAX_STOP_GRACE_MS (2147483647 ms)", () => {
		assert.equal(MAX_STOP_GRACE_MS, 2_147_483_647);
		new LaneChildren({ graceMs: 0 });
		new LaneChildren({ graceMs: MAX_STOP_GRACE_MS });
	});

	it("refuses such a grace for one stop and for stopAll, before it signals or closes anything", async () => {
		const children = new LaneChildren();
		const child = node(children, "setInterval(() => {}, 1 << 30)");
		await once(child, "spawn");

		assert.throws(() => children.stop(child, 3e9), refusesGrace(3e9));
		await assert.rejects(children.stopAll(3e9), refusesGrace(3e9));

		assert.deepEqual(toGroup(child.pid), []);
		// Still open: a refused stopAll closed nothing.
		const another = node(children, "process.exit(0)");
		await once(another, "exit");
		const exit = once(child, "exit");
		await children.stopAll();
		await exit;
	});
});
