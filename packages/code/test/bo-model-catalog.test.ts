import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	buildOllamaModelPurl,
	buildProviderModelPurl,
	listBoModelOffers,
	parseModelPurl,
	runtimeModelFromPurl,
} from "../src/bo-model-catalog.js";
import { saveHarnessSettings } from "../src/harness-settings.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-bo-models-"));
	dirs.push(dir);
	return dir;
}

describe("bo-model-catalog purl", () => {
	it("builds distinct PURLs for openai via codex vs azure", () => {
		const codex = buildProviderModelPurl({
			type: "openai",
			name: "gpt-5",
			via: "codex",
		});
		const azure = buildProviderModelPurl({
			type: "openai",
			name: "gpt-5",
			via: "azure",
		});
		expect(codex).toBe("pkg:openai/gpt-5?via=codex");
		expect(azure).toBe("pkg:openai/gpt-5?via=azure");
		expect(codex).not.toBe(azure);
	});

	it("builds ollama purl with host qualifier", () => {
		const purl = buildOllamaModelPurl({
			tag: "qwen2.5-coder:7b",
			host: "http://127.0.0.1:11434",
		});
		expect(purl).toBe(
			"pkg:ollama/qwen2.5-coder@7b?host=127.0.0.1%3A11434",
		);
		expect(runtimeModelFromPurl(purl)).toBe("ollama/qwen2.5-coder:7b");
		const parsed = parseModelPurl(purl);
		expect(parsed?.type).toBe("ollama");
		expect(parsed?.name).toBe("qwen2.5-coder");
		expect(parsed?.version).toBe("7b");
		expect(parsed?.qualifiers.host).toBe("127.0.0.1:11434");
	});
});

describe("listBoModelOffers", () => {
	it("includes local ollama tags and configured harness models with unique purls", () => {
		const home = tmp();
		saveHarnessSettings(home, {
			schema: "hobo.code.harness-settings/v1",
			id: "codex",
			model: "gpt-5",
			effort: "medium",
		});
		saveHarnessSettings(home, {
			schema: "hobo.code.harness-settings/v1",
			id: "claude",
			model: "claude-sonnet-4-6",
			effort: "high",
		});

		const offers = listBoModelOffers({
			hoboHome: home,
			env: {
				HOBO_CODE_MODEL: "ollama/qwen2.5-coder:1.5b",
				OPENAI_API_KEY: "sk-test",
				AZURE_OPENAI_API_KEY: "az-test",
			},
			ollama: {
				host: "http://127.0.0.1:11434",
				models: ["qwen2.5-coder:7b", "llama3.2:3b"],
			},
		});

		const purls = offers.map((row) => row.purl);
		expect(purls).toContain(
			"pkg:ollama/qwen2.5-coder@7b?host=127.0.0.1%3A11434",
		);
		expect(purls).toContain(
			"pkg:ollama/llama3.2@3b?host=127.0.0.1%3A11434",
		);
		expect(purls).toContain("pkg:openai/gpt-5?via=codex");
		expect(purls).toContain("pkg:anthropic/claude-sonnet-4-6?via=claude");
		expect(purls).toContain(
			"pkg:ollama/qwen2.5-coder@1.5b?via=env&host=active",
		);
		// Same logical model name, different provenance
		expect(purls).toContain("pkg:openai/gpt-5?via=byok");
		expect(purls).toContain("pkg:openai/gpt-5?via=azure");
		expect(new Set(purls).size).toBe(purls.length);
	});

	it("includes OPENAI_BASE_URL local openai-compatible endpoint", () => {
		const home = tmp();
		const offers = listBoModelOffers({
			hoboHome: home,
			env: {
				OPENAI_BASE_URL: "http://127.0.0.1:8080/v1",
				HOBO_CODE_MODEL: "local-coder",
			},
			ollama: { host: "http://127.0.0.1:11434", models: [] },
		});
		const local = offers.find((row) => row.source === "openai-compatible");
		expect(local?.purl).toMatch(/^pkg:openai\/local-coder\?/);
		expect(local?.purl).toContain("base_url=");
		expect(local?.runtimeId).toBe("local-coder");
	});
});
