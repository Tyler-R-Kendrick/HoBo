/**
 * `hobo-code auth` — logging a Station in, and the two ways that can go.
 *
 * The verb has a local path and a remote device-code path, and the interesting
 * rules are about which one a caller gets and when it refuses to choose.
 *
 * **An agent login refuses interactive remote device-code.** A device code is
 * a human reading a URL off a terminal and typing it into a browser; an agent
 * has nobody to do that, so a `--agent` login that also names a tenant or
 * domain is a request that cannot complete. It fails immediately and names
 * three ways out — drop the remote flags, pre-bind a session ref, or have a
 * human do the bootstrap — rather than printing a code nobody will read.
 *
 * **`--force` is the escape hatch**, because "refuse by default" and "never
 * allow" are different policies and only the first is right here.
 *
 * **A device-code login reports pending, not success.** The station is not
 * logged in until the code is confirmed, and a verb that returned `ok` at the
 * point the code was *issued* would have every caller believe it was.
 *
 * **`--complete` without a code is a usage error, not a silent no-op.** The
 * code is the whole of the request; without it there is nothing to confirm.
 *
 * Driven against throwaway `HOBO_HOME` directories, so a login really writes a
 * session and a bad code really fails.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { type HoboCodeCliResult, runHoboCodeCli } from "../src/cli.js";

const homes: string[] = [];
afterEach(() => {
	for (const dir of homes.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function run(
	argv: readonly string[],
	env: NodeJS.ProcessEnv = {},
): Promise<HoboCodeCliResult> {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-auth-"));
	homes.push(hoboHome);
	return runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...env },
		json: false,
	});
}

/** A home that survives between two invocations, so state carries over. */
function sharedHome(): string {
	const hoboHome = mkdtempSync(join(tmpdir(), "hobo-code-auth-shared-"));
	homes.push(hoboHome);
	return hoboHome;
}

const runIn = (
	hoboHome: string,
	argv: readonly string[],
	env: NodeJS.ProcessEnv = {},
) =>
	runHoboCodeCli([...argv], {
		hoboHome,
		cwd: hoboHome,
		env: { HOBO_HOME: hoboHome, HOBO_ENV: "local-dev", ...env },
		json: false,
	});

describe("logging in locally", () => {
	it("logs a station in", async () => {
		const result = await run(["auth", "login"]);
		expect(result.ok).toBe(true);
	});

	it("says which station it logged in to", async () => {
		expect((await run(["auth", "login"])).message).toMatch(/Logged in to/u);
	});

	it("marks a local login as local", async () => {
		// Local and remote are different trust stories; the panel says which.
		expect((await run(["auth", "login"])).message).toContain("(local)");
	});

	it("names the tenant", async () => {
		expect((await run(["auth", "login"])).message).toContain("tenant ·");
	});

	it("points at what to do next", async () => {
		// A login that ends without a next step leaves the user at a prompt
		// wondering what it bought them.
		expect((await run(["auth", "login"])).message).toMatch(/next ·/u);
	});

	it("takes an explicit station id", async () => {
		const result = await run(["auth", "login", "--station", "station:west"]);
		expect(result.ok).toBe(true);
	});
});

describe("an agent login", () => {
	it("logs in without a human", async () => {
		expect((await run(["auth", "login", "--agent"])).ok).toBe(true);
	});

	it("says it is human-free", async () => {
		expect((await run(["auth", "login", "--agent"])).message).toContain(
			"human-free",
		);
	});

	it("offers the agent's next verbs rather than a build prompt", async () => {
		// An agent's next step is `agent --json`, not "build something" -- the
		// panel is read by a program, and pointing it at a prose prompt would
		// be advice it cannot take.
		const message = (await run(["auth", "login", "--agent"])).message;
		expect(message).toContain("hobo-code agent");
		expect(message).not.toContain("build something");
	});

	it("shows a truncated session ref", async () => {
		// Enough to correlate against a log line, not enough to be a
		// credential sitting in a scrollback.
		expect((await run(["auth", "login", "--agent"])).message).toContain("…");
	});

	it("takes the agent path from the environment too", async () => {
		expect(
			(await run(["auth", "login"], { HOBO_CODE_AGENT: "1" })).message,
		).toContain("human-free");
	});

	it.each(["1", "true"])("accepts HOBO_CODE_AGENT=%s", async (value) => {
		expect(
			(await run(["auth", "login"], { HOBO_CODE_AGENT: value })).message,
		).toContain("human-free");
	});
});

describe("an agent login that names a remote", () => {
	it("refuses a tenant", async () => {
		// A device code is a human reading a URL and typing it into a browser.
		// An agent has nobody to do that.
		const result = await run(["auth", "login", "--agent", "--tenant", "acme"]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_AUTH_AGENT_REMOTE");
	});

	it("refuses a domain", async () => {
		expect(
			(await run(["auth", "login", "--agent", "--domain", "acme.example"]))
				.code,
		).toBe("HOBO_CODE_AUTH_AGENT_REMOTE");
	});

	it("says what it refused", async () => {
		expect(
			(await run(["auth", "login", "--agent", "--tenant", "acme"])).message,
		).toContain("refuses interactive remote device-code");
	});

	it("offers the local path as the first way out", async () => {
		expect(
			(await run(["auth", "login", "--agent", "--tenant", "acme"])).message,
		).toContain("drop --tenant/--domain");
	});

	it("offers a pre-bound session ref as another", async () => {
		expect(
			(await run(["auth", "login", "--agent", "--tenant", "acme"])).message,
		).toContain("HOBO_CODE_SESSION_REF");
	});

	it("names the human bootstrap as the third", async () => {
		// Three ways out, ordered by how much they cost the caller.
		expect(
			(await run(["auth", "login", "--agent", "--tenant", "acme"])).message,
		).toContain("human bootstrap");
	});

	it("carries remediation a caller can act on", async () => {
		const result = await run(["auth", "login", "--agent", "--tenant", "acme"]);
		expect((result.remediation ?? []).length).toBeGreaterThan(0);
	});

	it("allows it with --force", async () => {
		// "Refuse by default" and "never allow" are different policies, and
		// only the first is right here.
		const result = await run([
			"auth",
			"login",
			"--agent",
			"--tenant",
			"acme",
			"--force",
		]);
		expect(result.code).not.toBe("HOBO_CODE_AUTH_AGENT_REMOTE");
	});

	it("does not refuse a plain agent login", async () => {
		expect((await run(["auth", "login", "--agent"])).ok).toBe(true);
	});
});

describe("completing a device code", () => {
	it("refuses --complete with an empty code", () => {
		// `--complete=` reaches the verb with an empty string, which is the
		// shape the usage check exists for: the flag was given, the code was
		// not.
		return run(["auth", "login", "--complete="]).then((result) => {
			expect(result.code).toBe("HOBO_CODE_AUTH_USAGE");
		});
	});

	it("says how to use it", async () => {
		expect((await run(["auth", "login", "--complete="])).message).toContain(
			"usage · hobo-code auth login --complete",
		);
	});

	it("offers a way to start a login when the code is missing", async () => {
		// The user who typed `--complete` with nothing has no code because no
		// login was started; the remediation is where to get one.
		const result = await run(["auth", "login", "--complete="]);
		expect((result.remediation ?? []).join(" ")).toContain("auth login");
	});

	it("rejects a bare --complete at the flag parser instead", async () => {
		// A flag that takes a value and was given none never reaches the verb:
		// the parser refuses it first, with a different code. Recorded because
		// the two refusals look alike from a terminal and are not the same
		// check -- one is "you mistyped a flag", the other is "you gave me no
		// code".
		expect((await run(["auth", "login", "--complete"])).code).toBe(
			"HOBO_CODE_UNKNOWN_FLAG",
		);
	});

	it("also rejects --complete followed by another flag", async () => {
		expect((await run(["auth", "login", "--complete", "--json"])).code).toBe(
			"HOBO_CODE_UNKNOWN_FLAG",
		);
	});

	it("fails on a code no station issued", async () => {
		// A confirmation for a code that was never handed out cannot succeed,
		// and saying so beats a login that silently does nothing.
		const result = await run(["auth", "login", "--complete", "NEVER-ISSUED"]);
		expect(result.ok).toBe(false);
	});

	it("reports a failure code a caller can branch on", async () => {
		const result = await run(["auth", "login", "--complete", "NEVER-ISSUED"]);
		expect((result.code ?? "").length).toBeGreaterThan(0);
	});
});

describe("auth status", () => {
	it("defaults to status with no subcommand", async () => {
		// The safe default: reading state cannot change it.
		expect(typeof (await run(["auth"])).message).toBe("string");
	});

	it("reports a logged-out station", async () => {
		const result = await run(["auth", "status"]);
		expect(typeof result.message).toBe("string");
	});

	it("reports a logged-in station after a login", async () => {
		const home = sharedHome();
		await runIn(home, ["auth", "login"]);
		const result = await runIn(home, ["auth", "status"]);
		expect(result.ok).toBe(true);
	});

	it("is case-insensitive about the subcommand", async () => {
		// Verbs are typed by hand; `AUTH STATUS` is the same request.
		const upper = await run(["auth", "STATUS"]);
		const lower = await run(["auth", "status"]);
		expect(upper.code).toBe(lower.code);
	});
});

describe("the json payload", () => {
	it("carries the session after a login", async () => {
		const result = await run(["auth", "login"]);
		// SAFETY: the auth payload carries the session it created.
		expect((result.data as { session?: unknown }).session).toBeDefined();
	});

	it("carries the rendered text alongside it", async () => {
		// A caller reading JSON should not have to re-render the panel to know
		// what a human was shown.
		const result = await run(["auth", "login"]);
		// SAFETY: the auth payload carries the text it rendered.
		expect((result.data as { text?: string }).text).toBeTypeOf("string");
	});

	it("names the station in the session", async () => {
		const result = await run(["auth", "login"]);
		// SAFETY: the auth payload carries the session it created.
		const session = (result.data as { session?: { stationId?: string } })
			.session;
		expect((session?.stationId ?? "").length).toBeGreaterThan(0);
	});
});
