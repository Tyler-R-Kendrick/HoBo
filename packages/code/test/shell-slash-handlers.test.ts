/**
 * What each slash *action* actually does inside the running shell.
 *
 * `shell-slash-actions.test.ts` covers picking an item and the argv items
 * reaching the CLI. `shell-slash-arguments.test.ts` covers turning typed words
 * into an argv. This file covers the handlers themselves — the branch of
 * `applySlash` that runs when an item has an `action` rather than an `argv`,
 * where the shell answers out of its own state instead of shelling out.
 *
 * The distinction is load-bearing in both directions. An action item that
 * became argv would try to run a verb that does not exist. An argv item that
 * became an action would stop reaching the CLI's feature gates and isolation
 * checks — which is the security-relevant half, because those gates are where
 * "can this environment do that" is decided.
 *
 * Three handlers carry more than their share:
 *
 * **`/cost` must reflect what this session actually spent.** The source says
 * it: without the live usage line it is "a brochure" — the configured budget
 * with no relationship to the money already gone.
 *
 * **`/resume` prints an id or admits it has none.** A resume command that
 * printed a plausible-looking id for a chat that was never persisted would
 * send the user to a command that fails later, away from the context that
 * would explain why.
 *
 * **`/about` is overridable by the host.** The default lines describe a shell
 * with no engine wired; a host that has one has to be able to say so, or
 * `/about` describes a product the user is not running.
 *
 * Driven through `runInteractiveShell` with scripted keys.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { runInteractiveShell } from "../src/interactive-shell.js";

const CTRL_C = "\u0003";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-shell-actions-"));
	homes.push(dir);
	return dir;
}

interface Options {
	readonly aboutLines?: readonly string[];
	readonly usageLabel?: string;
	readonly verbThrows?: boolean;
	readonly verbText?: string;
	readonly dispose?: boolean;
	/** Wire a streaming engine, which is what makes usage accounting run. */
	readonly streaming?: boolean;
}

async function drive(scriptedKeys: string, options: Options = {}) {
	const chunks: string[] = [];
	const verbs: string[][] = [];
	const prompts: string[] = [];
	let disposed = 0;
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
			runVerb: async (argv: readonly string[]) => {
				verbs.push([...argv]);
				if (options.verbThrows) throw new Error("verb blew up");
				return options.verbText ?? `ran ${argv.join(" ")}`;
			},
			complete: async (prompt: string) => {
				prompts.push(prompt);
				return `assistant: ${prompt}`;
			},
			...(options.aboutLines ? { aboutLines: options.aboutLines } : undefined),
			...(options.usageLabel !== undefined
				? { usageLabel: () => options.usageLabel as string }
				: undefined),
			...(options.streaming
				? {
						streamTurn: async () => ({
							ok: true,
							text: "streamed reply",
							toolCalls: 0,
							aborted: false,
						}),
					}
				: undefined),
			...(options.dispose
				? {
						dispose: async () => {
							disposed += 1;
						},
					}
				: undefined),
		},
		// SAFETY: the scripted-driver options are the shape the shell declares.
	} as never);
	return { code, output: chunks.join(""), verbs, prompts, disposed };
}

describe("clearing the transcript", () => {
	it("removes what was said from the frame that follows", async () => {
		// The transcript is the only record in the pane; `/clear` is what a
		// user reaches for before sharing a screen. Asserted on the last frame
		// rather than the whole captured stream, which necessarily still holds
		// every earlier frame that did show the phrase.
		const { output } = await drive(`a distinctive phrase\r/clear\r${CTRL_C}`);
		const frames = output.split("\u001b[?2026h");
		expect(frames[frames.length - 1]).not.toContain("a distinctive phrase");
	});

	it("does not reach the product CLI", async () => {
		// There is no `hobo-code clear`; routing it out would fail with an
		// unknown-verb error for a feature that exists.
		expect((await drive(`/clear\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});

	it("leaves the shell usable", async () => {
		const { prompts } = await drive(`/clear\rafter\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["after"]);
	});

	it("clears an empty transcript without complaining", async () => {
		expect((await drive(`/clear\r${CTRL_C}`)).code).toBe(0);
	});
});

describe("the resume command", () => {
	it("has an id from the first frame, before anything was said", async () => {
		// The handler carries a "No persisted chat yet" branch for a session
		// with no id. In practice it does not fire: the shell mints a session
		// id at startup, so `/resume` on an untouched shell already has one to
		// print. Recorded as observed -- the branch is defensive rather than
		// reachable through the shell, and a reader looking for that message
		// should know it will not appear.
		const { output } = await drive(`/resume\r${CTRL_C}`);
		expect(output).toMatch(/hobo-code resume chat-/);
	});

	it("prints an id after a real turn too", async () => {
		const { output } = await drive(`say something\r/resume\r${CTRL_C}`);
		expect(output).toMatch(/hobo-code resume chat-/);
	});

	it("prints the exact command that reopens it", async () => {
		// A user reading this is going to paste it. An id with no command
		// around it makes them guess the verb.
		const { output } = await drive(`say something\r/resume\r${CTRL_C}`);
		expect(output).toMatch(/hobo-code resume /);
	});

	it("does not reach the product CLI", async () => {
		expect((await drive(`/resume\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});
});

describe("the cost command", () => {
	it("reaches the product CLI", async () => {
		// Unlike the handlers above, `/cost` is an argv item -- the budget
		// numbers live in the CLI, not the shell.
		expect((await drive(`/cost\r${CTRL_C}`)).verbs).toStrictEqual([["cost"]]);
	});

	it("adds what this session actually spent", async () => {
		// The source's own words: without this it is "a brochure" -- the
		// configured budget with no relationship to the money already gone.
		const { output } = await drive(`hello\r/cost\r${CTRL_C}`, {
			usageLabel: "1,234 tokens · $0.04",
			streaming: true,
		});
		expect(output).toContain("$0.04");
	});

	it("labels the spend as provider-reported rather than estimated", async () => {
		// An estimate presented as a fact is worse than no number: it will be
		// wrong, and nobody will know by how much.
		const { output } = await drive(`hello\r/cost\r${CTRL_C}`, {
			usageLabel: "1,234 tokens · $0.04",
			streaming: true,
		});
		expect(output).toMatch(/provider-reported/);
	});

	it("omits the live line when there is no usage to report", async () => {
		// A "this session" line reading zero on a session that never called a
		// model implies a measurement that did not happen.
		const { output } = await drive(`/cost\r${CTRL_C}`);
		expect(output).not.toMatch(/This session \(provider-reported\)/);
	});

	it("does not add the live line to an unrelated verb", async () => {
		// The suffix is keyed to `/cost`; appending spend to `/status` would
		// put a number where nothing asked for one.
		const { output } = await drive(`hello\r/status\r${CTRL_C}`, {
			usageLabel: "1,234 tokens · $0.04",
		});
		expect(output.split("/status").pop()).not.toMatch(/provider-reported/);
	});
});

describe("the about command", () => {
	it("names the product", async () => {
		// `/about` exists partly to answer "is this stock Pi?" -- the shell is
		// HoBo chrome over the hobo-code CLI, and saying so is the point.
		expect((await drive(`/about\r${CTRL_C}`)).output).toMatch(/hobo-code/);
	});

	it("describes the shell rather than shelling out", async () => {
		expect((await drive(`/about\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});

	it("takes the host's own lines when it has some", async () => {
		// The default lines describe a shell with no engine wired; a host that
		// has one has to be able to say so, or /about describes a product the
		// user is not running.
		const { output } = await drive(`/about\r${CTRL_C}`, {
			aboutLines: ["engine: a distinctive engine name"],
		});
		expect(output).toContain("a distinctive engine name");
	});

	it("still names the product alongside the host's lines", async () => {
		// The host supplies the engine detail, not the identity -- a host that
		// could replace the whole panel could make the shell claim to be
		// something else.
		const { output } = await drive(`/about\r${CTRL_C}`, {
			aboutLines: ["engine: something"],
		});
		expect(output).toMatch(/hobo-code/);
	});

	it("falls back to its own lines when the host supplies none", async () => {
		expect((await drive(`/about\r${CTRL_C}`)).output).toMatch(/\/agents|\/mux/);
	});
});

describe("the mux command", () => {
	it("opens the terminal surface for a bare invocation", async () => {
		expect((await drive(`/mux\r${CTRL_C}`)).code).toBe(0);
	});

	it("does not shell out for a bare invocation", async () => {
		expect((await drive(`/mux\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});

	it("names an unrecognised subcommand rather than silently opening", async () => {
		// Opening the terminal view is not what `/mux stpo` was asking for, and
		// a silent fallback would leave the user thinking the typo worked.
		const { output } = await drive(`/mux stpo\r${CTRL_C}`);
		expect(output).toMatch(/Unknown \/mux/);
	});

	it("prints the subcommand help alongside the refusal", async () => {
		// The user has just demonstrated they do not know the subcommand names;
		// this is the one moment listing them is worth the space.
		const { output } = await drive(`/mux stpo\r${CTRL_C}`);
		expect(output).toMatch(/\/mux tab/);
	});

	it("echoes the unrecognised word so the typo is visible", async () => {
		expect((await drive(`/mux stpo\r${CTRL_C}`)).output).toContain("stpo");
	});

	it("stays usable after an unknown subcommand", async () => {
		const { prompts } = await drive(`/mux stpo\rafter\r${CTRL_C}`);
		expect(prompts).toStrictEqual(["after"]);
	});
});

describe("the help command", () => {
	it("shows the key map", async () => {
		expect((await drive(`/help\r${CTRL_C}`)).output).toMatch(/Ctrl\+C/);
	});

	it("does not shell out", async () => {
		// The shell's keys are the shell's business; the CLI does not know
		// them.
		expect((await drive(`/help\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});

	it("names the slash commands a reader would look for next", async () => {
		expect((await drive(`/help\r${CTRL_C}`)).output).toMatch(/\/mux|\/agents/);
	});
});

describe("a verb that fails", () => {
	it("reports the failure rather than silently doing nothing", async () => {
		// A slash command that appeared to do nothing is the worst outcome:
		// the user retries it, and the second failure looks like the first.
		const { output } = await drive(`/status\r${CTRL_C}`, { verbThrows: true });
		expect(output).toMatch(/\/status failed/);
	});

	it("carries the reason", async () => {
		const { output } = await drive(`/status\r${CTRL_C}`, { verbThrows: true });
		expect(output).toContain("verb blew up");
	});

	it("keeps the shell alive", async () => {
		expect((await drive(`/status\r${CTRL_C}`, { verbThrows: true })).code).toBe(
			0,
		);
	});

	it("accepts another command afterwards", async () => {
		// One broken verb must not poison the session.
		const { verbs } = await drive(`/status\r/cost\r${CTRL_C}`, {
			verbThrows: true,
		});
		expect(verbs).toStrictEqual([["status"], ["cost"]]);
	});

	it("still takes a prompt afterwards", async () => {
		const { prompts } = await drive(`/status\rafter\r${CTRL_C}`, {
			verbThrows: true,
		});
		expect(prompts).toStrictEqual(["after"]);
	});
});

describe("a verb that answers at length", () => {
	it("truncates rather than flooding the transcript", async () => {
		// A verb returning a megabyte of output would push the whole
		// conversation out of the scrollback and make the pane unusable.
		const { output } = await drive(`/status\r${CTRL_C}`, {
			verbText: "x".repeat(20_000),
		});
		expect(output).not.toContain("x".repeat(6_000));
	});

	it("keeps the shell usable after a huge answer", async () => {
		// Whether the head of the answer is on screen depends on the viewport,
		// so that is not asserted here. What matters is that a verb returning
		// far more than fits does not wedge the renderer.
		const { prompts } = await drive(`/status\rafter\r${CTRL_C}`, {
			verbText: "x".repeat(20_000),
		});
		expect(prompts).toStrictEqual(["after"]);
	});
});

describe("releasing what the shell owns", () => {
	// `host.dispose` is declared on ShellHost and called by `bin/hobo-code.ts`
	// *after* `runInteractiveShell` resolves -- not by the loop itself. Pinning
	// which side owns it, because the split is easy to get wrong in either
	// direction: a loop that disposed would tear down a session the binary
	// still wanted, and a binary that assumed the loop had done it would leak
	// one. A leaked dev session holds a port and keeps a Yard running.
	it("does not dispose from inside the loop", async () => {
		expect((await drive(CTRL_C, { dispose: true })).disposed).toBe(0);
	});

	it("does not dispose after a turn either", async () => {
		expect(
			(await drive(`first\rsecond\r${CTRL_C}`, { dispose: true })).disposed,
		).toBe(0);
	});

	it("returns so the caller can dispose", async () => {
		// The contract the split rests on: the loop has to actually resolve,
		// or the binary's cleanup line is never reached.
		expect((await drive(CTRL_C, { dispose: true })).code).toBe(0);
	});

	it("exits cleanly when the host wires no dispose", async () => {
		expect((await drive(CTRL_C)).code).toBe(0);
	});
});

describe("actions and argv items stay on their own side", () => {
	const ACTIONS = ["/help", "/about", "/clear", "/resume", "/quit"];
	const ARGVS: ReadonlyArray<readonly [string, readonly string[]]> = [
		["/status", ["status"]],
		["/cost", ["cost"]],
		["/tasks", ["tasks"]],
		["/env", ["env"]],
	];

	it.each(ACTIONS)("%s never reaches the CLI", async (command) => {
		// An action item that became argv would try to run a verb that does
		// not exist.
		expect((await drive(`${command}\r${CTRL_C}`)).verbs).toStrictEqual([]);
	});

	it.each(
		ARGVS,
	)("%s reaches the CLI as its own argv", async (command, argv) => {
		// The security-relevant half: an argv item that became an action would
		// stop reaching the CLI's feature gates and isolation checks, which is
		// where "can this environment do that" is decided.
		expect((await drive(`${command}\r${CTRL_C}`)).verbs).toStrictEqual([
			[...argv],
		]);
	});

	it.each(
		ACTIONS.filter((command) => command !== "/quit"),
	)("%s never sends anything to the model", async (command) => {
		expect((await drive(`${command}\r${CTRL_C}`)).prompts).toStrictEqual([]);
	});
});
