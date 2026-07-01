import { describe, expect, it } from "vitest";

import { HOBO_BINDLES_PACKAGE } from "../src/index.js";

describe("@hobo/bindles scaffold", () => {
	it("exports the package name constant", () => {
		expect(HOBO_BINDLES_PACKAGE).toBe("@hobo/bindles");
	});
});
