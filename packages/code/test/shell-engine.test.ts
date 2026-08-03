/**
 * Slice 2 — streaming engine contract.
 *
 * The pi SDK itself needs credentials, so these tests cover the seams that
 * must hold regardless of provider: the pure event mapper, the availability
 * gate, the host's promote-hint honesty, and streaming turns flowing through
 * the real InteractiveShell driver with Esc cancellation.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
	runInteractiveShell,
	type ShellHost,
} from "../src/interactive-shell.js";
import {
	type EngineTurnEvent,
	mapPiEventToTurnEvent,
	type ShellEngine,
	shouldAttemptEngine,
} from "../src/shell-engine.js";
import { createDefaultShellHost } from "../src/shell-host.js";

const cleanups: string[] = [];
afterAll(() => {
	for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	cleanups.push(d);
	return d;
}

function sink(): Writable {
	return new Writable({
		write(_c, _e, cb) {
			cb();
		},
	});
}

describe("mapPiEventToTurnEvent", () => {
	it("maps text deltas, tool starts/ends; ignores the rest", () => {
		expect(
			mapPiEventToTurnEvent({
				type: "message_update",
				assistantMessageEvent: { type: "text_delta", delta: "hel" },
			}),
		).toEqual({ kind: "text-delta", delta: "hel" });
		expect(
			mapPiEventToTurnEvent({
				type: "tool_execution_start",
				toolName: "edit",
			}),
		).toEqual({ kind: "tool-start", name: "edit" });
		expect(
			mapPiEventToTurnEvent({
				type: "tool_execution_end",
				toolName: "edit",
				isError: true,
			}),
		).toEqual({ kind: "tool-end", name: "edit", ok: false });
		expect(mapPiEventToTurnEvent({ type: "agent_start" })).toBeNull();
		expect(
			mapPiEventToTurnEvent({
				type: "message_update",
				assistantMessageEvent: { type: "thinking_delta", delta: "…" },
			}),
		).toBeNull();
	});
});

describe("shouldAttemptEngine", () => {
	const noAgentDir = { piAgentDir: join(temp("hc-no-agent-"), "missing") };

	it("opts out on HOBO_CODE_ENGINE=none and in on =pi", () => {
		expect(shouldAttemptEngine({ HOBO_CODE_ENGINE: "none" }, noAgentDir)).toBe(
			false,
		);
		expect(shouldAttemptEngine({ HOBO_CODE_ENGINE: "pi" }, noAgentDir)).toBe(
			true,
		);
	});

	it("attempts only when a credential source is plausible", () => {
		expect(shouldAttemptEngine({}, noAgentDir)).toBe(false);
		expect(shouldAttemptEngine({ ANTHROPIC_API_KEY: "x" }, noAgentDir)).toBe(
			true,
		);
		expect(
			shouldAttemptEngine(
				{ OPENAI_BASE_URL: "http://127.0.0.1:1" },
				noAgentDir,
			),
		).toBe(true);
		// HOBO_CODE_MODEL alone is a preference, not a credential
		expect(
			shouldAttemptEngine({ HOBO_CODE_MODEL: "ollama/x" }, noAgentDir),
		).toBe(false);
	});
});

function fakeEngine(overrides: Partial<ShellEngine> = {}): ShellEngine {
	return {
		id: "fake",
		modelLabel: "test/fake-model",
		sandboxRoot: "/tmp/sandbox/run-x",
		runId: "run-x",
		async turn(_prompt, onEvent) {
			onEvent({ kind: "tool-start", name: "edit" });
			onEvent({ kind: "tool-end", name: "edit", ok: true });
			for (const delta of ["done", " and", " dusted"]) {
				onEvent({ kind: "text-delta", delta });
			}
			return {
				ok: true,
				text: "done and dusted",
				toolCalls: 1,
				aborted: false,
			};
		},
		async abort() {},
		async dispose() {},
		...overrides,
	};
}

describe("engine-backed shell host", () => {
	it("advertises the engine and appends the audited promote hint after edits", async () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		expect(host.engineLabel).toBe("fake · test/fake-model");
		expect(host.streamTurn).toBeDefined();
		const events: EngineTurnEvent[] = [];
		const result = await host.streamTurn!("do the thing", (e) =>
			events.push(e),
		);
		expect(result.ok).toBe(true);
		expect(events.some((e) => e.kind === "text-delta")).toBe(true);
		// Mediated-mutation honesty: edits are not applied; promote is the gate.
		expect(result.text).toContain("mediated sandbox (run run-x)");
		expect(result.text).toContain("hobo-code promote --run run-x");
	});

	it("no promote hint when the turn made no edits", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({
				async turn(_p, onEvent) {
					onEvent({ kind: "text-delta", delta: "just an answer" });
					return {
						ok: true,
						text: "just an answer",
						toolCalls: 0,
						aborted: false,
					};
				},
			}),
		});
		const result = await host.streamTurn!("question", () => {});
		expect(result.text).toBe("just an answer");
		expect(result.text).not.toContain("promote");
	});
});

describe("streaming turns through the InteractiveShell driver", () => {
	it("streams deltas live and renders tool lines and the final text", async () => {
		let sawPartialRender = false;
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const host: ShellHost = {
			runVerb: async () => "",
			complete: async () => "unused",
			engineLabel: "fake · test/fake-model",
			streamTurn: async (_prompt, onEvent) => {
				onEvent({ kind: "tool-start", name: "read" });
				onEvent({ kind: "tool-end", name: "read", ok: true });
				onEvent({ kind: "text-delta", delta: "part-1 " });
				// Give the renderer a beat with only the partial text visible.
				await new Promise((r) => setTimeout(r, 30));
				sawPartialRender = true;
				onEvent({ kind: "text-delta", delta: "part-2" });
				release();
				return {
					ok: true,
					text: "part-1 part-2",
					toolCalls: 1,
					aborted: false,
				};
			},
		};
		let frames = "";
		const out = new Writable({
			write(chunk, _e, cb) {
				frames += chunk.toString();
				cb();
			},
		});
		const stdin = new PassThrough();
		const exitCode = await runInteractiveShell({
			stdin,
			stdout: out,
			host,
			reducedMotion: true,
			env: { ...process.env, HOBO_HOME: temp("hc-eng-home-") },
			scriptedKeys: "go\r",
		});
		await gate;
		expect(exitCode).toBe(0);
		expect(sawPartialRender).toBe(true);
		expect(frames).toContain("tool · read ✓");
		expect(frames).toContain("part-1 part-2");
		// Footer carries the real engine label, not engine:none
		expect(frames).toContain("fake · test/fake-model");
		expect(frames).not.toContain("engine:none");
	});

	it("Esc cancels the in-flight turn", async () => {
		let cancelled = false;
		let resolveTurn!: () => void;
		const host: ShellHost = {
			runVerb: async () => "",
			complete: async () => "unused",
			streamTurn: (_prompt, onEvent) =>
				new Promise((resolve) => {
					onEvent({ kind: "text-delta", delta: "working…" });
					resolveTurn = () =>
						resolve({ ok: false, text: "", toolCalls: 0, aborted: true });
				}),
			cancelTurn: async () => {
				cancelled = true;
				resolveTurn();
			},
		};
		const stdin = new PassThrough();
		const exitCode = await runInteractiveShell({
			stdin,
			stdout: sink(),
			host,
			reducedMotion: true,
			env: { ...process.env, HOBO_HOME: temp("hc-esc-home-") },
			scriptedKeys: "go\r\x1b",
		});
		expect(exitCode).toBe(0);
		expect(cancelled).toBe(true);
	});
});
