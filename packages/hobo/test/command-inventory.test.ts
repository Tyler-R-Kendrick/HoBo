import { CANONICAL_VERBS } from "@hobo/cli";
import { describe, expect, it } from "vitest";
import { createComposedHoboCli } from "../src/cli.js";

describe("composed CLI command inventory", () => {
	const cli = createComposedHoboCli();
	it.each(CANONICAL_VERBS)("wires $name and provides offline help", async ({
		name,
	}) => {
		const result = await cli.run([name, "--help"], { cwd: "/tmp" });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
		expect(result.stdout).toContain("Status: implemented in this composition");
	});
});
