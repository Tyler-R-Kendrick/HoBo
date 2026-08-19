/**
 * Slice 2 — streaming engine contract.
 *
 * The pi SDK itself needs credentials, so these tests cover the seams that
 * must hold regardless of provider: the pure event mapper, the availability
 * gate, the host's promote-hint honesty, and streaming turns flowing through
 * the real InteractiveShell driver with Esc cancellation.
 */
import assert from "node:assert/strict";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { must } from "@hobo/core/total-access";
import { afterAll, describe, expect, it } from "vitest";
import { AGUI_EVENT } from "../src/agui.js";
import {
	runInteractiveShell,
	type ShellHost,
} from "../src/interactive-shell.js";
import type { MuxRunner } from "../src/mux.js";
import {
	createResidentSessionRuntime,
	residentSessionTmuxName,
} from "../src/resident-session-runtime.js";
import {
	type EngineTurnEvent,
	formatUsage,
	mapPiEventToTurnEvent,
	PI_SKILLS_ENABLED,
	parsePorcelain,
	type ShellEngine,
	shouldAttemptEngine,
	usageDelta,
	ZERO_USAGE,
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
		).toEqual({
			type: AGUI_EVENT.textMessageContent,
			messageId: "assistant",
			delta: "hel",
		});
		expect(
			mapPiEventToTurnEvent({
				type: "tool_execution_start",
				toolName: "edit",
			}),
		).toEqual({
			type: AGUI_EVENT.toolCallStart,
			toolCallId: "edit",
			toolName: "edit",
		});
		expect(
			mapPiEventToTurnEvent({
				type: "tool_execution_end",
				toolName: "edit",
				isError: true,
			}),
		).toEqual({
			type: AGUI_EVENT.toolCallResult,
			toolCallId: "edit",
			ok: false,
		});
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

it("keeps project skills enabled in the Pi-backed product engine", () => {
	expect(PI_SKILLS_ENABLED).toBe(true);
});

function fakeEngine(overrides: Partial<ShellEngine> = {}): ShellEngine {
	return {
		id: "fake",
		modelLabel: "test/fake-model",
		sandboxRoot: "/tmp/sandbox/run-x",
		runId: "run-x",
		async turn(_prompt, onEvent) {
			onEvent({
				type: AGUI_EVENT.toolCallStart,
				toolCallId: "t1",
				toolName: "edit",
			});
			onEvent({ type: AGUI_EVENT.toolCallResult, toolCallId: "t1", ok: true });
			for (const delta of ["done", " and", " dusted"]) {
				onEvent({
					type: AGUI_EVENT.textMessageContent,
					messageId: "assistant",
					delta,
				});
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
		usage: () => ZERO_USAGE,
		changes: async () => [{ status: "M", path: "src/app.ts" }],
		...overrides,
	};
}

describe("engine-backed shell host", () => {
	it("runs HoBo control commands and closes its bridged dev session", async () => {
		const root = temp("hc-hobo-control-");
		const hoboBin = join(root, "hobo");
		writeFileSync(hoboBin, "#!/bin/sh\nprintf 'hobo:%s\\n' \"$*\"\n");
		chmodSync(hoboBin, 0o755);
		let closed = false;
		const host = createDefaultShellHost({
			cwd: root,
			hoboHome: join(root, ".hobo"),
			env: { ...process.env, HOBO_CODE_HOBO_BIN: hoboBin },
			startDevSession: async () => ({
				sessionId: "dev-test",
				appUrl: "http://127.0.0.1:4173/",
				debugUrl: "http://127.0.0.1:4173/",
				controlsUrl: "http://127.0.0.1:4174/controls/test",
				reportUrl: "http://127.0.0.1:4174/report",
				evidencePath: join(root, ".hobo", "durable", "code", "evidence"),
				close: async () => {
					closed = true;
				},
			}),
			fetch: async () => new Response("ok"),
		});

		expect(await host.runVerb(["hobo", "yard", "status"])).toContain(
			"hobo:yard status",
		);
		expect(await host.runVerb(["hobo", "dev", "--port", "0"])).toContain(
			"bindle",
		);
		expect(closed).toBe(false);
		await host.dispose?.();
		expect(closed).toBe(true);
	});

	it("executes resident attach and detach actions", async () => {
		const home = temp("hc-shell-session-");
		const bin = temp("hc-shell-bin-");
		const log = join(home, "tmux.log");
		const tmuxPath = join(bin, "tmux");
		writeFileSync(
			tmuxPath,
			[
				"#!/bin/sh",
				'case "$1" in',
				"  has-session) exit 0 ;;",
				'  list-panes) printf "%s\\n" "$HOBO_TMUX_PANE"; exit 0 ;;',
				'  new-window) printf "%%2\\n" ;;',
				'  attach-session|switch-client|detach-client) printf "%s\\n" "$*" >> "$HOBO_TMUX_LOG" ;;',
				"esac",
				"",
			].join("\n"),
		);
		chmodSync(tmuxPath, 0o755);
		const tmux: MuxRunner = {
			async run(args) {
				if (args[0] === "has-session") {
					return { code: 1, stdout: "", stderr: "can't find session" };
				}
				return {
					code: 0,
					stdout: args[0] === "new-session" ? "%1\n" : "",
				};
			},
		};
		const runtime = createResidentSessionRuntime({
			dataDir: join(home, "durable", "code", "sessions"),
			tmux,
		});
		const created = await runtime.create({
			id: "switchable",
			name: "switchable",
			projectRoot: "/repo",
			worktreePath: "/repo/.worktrees/switchable",
			branch: "code/switchable",
			clientId: "seed",
		});
		runtime.close();
		const pane = created.panes[0];
		const tab = created.tabs[0];
		if (!pane || !tab) throw new Error("seed session has no pane");
		const metadata = Buffer.from(
			JSON.stringify({
				paneId: pane.id,
				tabId: tab.id,
				paneTitle: pane.title,
				tabTitle: tab.title,
				workingDirectory: pane.workingDirectory,
			}),
		).toString("base64url");

		const env = {
			...process.env,
			PATH: `${bin}:${process.env.PATH ?? ""}`,
			HOBO_TMUX_LOG: log,
			HOBO_TMUX_PANE: `${pane.runtimeId}\t1\t1\tenv HOBO_PANE_META=${metadata}\t\t`,
		};
		const priorPath = process.env.PATH;
		const priorPane = process.env.HOBO_TMUX_PANE;
		try {
			process.env.PATH = env.PATH;
			process.env.HOBO_TMUX_PANE = env.HOBO_TMUX_PANE;
			const attached = await createDefaultShellHost({
				hoboHome: home,
				env,
			}).runVerb(["session", "attach", "switchable"]);
			expect(attached).toContain("attach switchable");
			await createDefaultShellHost({
				hoboHome: home,
				env: { ...env, TMUX: "/tmp/tmux,1,0" },
			}).runVerb(["session", "switch", "switchable"]);
			await createDefaultShellHost({
				hoboHome: home,
				env: { ...env, TMUX: "/tmp/tmux,1,0" },
			}).runVerb(["session", "detach", "switchable"]);
		} finally {
			if (priorPath === undefined) delete process.env.PATH;
			else process.env.PATH = priorPath;
			if (priorPane === undefined) delete process.env.HOBO_TMUX_PANE;
			else process.env.HOBO_TMUX_PANE = priorPane;
		}

		const name = residentSessionTmuxName("switchable");
		expect(readFileSync(log, "utf8")).toBe(
			`attach-session -t ${name}\nswitch-client -t ${name}\ndetach-client\n`,
		);
	});

	it("advertises the engine and streams turns without mutating anything", async () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		expect(host.engineLabel).toBe("fake · test/fake-model");
		assert(host.streamTurn);
		const events: EngineTurnEvent[] = [];
		const result = await host.streamTurn("do the thing", (e) => events.push(e));
		expect(result.ok).toBe(true);
		expect(events.some((e) => e.type === AGUI_EVENT.textMessageContent)).toBe(
			true,
		);
		// The reply is the model's answer — not padded with promotion nags.
		expect(result.text).toBe("done and dusted");
	});

	it("raises an approval gate only when the sandbox actually changed", async () => {
		const edited = createDefaultShellHost({ engine: fakeEngine() });
		assert(edited.pendingApprovalFor);
		const gate = await edited.pendingApprovalFor({
			ok: true,
			text: "done",
			toolCalls: 1,
			aborted: false,
		});
		expect(gate).not.toBeNull();
		expect(must(gate).runId).toBe("run-x");
		expect(must(gate).changes).toEqual([{ status: "M", path: "src/app.ts" }]);

		// An answer-only turn must never nag for a promotion.
		assert(edited.pendingApprovalFor);
		expect(
			await edited.pendingApprovalFor({
				ok: true,
				text: "just an answer",
				toolCalls: 0,
				aborted: false,
			}),
		).toBeNull();

		// Tool ran but wrote nothing → still no gate.
		const readOnly = createDefaultShellHost({
			engine: fakeEngine({ changes: async () => [] }),
		});
		assert(readOnly.pendingApprovalFor);
		expect(
			await readOnly.pendingApprovalFor({
				ok: true,
				text: "read only",
				toolCalls: 2,
				aborted: false,
			}),
		).toBeNull();
	});

	it("promotes through the gated CLI path and reports refusals honestly", async () => {
		const home = temp("hc-promote-");
		const project = temp("hc-promote-proj-");
		const host = createDefaultShellHost({
			engine: fakeEngine(),
			hoboHome: home,
			cwd: project,
			env: { ...process.env, HOBO_HOME: home },
		});
		// No such sandbox run exists → promotion must fail closed, not pretend.
		assert(host.promote);
		const text = await host.promote({
			runId: "run-x",
			sandboxRoot: "/tmp/sandbox/run-x",
			changes: [{ status: "M", path: "src/app.ts" }],
		});
		expect(text).toMatch(/Promotion refused/);
		expect(text).toMatch(/work stays in the sandbox/);
		expect(text).not.toMatch(/Promoted run/);
	});

	it("surfaces provider-reported usage only once something was spent", async () => {
		const quiet = createDefaultShellHost({ engine: fakeEngine() });
		assert(quiet.usageLabel);
		expect(quiet.usageLabel()).toBe("");
		const spent = createDefaultShellHost({
			engine: fakeEngine({
				usage: () => ({
					inputTokens: 1200,
					outputTokens: 340,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					totalTokens: 1540,
					costUsd: 0.0123,
				}),
			}),
		});
		assert(spent.usageLabel);
		expect(spent.usageLabel()).toBe("1.2k in · 340 out · $0.0123");
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
				onEvent({
					type: AGUI_EVENT.toolCallStart,
					toolCallId: "r1",
					toolName: "read",
				});
				onEvent({
					type: AGUI_EVENT.toolCallResult,
					toolCallId: "r1",
					ok: true,
				});
				onEvent({
					type: AGUI_EVENT.textMessageContent,
					messageId: "assistant",
					delta: "part-1 ",
				});
				// Give the renderer a beat with only the partial text visible.
				await new Promise((r) => setTimeout(r, 30));
				sawPartialRender = true;
				onEvent({
					type: AGUI_EVENT.textMessageContent,
					messageId: "assistant",
					delta: "part-2",
				});
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
		expect(frames).toContain("tool ✓ read");
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
					onEvent({
						type: AGUI_EVENT.textMessageContent,
						messageId: "assistant",
						delta: "working…",
					});
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

describe("usage accounting", () => {
	it("reports per-turn deltas, never cumulative totals", () => {
		const before = {
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 10,
			cacheWriteTokens: 5,
			totalTokens: 165,
			costUsd: 0.01,
		};
		const after = {
			inputTokens: 400,
			outputTokens: 130,
			cacheReadTokens: 40,
			cacheWriteTokens: 5,
			totalTokens: 575,
			costUsd: 0.043,
		};
		const d = usageDelta(before, after);
		expect(d.inputTokens).toBe(300);
		expect(d.outputTokens).toBe(80);
		expect(d.cacheReadTokens).toBe(30);
		expect(d.totalTokens).toBe(410);
		expect(d.costUsd).toBeCloseTo(0.033, 6);
	});

	it("clamps at zero when a provider resets counters mid-session", () => {
		const d = usageDelta(
			{ ...ZERO_USAGE, inputTokens: 500, costUsd: 1 },
			ZERO_USAGE,
		);
		expect(d.inputTokens).toBe(0);
		expect(d.costUsd).toBe(0);
	});

	it("formats compactly with cache and sub-cent costs", () => {
		expect(
			formatUsage({
				inputTokens: 1200,
				outputTokens: 340,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				totalTokens: 1540,
				costUsd: 0.0123,
			}),
		).toBe("1.2k in · 340 out · $0.0123");
		expect(
			formatUsage({
				...ZERO_USAGE,
				inputTokens: 10,
				cacheReadTokens: 2000,
				costUsd: 0.00001,
			}),
		).toContain("2.0k cached");
		expect(formatUsage({ ...ZERO_USAGE, costUsd: 0.00001 })).toContain(
			"<$0.0001",
		);
	});
});

describe("parsePorcelain", () => {
	it("parses statuses, ignores blanks, and takes the new path of a rename", () => {
		const changes = parsePorcelain(
			[
				" M src/app.ts",
				"?? src/new.ts",
				"A  src/added.ts",
				"R  src/old.ts -> src/renamed.ts",
				"",
			].join("\n"),
		);
		expect(changes).toEqual([
			{ status: "M", path: "src/app.ts" },
			{ status: "??", path: "src/new.ts" },
			{ status: "A", path: "src/added.ts" },
			{ status: "R", path: "src/renamed.ts" },
		]);
	});

	it("returns nothing for a clean tree", () => {
		expect(parsePorcelain("")).toEqual([]);
	});
});

describe("promotion approval gate (ADR-0139 mediated mutation)", () => {
	function approvalHost(
		overrides: Partial<ShellHost> = {},
	): ShellHost & { promoted: string[] } {
		const promoted: string[] = [];
		const host = {
			promoted,
			runVerb: async () => "verb output",
			complete: async () => "unused",
			engineLabel: "fake · test/fake-model",
			streamTurn: async (_p: string, onEvent: (e: EngineTurnEvent) => void) => {
				onEvent({
					type: AGUI_EVENT.toolCallStart,
					toolCallId: "e1",
					toolName: "edit",
				});
				onEvent({
					type: AGUI_EVENT.toolCallResult,
					toolCallId: "e1",
					ok: true,
				});
				return { ok: true, text: "edited", toolCalls: 1, aborted: false };
			},
			pendingApprovalFor: async () => ({
				runId: "run-gate",
				sandboxRoot: "/tmp/sandbox/run-gate",
				changes: [
					{ status: "M", path: "src/app.ts" },
					{ status: "A", path: "src/new.ts" },
				],
			}),
			promote: async (a: { runId: string }) => {
				promoted.push(a.runId);
				return `Promoted run ${a.runId} (squash-only, gated, audited).`;
			},
			...overrides,
		} as ShellHost & { promoted: string[] };
		return host;
	}

	async function runWithKeys(host: ShellHost, keys: string): Promise<string> {
		let frames = "";
		const out = new Writable({
			write(chunk, _e, cb) {
				frames += chunk.toString();
				cb();
			},
		});
		await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: out,
			host,
			reducedMotion: true,
			env: { ...process.env, HOBO_HOME: temp("hc-gate-home-") },
			scriptedKeys: keys,
		});
		return frames;
	}

	it("shows the blast radius and does not promote without approval", async () => {
		const host = approvalHost();
		const frames = await runWithKeys(host, "go\r");
		expect(frames).toContain("promote run-gate?");
		expect(frames).toContain("canonical tree is untouched until you say yes");
		expect(frames).toContain("src/app.ts");
		expect(frames).toContain("src/new.ts");
		expect(frames).toContain("y promote · n keep sandboxed");
		// Nothing was promoted — the gate is still open.
		expect(host.promoted).toEqual([]);
	});

	it("y promotes through the audited handler", async () => {
		const host = approvalHost();
		const frames = await runWithKeys(host, "go\ry");
		expect(host.promoted).toEqual(["run-gate"]);
		expect(frames).toContain("squash-only, gated, audited");
	});

	it("n declines and keeps the work sandboxed with a way back", async () => {
		const host = approvalHost();
		const frames = await runWithKeys(host, "go\rn");
		expect(host.promoted).toEqual([]);
		expect(frames).toContain("Kept sandboxed");
		expect(frames).toContain("hobo-code promote --run run-gate");
	});

	it("is modal — stray keys neither type nor promote", async () => {
		const host = approvalHost();
		const frames = await runWithKeys(host, "go\rxyz");
		expect(host.promoted).toEqual([]);
		// Still waiting: the gate is up and nothing leaked into the input line.
		expect(frames).toContain("y promote · n keep sandboxed");
		expect(frames).not.toContain("❯ xyz");
	});

	it("no gate when the turn changed nothing", async () => {
		const host = approvalHost({ pendingApprovalFor: async () => null });
		const frames = await runWithKeys(host, "go\r");
		expect(frames).not.toContain("promote run-gate?");
		expect(host.promoted).toEqual([]);
	});
});
