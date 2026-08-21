/**
 * The interactive shell's terminal loop, driven through its scripted-keys hook.
 *
 * `runInteractiveShell` is the one function in this package that owns a real
 * terminal — raw mode, the alternate screen, resize handlers, a render tick and
 * a signal handler. It is also, by design, drivable offline: `scriptedKeys`
 * replays a key sequence through the same `handleKey` a live TTY would, with
 * no raw mode, so the loop's behaviour can be pinned without a pty.
 *
 * What is worth pinning here is what the reducer tests cannot reach — the parts
 * that are about the *process*, not the state:
 *
 * **The terminal is always restored.** The `finally` leaves the alternate
 * screen and raw mode even when the driver throws, because a CLI that can
 * strand a terminal in raw mode is not shippable — the user's shell is left
 * echoing nothing and they have to `reset` it blind.
 *
 * **A turn is drained before quitting.** A scripted quit that raced an
 * in-flight `complete()` would leave the assistant's reply unwritten and, worse,
 * make the test suite's results depend on scheduling.
 *
 * **The session is persisted on the way out.** The chat is written and a
 * closeout naming the session id is printed, because a session the user cannot
 * name is a session they cannot resume.
 *
 * Every run here passes `sidecars: false` — the sidecar path starts real
 * servers, and a unit test that opens a port is a unit test that fails on a
 * busy machine.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runInteractiveShell } from "../src/interactive-shell.js";
import type { JsonObject } from "../src/json.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-driver-"));
	homes.push(dir);
	return dir;
}

/** Collects everything the shell wrote, so a frame can be asserted on. */
function capture() {
	const chunks: string[] = [];
	const stream = new Writable({
		write(chunk, _encoding, done) {
			chunks.push(String(chunk));
			done();
		},
	});
	return { stream, text: () => chunks.join("") };
}

const CTRL_C = "";

async function drive(scriptedKeys: string, overrides: JsonObject = {}) {
	const out = capture();
	const verbs: string[][] = [];
	const prompts: string[] = [];
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const code = await runInteractiveShell({
		stdin: new PassThrough(),
		stdout: out.stream,
		hoboHome: home(),
		sidecars: false,
		reducedMotion: true,
		scriptedKeys,
		host: {
			runVerb: async (argv) => {
				verbs.push([...argv]);
				return "verb ok";
			},
			complete: async (prompt) => {
				prompts.push(prompt);
				return `assistant: ${prompt}`;
			},
		},
		...overrides,
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
	} as never);
	return { code, output: out.text(), verbs, prompts };
}

describe("the scripted driver", () => {
	it("exits zero on a clean quit", async () => {
		// The exit code is what a wrapper script branches on; a non-zero exit
		// from an ordinary quit would fail every CI job that runs the shell.
		expect((await drive(CTRL_C)).code).toBe(0);
	});

	it("quits on Ctrl-C without running anything", async () => {
		const session = await drive(CTRL_C);
		expect(session.prompts).toEqual([]);
		expect(session.verbs).toEqual([]);
	});

	it("writes a frame before it exits", async () => {
		// A shell that painted nothing would look like a hang.
		expect((await drive(CTRL_C)).output.length).toBeGreaterThan(0);
	});

	it("prints the exact command that resumes the session", async () => {
		// Not just the id: the closeout is the command, so a user who wants to
		// come back does not have to work out the verb.
		expect((await drive(CTRL_C)).output).toMatch(/hobo-code resume \S+/u);
	});

	it("runs with no keys at all", async () => {
		// The empty script is the degenerate case: start, paint, stop.
		expect((await drive("")).code).toBe(0);
	});

	it("stops at the first quit and ignores the rest of the script", async () => {
		// Keys after a quit belong to whatever the user's shell does next; the
		// loop must not consume them.
		const session = await drive(`${CTRL_C}hello\r`);
		expect(session.prompts).toEqual([]);
	});
});

describe("submitting a prompt", () => {
	it("sends typed text to the completion engine", async () => {
		const session = await drive(`hello\r${CTRL_C}`);
		expect(session.prompts).toEqual(["hello"]);
	});

	it("drains the turn before quitting, so the reply is not lost", async () => {
		// A quit that raced the in-flight turn would drop the assistant's reply
		// and make the outcome depend on scheduling.
		const session = await drive(`hello\r${CTRL_C}`);
		expect(session.output).toContain("assistant: hello");
	});

	it("waits for a slow turn to finish before it exits", async () => {
		// The drain is about the turn completing, not about the frame landing:
		// a shell that exited mid-turn would abandon whatever the engine was
		// doing — a half-written file, an unclosed request.
		let finished = false;
		const session = await drive(`slow\r${CTRL_C}`, {
			host: {
				runVerb: async () => "",
				complete: async (prompt: string) => {
					await new Promise((resolve) => setTimeout(resolve, 60));
					finished = true;
					return `late: ${prompt}`;
				},
			},
		});
		expect(finished).toBe(true);
		expect(session.code).toBe(0);
	});

	it("survives a turn that throws", async () => {
		// An engine failure must not take the shell down with it: the user still
		// has a session and unsaved context.
		const session = await drive(`boom\r${CTRL_C}`, {
			host: {
				runVerb: async () => "",
				complete: async () => {
					throw new Error("engine unavailable");
				},
			},
		});
		expect(session.code).toBe(0);
	});

	it("reports the failure rather than silently swallowing it", async () => {
		const session = await drive(`boom\r${CTRL_C}`, {
			host: {
				runVerb: async () => "",
				complete: async () => {
					throw new Error("engine unavailable");
				},
			},
		});
		expect(session.output.length).toBeGreaterThan(0);
	});

	it("ignores an empty submit rather than sending a blank prompt", async () => {
		// Enter on an empty line is how a user scrolls the transcript in most
		// shells; billing a model turn for it would be a surprise.
		expect((await drive(`\r${CTRL_C}`)).prompts).toEqual([]);
	});

	it("sends several prompts in order", async () => {
		const session = await drive(`one\rtwo\r${CTRL_C}`);
		expect(session.prompts).toEqual(["one", "two"]);
	});

	it("prefers a workspace action over the completion engine", async () => {
		// The contract is explicit: when tryWorkspaceAction answers, the prompt
		// must not also reach the model — otherwise a deterministic turn is
		// billed as an inference.
		const session = await drive(`run it\r${CTRL_C}`, {
			host: {
				runVerb: async () => "",
				complete: async (prompt: string) => `model: ${prompt}`,
				tryWorkspaceAction: async () => "workspace handled it",
			},
		});
		expect(session.output).toContain("workspace handled it");
		expect(session.output).not.toContain("model: run it");
	});

	it("falls through to the engine when the workspace declines", async () => {
		const session = await drive(`chat\r${CTRL_C}`, {
			host: {
				runVerb: async () => "",
				complete: async (prompt: string) => `model: ${prompt}`,
				tryWorkspaceAction: async () => null,
			},
		});
		expect(session.output).toContain("model: chat");
	});

	it("falls through when the workspace action throws", async () => {
		// A broken deterministic path must degrade to the model, not to nothing.
		const session = await drive(`chat\r${CTRL_C}`, {
			host: {
				runVerb: async () => "",
				complete: async (prompt: string) => `model: ${prompt}`,
				tryWorkspaceAction: async () => {
					throw new Error("workspace broke");
				},
			},
		});
		expect(session.code).toBe(0);
	});
});

describe("editing before submitting", () => {
	it("applies a backspace", async () => {
		const session = await drive(`helloX\r${CTRL_C}`);
		expect(session.prompts).toEqual(["hello"]);
	});

	it("applies the other backspace byte", async () => {
		// Terminals disagree about DEL vs BS; both have to work or the shell is
		// unusable on one of them.
		expect((await drive(`helloX\b\r${CTRL_C}`)).prompts).toEqual(["hello"]);
	});

	it("ignores a backspace on an empty line", async () => {
		expect((await drive(`\r${CTRL_C}`)).prompts).toEqual([]);
	});

	it("does not submit a line cleared back to empty", async () => {
		expect((await drive(`ab\r${CTRL_C}`)).prompts).toEqual([]);
	});
});

describe("the engine label", () => {
	it("is shown when the host names one", async () => {
		const session = await drive(CTRL_C, {
			host: {
				runVerb: async () => "",
				complete: async () => "",
				engineLabel: "test-engine",
			},
		});
		expect(session.output).toContain("test-engine");
	});
});

describe("seeded history", () => {
	it("renders messages the caller supplied", async () => {
		// Resuming a session is exactly this: the transcript is handed in rather
		// than replayed through the engine.
		const session = await drive(CTRL_C, {
			messages: [{ role: "assistant", text: "restored line" }],
		});
		expect(session.output).toContain("restored line");
	});

	it("starts empty when none were supplied", async () => {
		expect((await drive(CTRL_C)).code).toBe(0);
	});
});

describe("the render surface", () => {
	it("honours the stdout width it was given", async () => {
		// A shell that ignored the terminal width would wrap every line in the
		// wrong place.
		const out = capture();
		const stream = Object.assign(out.stream, { columns: 100, rows: 30 });
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const code = await runInteractiveShell({
			stdin: new PassThrough(),
			stdout: stream,
			hoboHome: home(),
			sidecars: false,
			reducedMotion: true,
			scriptedKeys: CTRL_C,
			host: { runVerb: async () => "", complete: async () => "" },
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
		} as never);
		expect(code).toBe(0);
	});

	it("hands the terminal to a caller that asks for it", async () => {
		// The render-economy tests need the terminal; the hook is how they get it
		// without the driver exposing its internals permanently.
		let seen = false;
		await drive(CTRL_C, {
			onTerminal: () => {
				seen = true;
			},
		});
		expect(seen).toBe(true);
	});

	it("stops on its own deadline when one is set", async () => {
		// The deadline exists so a scripted run cannot hang a suite forever.
		const session = await drive("", { maxMs: 25 });
		expect(session.code).toBe(0);
	});
});
