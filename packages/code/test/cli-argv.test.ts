/**
 * `hobo-code` argument parsing and verb routing.
 *
 * This CLI has an unusual shape: **`dispatch` is the default verb**, so a bare
 * `hobo-code "add a login page"` sends a prompt to an agent rather than
 * failing. That is deliberate and it makes the parser's refusals load-bearing,
 * because the fallback is never "error" — it is "do something with a model".
 *
 * Three rules carry the weight:
 *
 * **Unknown flags are rejected, not passed through.** Silently accepting
 * `--dry-runn` would run the real thing. Since every unrecognised *positional*
 * becomes prompt text, a mistyped flag is the one class of mistake the parser
 * can still catch, so it does — with a pointer to `help`.
 *
 * **A value flag must actually get a value.** `--cwd --json` would otherwise
 * bind the literal string `--json` as a directory. The check is that the next
 * token does not itself look like a flag.
 *
 * **A mistyped verb is suggested, not guessed.** `suggestVerbTypo` returns the
 * near miss for the caller to offer; it never rewrites the command. Running
 * `status` because someone typed `staus` is the kind of helpfulness that
 * eventually runs `promote` for `promot`.
 *
 * `--` ends flag parsing, which is what lets a prompt contain a word starting
 * with a dash without the parser claiming it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	HOBO_CODE_VERBS,
	looksLikeUnknownVerbAttempt,
	runHoboCodeCli,
	suggestVerbTypo,
} from "../src/cli.js";
import type { JsonObject } from "../src/json.js";

const temps: string[] = [];

afterEach(() => {
	for (const dir of temps.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/**
 * Every run gets its own HoBo home and working directory. `dispatch` is the
 * default verb and it *writes* a task file, so a run without an isolated home
 * records real work under the developer's own ~/.hobo.
 */
const run = (argv: readonly string[], deps: JsonObject = {}) => {
	const dir = mkdtempSync(join(tmpdir(), "hobo-cli-argv-"));
	temps.push(dir);
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	return runHoboCodeCli(argv, {
		json: true,
		hoboHome: dir,
		cwd: dir,
		env: { ...process.env, HOBO_HOME: dir },
		...deps,
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
	} as never);
};

describe("the verb catalog", () => {
	it("lists every verb exactly once", () => {
		// A duplicate would make routing depend on which entry matched first.
		expect(new Set(HOBO_CODE_VERBS).size).toBe(HOBO_CODE_VERBS.length);
	});

	it("includes dispatch, which is also the default", () => {
		expect(HOBO_CODE_VERBS).toContain("dispatch");
	});

	it("includes help", () => {
		expect(HOBO_CODE_VERBS).toContain("help");
	});
});

describe("flag parsing", () => {
	it("rejects an unknown long flag", async () => {
		// Every unrecognised positional becomes prompt text, so a mistyped flag
		// is the one mistake the parser can still catch.
		const result = await run(["status", "--nonsense"]);
		expect(result.ok).toBe(false);
	});

	it("points at help when it rejects a flag", async () => {
		// The refusal has to say where the real flags are listed.
		const result = await run(["status", "--nonsense"]);
		expect(`${result.status} ${result.message}`.toLowerCase()).toContain(
			"help",
		);
	});

	it("rejects an unknown flag given with a value", async () => {
		expect((await run(["status", "--nonsense=1"])).ok).toBe(false);
	});

	it("names the flag it did not recognise", async () => {
		const result = await run(["status", "--nonsense"]);
		expect(`${result.status} ${result.message}`).toContain("nonsense");
	});

	it("refuses a value flag with nothing after it", async () => {
		// Binding nothing would leave the flag set to a stray boolean.
		expect((await run(["status", "--cwd"])).ok).toBe(false);
	});

	it("refuses a value flag followed by another flag", async () => {
		// `--cwd --json` would otherwise bind the literal string "--json" as a
		// directory.
		expect((await run(["status", "--cwd", "--json"])).ok).toBe(false);
	});

	it("accepts a value flag in its equals form", async () => {
		expect((await run(["help", "--cwd=/tmp"])).ok).toBe(true);
	});

	it.each([
		"--json",
		"--dense",
		"-D",
		"--yes",
		"-y",
		"--non-interactive",
	])("accepts the global switch %s", async (flag) => {
		expect((await run(["help", flag])).ok).toBe(true);
	});

	it("stops parsing flags after a bare --", async () => {
		// This is what lets a prompt contain a word starting with a dash.
		const result = await run(["--", "--not-a-flag"]);
		expect(result.ok).toBe(true);
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("treats everything after -- as positional, flags included", async () => {
		expect((await run(["--", "--nonsense"])).ok).toBe(true);
	});
});

describe("verb routing", () => {
	it("routes an explicit verb", async () => {
		expect((await run(["help"])).ok).toBe(true);
	});

	it("shows top-level help for a bare --help", async () => {
		const result = await run(["--help"]);
		expect(result.ok).toBe(true);
	});

	it("keeps the verb for a subcommand --help", async () => {
		// `hobo-code status --help` is help *about status*, not the top-level
		// help — otherwise a user can never read a single verb's flags.
		expect((await run(["status", "--help"])).ok).toBe(true);
	});

	it("shows top-level help for `help --help`", async () => {
		expect((await run(["help", "--help"])).ok).toBe(true);
	});

	it("aliases `templates` to the template list", async () => {
		// A plural nobody documented is still what half of users type first.
		const result = await run(["templates"]);
		expect(result.ok).toBe(true);
	});

	it("keeps an explicit template subcommand rather than forcing list", async () => {
		expect((await run(["templates", "search", "api"])).ok).toBe(true);
	});
});

describe("suggestVerbTypo", () => {
	it("suggests the nearest verb for a one-character slip", () => {
		expect(suggestVerbTypo("statu")).toBe("status");
	});

	it("suggests for a transposition", () => {
		expect(suggestVerbTypo("staus")).toBe("status");
	});

	it("suggests nothing for an exact verb", () => {
		// It is not a typo; suggesting would tell the user their correct command
		// was wrong.
		expect(suggestVerbTypo("status")).toBeNull();
	});

	it("suggests nothing for a multi-word prompt", () => {
		// Free text is a dispatch, and dispatch is the point of this CLI.
		expect(suggestVerbTypo("add a login page")).toBeNull();
	});

	it("suggests nothing for a very short token", () => {
		// Two characters are within one edit of half the verb list; a suggestion
		// there is a coin flip.
		expect(suggestVerbTypo("st")).toBeNull();
	});

	it("suggests nothing for an empty token", () => {
		expect(suggestVerbTypo("")).toBeNull();
		expect(suggestVerbTypo("   ")).toBeNull();
	});

	it("suggests nothing for a token that is not identifier-shaped", () => {
		expect(suggestVerbTypo("what?")).toBeNull();
	});

	it("never suggests help or dispatch", () => {
		// Both are reachable other ways, and suggesting `dispatch` for free text
		// would be circular.
		for (const token of ["hlep", "dispatchh", "disptch"]) {
			expect(["help", "dispatch"]).not.toContain(suggestVerbTypo(token));
		}
	});

	it("is case-insensitive", () => {
		expect(suggestVerbTypo("STATU")).toBe("status");
	});

	it("holds a short token to one edit", () => {
		// A four-character token two edits from a verb is more likely a word
		// than a typo.
		expect(suggestVerbTypo("xxxx")).toBeNull();
	});

	it("returns a real verb whenever it returns anything", () => {
		// A suggestion the CLI cannot run is worse than none.
		for (const token of ["statu", "inti", "resum", "scafold"]) {
			const suggestion = suggestVerbTypo(token);
			if (suggestion !== null) {
				expect(HOBO_CODE_VERBS).toContain(suggestion);
			}
		}
	});
});

describe("looksLikeUnknownVerbAttempt", () => {
	it("flags a hyphenated invention", () => {
		// GUI-native users invent command names; dispatching `deploy-app` to a
		// model as prose would be deceptive magic.
		expect(looksLikeUnknownVerbAttempt("deploy-app")).toBe(true);
	});

	it("flags an underscored invention", () => {
		expect(looksLikeUnknownVerbAttempt("deploy_app")).toBe(true);
	});

	it("does not flag one-word natural language", () => {
		// A single ordinary word is a plausible prompt, and dispatch is the
		// default for a reason.
		expect(looksLikeUnknownVerbAttempt("deploy")).toBe(false);
	});

	it("does not flag a real verb", () => {
		expect(looksLikeUnknownVerbAttempt("status")).toBe(false);
	});

	it("does not flag a multi-word phrase", () => {
		expect(looksLikeUnknownVerbAttempt("deploy the app")).toBe(false);
	});

	it("flags a three-character hyphenated token, which is the threshold", () => {
		// Three is the shortest token it will judge at all; below that a hyphen
		// is more likely punctuation than an invented command.
		expect(looksLikeUnknownVerbAttempt("a-b")).toBe(true);
		expect(looksLikeUnknownVerbAttempt("ab")).toBe(false);
	});

	it("does not flag an empty token", () => {
		expect(looksLikeUnknownVerbAttempt("")).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(looksLikeUnknownVerbAttempt("Deploy-App")).toBe(true);
	});
});

describe("the result envelope", () => {
	it("always reports a boolean ok", async () => {
		// Callers branch on it, including the harness tools; undefined would read
		// as failure.
		const help = await run(["help"]);
		expect(help.ok === true || help.ok === false).toBe(true);
	});

	it("always carries a status code", async () => {
		expect(String((await run(["help"])).status).length).toBeGreaterThan(0);
	});

	it("carries a status on a failure too", async () => {
		// A failure without a code cannot be handled programmatically.
		const result = await run(["status", "--nonsense"]);
		expect(String(result.status).length).toBeGreaterThan(0);
	});

	it("reports a non-zero exit code for a failure", async () => {
		// The exit code is what a shell script branches on — and it is a
		// separate field from `code`, which is the machine-readable reason.
		expect((await run(["status", "--nonsense"])).exitCode).not.toBe(0);
	});

	it("reports a zero exit code for help", async () => {
		expect((await run(["help"])).exitCode).toBe(0);
	});

	it("carries a machine-readable code alongside the human message", async () => {
		// The code is what a caller switches on; the message is what a human
		// reads. Collapsing them would force callers to match on prose.
		const result = await run(["help"]);
		expect(result.code).toMatch(/^HOBO_CODE_/u);
		expect(Object.prototype.toString.call(result.message)).toBe(
			"[object String]",
		);
	});
});
