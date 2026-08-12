import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runTemplateCommand } from "../src/template-command.js";

describe("hobo-code template", () => {
	it("searches without touching a model", () => {
		const result = runTemplateCommand({
			args: ["bindle.topology.web-api"],
			flags: {},
		});
		expect(result.code).toBe("HOBO_CODE_TEMPLATE");
		const data = result.data as { llmCalls?: number };
		expect(data.llmCalls).toBe(0);
	});

	it("accepts a natural-language query after the verb", () => {
		const result = runTemplateCommand({
			args: ["web", "frontend", "backed", "by", "an", "api"],
			flags: {},
		});
		expect(result.code).toBe("HOBO_CODE_TEMPLATE");
	});

	it("records zero LLM usage on apply into an isolation root", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-template-"));
		const result = runTemplateCommand({
			args: ["apply", "bindle.named"],
			flags: { out, path: "src/bindle.ts" },
		});
		expect(result.ok).toBe(true);
		const data = result.data as { llmCalls?: number };
		expect(data.llmCalls).toBe(0);
	});
});
