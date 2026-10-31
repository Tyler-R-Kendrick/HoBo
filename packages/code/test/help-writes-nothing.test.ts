/**
 * Asking for help writes nothing.
 *
 * `hobo-code --help` used to compose the platform with a silent Station
 * auto-init, so help created `~/.hobo/stations/station:local` (and `~/.hobo`
 * itself, at 0755). As the account `nobody` it died with a raw EACCES stack.
 * Help reads nothing it needs from the home, so it must leave the home exactly
 * as it found it, absent included.
 *
 * The binary decides whether to prepare the home before running a verb, and
 * help is the one request it does not prepare for. That decision reads the
 * command line the way the CLI does: a prompt that happens to contain the
 * word "help" is not a help request.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { describeHoboCodeInvocation, runHoboCodeCli } from "../src/cli.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-code-help-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

let cases = 0;

describe("help", () => {
	it.each([
		[["--help"]],
		[["-h"]],
		[["help"]],
		[["help", "platform"]],
		[["platform", "--help"]],
	])("%j leaves an absent home absent", async (argv) => {
		cases += 1;
		const hoboHome = join(scratch, `home-${cases}`);
		const result = await runHoboCodeCli(argv, { hoboHome, env: {} });
		expect(result.ok).toBe(true);
		expect(existsSync(hoboHome)).toBe(false);
	});
});

describe("describeHoboCodeInvocation", () => {
	it("counts only a real help request as help", () => {
		expect(describeHoboCodeInvocation(["--help"]).help).toBe(true);
		expect(describeHoboCodeInvocation(["help"]).help).toBe(true);
		expect(describeHoboCodeInvocation(["platform", "-h"]).help).toBe(true);
		// A prompt for the default verb that mentions help is not a help request.
		expect(
			describeHoboCodeInvocation(["fix", "the", "help", "text"]).help,
		).toBe(false);
		expect(describeHoboCodeInvocation(["status"]).help).toBe(false);
	});

	it("reports a command line the CLI will refuse, which writes nothing", () => {
		expect(describeHoboCodeInvocation(["--no-such-flag"]).malformed).toBe(true);
		expect(describeHoboCodeInvocation(["status"]).malformed).toBe(false);
	});
});
