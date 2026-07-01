import { describe, expect, it } from "vitest";

import { HOBO_RUNTIME_PACKAGE } from "../src/index.js";

describe("@hobo/runtime scaffold", () => {
	it("exports the package name constant", () => {
		expect(HOBO_RUNTIME_PACKAGE).toBe("@hobo/runtime");
	});
});
