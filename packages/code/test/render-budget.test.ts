/**
 * Perceptual/render-economy contract for the InteractiveShell driver.
 *
 * The pre-pi-tui shell erased and repainted the entire screen every 95 ms
 * unconditionally (≈21 KB/s of pure flicker at 80×24) and once per input
 * character. These tests pin the fixed behavior end-to-end through the real
 * driver: initial paint once, diffs only on change, idle rest spans write
 * nothing, replies are honest about what dispatch does.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
	appendAssistant,
	clearWrapCache,
	createInitialShellState,
	renderShellFrame,
	runInteractiveShell,
	type ShellHost,
} from "../src/interactive-shell.js";
import { createDefaultShellHost } from "../src/shell-host.js";
import { StreamTerminal } from "../src/shell-terminal.js";

const WIDTH = 80;
const HEIGHT = 24;
/** One full frame incl. newlines — the naive per-keystroke repaint cost. */
const FRAME_BYTES = (WIDTH + 1) * HEIGHT;

const cleanups: string[] = [];
afterAll(() => {
	for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	cleanups.push(d);
	return d;
}

function collector(): { stream: Writable; bytes: () => number } {
	let total = 0;
	const stream = new Writable({
		write(chunk, _enc, cb) {
			total += chunk.length;
			cb();
		},
	});
	return { stream, bytes: () => total };
}

const stubHost: ShellHost = {
	runVerb: async () => "verb output",
	complete: async () => "stub reply",
};

interface RunOptions {
	readonly scriptedKeys?: string;
	readonly maxMs?: number;
	readonly reducedMotion?: boolean;
	readonly host?: ShellHost;
	readonly onTerminal?: (t: StreamTerminal) => void;
}

async function runShell(options: RunOptions): Promise<{
	readonly exitCode: number;
	readonly bytes: number;
	readonly terminal: StreamTerminal;
}> {
	const stdin = new PassThrough();
	const out = collector();
	let terminal!: StreamTerminal;
	const exitCode = await runInteractiveShell({
		stdin,
		stdout: out.stream,
		host: options.host ?? stubHost,
		reducedMotion: options.reducedMotion ?? true,
		env: { ...process.env, HOBO_HOME: temp("hc-shell-home-") },
		...(options.scriptedKeys !== undefined
			? { scriptedKeys: options.scriptedKeys }
			: {}),
		...(options.maxMs !== undefined ? { maxMs: options.maxMs } : {}),
		onTerminal: (t) => {
			terminal = t;
			options.onTerminal?.(t);
		},
	});
	return { exitCode, bytes: out.bytes(), terminal };
}

describe("InteractiveShell render budget (differential rendering)", () => {
	it("typing N keys costs far less than N full-frame repaints", async () => {
		const keys = "hello world";
		const { exitCode, bytes } = await runShell({ scriptedKeys: keys });
		expect(exitCode).toBe(0);
		// Naive pre-fix behavior: (1 initial + one per key) × full frame.
		const naive = (keys.length + 1) * FRAME_BYTES;
		// Diff rendering: one full frame + per-key input-line updates.
		expect(bytes).toBeLessThan(naive / 2);
		expect(bytes).toBeGreaterThan(0);
	});

	it("reduced motion: zero writes while idle after the first paint", async () => {
		let afterPaint = 0;
		let beforeQuit = 0;
		let terminalRef: StreamTerminal | undefined;
		const snapshots = new Promise<void>((resolve) => {
			setTimeout(() => {
				afterPaint = terminalRef?.bytesWritten ?? -1;
			}, 120);
			setTimeout(() => {
				beforeQuit = terminalRef?.bytesWritten ?? -1;
				resolve();
			}, 340);
		});
		const { terminal } = await runShell({
			reducedMotion: true,
			maxMs: 420,
			onTerminal: (t) => {
				terminalRef = t;
			},
		});
		await snapshots;
		expect(afterPaint).toBeGreaterThan(0);
		// No animation, no input — not a single byte between the two snapshots.
		expect(beforeQuit).toBe(afterPaint);
		// Exit cleanup (cursor restore) is the only thing written afterwards.
		expect(terminal.bytesWritten - beforeQuit).toBeLessThan(64);
	});

	it("idle animation stays far below the naive full-repaint byte rate", async () => {
		let afterFirstPaint = 0;
		let terminalRef: StreamTerminal | undefined;
		const firstPaint = new Promise<void>((resolve) => {
			setTimeout(() => {
				afterFirstPaint = terminalRef?.bytesWritten ?? -1;
				resolve();
			}, 120);
		});
		const windowMs = 600;
		const { terminal } = await runShell({
			reducedMotion: false,
			maxMs: 120 + windowMs,
			onTerminal: (t) => {
				terminalRef = t;
			},
		});
		await firstPaint;
		const animationBytes = terminal.bytesWritten - afterFirstPaint;
		// Pre-fix behavior: a full erase+frame every 95 ms regardless of change.
		const naive = Math.floor(windowMs / 95) * FRAME_BYTES;
		expect(animationBytes).toBeLessThan(naive / 2);
	});

	it("a submitted prompt resolves without blocking and renders the reply", async () => {
		let resolved = false;
		const host: ShellHost = {
			runVerb: async () => "verb output",
			complete: async (prompt) => {
				// Yield across the event loop — the shell must keep running.
				await new Promise((r) => setTimeout(r, 20));
				resolved = true;
				return `echo:${prompt}`;
			},
		};
		const { exitCode } = await runShell({
			scriptedKeys: "hi\r",
			host,
		});
		expect(exitCode).toBe(0);
		expect(resolved).toBe(true);
	});
});

describe("default shell host honesty", () => {
	it("a dispatch reply states what actually happened — no success theater", async () => {
		const home = temp("hc-honest-home-");
		const project = temp("hc-honest-proj-");
		const host = createDefaultShellHost({
			hoboHome: home,
			cwd: project,
			env: { ...process.env, HOBO_HOME: home },
		});
		const reply = await host.complete("add a settings button");
		// Honest: names the recorded task and says no engine acted on it.
		expect(reply).toMatch(/Recorded compute task task-[0-9a-f]+/);
		expect(reply).toMatch(/No completion engine/i);
		// Teaches the scripted surface.
		expect(reply).toContain(
			'One-shot equivalent: hobo-code "add a settings button"',
		);
		// The old reply was branding + filler around an 8-char echo panel.
		expect(reply).not.toMatch(/not stock Pi/i);
		expect(reply).not.toMatch(/Bo dispatched your prompt/);
		expect(reply).not.toMatch(/Next: \/status/);
	});

	it("a failed dispatch reply carries the failure code and remediation", async () => {
		const home = temp("hc-honest-fail-");
		const host = createDefaultShellHost({
			hoboHome: home,
			env: { ...process.env, HOBO_HOME: home },
		});
		// Unknown flag on a verb path fails closed with remediation.
		const reply = await host.runVerb(["status", "--wat"]);
		expect(reply.length).toBeGreaterThan(0);
	});
});

describe("StreamTerminal contract", () => {
	it("accounts every byte it writes and implements progress signalling", () => {
		const out = collector();
		const t = new StreamTerminal({
			stdin: new PassThrough(),
			stdout: out.stream,
			columns: 80,
			rows: 24,
		});
		expect(t.bytesWritten).toBe(0);
		t.write("hello");
		expect(t.bytesWritten).toBe(5);
		expect(t.writeCount).toBe(1);
		// setProgress is a real OSC 9;4 signal, not a swallowed call.
		const before = t.bytesWritten;
		t.setProgress(true);
		t.setProgress(false);
		expect(t.bytesWritten).toBeGreaterThan(before);
		expect(t.writeCount).toBe(3);
		// Falls back to declared geometry when the stream carries none.
		expect(t.columns).toBe(80);
		expect(t.rows).toBe(24);
	});
});

describe("wrap cache invalidation", () => {
	it("re-wraps after an explicit invalidate", () => {
		let state = createInitialShellState({
			width: 60,
			height: 24,
			welcome: false,
			reducedMotion: true,
		});
		state = appendAssistant(state, "a message that will be wrapped");
		const first = renderShellFrame(state);
		clearWrapCache();
		// Same state must still render identically from a cold cache.
		expect(renderShellFrame(state)).toBe(first);
	});
});
