import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import {
	describeAuthedStationSession,
	formatStationStatusBlock,
	formatStationStrap,
	stationDevEnv,
} from "../src/station-session.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "hobo-code-station-session-"));
	homes.push(home);
	return home;
}

describe("authed station session view", () => {
	it("reports auth:out when no session exists", () => {
		const view = describeAuthedStationSession({ hoboHome: tempHome() });
		expect(view.loggedIn).toBe(false);
		expect(formatStationStrap(view)).toEqual(["auth:out"]);
		expect(formatStationStatusBlock(view)).toMatch(/not logged in/i);
		expect(stationDevEnv(view)).toEqual({});
	});

	it("shows station name, id, tenant, and environment after local login", () => {
		const hoboHome = tempHome();
		const login = authLogin({
			hoboHome,
			tenant: "camp-west",
			autoInitLocal: true,
		});
		expect(login.ok && login.status === "logged-in").toBe(true);
		const view = describeAuthedStationSession({
			hoboHome,
			env: {
				HOBO_ENV: "preview",
				HOBO_PROJECT: "hello-world",
				HOBO_BRANCH: "main",
			},
		});
		expect(view.loggedIn).toBe(true);
		expect(view.stationId).toBe("station:local");
		expect(view.displayName).toBe("local");
		expect(view.tenant).toBe("camp-west");
		expect(view.mode).toBe("local");
		expect(view.environment).toBe("preview");
		expect(view.project).toBe("hello-world");
		expect(view.branch).toBe("main");
		expect(formatStationStrap(view)).toEqual(["local@preview"]);
		const block = formatStationStatusBlock(view);
		expect(block).toContain("id       station:local");
		expect(block).toContain("name     local");
		expect(block).toContain("tenant   camp-west");
		expect(block).toContain("env      preview");
		expect(block).toContain("project  hello-world");
		expect(stationDevEnv(view)).toMatchObject({
			HOBO_STATION: "station:local",
			HOBO_TENANT: "camp-west",
			HOBO_ENV: "preview",
			HOBO_PROJECT: "hello-world",
			HOBO_BRANCH: "main",
		});
	});

	it("ensureLocalLogin writes a local session so the shell can start authed", () => {
		const hoboHome = tempHome();
		const view = describeAuthedStationSession({
			hoboHome,
			ensureLocalLogin: true,
		});
		expect(view.loggedIn).toBe(true);
		expect(view.stationId).toBe("station:local");
		expect(view.environment).toBe("local-dev");
	});
});
