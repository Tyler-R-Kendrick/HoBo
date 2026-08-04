import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	authLogin,
	authStatus,
	clearAuthSession,
	confirmRemoteLogin,
	readAuthSession,
	resolveStationTarget,
} from "../src/auth.js";
import { runHoboCodeCli } from "../src/cli.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("hobo-code auth (station login)", () => {
	it("local login auto-resolves and creates station session", () => {
		const home = temp("auth-local-");
		const result = authLogin({ hoboHome: home });
		expect(result.ok).toBe(true);
		if (!result.ok || result.status !== "logged-in")
			throw new Error("expected login");
		expect(result.session.mode).toBe("local");
		expect(result.session.stationId).toMatch(/^station:/);
		expect(readAuthSession(home)?.sessionRef).toBe(result.session.sessionRef);
		const st = authStatus(home);
		expect(st.loggedIn).toBe(true);
	});

	it("remote login requires tenant+domain then device-code complete", () => {
		const home = temp("auth-remote-");
		const pending = authLogin({
			hoboHome: home,
			tenant: "acme",
			domain: "stations.acme.example",
		});
		expect(pending.ok).toBe(true);
		if (!pending.ok || pending.status !== "device-code-pending") {
			throw new Error("expected device-code");
		}
		expect(pending.userCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{2}$/);
		expect(pending.verificationUrl).toContain("stations.acme.example");
		const done = confirmRemoteLogin({
			hoboHome: home,
			userCode: pending.userCode,
		});
		expect(done.ok).toBe(true);
		if (!done.ok || done.status !== "logged-in")
			throw new Error("expected complete");
		expect(done.session.mode).toBe("remote");
		expect(done.session.tenant).toBe("acme");
		expect(done.session.domain).toBe("stations.acme.example");
	});

	it("remote without tenant fails closed", () => {
		const home = temp("auth-bad-");
		const r = authLogin({ hoboHome: home, domain: "stations.example.com" });
		expect(r.ok).toBe(false);
	});

	it("resolveStationTarget prefers local without domain", () => {
		const home = temp("auth-resolve-");
		const t = resolveStationTarget({ hoboHome: home });
		expect(t.mode).toBe("local");
	});

	it("CLI auth login / status / logout", async () => {
		const home = temp("auth-cli-");
		const login = await runHoboCodeCli(["auth", "login"], { hoboHome: home });
		expect(login.ok).toBe(true);
		expect(login.code).toBe("HOBO_CODE_AUTH");
		expect(login.message).toMatch(/local station|Logged in|station/i);

		const status = await runHoboCodeCli(["auth", "status"], {
			hoboHome: home,
		});
		expect(status.ok).toBe(true);
		expect(status.message).toMatch(/Logged in|station/i);

		const logout = await runHoboCodeCli(["auth", "logout"], {
			hoboHome: home,
		});
		expect(logout.ok).toBe(true);
		expect(clearAuthSession(home)).toBe(false); // already cleared
	});

	it("CLI auth --help is topic-scoped", async () => {
		const r = await runHoboCodeCli(["auth", "--help"]);
		expect(r.message).toMatch(/hobo-code auth/);
		expect(r.message).toMatch(/login/);
		expect(r.message).toMatch(/--domain/);
		expect((r.data as { topic: string }).topic).toBe("auth");
	});
});
