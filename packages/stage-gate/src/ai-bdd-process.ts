/**
 * One ai-bdd command as a process (ADR-0172), bounded in time and in what it
 * passes on:
 *
 * - It runs in a process group of its own (POSIX), so a timeout, or a signal
 *   to the gate, kills ai-bdd and whatever it started (a browser) together,
 *   and so does its own exit, which leaves nothing of the run behind.
 * - Its output is relayed live, but only the first and the last
 *   RELAY_BYTES: the stage-gate runner captures a check's stderr up to
 *   CHECK_OUTPUT_LIMIT, and a check that writes more is killed for it, so a
 *   passing run that prints a lot must not reach that limit. Nothing is
 *   buffered whole; the evidence keeps the last TAIL_CHARS characters.
 */
import { type ChildProcess, spawn } from "node:child_process";

import { CHECK_OUTPUT_LIMIT } from "./gate-status.js";

/** Relayed from the start, and again from the end, of a command's output. */
export const RELAY_BYTES = CHECK_OUTPUT_LIMIT / 8;
const TAIL_CHARS = 2000;

export interface AiBddCommand {
	readonly command: readonly string[];
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly timeoutMs: number;
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

const running = new Set<ChildProcess>();

function killGroup(child: ChildProcess): void {
	if (child.pid === undefined) return;
	try {
		if (process.platform === "win32") child.kill("SIGKILL");
		else process.kill(-child.pid, "SIGKILL");
	} catch {
		// The group is already gone.
	}
}

/** Kill every ai-bdd process group still running (the entry script does, on SIGINT and SIGTERM). */
export function killRunningAiBdd(): void {
	for (const child of running) killGroup(child);
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

export function runAiBdd(
	spec: AiBddCommand,
	args: readonly string[],
): Promise<AiBddRun> {
	const [executable = "", ...prefix] = spec.command;
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
		const child = spawn(executable, [...prefix, ...args], {
			cwd: spec.cwd,
			env: spec.env,
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		running.add(child);
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup(child);
		}, spec.timeoutMs);
		child.stdout?.on("data", output.write);
		child.stderr?.on("data", output.write);
		child.on("error", (cause) => {
			clearTimeout(timer);
			running.delete(child);
			finish(null, `${cause.name}: ${cause.message}`);
		});
		// What it started and left running goes with it.
		child.on("exit", () => killGroup(child));
		child.on("close", (status, signal) => {
			clearTimeout(timer);
			running.delete(child);
			finish(
				timedOut ? null : status,
				signal === null ? "" : `ended by ${signal}`,
			);
		});
	});
}
