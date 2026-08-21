import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import { runHoboCodeCli } from "../src/cli.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

describe("hobo-code history and alias", () => {
	it("records, searches, and exports Station-scoped aliases", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-hist-cli-"));
		homes.push(hoboHome);
		authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
		const cwd = join(hoboHome, "app");
		const env = { ...process.env, HOBO_HOME: hoboHome };
		const recorded = await runHoboCodeCli(
			["history", "record", "hobo-code", "status"],
			{ hoboHome, env, cwd },
		);
		expect(recorded.ok).toBe(true);
		const search = await runHoboCodeCli(["history", "status", "--json"], {
			hoboHome,
			env,
			cwd,
		});
		expect(search.ok).toBe(true);
		const events =
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			(search.data as { events: { command: string; trust: string }[] }).events;
		expect(events.some((row) => row.command === "hobo-code status")).toBe(true);
		expect(events[0]?.trust).toBe("hobo-executed");
		const set = await runHoboCodeCli(["alias", "set", "gs", "git", "status"], {
			hoboHome,
			env,
			cwd,
		});
		expect(set.ok).toBe(true);
		const exported = await runHoboCodeCli(["alias", "export"], {
			hoboHome,
			env,
			cwd,
		});
		expect(exported.message).toContain("alias gs='git status'");
		const loggedOut = await runHoboCodeCli(["history"], {
			hoboHome: mkdtempSync(join(tmpdir(), "hobo-hist-out-")),
			env: { ...process.env, HOBO_HOME: `${hoboHome}-absent` },
			cwd,
		});
		homes.push(`${hoboHome}-absent`);
		expect(loggedOut.ok).toBe(false);
		expect(loggedOut.code).toBe("HOBO_AUTH_REQUIRED");
	});
});
