import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	buildModelId,
	listBoModelOffers,
	makeModelOffer,
	offerKey,
	parseModelId,
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

describe("bo-model-catalog identity", () => {
	it("uses provider/model ids that stay distinct by via", () => {
		const codex = makeModelOffer({
			provider: "openai",
			model: "gpt-5",
			runtimeId: "gpt-5",
			label: "gpt-5 · codex",
			source: "harness",
			via: "codex",
			harnessId: "codex",
		});
		const azure = makeModelOffer({
			provider: "openai",
			model: "gpt-5",
			runtimeId: "gpt-5",
			label: "gpt-5 · azure",
			source: "harness",
			via: "azure",
			harnessId: "azure",
		});
		expect(codex.id).toBe("openai/gpt-5");
		expect(azure.id).toBe("openai/gpt-5");
		expect(offerKey(codex)).not.toBe(offerKey(azure));
		expect(buildModelId("openai", "gpt-5")).toBe("openai/gpt-5");
		expect(parseModelId("openai/gpt-5")).toEqual({
			provider: "openai",
			model: "gpt-5",
		});
	});

	it("builds ollama id with host qualifier in offerKey", () => {
		const offer = makeModelOffer({
			provider: "ollama",
			model: "qwen2.5-coder:7b",
			runtimeId: "ollama/qwen2.5-coder:7b",
			label: "qwen · ollama",
			source: "ollama",
			host: "127.0.0.1:11434",
		});
		expect(offer.id).toBe("ollama/qwen2.5-coder:7b");
		expect(offerKey(offer)).toContain("host=127.0.0.1:11434");
	});
});

describe("listBoModelOffers", () => {
	it("includes local ollama tags and saved harness models — not invented BYOK seeds", () => {
		const home = tmp();
		saveHarnessSettings(home, {
			schema: "hobo.code.harness-settings/v1",
			id: "codex",
			model: "gpt-5.6-sol",
			effort: "medium",
		});
		saveHarnessSettings(home, {
			schema: "hobo.code.harness-settings/v1",
			id: "claude",
			model: "claude-sonnet-5",
			effort: "high",
		});
		const offers = listBoModelOffers({
			hoboHome: home,
			env: { HOBO_CODE_MODEL: "ollama/qwen2.5-coder:1.5b" },
			ollama: {
				host: "http://127.0.0.1:11434",
				models: ["qwen2.5-coder:7b", "llama3.2:3b"],
			},
		});
		const ids = offers.map((row) => offerKey(row));
		expect(ids.some((k) => k.startsWith("ollama/qwen2.5-coder:7b"))).toBe(
			true,
		);
		expect(ids.some((k) => k.startsWith("ollama/llama3.2:3b"))).toBe(true);
		expect(ids).toContain("openai/gpt-5.6-sol|via=codex");
		expect(ids).toContain("anthropic/claude-sonnet-5|via=claude");
		expect(
			ids.some((k) => k.includes("ollama/qwen2.5-coder:1.5b") && k.includes("via=env")),
		).toBe(true);
		expect(ids.some((k) => k.includes("via=byok"))).toBe(false);
		expect(ids.some((k) => k.includes("via=azure"))).toBe(false);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("includes OPENAI_BASE_URL local openai-compatible endpoint", () => {
		const home = tmp();
		const offers = listBoModelOffers({
			hoboHome: home,
			env: {
				OPENAI_BASE_URL: "http://127.0.0.1:8080/v1",
			},
			ollama: { host: "http://127.0.0.1:11434", models: [] },
		});
		const local = offers.find((row) => row.source === "openai-compatible");
		expect(local?.id).toBe("openai/local-coder");
		expect(local?.baseUrl).toBe("http://127.0.0.1:8080/v1");
	});
});
