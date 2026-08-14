import { describe, expect, it } from "vitest";

import {
	classifyCommand,
	redactCommand,
	redactOutput,
} from "../src/command-redaction.js";

describe("command redaction", () => {
	it("keeps ordinary commands public", () => {
		expect(classifyCommand("hobo-code status")).toBe("public");
		expect(redactCommand("pnpm test")).toBe("pnpm test");
	});

	it("redacts bearer tokens and password flags", () => {
		const line =
			"curl -H 'Authorization: Bearer ghp_aaa111222333444555666777888' https://api.github.com";
		expect(classifyCommand(line)).toBe("secret-suspected");
		expect(redactCommand(line)).not.toContain("ghp_");
		expect(redactCommand("cmd --password hunter2")).toContain("***");
	});

	it("truncates output after redaction", () => {
		const out = redactOutput("ok ".repeat(200), 20);
		expect(out.truncated).toBe(true);
		expect(out.text.length).toBeLessThanOrEqual(20);
	});
});
