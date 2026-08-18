import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadHarnessCatalog } from "../src/agent-harness-catalog.js";
import {
	listConfigurableHarnessIds,
	listHarnessModelOffers,
	parseCursorListModelsOutput,
	parseGrokModelsOutput,
	parseOpencodeModelsOutput,
} from "../src/harness-model-catalog.js";

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

describe("listConfigurableHarnessIds", () => {
	it("covers every bundled coding-agent + sdk harness (not Bo/ollama/eve)", () => {
		const ids = listConfigurableHarnessIds(loadHarnessCatalog());
		expect(ids).toEqual([
			"aider",
			"claude",
			"codex",
			"copilot",
			"cursor",
			"gemini",
			"goose",
			"grok",
			"opencode",
			"pi",
			"sdk",
		]);
	});
});

describe("listHarnessModelOffers", () => {
	it("every configurable harness except empty-Pi has selectable models", () => {
		const home = tmp();
		for (const id of listConfigurableHarnessIds()) {
			const offers = listHarnessModelOffers(id, {
				live: false,
				homeDir: home,
			});
			if (id === "pi") {
				expect(offers).toEqual([]);
				continue;
			}
			expect(offers.length, id).toBeGreaterThan(0);
			expect(
				offers.every((row) => row.harnessId === id),
				id,
			).toBe(true);
			expect(
				offers.every((row) => row.runtimeId.trim().length > 0),
				id,
			).toBe(true);
			if (
				id === "codex" ||
				id === "claude" ||
				id === "gemini" ||
				id === "copilot" ||
				id === "cursor" ||
				id === "sdk" ||
				id === "grok" ||
				id === "opencode"
			) {
				expect(
					offers.every((row) => row.provider !== "ollama"),
					id,
				).toBe(true);
			}
		}
	});

	it("Codex merges OpenAI-compatible endpoints into offers", () => {
		const offers = listHarnessModelOffers("codex", {
			live: false,
			env: {
				OPENAI_BASE_URL: "http://127.0.0.1:8080/v1",
				HOBO_CODE_MODEL: "my-local",
			},
		});
		const hit = offers.find(
			(row) => row.baseUrl === "http://127.0.0.1:8080/v1",
		);
		expect(hit?.runtimeId).toBe("my-local");
		expect(hit?.id).toBe("openai/my-local");
		expect(hit?.via).toBe("codex");
	});

	it("Claude merges Anthropic-compatible endpoints into offers", () => {
		const offers = listHarnessModelOffers("claude", {
			live: false,
			env: {
				ANTHROPIC_BASE_URL: "https://gateway.example/v1",
			},
		});
		const hit = offers.find(
			(row) => row.baseUrl === "https://gateway.example/v1",
		);
		expect(hit?.runtimeId).toBe("claude-sonnet-5");
		expect(hit?.id).toBe("anthropic/claude-sonnet-5");
		expect(hit?.via).toBe("claude");
	});

	it("Codex offers real OpenAI Codex CLI model ids — never ollama", () => {
		const offers = listHarnessModelOffers("codex", { live: false });
		const ids = offers.map((row) => row.id);
		expect(ids).toContain("openai/gpt-5.6-sol");
		expect(ids).toContain("openai/gpt-5.6-terra");
		expect(ids).toContain("openai/gpt-5.6-luna");
		expect(offers.every((row) => row.provider !== "ollama")).toBe(true);
		expect(offers.find((row) => row.runtimeId === "gpt-5.6-sol")).toBeTruthy();
	});

	it("Claude offers Anthropic Claude Code model ids — never ollama", () => {
		const offers = listHarnessModelOffers("claude", { live: false });
		const runtimeIds = offers.map((row) => row.runtimeId);
		expect(runtimeIds).toContain("claude-opus-5");
		expect(runtimeIds).toContain("claude-sonnet-5");
		expect(runtimeIds).toContain("claude-fable-5");
		expect(runtimeIds).toContain("fable");
		expect(runtimeIds).toContain("claude-sonnet-4-6");
		expect(offers.every((row) => row.provider === "anthropic")).toBe(true);
	});

	it("Cursor / Copilot / OpenCode / Aider / Goose / SDK have curated CLI ids", () => {
		expect(
			listHarnessModelOffers("cursor", { live: false }).map((r) => r.runtimeId),
		).toContain("composer-2.5");
		expect(
			listHarnessModelOffers("copilot", { live: false }).map(
				(r) => r.runtimeId,
			),
		).toContain("claude-sonnet-4.6");
		expect(
			listHarnessModelOffers("opencode", { live: false }).map(
				(r) => r.runtimeId,
			),
		).toContain("opencode/big-pickle");
		expect(
			listHarnessModelOffers("aider", { live: false }).map((r) => r.runtimeId),
		).toContain("claude-sonnet-5");
		expect(
			listHarnessModelOffers("goose", { live: false }).map((r) => r.runtimeId),
		).toContain("gpt-4o");
		expect(
			listHarnessModelOffers("sdk", { live: false }).map((r) => r.runtimeId),
		).toContain("gpt-5.4");
	});

	it("Gemini and Grok use provider-real ids", () => {
		const gemini = listHarnessModelOffers("gemini", { live: false }).map(
			(row) => row.runtimeId,
		);
		expect(gemini).toContain("gemini-2.5-pro");
		expect(gemini).toContain("auto");

		const grok = listHarnessModelOffers("grok", { live: false }).map(
			(row) => row.runtimeId,
		);
		expect(grok).toContain("grok-4.6");
		expect(grok).toContain("grok-build-0.1");
	});

	it("unknown harness returns empty", () => {
		expect(listHarnessModelOffers("nope", { live: false })).toEqual([]);
	});

	it("live Cursor probe merges every listed model into offers", () => {
		const stdout = [
			"Available models",
			"",
			"auto - Auto (current, default)",
			"composer-2.5 - Composer 2.5",
			"claude-opus-5-thinking-high - Claude Opus 5 Thinking",
		].join("\n");
		const offers = listHarnessModelOffers("cursor", {
			live: true,
			runProbe: () => stdout,
		});
		const ids = offers.map((row) => row.runtimeId);
		expect(ids).toContain("auto");
		expect(ids).toContain("composer-2.5");
		expect(ids).toContain("claude-opus-5-thinking-high");
		expect(ids).toContain("gpt-5.6-sol-medium");
	});

	it("live OpenCode + Grok probes parse CLI output", () => {
		const opencode = listHarnessModelOffers("opencode", {
			live: true,
			runProbe: () => "opencode/big-pickle\nanthropic/claude-sonnet-5\n",
		});
		expect(opencode.map((r) => r.runtimeId)).toContain(
			"anthropic/claude-sonnet-5",
		);

		const grok = listHarnessModelOffers("grok", {
			live: true,
			runProbe: () =>
				"Available models:\n  * grok-4.6 (default)\n  - grok-4.5\n  - hobo\n",
		});
		expect(grok.map((r) => r.runtimeId)).toEqual(
			expect.arrayContaining(["grok-4.6", "grok-4.5", "hobo"]),
		);
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
		expect(offers.map((row) => row.runtimeId).sort()).toEqual([
			"gpt-4.1",
			"o3",
		]);
		expect(offers.every((row) => row.via === "pi")).toBe(true);
	});
});

describe("probe parsers", () => {
	it("parseCursorListModelsOutput", () => {
		expect(
			parseCursorListModelsOutput(
				"Available models\n\nauto - Auto\ngpt-5.3-codex - Codex\n",
			),
		).toEqual(["auto", "gpt-5.3-codex"]);
	});

	it("parseOpencodeModelsOutput", () => {
		expect(
			parseOpencodeModelsOutput("opencode/a\nnot-a-model\nopenai/gpt-5\n"),
		).toEqual(["opencode/a", "openai/gpt-5"]);
	});

	it("parseGrokModelsOutput", () => {
		expect(
			parseGrokModelsOutput("  * grok-4.6 (default)\n  - grok-4.5\n"),
		).toEqual(["grok-4.6", "grok-4.5"]);
	});
});
