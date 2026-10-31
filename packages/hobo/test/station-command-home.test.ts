/**
 * `hobo station` resolves its HoBo home by the rule every command uses:
 * the explicit dependency, else `resolveHoboHome` over the injected env (the
 * ambient one when none is injected). An empty or blank `HOBO_HOME` is unset
 * there, not a path: `HOBO_HOME= hobo station init` used to try to mkdir ""
 * and fail, or write `stations/` into the working directory.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandRunInput } from "@hobo/cli";
import { afterAll, describe, expect, it } from "vitest";

import { createStationCommand } from "../src/station-command.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-station-home-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * `station init` reads only its args and the flags it names, so this is the
 * input it acts on.
 */
function init(name: string): CommandRunInput {
	// SAFETY: the station command reads `args` and looks flags up by name
	// (flagString); no other field of the invocation is consulted for init.
	return { args: ["init"], flags: { name } } as never;
}

describe("hobo station's home", () => {
	it.each([
		["empty", ""],
		["blank", "   "],
	])("treats an %s HOBO_HOME as unset, and uses HOME's .hobo", async (_, value) => {
		const user = mkdtempSync(join(scratch, "user-"));
		const command = createStationCommand({
			env: { HOBO_HOME: value, HOME: user },
			log: () => {},
		});
		const result = await command.run(init("edge"));
		expect(result.ok).toBe(true);
		expect(JSON.stringify(result.data)).toContain(join(user, ".hobo"));
	});
});
