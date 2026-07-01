import { describe, expect, it } from "vitest";

import { HOBO_WIT_PACKAGE } from "../src/index.js";

describe("@hobo/wit scaffold", () => {
	it("exports the package name constant", () => {
		expect(HOBO_WIT_PACKAGE).toBe("@hobo/wit");
	});
});
