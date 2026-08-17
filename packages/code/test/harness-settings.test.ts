import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	applySettingsToSeatCommand,
	cycleEffort,
	defaultHarnessSettings,
	loadHarnessSettings,
	migrateLegacyModelPurl,
	resolveHarnessApiEndpoint,
	saveHarnessSettings,
	seatEnvForHarness,
} from "../src/harness-settings.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-settings-"));
	dirs.push(dir);
	return dir;
}

describe("harness-settings", () => {
	it("round-trips model and effort under HOBO_HOME", () => {
		const home = tmp();
		const path = saveHarnessSettings(home, {
			...defaultHarnessSettings("codex"),
			model: "gpt-5.3-codex",
			effort: "high",
		});
		expect(readFileSync(path, "utf8")).toMatch(/gpt-5\.3-codex/);
		const loaded = loadHarnessSettings(home, "codex");
		expect(loaded.model).toBe("gpt-5.3-codex");
		expect(loaded.effort).toBe("high");
	});

	it("round-trips modelId, via, and apiEndpoint", () => {
		const home = tmp();
		saveHarnessSettings(home, {
			...defaultHarnessSettings("codex"),
			model: "local-coder",
			modelId: "openai/local-coder",
			via: "codex",
			apiEndpoint: "http://127.0.0.1:8080/v1",
			effort: "medium",
		});
		const loaded = loadHarnessSettings(home, "codex");
		expect(loaded.model).toBe("local-coder");
		expect(loaded.modelId).toBe("openai/local-coder");
		expect(loaded.via).toBe("codex");
		expect(loaded.apiEndpoint).toBe("http://127.0.0.1:8080/v1");
		expect(resolveHarnessApiEndpoint(loaded)).toBe(
			"http://127.0.0.1:8080/v1",
		);
	});

	it("migrates legacy modelPurl on load", () => {
		const home = tmp();
		const path = join(
			home,
			"durable",
			"code",
			"harness-settings",
			"codex.json",
		);
		mkdirSync(join(home, "durable", "code", "harness-settings"), {
			recursive: true,
		});
		writeFileSync(
			path,
			JSON.stringify({
				schema: "hobo.code.harness-settings/v1",
				id: "codex",
				model: "local-coder",
				modelPurl:
					"pkg:openai/local-coder?via=codex&base_url=http%3A%2F%2F127.0.0.1%3A8080%2Fv1",
				effort: "medium",
			}),
			"utf8",
		);
		const loaded = loadHarnessSettings(home, "codex");
		expect(loaded.modelId).toBe("openai/local-coder");
		expect(loaded.via).toBe("codex");
		expect(loaded.apiEndpoint).toBe("http://127.0.0.1:8080/v1");
		expect(
			migrateLegacyModelPurl(
				"pkg:openai/gpt-5?via=codex",
			)?.modelId,
		).toBe("openai/gpt-5");
	});

	it("cycles effort levels", () => {
		expect(cycleEffort("medium", 1)).toBe("high");
		expect(cycleEffort("minimal", -1)).toBe("xhigh");
	});

	it("applies Codex model, effort, and OpenAI-compatible endpoint to seat command", () => {
		const cmd = applySettingsToSeatCommand("codex", "codex", {
			...defaultHarnessSettings("codex"),
			model: "gpt-5.3-codex",
			apiEndpoint: "http://127.0.0.1:8080/v1",
			effort: "high",
		});
		expect(cmd).toContain("OPENAI_BASE_URL=http://127.0.0.1:8080/v1");
		expect(cmd).toContain("-m gpt-5.3-codex");
		expect(cmd).toContain("model_reasoning_effort=high");
	});

	it("injects OPENAI_BASE_URL on the final Codex seat segment", () => {
		const seated =
			"mkdir -p /tmp/seat && ln -sfn /a /tmp/seat/auth.json && CODEX_HOME=/tmp/seat codex";
		const cmd = applySettingsToSeatCommand("codex", seated, {
			...defaultHarnessSettings("codex"),
			model: "gpt-5.6-sol",
			apiEndpoint: "http://127.0.0.1:9000/v1",
			effort: "medium",
		});
		expect(cmd.startsWith("mkdir -p")).toBe(true);
		expect(cmd).toMatch(
			/&& OPENAI_BASE_URL=http:\/\/127\.0\.0\.1:9000\/v1 CODEX_HOME=\/tmp\/seat codex -m gpt-5\.6-sol/,
		);
	});

	it("applies Claude Anthropic endpoint, model, and effort env", () => {
		const cmd = applySettingsToSeatCommand("claude", "claude", {
			...defaultHarnessSettings("claude"),
			model: "claude-sonnet-5",
			apiEndpoint: "https://gateway.example/anthropic",
			effort: "high",
		});
		expect(cmd).toContain(
			"ANTHROPIC_BASE_URL=https://gateway.example/anthropic",
		);
		expect(cmd).toContain("CLAUDE_CODE_EFFORT_LEVEL=high");
		expect(cmd).toContain("--model claude-sonnet-5");
		expect(
			seatEnvForHarness("claude", {
				...defaultHarnessSettings("claude"),
				apiEndpoint: "https://gateway.example/anthropic",
			}),
		).toEqual({
			ANTHROPIC_BASE_URL: "https://gateway.example/anthropic",
		});
	});

	it("applies Pi model + OpenAI-compatible endpoint", () => {
		const cmd = applySettingsToSeatCommand("pi", "pi", {
			...defaultHarnessSettings("pi"),
			model: "ollama/qwen2.5-coder:7b",
			apiEndpoint: "http://127.0.0.1:11434/v1",
			effort: "low",
		});
		expect(cmd).toContain("OPENAI_BASE_URL=http://127.0.0.1:11434/v1");
		expect(cmd).toContain("--model ollama/qwen2.5-coder:7b");
	});
});
