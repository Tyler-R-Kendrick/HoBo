/**
 * A Station written to a HoBo home that does not exist yet creates that home
 * owner-only. A recursive mkdir of the Station's own directory used to create
 * the home at the umask's 0755, and nothing later tightened it; the home holds
 * auth sessions and keys.
 */
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { initStation } from "../src/station-client.js";

const scratch = mkdtempSync(join(tmpdir(), "hobo-station-home-mode-"));
afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

describe("a Station on a missing home", () => {
	it("creates the home with mode 0700", () => {
		const hoboHome = join(scratch, "fresh", ".hobo");
		initStation({ hoboHome, name: "local" });
		expect(statSync(hoboHome).mode & 0o777).toBe(0o700);
	});
});
