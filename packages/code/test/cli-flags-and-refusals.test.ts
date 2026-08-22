/**
 * What the CLI checks before it does anything, and what it refuses.
 *
 * `cli-verb-sweep.test.ts` beside this file proves every verb answers on a
 * bare machine. This one goes at the guards — the checks that run *before* a
 * verb does its work, because each of them exists to stop a specific
 * expensive or misleading failure from reaching the user:
 *
 * **A port is validated before a server is started.** `--port notanumber`
 * becomes `NaN`, and `listen(NaN)` binds a random port — the dev server comes
 * up somewhere the user did not ask for and the browser opens at the wrong
 * address. Out of range is the same story with a different error. Both refuse
 * up front rather than after the auth check and the occupancy check have
 * already run.
 *
 * **An unknown flag is a refusal, not a shrug.** A dropped flag runs a
 * command the user did not type, and on a CLI whose verbs include ones that
 * write, that is not a cosmetic failure. `--port -1` is the sharp case: the
 * leading dash makes it a *flag*, not a value, so it is caught by the
 * unknown-flag check rather than the range check — a different code for the
 * same typo, which is worth pinning because someone reading only the range
 * check would expect otherwise.
 *
 * **A verb that needs a login says so before doing half the work.** `history`
 * and `alias` refuse with `HOBO_AUTH_REQUIRED` and name the command that
 * fixes it. A CLI that only says "no" trains a user to guess.
 *
 * **The default verb is `dispatch`, and a bare prompt reaches it.** Typing
 * `hobo-code "make me a hello world app"` with no verb has to work, because
 * that is the product's headline promise; a bare argv that fell through to
 * unknown-verb would make the documented usage a lie.
 *
 * Each run gets its own `HOBO_HOME`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	formatHoboCodeResult,
	type HoboCodeCliResult,
	runHoboCodeCli,
} from "../src/cli.js";

const homes: string[] = [];

afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

async function run(
	argv: readonly string[],
	env: NodeJS.ProcessEnv = {},
): Promise<HoboCodeCliResult> {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-flags-"));
	homes.push(hoboHome);
	return await runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...env },
		json: false,
	});
}

describe("validating a port before starting anything", () => {
	it("refuses a port that is not a number", async () => {
		// `Number("notanumber")` is NaN, and `listen(NaN)` binds a random port:
		// the dev server comes up somewhere the user did not ask for and the
		// browser opens at the wrong address.
		expect((await run(["dev", "--port", "notanumber"])).code).toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("refuses a port above the range", async () => {
		expect((await run(["dev", "--port", "99999"])).code).toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("refuses a fractional port", async () => {
		// `listen(4173.5)` truncates silently; the user asked for something the
		// protocol cannot express.
		expect((await run(["dev", "--port", "4173.5"])).code).toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("validates the debug port the same way", async () => {
		// Two ports, one check. A debug port that skipped validation would fail
		// later and further from the flag that caused it.
		expect((await run(["dev", "--debug-port", "abc"])).code).toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("refuses a debug port above the range", async () => {
		expect((await run(["dev", "--debug-port", "70000"])).code).toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("says what a valid port looks like", async () => {
		// A refusal that only says "invalid" makes the user guess whether the
		// problem is the number, the flag name or the verb.
		expect((await run(["dev", "--port", "99999"])).message).toMatch(
			/0 through 65535/,
		);
	});

	it("points at the verb's help", async () => {
		expect((await run(["dev", "--port", "99999"])).remediation).toContain(
			"hobo-code dev --help",
		);
	});

	it("accepts port zero, which means ask the OS", async () => {
		// Zero is a legitimate request for an ephemeral port, and rejecting it
		// would break the one way to run two dev servers at once. It gets past
		// the range check and fails later for an unrelated reason.
		expect((await run(["dev", "--port", "0"])).code).not.toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("accepts the top of the range", async () => {
		expect((await run(["dev", "--port", "65535"])).code).not.toBe(
			"HOBO_CODE_DEV_USAGE",
		);
	});

	it("gets past the port check to a real failure with valid ports", async () => {
		// Proves the check is a gate and not the only thing the verb does: with
		// good ports it goes on and fails on the station instead.
		expect((await run(["dev"])).code).toBe("HOBO_CODE_DEV_FAILED");
	});
});

describe("an unknown flag is a refusal", () => {
	it.each([
		["dev", "--no-such-flag"],
		["edit", "--no-such-flag"],
		["status", "--no-such-flag"],
		["scaffold", "--example"],
		["env", "--set"],
	])("refuses %s %s", async (verb, flag) => {
		// A dropped flag runs a command the user did not type, and this CLI's
		// verbs include ones that write.
		expect((await run([verb, flag])).code).toBe("HOBO_CODE_UNKNOWN_FLAG");
	});

	it("treats a negative port as an unknown flag, not an out-of-range one", async () => {
		// The sharp case: the leading dash makes `-1` a *flag*, not a value, so
		// it is caught before the range check ever sees it. Same typo, different
		// code -- worth pinning, because someone reading only the range check
		// would expect HOBO_CODE_DEV_USAGE here.
		expect((await run(["dev", "--port", "-1"])).code).toBe(
			"HOBO_CODE_UNKNOWN_FLAG",
		);
	});

	it("exits non-zero on an unknown flag", async () => {
		expect((await run(["status", "--no-such-flag"])).exitCode).toBeGreaterThan(
			0,
		);
	});

	it("renders the unknown-flag refusal", async () => {
		expect(
			formatHoboCodeResult(await run(["status", "--no-such-flag"])).length,
		).toBeGreaterThan(0);
	});
});

describe("a verb that needs a login", () => {
	it.each([
		["history"],
		["alias"],
	])("refuses %s when logged out", async (verb) => {
		expect((await run([verb])).code).toBe("HOBO_AUTH_REQUIRED");
	});

	it("names the command that fixes it", async () => {
		// A CLI that only says "no" trains a user to guess.
		expect((await run(["history"])).message).toMatch(/auth login/);
	});

	it("exits non-zero rather than pretending there is no history", async () => {
		// An empty list would read as "you have never run anything", which is a
		// different and wrong answer.
		expect((await run(["history"])).exitCode).toBeGreaterThan(0);
	});

	it("lets the login verb itself through", async () => {
		// The one verb that must not require a login.
		expect((await run(["auth", "login"])).ok).toBe(true);
	});

	it("lets the logout verb through too", async () => {
		// Logging out while already logged out is a no-op, not an error --
		// refusing would leave a user with a broken token unable to clear it.
		expect((await run(["auth", "logout"])).ok).toBe(true);
	});

	it("answers history once logged in", async () => {
		// The gate is a gate, not a permanent refusal.
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-authed-"));
		homes.push(hoboHome);
		const options = {
			hoboHome,
			cwd: hoboHome,
			env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev" },
			json: false,
		};
		await runHoboCodeCli(["auth", "login"], options);
		expect((await runHoboCodeCli(["history"], options)).code).not.toBe(
			"HOBO_AUTH_REQUIRED",
		);
	});
});

describe("the default verb", () => {
	it("routes a bare prompt to dispatch", async () => {
		// `hobo-code "make me a hello world app"` with no verb is the product's
		// headline promise; falling through to unknown-verb would make the
		// documented usage a lie.
		const result = await run(["make me a hello world app"]);
		expect(result.ok).toBe(true);
	});

	it("recognises an example request in a bare prompt", async () => {
		// The prompt names a shipped example, so it materialises that rather
		// than queueing a compute task about it.
		expect((await run(["make me a hello world app"])).code).toBe(
			"HOBO_CODE_EXAMPLE",
		);
	});

	it("routes the same words through the explicit verb identically", async () => {
		// The default verb has to be a genuine alias; a bare prompt behaving
		// differently from `dispatch <prompt>` would make the shorthand a
		// separate feature to learn.
		const [bare, explicit] = await Promise.all([
			run(["make me a hello world app"]),
			run(["dispatch", "make me a hello world app"]),
		]);
		expect(bare.code).toBe(explicit.code);
	});

	it("records a compute task for a prompt that names no example", async () => {
		expect((await run(["dispatch", "refactor the auth module"])).code).toBe(
			"HOBO_CODE_DISPATCH",
		);
	});

	it("says recorded rather than done", async () => {
		// The honesty rule: dispatch queues work, it does not edit the project.
		// "recorded" is the word the panel uses -- a reply that said "done"
		// would have the user looking for changes that do not exist. The
		// fuller "no agent has run it yet" wording lives in the plain
		// (non-dense) body, which this default rendering already carries.
		const result = await run(["dispatch", "refactor the auth module"]);
		expect(formatHoboCodeResult(result)).toMatch(/recorded/i);
	});

	it("does not claim the project was edited", async () => {
		const rendered = formatHoboCodeResult(
			await run(["dispatch", "refactor the auth module"]),
		);
		expect(rendered).not.toMatch(/\bedited\b|\bapplied\b|\bcompleted\b/i);
	});

	it("carries a pool through to the recorded task", async () => {
		expect((await run(["dispatch", "x", "--pool", "hive"])).ok).toBe(true);
	});

	it("refuses an empty dispatch rather than queueing a blank task", async () => {
		// With no prompt and no terminal to ask on, there is nothing to record;
		// an empty task would sit on the board meaning nothing.
		expect((await run(["dispatch"])).code).toBe(
			"HOBO_CODE_INTERACTIVE_REQUIRED",
		);
	});

	it("exits non-zero on an empty dispatch", async () => {
		expect((await run(["dispatch"])).exitCode).toBeGreaterThan(0);
	});
});

describe("dense chrome", () => {
	it.each([
		["status"],
		["tasks"],
		["models"],
		["cost"],
		["machines"],
	])("%s renders in dense mode without changing its code", async (verb) => {
		// Dense is a rendering choice. A code that shifted under it would
		// make a script's behaviour depend on a display preference.
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-dense-"));
		homes.push(hoboHome);
		const options = {
			hoboHome,
			cwd: hoboHome,
			env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev" },
			json: false,
		};
		const plain = await runHoboCodeCli([verb], options);
		const dense = await runHoboCodeCli([verb], { ...options, dense: true });
		expect(dense.code).toBe(plain.code);
		expect(dense.ok).toBe(plain.ok);
	});

	it.each([
		["status"],
		["tasks"],
		["models"],
	])("%s still says something in dense mode", async (verb) => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-dense2-"));
		homes.push(hoboHome);
		const result = await runHoboCodeCli([verb], {
			hoboHome,
			cwd: hoboHome,
			env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev" },
			json: false,
			dense: true,
		});
		expect(
			formatHoboCodeResult(result, { dense: true }).length,
		).toBeGreaterThan(0);
	});
});

describe("subcommands that do work", () => {
	it("starts an isolation without a project to isolate", async () => {
		// A bare machine has no worktree; the verb has to answer rather than
		// throwing on the missing one.
		expect((await run(["isolate", "start"])).ok).toBe(true);
	});

	it("reports isolation status on a bare machine", async () => {
		expect((await run(["isolate", "status"])).ok).toBe(true);
	});

	it("refuses to promote a session that does not exist", async () => {
		expect((await run(["promote", "--session", "no-such-session"])).ok).toBe(
			false,
		);
	});

	it("lists harnesses without any configured", async () => {
		expect((await run(["harness", "list"])).ok).toBe(true);
	});

	it("answers machines add on a bare machine", async () => {
		expect((await run(["machines", "add"])).ok).toBe(true);
	});

	it("refuses a config stack it does not know", async () => {
		// Recorded as observed: `aws` and `azure` are refused the same way an
		// invented name is. The stack list is what the verb actually supports,
		// not a catalogue of cloud vendors.
		expect((await run(["config", "aws"])).code).toBe("HOBO_CODE_CONFIG_USAGE");
	});

	it("refuses every unknown stack with the same code", async () => {
		expect((await run(["config", "azure"])).code).toBe(
			"HOBO_CODE_CONFIG_USAGE",
		);
	});
});
