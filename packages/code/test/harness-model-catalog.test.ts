import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { listHarnessModelOffers } from "../src/harness-model-catalog.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-models-"));
	dirs.push(dir);
	return dir;
}

describe("listHarnessModelOffers", () => {
	it("Codex offers real OpenAI Codex CLI model ids — never ollama", () => {
		const offers = listHarnessModelOffers("codex");
		const purls = offers.map((row) => row.purl);
		expect(purls).toContain("pkg:openai/gpt-5.6-sol?via=codex");
		expect(purls).toContain("pkg:openai/gpt-5.6-terra?via=codex");
		expect(purls).toContain("pkg:openai/gpt-5.6-luna?via=codex");
		expect(offers.every((row) => !row.purl.startsWith("pkg:ollama/"))).toBe(
			true,
		);
		expect(offers.every((row) => row.harnessId === "codex")).toBe(true);
		expect(offers.find((row) => row.runtimeId === "gpt-5.6-sol")).toBeTruthy();
	});

	it("Claude offers Anthropic Claude Code model ids — never ollama", () => {
		const offers = listHarnessModelOffers("claude");
		const ids = offers.map((row) => row.runtimeId);
		expect(ids).toContain("claude-opus-5");
		expect(ids).toContain("claude-sonnet-5");
		expect(ids).toContain("claude-sonnet-4-6");
		expect(ids).toContain("claude-haiku-4-5");
		expect(offers.every((row) => row.purl.startsWith("pkg:anthropic/"))).toBe(
			true,
		);
		expect(offers.every((row) => !row.purl.startsWith("pkg:ollama/"))).toBe(
			true,
		);
	});

	it("Gemini and Grok use provider-real ids", () => {
		const gemini = listHarnessModelOffers("gemini").map((row) => row.runtimeId);
		expect(gemini).toContain("gemini-2.5-pro");
		expect(gemini).toContain("gemini-2.5-flash");

		const grok = listHarnessModelOffers("grok").map((row) => row.runtimeId);
		expect(grok).toContain("grok-4.6");
		expect(grok).toContain("grok-build-0.1");
	});

	it("unknown / free-text harnesses return empty offers", () => {
		expect(listHarnessModelOffers("cursor")).toEqual([]);
		expect(listHarnessModelOffers("copilot")).toEqual([]);
		expect(listHarnessModelOffers("aider")).toEqual([]);
		expect(listHarnessModelOffers("nope")).toEqual([]);
	});

	it("Pi reads models from ~/.pi/agent/models.json when present", () => {
		const home = tmp();
		const piDir = join(home, ".pi", "agent");
		mkdirSync(piDir, { recursive: true });
		writeFileSync(
			join(piDir, "models.json"),
			JSON.stringify({
				providers: {
					openai: {
						models: [
							{ id: "gpt-4.1", name: "GPT-4.1" },
							{ id: "o3", name: "o3" },
						],
					},
				},
			}),
			"utf8",
		);
		const offers = listHarnessModelOffers("pi", { homeDir: home });
		expect(offers.map((row) => row.runtimeId).sort()).toEqual(["gpt-4.1", "o3"]);
		expect(offers.every((row) => row.purl.includes("via=pi"))).toBe(true);
	});

	it("Pi with no models.json returns empty", () => {
		const home = tmp();
		expect(listHarnessModelOffers("pi", { homeDir: home })).toEqual([]);
	});
});
