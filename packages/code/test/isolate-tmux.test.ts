import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

// test/isolate-tmux.ts, run before every test file: a shell a test starts, or
// a `mux` it runs, must not reach the developer's tmux server or start their
// agent CLIs.
describe("each test file's tmux", () => {
	it("is a server of its own, under the test TMPDIR, and seats no agents", () => {
		expect(process.env.TMUX).toBeUndefined();
		expect(process.env.TMUX_TMPDIR).toMatch(
			new RegExp(
				`^${tmpdir().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/hobo-code-tmux-`,
				"u",
			),
		);
		expect(process.env.HOBO_CODE_SEAT_AGENTS).toBe("0");
	});

	it("has no server before a test starts one", () => {
		const listed = spawnSync("tmux", ["list-sessions"], {
			env: process.env,
			stdio: "ignore",
		});
		expect(listed.status).not.toBe(0);
	});
});
