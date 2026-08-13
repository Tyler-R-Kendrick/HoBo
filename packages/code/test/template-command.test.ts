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

	it("lists atomic snippets alongside catalog patterns", () => {
		const result = runTemplateCommand({ args: ["list"], flags: {} });
		expect(result.ok).toBe(true);
		expect(result.message).toContain("bindle.web-only");
		expect(result.message).toContain("station.init");
		expect(result.message).toContain("bindle.named");
	});

	it("renders an atom snippet by exact id", () => {
		const result = runTemplateCommand({
			args: ["render", "bindle.web-only"],
			flags: { name: "greeter" },
		});
		expect(result.ok).toBe(true);
		expect(result.message).toContain("greeter");
		const data = result.data as { llmCalls?: number; patternId?: string };
		expect(data.llmCalls).toBe(0);
		expect(data.patternId).toBe("bindle.web-only");
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
		expect(result.message).toContain("0 LLM calls · 0 LLM tokens");
	});

	it("prints a zero-token receipt on natural-language search", () => {
		const result = runTemplateCommand({
			args: ["web", "frontend", "backed", "by", "an", "api"],
			flags: {},
		});
		expect(result.message).toContain("0 LLM calls · 0 LLM tokens");
	});
});
