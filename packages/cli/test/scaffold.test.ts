import { describe, expect, it } from "vitest";

import { HOBO_CLI_PACKAGE } from "../src/index.js";

describe("@hobo/cli scaffold", () => {
	it("exports the package name constant", () => {
		expect(HOBO_CLI_PACKAGE).toBe("@hobo/cli");
	});
});
