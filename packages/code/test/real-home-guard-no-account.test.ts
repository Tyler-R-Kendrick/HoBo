/**
 * The real-home guard for a uid the password database does not know (a
 * container run as `--user 4242`, HOME=/). `os.userInfo()` throws for it, and
 * the guard's global setup used to throw with it, failing the whole run before
 * a test started. Such a uid has no account home to watch beyond HOME.
 */
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (original) => ({
	...(await original<typeof import("node:os")>()),
	userInfo: () => {
		throw Object.assign(
			new Error(
				"A system error occurred: uv_os_get_passwd returned ENOENT (no such file or directory)",
			),
			{ code: "ERR_SYSTEM_ERROR" },
		);
	},
}));

const { watchedHomes } = await import("./real-home-guard.js");

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

describe("watchedHomes for a uid with no passwd entry", () => {
	it("watches the temp homes and HOME's, and does not throw", () => {
		expect(watchedHomes({ HOME: "/" })).toEqual([
			...new Set(
				["/tmp/.hobo", join(tmpdir(), ".hobo"), "/.hobo"].map(canonical),
			),
		]);
	});

	it("watches only the temp homes when HOME is unset too", () => {
		expect(watchedHomes({})).toEqual([
			...new Set(["/tmp/.hobo", join(tmpdir(), ".hobo")].map(canonical)),
		]);
	});
});
