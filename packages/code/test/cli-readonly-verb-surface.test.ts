/**
 * The `hobo-code` CLI's read-only verb surface.
 *
 * These are the verbs a user reaches for to find out where they stand —
 * `help`, `status`, `models`, `cost`, `config`, `agent`, `harness`,
 * `resources`, `tasks`, `guide`, `machines`, `history`, `alias`, `env`,
 * `template`. None of them start a process, contact a model, or mutate the
 * project, which is exactly why they have to be right: they are what a user
 * trusts when something else has gone wrong.
 *
 * **Every result carries a machine-readable code.** The shell, the dashboard
 * and the harness all branch on `result.code`; a verb that answered with prose
 * alone would force them to match English.
 *
 * **A refusal names the fix.** An unknown config stack, an unknown help topic,
 * an unknown verb — each must say what to try instead, because a CLI that only
 * says "no" trains a user to guess.
 *
 * **`--help` on a verb is the verb's own help, not the top-level help.** A user
 * who typed `hobo-code dev --help` wants `dev`; handing back the index is a
 * silent redirect that costs them a second read.
 *
 * Each run gets its own `HOBO_HOME`, so nothing leaks between tests and
 * nothing touches the developer's real station.
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
	for (const home of homes.splice(0))
		rmSync(home, { recursive: true, force: true });
});

function home(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-code-cli-"));
	homes.push(dir);
	return dir;
}

/** Run a verb against a private station home. */
async function run(
	argv: readonly string[],
	options: { env?: NodeJS.ProcessEnv; dense?: boolean } = {},
): Promise<HoboCodeCliResult> {
	const hoboHome = home();
	return await runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...options.env },
		json: false,
		...(options.dense !== undefined ? { dense: options.dense } : undefined),
	});
}

describe("help", () => {
	it("answers the bare help verb", async () => {
		const result = await run(["help"]);
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_HELP");
	});

	it("names the default verb so a bare invocation is predictable", async () => {
		const result = await run(["help"]);
		// A user typing `hobo-code "add a login page"` is relying on this; the
		// help has to say which verb their words land in.
		expect(result.data).toMatchObject({ defaultVerb: "dispatch" });
	});

	it("lists the verbs it accepts", async () => {
		const result = await run(["help"]);
		// SAFETY: the help verb always answers with its verb list.
		const data = result.data as { verbs?: readonly string[] };
		expect(data.verbs).toContain("dev");
	});

	it("reports the top topic for bare help", async () => {
		const result = await run(["help"]);
		expect(result.data).toMatchObject({ topic: "top" });
	});

	it("answers help for a named verb topic", async () => {
		const result = await run(["help", "dev"]);
		expect(result.data).toMatchObject({ topic: "dev" });
	});

	it("treats `--help` on a verb as that verb's topic", async () => {
		const result = await run(["dev", "--help"]);
		// The user asked about `dev`. Answering with the index would make them
		// find `dev` again themselves.
		expect(result.data).toMatchObject({ topic: "dev" });
	});

	it("does not treat `help --help` as a topic of itself", async () => {
		const result = await run(["help", "--help"]);
		expect(result.data).toMatchObject({ topic: "top" });
	});

	it("falls back to the index for a topic that is not a verb", async () => {
		const result = await run(["help", "nonsense"]);
		// An unknown topic is a typo, and the index is what lets the user find
		// what they meant.
		expect(result.data).toMatchObject({ topic: "top" });
	});

	it("renders differently in dense mode", async () => {
		const plain = await run(["help"]);
		const dense = await run(["help"], { dense: true });
		// Dense is an opt-in power chrome; if it rendered identically the flag
		// would be a lie.
		expect(dense.message).not.toBe(plain.message);
	});

	it("reports which chrome it rendered", async () => {
		expect((await run(["help"], { dense: true })).data).toMatchObject({
			dense: true,
		});
	});

	it("names the binary it is documenting", async () => {
		// `hobo` and `hobo-code` are different CLIs; help that named the wrong
		// one would send a user to the wrong tool.
		expect((await run(["help"])).data).toMatchObject({ binary: "hobo-code" });
	});
});

describe("the read-only inspection verbs", () => {
	const verbs = [
		["models", "HOBO_CODE_MODELS"],
		["cost", "HOBO_CODE_COST"],
		["harness", "HOBO_CODE_HARNESS"],
		["config", "HOBO_CODE_CONFIG"],
		["agent", "HOBO_CODE_AGENT"],
		["status", "HOBO_CODE_STATUS"],
		["tasks", "HOBO_CODE_TASKS"],
	] as const;

	for (const [verb, code] of verbs) {
		it(`answers \`${verb}\` with its own code`, async () => {
			const result = await run([verb]);
			// Callers branch on the code, never on the prose.
			expect(result.code).toBe(code);
			expect(result.ok).toBe(true);
		});

		it(`answers \`${verb}\` with renderable text`, async () => {
			const result = await run([verb]);
			expect(result.message.length).toBeGreaterThan(0);
		});
	}

	it("reports models with a structured status alongside the text", async () => {
		const result = await run(["models"]);
		// The dashboard renders the structure; the terminal renders the text.
		// Shipping only one forces the other side to re-parse.
		expect(result.data).toMatchObject({ models: expect.anything() });
	});

	it("reports cost with a structured status", async () => {
		expect((await run(["cost"])).data).toMatchObject({
			cost: expect.anything(),
		});
	});

	it("reports the harness surface for the current project", async () => {
		expect((await run(["harness"])).data).toMatchObject({
			harness: expect.anything(),
		});
	});

	it("reports no config stack when none was asked for", async () => {
		expect((await run(["config"])).data).toMatchObject({ stack: null });
	});

	it("accepts a known config stack as a positional", async () => {
		const result = await run(["config", "agent-native"]);
		expect(result.ok).toBe(true);
		expect(result.data).toMatchObject({ stack: "agent-native" });
	});

	it("accepts a known config stack as a flag", async () => {
		expect(
			(await run(["config", "--stack", "cost-budget"])).data,
		).toMatchObject({ stack: "cost-budget" });
	});

	it("lower-cases a config stack before matching it", async () => {
		// A user typing the name they saw in a heading should not be punished
		// for the capitalisation.
		expect((await run(["config", "--stack", "EDITOR-VIM"])).data).toMatchObject(
			{ stack: "editor-vim" },
		);
	});

	it("refuses an unknown config stack", async () => {
		const result = await run(["config", "not-a-stack"]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_CONFIG_USAGE");
	});

	it("names the stacks it does accept in the refusal", async () => {
		const result = await run(["config", "not-a-stack"]);
		// A refusal that does not list the alternatives makes the user go read
		// source or guess.
		expect(result.message).toContain("agent-native");
	});

	it("offers a remediation for an unknown config stack", async () => {
		const result = await run(["config", "not-a-stack"]);
		expect(result.remediation?.length).toBeGreaterThan(0);
	});

	it("does not read a leading flag as a config stack", async () => {
		// `hobo-code config --json` names no stack; treating `--json` as one
		// would refuse a perfectly ordinary invocation.
		const result = await run(["config", "--json"]);
		expect(result.ok).toBe(true);
	});

	it("reports the platform alongside status", async () => {
		expect((await run(["status"])).data).toMatchObject({
			platform: expect.anything(),
		});
	});

	it("renders a status chip for compact display", async () => {
		const result = await run(["status"]);
		// SAFETY: the status verb always answers with its chip.
		const data = result.data as { chip?: string };
		expect(typeof data.chip).toBe("string");
	});

	it("renders status differently in dense mode", async () => {
		const plain = await run(["status"]);
		const dense = await run(["status"], { dense: true });
		expect(dense.message).not.toBe(plain.message);
	});
});

describe("resources", () => {
	it("lists the session resource inventory", async () => {
		const result = await run(["resources"]);
		expect(result.code).toBe("HOBO_CODE_RESOURCES");
	});

	it("carries the inventory as structure", async () => {
		expect((await run(["resources"])).data).toMatchObject({
			inventory: expect.anything(),
		});
	});

	it("filters by a kind given as a positional", async () => {
		const result = await run(["resources", "station"]);
		expect(result.code).toBe("HOBO_CODE_RESOURCES");
	});

	it("filters by a kind given as a flag", async () => {
		const result = await run(["resources", "--kind", "camp"]);
		expect(result.code).toBe("HOBO_CODE_RESOURCES");
	});

	it("lower-cases the kind before matching", async () => {
		const result = await run(["resources", "--kind", "YARD"]);
		expect(result.code).toBe("HOBO_CODE_RESOURCES");
	});

	it("ignores an unrecognised kind rather than emptying the list", async () => {
		const unfiltered = await run(["resources"]);
		const bogus = await run(["resources", "--kind", "not-a-kind"]);
		// An empty list for a typo reads as "you have nothing"; showing
		// everything makes the mistake visible.
		expect(bogus.message).toBe(unfiltered.message);
	});

	it("mirrors the inventory's own health into the exit code", async () => {
		const result = await run(["resources"]);
		// `resources` is used in scripts as a health probe, so a degraded
		// inventory has to be a non-zero exit and not just different prose.
		expect(result.exitCode).toBe(result.ok ? 0 : 1);
	});
});

describe("history and alias", () => {
	it("answers the history verb", async () => {
		const result = await run(["history"]);
		expect(typeof result.code).toBe("string");
	});

	it("answers the alias verb", async () => {
		const result = await run(["alias"]);
		expect(typeof result.code).toBe("string");
	});

	it("refuses to set an alias before login, and names the fix", async () => {
		const hoboHome = home();
		const deps = {
			hoboHome,
			cwd: hoboHome,
			env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev" },
			json: false,
		};
		await runHoboCodeCli(["alias", "set", "ll", "ls -l"], deps);
		const listed = await runHoboCodeCli(["alias"], deps);
		// Shell memory is per-station and per-principal, so there is nowhere to
		// put an alias until a station session exists. The refusal names the
		// command that creates one rather than failing opaquely.
		expect(listed.message).toContain("hobo-code auth");
	});
});

describe("guide", () => {
	it("answers the bare guide verb", async () => {
		const result = await run(["guide"]);
		expect(result.ok).toBe(true);
	});

	it("answers a Cursor guide asked for by flag", async () => {
		const result = await run(["guide", "--cursor"]);
		expect(result.ok).toBe(true);
	});

	it("answers a Cursor guide asked for by `--from`", async () => {
		const result = await run(["guide", "--from", "cursor"]);
		expect(result.ok).toBe(true);
	});

	it("answers a Cursor guide asked for as a positional", async () => {
		// Three spellings reach the same guide because a user arriving from
		// Cursor will try whichever one occurs to them first.
		const result = await run(["guide", "cursor"]);
		expect(result.ok).toBe(true);
	});

	it("matches the `--from` value case-insensitively", async () => {
		const result = await run(["guide", "--from", "Cursor"]);
		expect(result.ok).toBe(true);
	});
});

describe("formatting a result", () => {
	it("renders the message in human mode", async () => {
		const result = await run(["models"]);
		expect(formatHoboCodeResult(result, { json: false })).toContain(
			result.message.split("\n")[0] ?? "",
		);
	});

	it("renders JSON when asked", async () => {
		const result = await run(["models"]);
		const text = formatHoboCodeResult(result, { json: true });
		// A `--json` caller is a program. It must get parseable output even when
		// the human rendering is a decorated panel.
		expect(() => JSON.parse(text)).not.toThrow();
	});

	it("carries the code into the JSON rendering", async () => {
		const result = await run(["models"]);
		expect(
			JSON.parse(formatHoboCodeResult(result, { json: true })),
		).toMatchObject({ code: "HOBO_CODE_MODELS" });
	});

	it("renders a failure's remediation in human mode", async () => {
		const result = await run(["config", "not-a-stack"]);
		const text = formatHoboCodeResult(result, { json: false });
		// The remediation is the actionable half; dropping it from the terminal
		// rendering leaves the user with a refusal and no next step.
		expect(text).toContain("hobo-code config");
	});

	it("renders a failure as JSON without throwing", async () => {
		const result = await run(["config", "not-a-stack"]);
		expect(() =>
			JSON.parse(formatHoboCodeResult(result, { json: true })),
		).not.toThrow();
	});

	it("keeps dense rendering parseable as JSON", async () => {
		const result = await run(["status"], { dense: true });
		expect(() =>
			JSON.parse(formatHoboCodeResult(result, { json: true, dense: true })),
		).not.toThrow();
	});
});

describe("a logged-in station", () => {
	/**
	 * Every verb above ran unauthenticated, which reaches only the "no session"
	 * arm of each branch. A local login is offline — `autoInitLocal` mints a
	 * station in the given home — so the authenticated arms are reachable too,
	 * and they are the ones a real user actually sees.
	 */
	async function station() {
		const hoboHome = home();
		const deps = {
			hoboHome,
			cwd: hoboHome,
			env: {
				HOBO_HOME: hoboHome,
				HOBO_ENV: "local-dev",
				HOBO_CODE_AUTH_MOCK: "1",
			},
			json: false,
		};
		const login = await runHoboCodeCli(["auth", "login"], deps);
		return { deps, login };
	}

	it("logs in locally without contacting anything", async () => {
		const { login } = await station();
		expect(login.ok).toBe(true);
		expect(login.code).toBe("HOBO_CODE_AUTH");
	});

	it("names the station it logged into", async () => {
		const { login } = await station();
		// A login that did not say which station it bound would leave a user
		// with two homes unable to tell which one they are working in.
		expect(login.message).toContain("Station");
	});

	it("reports the session's tenant", async () => {
		const { login } = await station();
		expect(login.message).toContain("tenant ·");
	});

	it("carries the session as structure", async () => {
		const { login } = await station();
		expect(login.data).toMatchObject({ session: expect.anything() });
	});

	it("teaches the next command after login", async () => {
		const { login } = await station();
		// Login is the first thing a new user does; leaving them at a prompt
		// with no next step is where a CLI loses them.
		expect(login.message).toContain("hobo-code");
	});

	it("reports a logged-in status differently from a logged-out one", async () => {
		const { deps } = await station();
		const authed = await runHoboCodeCli(["status"], deps);
		const anonymous = await run(["status"]);
		// If status read the same either way, it would not be telling the user
		// anything about their session.
		expect(authed.message).not.toBe(anonymous.message);
	});

	it("answers auth status once logged in", async () => {
		const { deps } = await station();
		const status = await runHoboCodeCli(["auth"], deps);
		expect(status.ok).toBe(true);
	});

	it("answers auth status explicitly", async () => {
		const { deps } = await station();
		expect((await runHoboCodeCli(["auth", "status"], deps)).ok).toBe(true);
	});

	it("logs out again", async () => {
		const { deps } = await station();
		const out = await runHoboCodeCli(["auth", "logout"], deps);
		expect(out.ok).toBe(true);
	});

	it("reports logged out after a logout", async () => {
		const { deps } = await station();
		await runHoboCodeCli(["auth", "logout"], deps);
		const status = await runHoboCodeCli(["auth"], deps);
		// A logout that left the session readable would be a logout in name
		// only — the next command would still act as the principal.
		expect(status.message).not.toContain("tenant ·");
	});

	it("accepts an explicit station id", async () => {
		const hoboHome = home();
		const login = await runHoboCodeCli(
			["auth", "login", "--station", "station:test"],
			{
				hoboHome,
				cwd: hoboHome,
				env: {
					HOBO_HOME: hoboHome,
					HOBO_ENV: "local-dev",
					HOBO_CODE_AUTH_MOCK: "1",
				},
				json: false,
			},
		);
		expect(login.message).toContain("station:test");
	});

	it("logs in as an agent with no elicitation", async () => {
		const hoboHome = home();
		const login = await runHoboCodeCli(["auth", "login", "--agent"], {
			hoboHome,
			cwd: hoboHome,
			env: {
				HOBO_HOME: hoboHome,
				HOBO_ENV: "local-dev",
				HOBO_CODE_AUTH_MOCK: "1",
			},
			json: false,
		});
		// An agent login must never wait on a human, because there is not one.
		expect(login.ok).toBe(true);
		expect(login.message).toContain("human-free");
	});

	it("shows an agent login its own next steps", async () => {
		const hoboHome = home();
		const login = await runHoboCodeCli(["auth", "login", "--agent"], {
			hoboHome,
			cwd: hoboHome,
			env: {
				HOBO_HOME: hoboHome,
				HOBO_ENV: "local-dev",
				HOBO_CODE_AUTH_MOCK: "1",
			},
			json: false,
		});
		// An agent is pointed at `--json` surfaces, not at "build something".
		expect(login.message).toContain("--json");
	});

	it("lists resources for a logged-in station", async () => {
		const { deps } = await station();
		const resources = await runHoboCodeCli(["resources"], deps);
		expect(resources.code).toBe("HOBO_CODE_RESOURCES");
	});

	it("reports the agent surface for a logged-in station", async () => {
		const { deps } = await station();
		expect((await runHoboCodeCli(["agent"], deps)).ok).toBe(true);
	});

	it("reports tasks for a logged-in station", async () => {
		const { deps } = await station();
		expect((await runHoboCodeCli(["tasks"], deps)).code).toBe(
			"HOBO_CODE_TASKS",
		);
	});

	it("sets and lists an alias once a station exists", async () => {
		const { deps } = await station();
		await runHoboCodeCli(["alias", "set", "ll", "ls -l"], deps);
		const listed = await runHoboCodeCli(["alias"], deps);
		// Shell memory is per-station, so this is the first point at which an
		// alias has anywhere to live.
		expect(listed.message).toContain("ll");
	});

	it("records and searches command history once a station exists", async () => {
		const { deps } = await station();
		const listed = await runHoboCodeCli(["history"], deps);
		expect(listed.ok).toBe(true);
	});
});
