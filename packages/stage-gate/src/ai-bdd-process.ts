/**
 * One ai-bdd command as a process (ADR-0172), bounded in time and in what it
 * passes on:
 *
 * - It runs in a process group of its own (POSIX). A timeout, or SIGINT or
 *   SIGTERM to the gate, stops that group: the signal first (SIGTERM for a
 *   timeout, else the one the gate got), and SIGKILL to whatever of it is left
 *   after AI_BDD_GRACE_MS. Its own exit stops what it left in its group the
 *   same way. Playwright launches each browser as the leader of a group of its
 *   own, out of reach of a group signal, and closes it from its SIGTERM and
 *   SIGINT handlers: that is why the signal goes first. A process ai-bdd
 *   started in another group and that ignores SIGTERM can outlive the check.
 * - Its output is relayed, but only the first RELAY_BYTES as they come and
 *   the last RELAY_BYTES when it exits: the stage-gate runner captures a
 *   check's stderr up to CHECK_OUTPUT_LIMIT, and a check that writes more is
 *   killed for it, so a passing run that prints a lot must not reach that
 *   limit. Nothing is buffered whole; the evidence keeps the last TAIL_CHARS
 *   characters.
 */
import { type ChildProcess, spawn } from "node:child_process";

import { CHECK_OUTPUT_LIMIT } from "./gate-status.js";

/** Relayed from the start, and again from the end, of a command's output. */
export const RELAY_BYTES = CHECK_OUTPUT_LIMIT / 8;
const TAIL_CHARS = 2000;

/** How long a process group has to end after it is signalled, before SIGKILL. */
export const AI_BDD_GRACE_MS = 10_000;
const POLL_MS = 100;

export interface AiBddCommand {
	readonly command: readonly string[];
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly timeoutMs: number;
	/** Between the signal that stops its group and SIGKILL; AI_BDD_GRACE_MS unless set. */
	readonly graceMs?: number;
	/** Where the output is relayed (the check's stderr). */
	readonly relay: (chunk: Buffer) => void;
}

export interface AiBddRun {
	readonly args: readonly string[];
	/** Its exit code; null when it did not exit by itself. */
	readonly status: number | null;
	/** Why it has no exit code: a spawn error or a signal. Empty when it exited. */
	readonly unstartable: string;
	/** It outlived `timeoutMs`, and its process group was killed. */
	readonly timedOut: boolean;
	/** The last characters of its output, stdout and stderr as they came. */
	readonly tail: string;
}

/** Each ai-bdd still running, and its grace period. */
const running = new Map<ChildProcess, number>();
/** Each group being stopped: a second stop of the same group waits for the first. */
const stopping = new Map<ChildProcess, Promise<void>>();
/** Set once the gate itself is told to stop: no ai-bdd starts after that. */
let stoppedBy: NodeJS.Signals | undefined;

/** Signal ai-bdd's process group (0 only asks whether any of it is left); false when none is. */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals | 0): boolean {
	if (child.pid === undefined) return false;
	if (process.platform === "win32") {
		// No process groups: the command itself, and every signal ends it at once.
		if (child.exitCode !== null || child.signalCode !== null) return false;
		return signal === 0 || child.kill(signal);
	}
	try {
		process.kill(-child.pid, signal);
		return true;
	} catch {
		return false;
	}
}

/**
 * Stop ai-bdd's process group: `signal` to all of it, then SIGKILL to what is
 * left after graceMs. Resolves once none of the group is left, or it was killed.
 */
function stopGroup(
	child: ChildProcess,
	signal: NodeJS.Signals,
	graceMs: number,
): Promise<void> {
	const pending = stopping.get(child);
	if (pending !== undefined) return pending;
	const stop = (async () => {
		if (!signalGroup(child, signal)) return;
		const deadline = Date.now() + graceMs;
		while (Date.now() < deadline) {
			await new Promise((done) => setTimeout(done, POLL_MS));
			if (!signalGroup(child, 0)) return;
		}
		signalGroup(child, "SIGKILL");
	})();
	stopping.set(child, stop);
	return stop;
}

/**
 * The gate was told to stop (the entry script calls this on SIGINT and
 * SIGTERM): pass the signal on to every ai-bdd group still running, SIGKILL
 * what is left after its grace, and start no other. Resolves when all are gone.
 */
export async function stopRunningAiBdd(signal: NodeJS.Signals): Promise<void> {
	stoppedBy = signal;
	await Promise.all(
		[...running].map(([child, graceMs]) => stopGroup(child, signal, graceMs)),
	);
}

interface OutputRelay {
	readonly write: (chunk: Buffer) => void;
	readonly end: () => void;
	readonly tail: () => string;
}

/** The first RELAY_BYTES go out as they come; of the rest, the last RELAY_BYTES go out at the end. */
function boundedRelay(relay: (chunk: Buffer) => void): OutputRelay {
	let relayed = 0;
	let held: Buffer[] = [];
	let heldBytes = 0;
	let dropped = 0;
	let tail = "";
	return {
		write(chunk) {
			tail = `${tail}${chunk.toString("utf8")}`.slice(-TAIL_CHARS);
			const head = chunk.subarray(0, Math.max(0, RELAY_BYTES - relayed));
			if (head.length > 0) {
				relay(head);
				relayed += head.length;
			}
			const rest = chunk.subarray(head.length);
			if (rest.length === 0) return;
			held.push(rest);
			heldBytes += rest.length;
			while (
				held.length > 1 &&
				heldBytes - (held[0]?.length ?? 0) >= RELAY_BYTES
			) {
				const first = held[0]?.length ?? 0;
				held = held.slice(1);
				heldBytes -= first;
				dropped += first;
			}
		},
		end() {
			if (dropped > 0) {
				relay(
					Buffer.from(
						`\n[... ${dropped} bytes of ai-bdd output not relayed ...]\n`,
					),
				);
			}
			for (const chunk of held) relay(chunk);
		},
		tail: () => tail,
	};
}

interface Ending {
	readonly status: number | null;
	readonly signal: NodeJS.Signals | null;
}

export function runAiBdd(
	spec: AiBddCommand,
	args: readonly string[],
): Promise<AiBddRun> {
	const [executable = "", ...prefix] = spec.command;
	const graceMs = spec.graceMs ?? AI_BDD_GRACE_MS;
	const output = boundedRelay(spec.relay);
	return new Promise((settle) => {
		let done = false;
		let timedOut = false;
		const finish = (status: number | null, unstartable: string) => {
			if (done) return;
			done = true;
			output.end();
			settle({ args, status, unstartable, timedOut, tail: output.tail() });
		};
		if (stoppedBy !== undefined) {
			finish(null, `not started: the check was stopped by ${stoppedBy}`);
			return;
		}
		let child: ChildProcess;
		try {
			child = spawn(executable, [...prefix, ...args], {
				cwd: spec.cwd,
				env: spec.env,
				stdio: ["ignore", "pipe", "pipe"],
				detached: process.platform !== "win32",
			});
		} catch (cause) {
			// Node refuses some commands before any process exists (a .cmd shim on Windows: EINVAL).
			const reason = cause instanceof Error ? cause.message : String(cause);
			finish(null, reason);
			return;
		}
		running.set(child, graceMs);
		let closed: Ending | undefined;
		let groupGone = false;
		const end = () => {
			if (!groupGone || closed === undefined) return;
			clearTimeout(timer);
			running.delete(child);
			stopping.delete(child);
			finish(
				timedOut ? null : closed.status,
				closed.signal === null ? "" : `ended by ${closed.signal}`,
			);
		};
		const timer = setTimeout(() => {
			timedOut = true;
			void stopGroup(child, "SIGTERM", graceMs);
		}, spec.timeoutMs);
		child.stdout?.on("data", output.write);
		child.stderr?.on("data", output.write);
		child.on("error", (cause) => {
			clearTimeout(timer);
			running.delete(child);
			finish(null, `${cause.name}: ${cause.message}`);
		});
		// What it started and left running in its group goes with it.
		child.on("exit", () => {
			void stopGroup(child, "SIGTERM", graceMs).then(() => {
				groupGone = true;
				end();
			});
		});
		child.on("close", (status, signal) => {
			closed = { status, signal };
			end();
		});
	});
}
