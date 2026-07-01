import { describe, expect, it } from "vitest";

import { HOBO_CORE_PACKAGE } from "../src/index.js";

describe("@hobo/core scaffold", () => {
	it("exports the package name constant", () => {
		expect(HOBO_CORE_PACKAGE).toBe("@hobo/core");
	});
});
