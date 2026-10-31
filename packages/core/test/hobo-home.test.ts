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

import { HOBO_HOME_DIRNAME, resolveHoboHome } from "../src/hobo-home.js";

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
