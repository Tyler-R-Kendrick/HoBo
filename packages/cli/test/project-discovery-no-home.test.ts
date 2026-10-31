/**
 * Project discovery for an account with no home: HOME unset and no passwd
 * entry (a container run as `--user 4242`), where `os.homedir()` throws.
 *
 * Discovery excludes the user's HoBo home from the `.hobo` markers, and naming
 * that home needs HOME or an account home. With neither there is no user home
 * to exclude, so discovery must still find the project rather than fail the
 * verb with libuv's `uv_os_homedir returned ENOENT`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

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

const { CEILING_DIRECTORIES_ENV, defaultContextFactory } = await import(
	"../src/shell/context.js"
);
const { parseArgv } = await import("../src/shell/parse.js");

const scratch = mkdtempSync(path.join(tmpdir(), "hobo-cli-discovery-nohome-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

async function projectDirFrom(cwd: string, env: NodeJS.ProcessEnv) {
	const context = await defaultContextFactory({
		cwd,
		env,
		flags: parseArgv(["plan"], { cwd }).flags,
		verb: "plan",
		args: [],
		requiresProject: true,
	});
	return context.projectDir;
}

describe("discovery with no HOME and no account home", () => {
	it("finds the project above the working directory", async () => {
		const app = path.join(scratch, "bindle", "app");
		mkdirSync(path.join(app, "src"), { recursive: true });
		writeFileSync(path.join(app, "hobo.bindle.json"), "{}");
		expect(
			await projectDirFrom(path.join(app, "src"), {
				[CEILING_DIRECTORIES_ENV]: scratch,
			}),
		).toBe(app);
	});

	it("still skips a .hobo that holds only user-level state", async () => {
		const shared = path.join(scratch, "stray", "shared");
		mkdirSync(path.join(shared, ".hobo", "durable"), { recursive: true });
		mkdirSync(path.join(shared, "work"), { recursive: true });
		await expect(
			projectDirFrom(path.join(shared, "work"), {
				[CEILING_DIRECTORIES_ENV]: scratch,
			}),
		).rejects.toMatchObject({ code: "HOBO_NO_BINDLE" });
	});
});
