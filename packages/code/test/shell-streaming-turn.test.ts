/**
 * A streaming turn, from the shell's side of the seam.
 *
 * When a host wires `streamTurn`, the shell stops calling `complete` and
 * renders the turn as it arrives. That swap moves several decisions into the
 * loop, and each one is a place the user could be told something untrue:
 *
 * **A cancelled turn says so; a failed turn says why.** The rendered body gets
 * `(cancelled)` or `(failed: reason)` appended, and the message state goes to
 * `blocked` only for the genuine failure. A cancelled turn marked blocked
 * would look like the model refused; a failed turn marked idle would look like
 * a complete answer that happened to be short.
 *
 * **A turn that produced nothing says `(no reply)`.** An empty assistant
 * bubble is indistinguishable from a rendering bug — the user cannot tell
 * whether the model said nothing or the shell lost it.
 *
 * **The approval gate is raised only for a turn that actually succeeded.** Not
 * after a cancel, not after a failure. Raising it otherwise would ask the user
 * to approve the output of a run that did not finish.
 *
 * **A deterministic workspace action pre-empts the engine entirely.** When
 * `tryWorkspaceAction` answers, the prompt must not also reach the model —
 * paying for a turn whose answer was already known, and then showing whichever
 * of the two arrived last.
 *
 * Driven through `runInteractiveShell` with scripted keys, each run against
 * its own `HOBO_HOME`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { AGUI_EVENT } from "../src/agui.js";
import { runInteractiveShell } from "../src/interactive-shell.js";
import type { EngineTurnEvent, EngineTurnResult } from "../src/shell-engine.js";

const CTRL_C = "\u0003";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-stream-"));
	homes.push(dir);
	return dir;
}

/** The event stream a well-behaved engine emits for a one-message turn. */
const textEvents = (text: string): readonly EngineTurnEvent[] => [
	{ type: AGUI_EVENT.runStarted, runId: "r1" },
	{ type: AGUI_EVENT.textMessageStart, messageId: "m1", role: "assistant" },
	{ type: AGUI_EVENT.textMessageContent, messageId: "m1", delta: text },
	{ type: AGUI_EVENT.textMessageEnd, messageId: "m1" },
	{ type: AGUI_EVENT.runFinished, runId: "r1" },
];

const okResult = (text: string): EngineTurnResult => ({
	ok: true,
	text,
	toolCalls: 0,
	aborted: false,
});

interface StreamOptions {
	readonly events?: readonly EngineTurnEvent[];
	readonly result?: EngineTurnResult;
	/** Throw out of streamTurn rather than resolving. */
	readonly throws?: boolean;
	/** Answer deterministically before the engine is consulted. */
	readonly workspaceAnswer?: string | null;
	/** Raise an approval gate after the turn. */
	readonly approval?: boolean;
}

async function drive(scriptedKeys: string, options: StreamOptions = {}) {
	const chunks: string[] = [];
	const completes: string[] = [];
	const streamed: string[] = [];
	const workspacePrompts: string[] = [];
	let approvalsAsked = 0;
	const code = await runInteractiveShell({
		stdin: new PassThrough(),
		stdout: new Writable({
			write(chunk, _encoding, done) {
				chunks.push(String(chunk));
				done();
			},
		}),
		hoboHome: home(),
		sidecars: false,
		reducedMotion: true,
		scriptedKeys,
		host: {
			runVerb: async (argv: readonly string[]) => `ran ${argv.join(" ")}`,
			complete: async (prompt: string) => {
				completes.push(prompt);
				return `complete: ${prompt}`;
			},
			streamTurn: async (
				prompt: string,
				onEvent: (event: EngineTurnEvent) => void,
			) => {
				streamed.push(prompt);
				if (options.throws) throw new Error("engine exploded");
				for (const event of options.events ?? textEvents("streamed reply")) {
					onEvent(event);
				}
				return options.result ?? okResult("streamed reply");
			},
			...(options.workspaceAnswer !== undefined
				? {
						tryWorkspaceAction: async (prompt: string) => {
							workspacePrompts.push(prompt);
							return options.workspaceAnswer ?? null;
						},
					}
				: undefined),
			...(options.approval
				? {
						pendingApprovalFor: async () => {
							approvalsAsked += 1;
							// SAFETY: the fixture stands in for the gate the host builds.
							return {
								kind: "promote",
								summary: "promote 1 file",
							} as never;
						},
					}
				: undefined),
		},
		// SAFETY: the scripted-driver options are the shape the shell declares.
	} as never);
	return {
		code,
		output: chunks.join(""),
		completes,
		streamed,
		workspacePrompts,
		approvalsAsked,
	};
}

describe("a wired engine replaces the completion fallback", () => {
	it("sends the prompt to streamTurn", async () => {
		expect((await drive(`hello\r${CTRL_C}`)).streamed).toStrictEqual(["hello"]);
	});

	it("does not also send it to complete", async () => {
		// Both wired means both would be paid for, and the user would see
		// whichever arrived last.
		expect((await drive(`hello\r${CTRL_C}`)).completes).toStrictEqual([]);
	});

	it("renders the streamed text", async () => {
		expect((await drive(`hello\r${CTRL_C}`)).output).toContain(
			"streamed reply",
		);
	});

	it("streams several turns in one session", async () => {
		const { streamed } = await drive(`first\rsecond\r${CTRL_C}`);
		expect(streamed).toStrictEqual(["first", "second"]);
	});

	it("exits cleanly after a streamed turn", async () => {
		expect((await drive(`hello\r${CTRL_C}`)).code).toBe(0);
	});
});

describe("a turn that did not finish normally", () => {
	it("marks a cancelled turn as cancelled", async () => {
		// Not "failed": the user asked for it to stop, and reporting a failure
		// would send them looking for a problem they caused deliberately.
		const { output } = await drive(`hello\r${CTRL_C}`, {
			result: { ok: true, text: "partial", toolCalls: 0, aborted: true },
		});
		expect(output).toContain("(cancelled)");
	});

	it("does not call a cancelled turn a failure", async () => {
		const { output } = await drive(`hello\r${CTRL_C}`, {
			result: { ok: true, text: "partial", toolCalls: 0, aborted: true },
		});
		expect(output).not.toContain("(failed");
	});

	it("says why a turn failed", async () => {
		// "failed" with no reason is the least useful thing a shell can say
		// about the one part of it most likely to be misconfigured.
		const { output } = await drive(`hello\r${CTRL_C}`, {
			result: {
				ok: false,
				text: "",
				toolCalls: 0,
				aborted: false,
				error: "rate limited",
			},
		});
		expect(output).toContain("rate limited");
	});

	it("marks a failure as failed", async () => {
		const { output } = await drive(`hello\r${CTRL_C}`, {
			result: { ok: false, text: "", toolCalls: 0, aborted: false },
		});
		expect(output).toContain("(failed");
	});

	it("still names a failure with no error string", async () => {
		// A host that omits `error` still has to produce something readable
		// rather than "failed: undefined".
		const { output } = await drive(`hello\r${CTRL_C}`, {
			result: { ok: false, text: "", toolCalls: 0, aborted: false },
		});
		expect(output).not.toContain("undefined");
	});

	it("survives streamTurn throwing outright", async () => {
		// A throw is different from a failed result: nothing resolved, so there
		// is no body to render at all.
		expect((await drive(`hello\r${CTRL_C}`, { throws: true })).code).toBe(0);
	});

	it("reports the thrown message rather than swallowing it", async () => {
		const { output } = await drive(`hello\r${CTRL_C}`, { throws: true });
		expect(output).toContain("engine exploded");
	});

	it("accepts another turn after a throw", async () => {
		// One misconfigured turn must not poison the session; the fix is
		// usually an export away and the user is still sitting in the shell.
		const { streamed } = await drive(`first\rsecond\r${CTRL_C}`, {
			throws: true,
		});
		expect(streamed).toStrictEqual(["first", "second"]);
	});
});

describe("a turn that produced nothing", () => {
	it("says so rather than showing an empty bubble", async () => {
		// An empty assistant bubble is indistinguishable from a rendering bug:
		// the user cannot tell whether the model said nothing or the shell lost
		// it.
		const { output } = await drive(`hello\r${CTRL_C}`, {
			events: [
				{ type: AGUI_EVENT.runStarted, runId: "r1" },
				{ type: AGUI_EVENT.runFinished, runId: "r1" },
			],
			result: { ok: true, text: "", toolCalls: 0, aborted: false },
		});
		expect(output).toContain("(no reply)");
	});

	it("falls back to the result text when the stream carried none", async () => {
		// The two channels can disagree — a host may resolve with text it never
		// streamed. Dropping it would lose the only answer there was.
		const { output } = await drive(`hello\r${CTRL_C}`, {
			events: [
				{ type: AGUI_EVENT.runStarted, runId: "r1" },
				{ type: AGUI_EVENT.runFinished, runId: "r1" },
			],
			result: okResult("only in the result"),
		});
		expect(output).toContain("only in the result");
	});
});

describe("the approval gate after a turn", () => {
	it("is raised for a turn that succeeded", async () => {
		expect(
			(await drive(`hello\r${CTRL_C}`, { approval: true })).approvalsAsked,
		).toBe(1);
	});

	it("is not raised after a cancelled turn", async () => {
		// The run did not finish. Asking the user to approve its output would
		// be asking them to approve a partial edit.
		const { approvalsAsked } = await drive(`hello\r${CTRL_C}`, {
			approval: true,
			result: { ok: true, text: "partial", toolCalls: 0, aborted: true },
		});
		expect(approvalsAsked).toBe(0);
	});

	it("is not raised after a failed turn", async () => {
		const { approvalsAsked } = await drive(`hello\r${CTRL_C}`, {
			approval: true,
			result: { ok: false, text: "", toolCalls: 0, aborted: false },
		});
		expect(approvalsAsked).toBe(0);
	});

	it("is not raised when the host wires no gate", async () => {
		// A host without `pendingApprovalFor` is a valid host; the loop must
		// not call an absent function.
		expect((await drive(`hello\r${CTRL_C}`)).code).toBe(0);
	});

	it("leaves the shell able to quit with a gate up", async () => {
		// The gate is modal. A modal that also blocked Ctrl+C would leave the
		// user with no way out but killing the terminal.
		expect((await drive(`hello\r${CTRL_C}`, { approval: true })).code).toBe(0);
	});

	it("takes a decline and carries on", async () => {
		// `n` declines; the session has to keep working afterwards.
		const { streamed } = await drive(`hello\rnafter\r${CTRL_C}`, {
			approval: true,
		});
		expect(streamed).toContain("hello");
	});
});

describe("a deterministic workspace action", () => {
	it("answers without consulting the engine", async () => {
		// Paying for a turn whose answer was already known, and then showing
		// whichever of the two arrived last, is the failure this prevents.
		const { streamed } = await drive(`run it\r${CTRL_C}`, {
			workspaceAnswer: "started on http://127.0.0.1:4173",
		});
		expect(streamed).toStrictEqual([]);
	});

	it("renders its answer", async () => {
		const { output } = await drive(`run it\r${CTRL_C}`, {
			workspaceAnswer: "started on http://127.0.0.1:4173",
		});
		expect(output).toContain("127.0.0.1:4173");
	});

	it("sees the prompt before the engine does", async () => {
		const { workspacePrompts } = await drive(`run it\r${CTRL_C}`, {
			workspaceAnswer: "started",
		});
		expect(workspacePrompts).toStrictEqual(["run it"]);
	});

	it("falls through to the engine when it declines", async () => {
		// Returning null is "not mine" — the prompt has to reach the model, or
		// an unrecognised request would silently do nothing.
		const { streamed, workspacePrompts } = await drive(
			`explain this\r${CTRL_C}`,
			{
				workspaceAnswer: null,
			},
		);
		expect(workspacePrompts).toStrictEqual(["explain this"]);
		expect(streamed).toStrictEqual(["explain this"]);
	});

	it("handles one prompt and declines the next in the same session", async () => {
		// The seam is consulted per prompt, not once per session.
		const { workspacePrompts } = await drive(`first\rsecond\r${CTRL_C}`, {
			workspaceAnswer: null,
		});
		expect(workspacePrompts).toStrictEqual(["first", "second"]);
	});
});
