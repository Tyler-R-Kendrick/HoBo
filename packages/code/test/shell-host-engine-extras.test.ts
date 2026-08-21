/**
 * The default InteractiveShell host, as seen with and without an engine.
 *
 * The host's honesty contract (ADR-0139) is what these tests hold. A shell
 * with no completion engine wired must not pretend to have one, and a shell
 * with an engine must not pretend a turn reached the canonical tree.
 *
 * **The engine-derived surface exists only when an engine exists.** A footer
 * label, a usage readout, a turn streamer, an abort, an approval gate and a
 * promote path all appear together or not at all. Half-present would let the
 * shell render an engine footer over a dispatch-only session.
 *
 * **The approval gate rises only when the sandbox actually changed.** A turn
 * that answered a question without touching a file must not nag for a
 * promotion; a turn that made tool calls but left the tree identical must not
 * either. The gate is about changes, not about activity.
 *
 * **The usage readout is empty rather than zeroed.** A provider that reports
 * no usage is different from a turn that cost nothing, and rendering
 * `0 in · 0 out · $0.0000` claims a measurement that was never taken.
 *
 * These tests drive the host with a stand-in engine, so no model is contacted
 * and no sandbox is promoted.
 */
import { describe, expect, it } from "vitest";
import type {
	EngineTurnEvent,
	EngineTurnResult,
	EngineUsage,
	SandboxChange,
	ShellEngine,
} from "../src/shell-engine.js";
import { createDefaultShellHost } from "../src/shell-host.js";

const NO_USAGE: EngineUsage = {
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
	cacheReadTokens: 0,
	costUsd: 0,
};

/** A stand-in engine that records what the host asked it to do. */
function fakeEngine(overrides: Partial<ShellEngine> = {}): ShellEngine & {
	readonly calls: string[];
} {
	const calls: string[] = [];
	const engine: ShellEngine & { readonly calls: string[] } = {
		calls,
		id: "pi",
		modelLabel: "anthropic/claude",
		sandboxRoot: "/sandbox/run-1",
		runId: "run-1",
		async turn(prompt, onEvent) {
			calls.push(`turn:${prompt}`);
			onEvent({ kind: "text", text: "hello" } as EngineTurnEvent);
			return {
				ok: true,
				text: "hello",
				toolCalls: 0,
				aborted: false,
			} satisfies EngineTurnResult;
		},
		async abort() {
			calls.push("abort");
		},
		async dispose() {
			calls.push("dispose");
		},
		usage() {
			return NO_USAGE;
		},
		async changes() {
			return [];
		},
		...overrides,
	};
	return engine;
}

const change = (path: string): SandboxChange =>
	// SAFETY: the host reads the change list only to count and forward it.
	({ path, status: "modified" }) as SandboxChange;

describe("a host with no engine", () => {
	it("advertises no engine label", () => {
		const host = createDefaultShellHost();
		// The footer renders whatever this holds; a label here over a
		// dispatch-only session would claim a model that never runs.
		expect(host.engineLabel).toBeUndefined();
	});

	it("offers no turn streamer", () => {
		expect(createDefaultShellHost().streamTurn).toBeUndefined();
	});

	it("offers no cancel", () => {
		// Nothing is running, so a cancel key must be inert rather than
		// silently succeeding.
		expect(createDefaultShellHost().cancelTurn).toBeUndefined();
	});

	it("offers no approval gate", () => {
		expect(createDefaultShellHost().pendingApprovalFor).toBeUndefined();
	});

	it("offers no promote path", () => {
		// With no sandbox there is nothing to promote; exposing the verb would
		// invite a user to approve work that does not exist.
		expect(createDefaultShellHost().promote).toBeUndefined();
	});

	it("offers no usage readout", () => {
		expect(createDefaultShellHost().usageLabel).toBeUndefined();
	});

	it("treats an explicit null engine the same as no engine", () => {
		// The wiring passes `null` when the engine gate declined; it must not
		// be read as a truthy engine object.
		expect(
			createDefaultShellHost({ engine: null }).engineLabel,
		).toBeUndefined();
	});

	it("still exposes the workspace action path", () => {
		// Dispatch-only is a real mode, not a degraded one — creating and
		// running a Bindle works without a model.
		expect(typeof createDefaultShellHost().tryWorkspaceAction).toBe("function");
	});

	it("still disposes cleanly with nothing open", async () => {
		await expect(createDefaultShellHost().dispose?.()).resolves.toBeUndefined();
	});
});

describe("a host with an engine", () => {
	it("labels the footer with the engine and its model", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		// Both halves matter: the engine id says which harness runs, the model
		// label says what actually answers.
		expect(host.engineLabel).toBe("pi · anthropic/claude");
	});

	it("names the engine and model in the about lines", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		expect(host.aboutLines?.[0]).toContain("anthropic/claude");
	});

	it("names the sandbox root in the about lines", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		// A user needs to know where edits are landing before they approve one.
		expect(host.aboutLines?.join("\n")).toContain("/sandbox/run-1");
	});

	it("states that the canonical tree is read-only", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		expect(host.aboutLines?.join("\n")).toContain("canonical tree read-only");
	});

	it("states that promotion is gated and audited", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		// The honesty contract: an edit is not applied until an audited promote.
		expect(host.aboutLines?.join("\n")).toMatch(/gated and audited/);
	});

	it("names the run id promotion would target", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		expect(host.aboutLines?.join("\n")).toContain("run-1");
	});

	it("keeps the Pi TUI described as an escape hatch, not the product", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		expect(host.aboutLines?.join("\n")).toContain("never the product UI");
	});

	it("streams a turn through the engine", async () => {
		const engine = fakeEngine();
		const host = createDefaultShellHost({ engine });
		const events: EngineTurnEvent[] = [];
		await host.streamTurn?.("say hi", (event) => events.push(event));
		expect(engine.calls).toContain("turn:say hi");
		// The host must forward events as they arrive rather than buffering the
		// whole turn — that is what makes the shell feel live.
		expect(events).toHaveLength(1);
	});

	it("returns the engine's own turn result", async () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		const result = await host.streamTurn?.("say hi", () => undefined);
		expect(result).toMatchObject({ ok: true, text: "hello" });
	});

	it("cancels through the engine's abort", async () => {
		const engine = fakeEngine();
		const host = createDefaultShellHost({ engine });
		await host.cancelTurn?.();
		expect(engine.calls).toContain("abort");
	});
});

describe("the usage readout", () => {
	it("is empty when the provider reported nothing", () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		// Zeros are not a measurement of zero. Rendering them would claim a cost
		// reading the provider never gave.
		expect(host.usageLabel?.()).toBe("");
	});

	it("renders once tokens have been reported", () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({
				usage: () => ({
					inputTokens: 1200,
					outputTokens: 340,
					totalTokens: 1540,
					cacheReadTokens: 0,
					costUsd: 0.0123,
				}),
			}),
		});
		expect(host.usageLabel?.()).toBe("1.2k in · 340 out · $0.0123");
	});

	it("renders on cost alone when the token counts are absent", () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({
				usage: () => ({ ...NO_USAGE, costUsd: 0.5 }),
			}),
		});
		// A provider that bills without reporting tokens still owes the user a
		// visible number.
		expect(host.usageLabel?.()).toContain("$0.5000");
	});

	it("shows a sub-cent cost as a floor rather than as zero", () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({
				usage: () => ({ ...NO_USAGE, totalTokens: 10, costUsd: 0.00001 }),
			}),
		});
		// `$0.0000` reads as free; `<$0.0001` reads as cheap. Only one is true.
		expect(host.usageLabel?.()).toContain("<$0.0001");
	});

	it("reports cached tokens when any were read", () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({
				usage: () => ({
					inputTokens: 2000,
					outputTokens: 100,
					totalTokens: 2100,
					cacheReadTokens: 1500,
					costUsd: 0.01,
				}),
			}),
		});
		expect(host.usageLabel?.()).toContain("1.5k cached");
	});

	it("reads the engine fresh on every call", () => {
		let calls = 0;
		const host = createDefaultShellHost({
			engine: fakeEngine({
				usage: () => {
					calls += 1;
					return { ...NO_USAGE, totalTokens: calls, costUsd: calls };
				},
			}),
		});
		host.usageLabel?.();
		// A cached label would freeze the footer at the first turn's cost.
		expect(host.usageLabel?.()).toContain("$2.0000");
	});
});

describe("the approval gate", () => {
	it("stays down for a turn that made no tool calls", async () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		const pending = await host.pendingApprovalFor?.({
			ok: true,
			text: "the answer is 4",
			toolCalls: 0,
			aborted: false,
		});
		// An answer-only turn cannot have changed anything; asking to promote it
		// trains the user to approve without reading.
		expect(pending).toBeNull();
	});

	it("does not consult the sandbox for an answer-only turn", async () => {
		let consulted = 0;
		const host = createDefaultShellHost({
			engine: fakeEngine({
				changes: async () => {
					consulted += 1;
					return [];
				},
			}),
		});
		await host.pendingApprovalFor?.({
			ok: true,
			text: "4",
			toolCalls: 0,
			aborted: false,
		});
		// Diffing a sandbox costs real work; the tool-call count short-circuits it.
		expect(consulted).toBe(0);
	});

	it("stays down when tool calls left the sandbox identical", async () => {
		const host = createDefaultShellHost({ engine: fakeEngine() });
		const pending = await host.pendingApprovalFor?.({
			ok: true,
			text: "read three files",
			toolCalls: 3,
			aborted: false,
		});
		// Reads are tool calls too. Activity is not a change.
		expect(pending).toBeNull();
	});

	it("rises when the sandbox actually changed", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({ changes: async () => [change("src/app.ts")] }),
		});
		const pending = await host.pendingApprovalFor?.({
			ok: true,
			text: "edited",
			toolCalls: 1,
			aborted: false,
		});
		expect(pending).not.toBeNull();
	});

	it("carries the run id promotion would target", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({ changes: async () => [change("src/app.ts")] }),
		});
		const pending = await host.pendingApprovalFor?.({
			ok: true,
			text: "edited",
			toolCalls: 1,
			aborted: false,
		});
		// Approving the wrong run would promote someone else's sandbox.
		expect(pending?.runId).toBe("run-1");
	});

	it("carries the sandbox root so the user can look before approving", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({ changes: async () => [change("src/app.ts")] }),
		});
		const pending = await host.pendingApprovalFor?.({
			ok: true,
			text: "edited",
			toolCalls: 1,
			aborted: false,
		});
		expect(pending?.sandboxRoot).toBe("/sandbox/run-1");
	});

	it("carries every changed file, not a count", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({
				changes: async () => [change("a.ts"), change("b.ts")],
			}),
		});
		const pending = await host.pendingApprovalFor?.({
			ok: true,
			text: "edited",
			toolCalls: 2,
			aborted: false,
		});
		// The gate shows a diff summary; a bare count is not something a user
		// can meaningfully approve.
		expect(pending?.changes).toHaveLength(2);
	});

	it("rises even for a turn the engine reported as failed", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({ changes: async () => [change("a.ts")] }),
		});
		const pending = await host.pendingApprovalFor?.({
			ok: false,
			text: "",
			toolCalls: 1,
			aborted: false,
			error: "model error",
		});
		// A turn that died mid-edit still left files behind; hiding the gate
		// would strand those changes in a sandbox with no way to see them.
		expect(pending).not.toBeNull();
	});

	it("rises for an aborted turn that had already written", async () => {
		const host = createDefaultShellHost({
			engine: fakeEngine({ changes: async () => [change("a.ts")] }),
		});
		const pending = await host.pendingApprovalFor?.({
			ok: false,
			text: "",
			toolCalls: 1,
			aborted: true,
		});
		expect(pending).not.toBeNull();
	});
});
