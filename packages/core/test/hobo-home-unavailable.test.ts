// With no HOBO_HOME, no HOME, and an account the password database does not
// know (a container's `--user 4242`), `os.homedir()` throws libuv's
// `uv_os_homedir returned ENOENT`. `resolveHoboHome` turns that into a
// `HoboHomeUnavailable` that says what to set, so every caller reports the
// same thing and discovery can tell "no home" from a real failure.
import { describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (original) => ({
	...(await original<typeof import("node:os")>()),
	homedir: () => {
		throw Object.assign(
			new Error(
				"A system error occurred: uv_os_homedir returned ENOENT (no such file or directory)",
			),
			{ code: "ERR_SYSTEM_ERROR" },
		);
	},
}));

const { HoboHomeUnavailable, resolveHoboHome } = await import(
	"../src/hobo-home.js"
);

describe("resolveHoboHome with no home anywhere", () => {
	it("throws HoboHomeUnavailable naming HOBO_HOME and HOME", () => {
		let thrown: unknown;
		try {
			resolveHoboHome({});
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(HoboHomeUnavailable);
		expect(thrown).toMatchObject({
			code: "HOBO_HOME_UNAVAILABLE",
			message: expect.stringMatching(/set HOBO_HOME or HOME$/u),
		});
		expect(thrown).not.toMatchObject({
			message: expect.stringMatching(/uv_os_homedir/u),
		});
	});

	it("still answers from HOBO_HOME or HOME without asking the account", () => {
		expect(resolveHoboHome({ HOBO_HOME: "/srv/hobo" })).toBe("/srv/hobo");
		expect(resolveHoboHome({ HOME: "/home/a" })).toBe("/home/a/.hobo");
	});
});
