// The one rule for where a user's HoBo state lives (`@hobo/core/hobo-home`).
//
// The case that matters is the last one. Several packages used to fall back to
// `/tmp/.hobo` or `$(os.tmpdir())/.hobo` when the environment they were handed
// named no `HOME`. `/tmp` is world-writable, so another local user could make
// that directory first and receive every auth session and evidence file written
// into it. An environment with no `HOME` still belongs to a user, and that
// user's home (`os.homedir()`) is where its state goes.
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	HOBO_HOME_DIRNAME,
	HoboHomeUnavailable,
	resolveHoboHome,
} from "../src/hobo-home.js";

describe("resolveHoboHome", () => {
	it("takes HOBO_HOME when it is set", () => {
		expect(resolveHoboHome({ HOBO_HOME: "/srv/hobo", HOME: "/home/a" })).toBe(
			"/srv/hobo",
		);
	});

	it("treats an empty HOBO_HOME as unset", () => {
		// `HOBO_HOME= hobo …` is how a shell unsets it for one command.
		expect(resolveHoboHome({ HOBO_HOME: "", HOME: "/home/a" })).toBe(
			join("/home/a", HOBO_HOME_DIRNAME),
		);
	});

	it("treats a blank HOBO_HOME or HOME as unset", () => {
		expect(resolveHoboHome({ HOBO_HOME: "  ", HOME: "/home/a" })).toBe(
			"/home/a/.hobo",
		);
		expect(resolveHoboHome({ HOME: " \t" })).toBe(join(homedir(), ".hobo"));
	});

	it("trims HOBO_HOME", () => {
		expect(resolveHoboHome({ HOBO_HOME: "  /srv/hobo\n" })).toBe("/srv/hobo");
	});

	it("expands a leading ~ in HOBO_HOME to HOME", () => {
		// A shell expands `~` only at a word's start, so `HOBO_HOME="~/x"` in a
		// systemd unit or a .env file arrives with the tilde intact.
		expect(resolveHoboHome({ HOBO_HOME: "~", HOME: "/home/a" })).toBe(
			"/home/a",
		);
		expect(
			resolveHoboHome({ HOBO_HOME: "~/.local/state/hobo", HOME: "/home/a" }),
		).toBe("/home/a/.local/state/hobo");
		expect(resolveHoboHome({ HOBO_HOME: "~/x" }, () => "/home/b")).toBe(
			"/home/b/x",
		);
	});

	it("refuses a relative HOBO_HOME rather than resolving it against the cwd", () => {
		// `HOBO_HOME=hobo` would put state wherever the command happens to run.
		for (const relative of ["hobo", "./hobo", "~other/hobo"]) {
			expect(() => resolveHoboHome({ HOBO_HOME: relative })).toThrow(
				HoboHomeUnavailable,
			);
			expect(() => resolveHoboHome({ HOBO_HOME: relative })).toThrow(
				/HOBO_HOME must be an absolute path/u,
			);
		}
	});

	it("uses HOME from the environment it is given, not the process's", () => {
		expect(resolveHoboHome({ HOME: "/home/a" })).toBe("/home/a/.hobo");
	});

	it("treats an empty HOME as unset", () => {
		expect(resolveHoboHome({ HOME: "" })).toBe(join(homedir(), ".hobo"));
	});

	it("falls back to os.homedir(), never a temp directory, when HOME is missing", () => {
		const home = resolveHoboHome({});
		expect(home).toBe(join(homedir(), ".hobo"));
		expect(home).not.toBe("/tmp/.hobo");
		expect(home).not.toBe(join(tmpdir(), ".hobo"));
	});
});
