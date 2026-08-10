import { describe, expect, it } from "vitest";

import {
	EXPERIENCE_ID,
	runHoboCodeHarnessExperience,
} from "../src/hobo-code-harness-experience.js";

describe("hobo-code-harness-experience", () => {
	it("exercises template, visual lock-in, and isolation cleanup", async () => {
		expect(EXPERIENCE_ID).toBe("hobo-code-harness-experience");
		const result = await runHoboCodeHarnessExperience();
		expect(result.templateOk).toBe(true);
		expect(result.visualOk).toBe(true);
		expect(result.evidenceOk).toBe(true);
		expect(result.isolationClean).toBe(true);
		expect(result.orphans).toEqual([]);
	});
});
