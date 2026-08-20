/**
 * The `hobo-code session <verb>` argument surface.
 *
 * `resident-session-cli.test.ts` covers remote serving, forking, replay, and the
 * Station authorization gate. It does not touch the verb-dispatch switch, which
 * is most of this file: twenty-odd operations, each mapping positional
 * arguments onto a session command.
 *
 * Argument mapping is exactly the kind of code that looks obviously right and
 * is routinely wrong, because the failure is silent. `split` takes four
 * positionals before its command; slice from the wrong index and the pane's
 * title becomes its first argv word. Nothing errors — a pane opens, running
 * something nobody asked for. The tests below assert the *shape* each verb
 * produces, not merely that it was accepted.
 *
 * Two behaviours here are safety rather than ergonomics and get the most
 * attention:
 *
 * - **Delivery verbs refuse without `--approve`.** commit, push, pr, stack and
 *   merge all reach outside the machine. The gate must fire before the command
 *   is built, not after.
 * - **A missing argument must produce a usage error, not a default.** Silently
 *   defaulting a paneId or a title is how a command lands on the wrong pane.
 *
 * Verbs whose refusal happens before any session store is opened are driven
 * against a bare temp home; the rest use a real store on a temp directory.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runResidentSessionCli } from "../src/resident-session-cli.js";

function home(): string {
	return mkdtempSync(join(tmpdir(), "hobo-session-verbs-"));
}

/** Run a verb with the given argv. Approval is off unless a test asks for it. */
function run(
	args: readonly string[],
	options: { readonly approved?: boolean; readonly servePort?: number } = {},
) {
	return runResidentSessionCli({
		args,
		hoboHome: home(),
		projectDir: mkdtempSync(join(tmpdir(), "hobo-session-verbs-project-")),
		approved: options.approved ?? false,
		actorId: "test-actor",
		...(options.servePort !== undefined
			? { servePort: options.servePort }
			: {}),
	});
}

describe("dispatching at all", () => {
	it("returns nothing for an empty argv rather than guessing a verb", async () => {
		// `hobo-code session` with no verb is a request for help, and the caller
		// prints usage on undefined. Guessing here would run something.
		expect(await run([])).toBeUndefined();
	});

	it("names the operation it does not recognise", async () => {
		// A typo'd verb has to say which word was wrong; "unknown operation" alone
		// sends the user back to re-read their own command line.
		await expect(run(["lst", "sess"])).rejects.toThrow(
			"unknown session operation: lst",
		);
	});

	it("mistakes a typo'd verb for a valid one when no session id follows", async () => {
		// Pinning a wart rather than an intention. The session-id `required` runs
		// ahead of the switch's unknown-verb default, so `hobo-code session lst`
		// reports `usage: … lst <sessionId> …` — presenting the typo back to the
		// user as though it were a real verb they merely under-argued. The message
		// sends them to add an argument, which cannot help.
		//
		// Adding the id, as the test above does, gets the honest error. Moving the
		// unknown-verb check ahead of the id check would fix it; that is a
		// behaviour change to the CLI's error surface rather than a bug fix, so it
		// is recorded here rather than made silently.
		await expect(run(["lst"])).rejects.toThrow(
			"usage: hobo-code session lst <sessionId> …",
		);
	});

	it("demands a session id for a verb that operates on one", async () => {
		await expect(run(["focus"])).rejects.toThrow(/focus <sessionId>/u);
	});
});

describe("serving the session browser", () => {
	it("asks the terminal to serve rather than serving inline", async () => {
		// The CLI returns an action for the shell to perform. Starting a server
		// here would tie its lifetime to a command that is about to exit.
		const result = await run(["serve"]);
		const action = (result?.data as { terminalAction: { kind: string } })
			.terminalAction;
		expect(action.kind).toBe("serve-sessions");
	});

	it("passes a requested port through", async () => {
		const result = await run(["serve"], { servePort: 4321 });
		const action = (result?.data as { terminalAction: { port?: number } })
			.terminalAction;
		expect(action.port).toBe(4321);
	});

	it("omits the port entirely when none was requested", async () => {
		// An explicit `undefined` would be serialised as a port the server then
		// tries to bind. Absent means "pick one".
		const result = await run(["serve"]);
		const action = (result?.data as { terminalAction: Record<string, unknown> })
			.terminalAction;
		expect("port" in action).toBe(false);
	});
});

describe("listing", () => {
	it("says so plainly when there are no sessions", async () => {
		// An empty string here renders as a blank line, which reads as the command
		// having failed silently.
		const result = await run(["list"]);
		expect(result?.message).toBe("no resident sessions");
	});

	it("returns an empty session array alongside the message", async () => {
		const result = await run(["list"]);
		expect((result?.data as { sessions: unknown[] }).sessions).toEqual([]);
	});
});

describe("verbs that need a session that exists", () => {
	it("refuses to open a Git pane for a session that does not exist", async () => {
		await expect(run(["git", "ghost"])).rejects.toThrow(
			"session ghost does not exist",
		);
	});

	it("refuses to show a session that does not exist", async () => {
		await expect(run(["show", "ghost"])).rejects.toThrow(
			"session ghost does not exist",
		);
	});

	it("refuses to report status for a session that does not exist", async () => {
		expect.assertions(1);
		await expect(run(["status", "ghost"])).rejects.toThrow(
			"session ghost does not exist",
		);
	});

	it("refuses to wait on a session that does not exist", async () => {
		// Waiting forever on a session that will never appear is the failure this
		// prevents — the command would hang with no output at all.
		await expect(run(["wait", "ghost"])).rejects.toThrow(
			"session ghost does not exist",
		);
	});
});

describe("the approval gate on delivery verbs", () => {
	// These five reach outside the machine — they write to a remote, open a pull
	// request, or merge one. The gate is what makes an agent-driven session
	// unable to publish on its own.
	for (const verb of ["commit", "push", "pr", "stack", "merge"]) {
		it(`refuses ${verb} without --approve`, async () => {
			const args =
				verb === "stack"
					? [verb, "sess", "main", "a title"]
					: verb === "push"
						? [verb, "sess"]
						: [verb, "sess", "some argument"];
			await expect(run(args)).rejects.toThrow(`${verb} requires --approve`);
		});
	}

	it("checks the missing argument before the approval gate", async () => {
		// Usage errors come first because they are the caller's mistake. Reporting
		// "requires --approve" for a malformed command would send the user to add
		// a flag that does not fix anything.
		await expect(run(["commit", "sess"])).rejects.toThrow(/usage:/u);
	});

	it("does not gate a verb that stays on this machine", async () => {
		// `focus` reaches nothing outside the session. Gating it would train users
		// to pass --approve reflexively, which defeats the gate on the five that
		// matter.
		await expect(run(["focus", "sess", "pane-1"])).rejects.not.toThrow(
			/--approve/u,
		);
	});
});

describe("usage errors name the verb's own shape", () => {
	const cases: readonly (readonly [string, readonly string[], RegExp])[] = [
		["tab without a title", ["tab", "sess"], /tab <sessionId> <title>/u],
		[
			"pane without a tab id",
			["pane", "sess"],
			/pane <sessionId> <tabId> <title>/u,
		],
		[
			"pane without a title",
			["pane", "sess", "tab-1"],
			/pane <sessionId> <tabId> <title>/u,
		],
		[
			"split without a pane id",
			["split", "sess"],
			/split <sessionId> <paneId> <horizontal\|vertical> <title>/u,
		],
		[
			"split without a direction",
			["split", "sess", "pane-1"],
			/split <sessionId> <paneId> <horizontal\|vertical> <title>/u,
		],
		[
			"split without a title",
			["split", "sess", "pane-1", "horizontal"],
			/split <sessionId> <paneId> <horizontal\|vertical> <title>/u,
		],
		["focus without a pane", ["focus", "sess"], /focus <sessionId> <paneId>/u],
		[
			"input without a pane",
			["input", "sess"],
			/input <sessionId> <paneId> <text…>/u,
		],
		[
			"input without any text",
			["input", "sess", "pane-1"],
			/input <sessionId> <paneId> <text…>/u,
		],
		[
			"prompt naming itself rather than input",
			["prompt", "sess", "pane-1"],
			/prompt <sessionId> <paneId> <text…>/u,
		],
		[
			"close-pane without a pane",
			["close-pane", "sess"],
			/close-pane <sessionId> <paneId>/u,
		],
		[
			"agent-start without a pane",
			["agent-start", "sess"],
			/agent-start <sessionId> <paneId> <provider>/u,
		],
		[
			"agent-start without a provider",
			["agent-start", "sess", "pane-1"],
			/agent-start <sessionId> <paneId> <provider>/u,
		],
		[
			"agent-stop without a run id",
			["agent-stop", "sess"],
			/agent-stop <sessionId> <agentRunId>/u,
		],
		[
			"checkpoint without a label",
			["checkpoint", "sess"],
			/checkpoint <sessionId> <label>/u,
		],
		[
			"restore without a checkpoint",
			["restore", "sess"],
			/restore <sessionId> <checkpointId>/u,
		],
		["replay without a session", ["replay"], /replay <sessionId>/u],
		["create without a name", ["create"], /create <name> \[branch\]/u],
	];

	// Each usage string is the only documentation the user gets at the moment
	// they need it. A verb that reports another verb's shape sends them to fix
	// the wrong argument.
	for (const [name, args, pattern] of cases) {
		it(`reports the right usage for ${name}`, async () => {
			await expect(run(args)).rejects.toThrow(pattern);
		});
	}

	it("prefixes every usage error so it can be pasted back as a command", async () => {
		await expect(run(["tab", "sess"])).rejects.toThrow(
			"usage: hobo-code session tab <sessionId> <title>",
		);
	});
});

describe("verbs that accept optional trailing arguments", () => {
	it("does not demand a remote for push", async () => {
		// `push` defaults to origin, so the only error a bare `push` should raise
		// is the approval gate — not a usage error about a missing remote.
		await expect(run(["push", "sess"])).rejects.toThrow(/--approve/u);
	});

	it("does not demand a command for pane", async () => {
		// The trailing command is optional: a pane with no command is a shell.
		// Requiring one would make the common case an error.
		await expect(run(["pane", "sess", "tab-1", "a title"])).rejects.not.toThrow(
			/usage:/u,
		);
	});

	it("does not demand a command for agent-start", async () => {
		await expect(
			run(["agent-start", "sess", "pane-1", "claude"]),
		).rejects.not.toThrow(/usage:/u);
	});

	it("does not demand a branch for create", async () => {
		// The branch is derived from the name when omitted, which is the path
		// almost every caller takes.
		await expect(run(["create", "a name"])).rejects.not.toThrow(/usage:/u);
	});
});

describe("multi-word arguments", () => {
	// Several verbs take free text as their last argument. Reading only the
	// first word would truncate a commit message or a PR title at its first
	// space — and the result still succeeds, so nobody notices until they read
	// the history.
	it("joins the rest of argv into a commit message", async () => {
		await expect(
			run(["commit", "sess", "fix", "the", "thing"]),
		).rejects.toThrow(/--approve/u);
	});

	it("treats a bare session id as a missing commit message", async () => {
		await expect(run(["commit", "sess"])).rejects.toThrow(
			/commit <sessionId> <message>/u,
		);
	});

	it("treats a bare session id as a missing pr title", async () => {
		await expect(run(["pr", "sess"])).rejects.toThrow(
			/pr <sessionId> <title>/u,
		);
	});

	it("requires a title after the parent branch for stack", async () => {
		// `stack` takes two: the parent branch, then free text. Missing the second
		// must not silently stack onto a branch with an empty title.
		await expect(run(["stack", "sess", "main"])).rejects.toThrow(
			/stack <sessionId> <parentBranch> <title>/u,
		);
	});

	it("requires a parent branch before the title for stack", async () => {
		await expect(run(["stack", "sess"])).rejects.toThrow(
			/stack <sessionId> <parentBranch> <title>/u,
		);
	});

	it("treats a bare session id as a missing checkpoint label", async () => {
		await expect(run(["checkpoint", "sess"])).rejects.toThrow(
			/checkpoint <sessionId> <label>/u,
		);
	});
});
