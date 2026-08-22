/**
 * The history and alias verbs, sub-command by sub-command.
 *
 * `history-cli.test.ts` walks one happy path through the CLI front door. This
 * goes at the two entry functions directly, because the interesting behaviour
 * is in which sub-command a given argv selects and what each one refuses:
 *
 * **Both verbs refuse before they open a store.** A logged-out station gets
 * `HOBO_AUTH_REQUIRED` with empty lists in the payload rather than an empty
 * success — a caller reading `data.events` should not be told "no history"
 * when the truth is "no session".
 *
 * **`record` needs a command.** Recording the empty string would put a row in
 * a station's shell history that nobody typed.
 *
 * **The author filter is a closed set.** `human`, `agent`, `automation` and
 * nothing else; an unrecognised value falls through to no filter rather than
 * being passed down to the store as a kind that does not exist.
 *
 * **An empty result renders `(empty)`, not a blank pane.** Same for both alias
 * listings. A pane that renders nothing is indistinguishable from one that
 * failed to render.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import { runAliasCli, runHistoryCli } from "../src/history-cli.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

/** A logged-in station with its own home, plus the cwd commands are run from. */
function station() {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-hist-verb-"));
	homes.push(hoboHome);
	authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
	return {
		hoboHome,
		env: { ...process.env, HOBO_HOME: hoboHome },
		cwd: join(hoboHome, "app"),
	};
}

/** A home directory that has never been logged into. */
function loggedOut() {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-hist-out-"));
	homes.push(hoboHome);
	return { hoboHome, env: { HOBO_HOME: `${hoboHome}-absent` }, cwd: hoboHome };
}

const history = (
	args: readonly string[],
	flags: { [name: string]: string | boolean } = {},
	site = station(),
) => runHistoryCli({ ...site, args, flags });

const alias = (args: readonly string[], site = station()) =>
	runAliasCli({ hoboHome: site.hoboHome, env: site.env, args });

describe("a station with no session", () => {
	it("refuses history rather than reporting no history", () => {
		// Empty results and no session are different answers, and only one of
		// them means "go log in".
		expect(history([], {}, loggedOut()).code).toBe("HOBO_AUTH_REQUIRED");
	});

	it("refuses alias the same way", () => {
		expect(alias([], loggedOut()).code).toBe("HOBO_AUTH_REQUIRED");
	});

	it("names the command that fixes it", () => {
		expect(history([], {}, loggedOut()).message).toContain("hobo-code auth");
	});

	it("still returns the empty lists the payload shape promises", () => {
		// A caller reading `data.events` should find an array, not undefined --
		// a refusal is not an excuse to change the shape of the answer.
		const data = history([], {}, loggedOut()).data as {
			events: unknown[];
			aliases: unknown[];
			env: unknown[];
		};
		expect(data.events).toEqual([]);
		expect(data.aliases).toEqual([]);
		expect(data.env).toEqual([]);
	});

	it("is not ok", () => {
		expect(history([], {}, loggedOut()).ok).toBe(false);
	});
});

describe("recording a command", () => {
	it("records what was typed", () => {
		const result = history(["record", "git", "status"]);
		expect(result.ok).toBe(true);
		expect(result.message).toBe("git status");
	});

	it("refuses an empty command", () => {
		// Recording `""` would put a row in a station's shell history that
		// nobody typed.
		expect(history(["record"]).code).toBe("HOBO_CODE_HISTORY_EMPTY");
	});

	it("refuses a command that is only whitespace", () => {
		expect(history(["record", "  ", " "]).code).toBe("HOBO_CODE_HISTORY_EMPTY");
	});

	it("says how to use it when it refuses", () => {
		expect(history(["record"]).message).toContain("usage:");
	});

	it("attaches an exit code when one is given", () => {
		const site = station();
		history(["record", "false"], { exit: "1" }, site);
		const search = history(["false"], {}, site);
		expect(search.message).toContain("  1  false");
	});

	it("records no outcome when no exit code is given", () => {
		// The dot is "ran, outcome unknown" -- a recorded command with no
		// recorded result. Rendering it as 0 would claim it succeeded.
		const site = station();
		history(["record", "vim"], {}, site);
		expect(history(["vim"], {}, site).message).toContain("  ·  vim");
	});

	it("ignores a boolean --exit rather than recording NaN", () => {
		// `--exit` with no value arrives as `true`, and `Number(true)` is 1 --
		// which would invent a failure. The string check is what keeps a bare
		// flag from doing that.
		const site = station();
		history(["record", "ls"], { exit: true }, site);
		expect(history(["ls"], {}, site).message).toContain("  ·  ls");
	});

	it("accepts a zero exit code as a real outcome", () => {
		const site = station();
		history(["record", "true"], { exit: "0" }, site);
		expect(history(["true"], {}, site).message).toContain("  0  true");
	});
});

describe("searching", () => {
	const seeded = () => {
		const site = station();
		history(["record", "git", "status"], {}, site);
		history(["record", "npm", "test"], { exit: "1" }, site);
		return site;
	};

	it("finds a command by a word in it", () => {
		expect(history(["git"], {}, seeded()).message).toContain("git status");
	});

	it("takes the query after an explicit search sub-command", () => {
		expect(history(["search", "npm"], {}, seeded()).message).toContain(
			"npm test",
		);
	});

	it("does not treat the word search as part of the query", () => {
		// `history search npm` and `history npm` are the same search; if the
		// sub-command leaked into the query neither would match.
		const site = seeded();
		expect(history(["search", "npm"], {}, site).message).toContain("npm test");
	});

	it("lists everything when there is no query", () => {
		const listed = history([], {}, seeded()).message;
		expect(listed).toContain("git status");
		expect(listed).toContain("npm test");
	});

	it("renders (empty) when nothing matches", () => {
		// A pane that renders nothing is indistinguishable from one that failed
		// to render.
		expect(history(["nothing-matches-this"], {}, seeded()).message).toContain(
			"(empty)",
		);
	});

	it("still renders the header when nothing matches", () => {
		expect(history(["nothing-matches-this"], {}, seeded()).message).toContain(
			"▣ history",
		);
	});

	it("shows only failures under --failed", () => {
		const failed = history([], { failed: true }, seeded()).message;
		expect(failed).toContain("npm test");
		expect(failed).not.toContain("git status");
	});

	it("shows everything when --failed is not set to true", () => {
		// Only the literal `true` narrows the search. A flag that arrived as a
		// string would otherwise silently hide successful commands.
		expect(history([], { failed: "no" }, seeded()).message).toContain(
			"git status",
		);
	});

	it("returns the rows in the payload as well as the pane", () => {
		const data = history([], {}, seeded()).data as { events: unknown[] };
		expect(data.events.length).toBe(2);
	});

	it.each([
		"human",
		"agent",
		"automation",
	])("accepts %s as an author filter", (author) => {
		// The closed set the store understands.
		expect(history([], { author }, seeded()).ok).toBe(true);
	});

	it("finds the cli's own rows under the human author", () => {
		expect(history([], { author: "human" }, seeded()).message).toContain(
			"git status",
		);
	});

	it("finds nothing under an author that did not run them", () => {
		expect(history([], { author: "agent" }, seeded()).message).toContain(
			"(empty)",
		);
	});

	it("ignores an unrecognised author rather than passing it down", () => {
		// An author outside the closed set is not a kind the store has; falling
		// through to no filter is what keeps it from being handed one.
		expect(history([], { author: "wizard" }, seeded()).message).toContain(
			"git status",
		);
	});

	it("ignores a boolean author", () => {
		expect(history([], { author: true }, seeded()).message).toContain(
			"git status",
		);
	});

	it("shows the time of day rather than the whole timestamp", () => {
		// Eight characters of clock. The date is nearly always today, and the
		// row has to leave room for the command.
		expect(history([], {}, seeded()).message).toMatch(/\n\d\d:\d\d:\d\d {2}h/);
	});

	it("abbreviates the actor to one letter", () => {
		expect(history([], {}, seeded()).message).toMatch(/ {2}h {2}/);
	});
});

describe("aliases", () => {
	it("sets one", () => {
		expect(alias(["set", "gs", "git", "status"]).message).toBe(
			"alias gs='git status'",
		);
	});

	it("lists what was set", () => {
		const site = station();
		alias(["set", "gs", "git", "status"], site);
		expect(alias([], site).message).toContain("gs='git status'");
	});

	it("renders (empty) with no aliases", () => {
		expect(alias([]).message).toBe("▣ alias\n (empty)");
	});

	it("removes one", () => {
		const site = station();
		alias(["set", "gs", "git", "status"], site);
		expect(alias(["rm", "gs"], site).message).toBe("removed gs");
	});

	it("accepts remove as a spelling of rm", () => {
		const site = station();
		alias(["set", "gs", "git", "status"], site);
		alias(["remove", "gs"], site);
		expect(alias([], site).message).toContain("(empty)");
	});

	it("really removes it", () => {
		const site = station();
		alias(["set", "gs", "git", "status"], site);
		alias(["rm", "gs"], site);
		expect(alias([], site).message).not.toContain("gs=");
	});

	it("falls through to the listing when set has no name", () => {
		// `alias set` with nothing after it is not a set; listing is the safe
		// reading, and it is what the bare verb does anyway.
		expect(alias(["set"]).message).toContain("▣ alias");
	});

	it("falls through to the listing when rm has no name", () => {
		expect(alias(["rm"]).message).toContain("▣ alias");
	});

	it("sets an alias with an empty body", () => {
		// A body is allowed to be empty; it is the *name* that is required.
		expect(alias(["set", "noop"]).message).toBe("alias noop=''");
	});

	it("carries the env listing alongside the aliases", () => {
		const data = alias([]).data as { aliases: unknown[]; env: unknown[] };
		expect(data.aliases).toEqual([]);
		expect(data.env).toEqual([]);
	});
});

describe("environment variables", () => {
	it("sets one", () => {
		expect(alias(["env", "set", "EDITOR", "vim"]).message).toBe(
			"export EDITOR='vim'",
		);
	});

	it("lists what was set", () => {
		const site = station();
		alias(["env", "set", "EDITOR", "vim"], site);
		expect(alias(["env"], site).message).toContain("EDITOR=vim");
	});

	it("renders (empty) with none set", () => {
		expect(alias(["env"]).message).toBe("▣ env\n (empty)");
	});

	it("removes one", () => {
		const site = station();
		alias(["env", "set", "EDITOR", "vim"], site);
		expect(alias(["env", "rm", "EDITOR"], site).message).toBe("removed EDITOR");
	});

	it("accepts remove as a spelling of rm", () => {
		const site = station();
		alias(["env", "set", "EDITOR", "vim"], site);
		alias(["env", "remove", "EDITOR"], site);
		expect(alias(["env"], site).message).toContain("(empty)");
	});

	it("falls through to the listing when env set has no name", () => {
		expect(alias(["env", "set"]).message).toContain("▣ env");
	});

	it("falls through to the listing when env rm has no name", () => {
		expect(alias(["env", "rm"]).message).toContain("▣ env");
	});

	it("joins a value that came in as several words", () => {
		// The value is the rest of the line, not just the next word -- an
		// editor invocation with flags is an ordinary thing to export.
		expect(alias(["env", "set", "EDITOR", "code", "--wait"]).message).toBe(
			"export EDITOR='code --wait'",
		);
	});

	it("does not confuse an alias named env with the env sub-command", () => {
		// `alias set env ...` sets an alias; `alias env` lists variables. The
		// sub-command is the first argument, so they cannot collide.
		const site = station();
		alias(["set", "env", "printenv"], site);
		expect(alias(["env"], site).message).toContain("(empty)");
	});
});

describe("exporting dotfiles", () => {
	it("emits a bash script", () => {
		const site = station();
		alias(["set", "gs", "git", "status"], site);
		expect(alias(["export"], site).message).toContain("alias gs='git status'");
	});

	it("includes exported variables", () => {
		const site = station();
		alias(["env", "set", "EDITOR", "vim"], site);
		expect(alias(["export"], site).message).toContain("EDITOR");
	});

	it("carries the script in the payload as well as the message", () => {
		// The payload is what a shell integration reads; the message is what a
		// person reads. Both have to be the same script.
		const result = alias(["export"]);
		const data = result.data as { script: string };
		expect(data.script).toBe(result.message);
	});

	it("exports an empty station without failing", () => {
		expect(alias(["export"]).ok).toBe(true);
	});
});
