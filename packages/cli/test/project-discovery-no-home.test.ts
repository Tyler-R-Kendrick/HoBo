/**
 * Project discovery for an account with no home: HOME unset and no passwd
 * entry (a container run as `--user 4242`), where `os.homedir()` throws.
 *
 * Discovery excludes the user's HoBo home from the `.hobo` markers, and naming
 * that home needs HOME or an account home. With neither there is no user home
 * to exclude, so discovery must still find the project rather than fail the
 * verb with libuv's `uv_os_homedir returned ENOENT`. The account is asked
 * through the request's `accountHome`, which here fails the way
 * `os.homedir()` does for such a uid.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	CEILING_DIRECTORIES_ENV,
	defaultContextFactory,
} from "../src/shell/context.js";
import { parseArgv } from "../src/shell/parse.js";

const scratch = mkdtempSync(path.join(tmpdir(), "hobo-cli-discovery-nohome-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/** `os.homedir()` for a uid with no passwd entry and no HOME. */
const noAccountHome = (): string => {
	throw Object.assign(
		new Error(
			"A system error occurred: uv_os_homedir returned ENOENT (no such file or directory)",
		),
		{ code: "ERR_SYSTEM_ERROR" },
	);
};

async function projectDirFrom(cwd: string, env: NodeJS.ProcessEnv) {
	const context = await defaultContextFactory({
		cwd,
		env,
		flags: parseArgv(["plan"], { cwd }).flags,
		verb: "plan",
		args: [],
		requiresProject: true,
		accountHome: noAccountHome,
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
