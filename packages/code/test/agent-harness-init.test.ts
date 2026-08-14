import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
	applyAgentsInit,
	discoverEveAgentTrees,
	planAgentsInit,
	resolveAgentsDestination,
} from "../src/agent-harness-init.js";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-agents-init-"));
	dirs.push(dir);
	return dir;
}

describe("agents init destination", () => {
	it("fails closed when no model listen URL exists", async () => {
		const dest = await resolveAgentsDestination({
			env: { PATH: "/empty", HOME: "/tmp", HOBO_CODE_AGENTS_PROBE: "0" },
		});
		expect(dest.ok).toBe(false);
		if (!dest.ok) {
			expect(dest.reason).toMatch(/no model listen/i);
			expect(dest.remediation.join("\n")).toMatch(/hobo-code models|OPENAI_BASE_URL|ollama/i);
		}
	});

	it("binds OPENAI_BASE_URL without printing a secret", async () => {
		const dest = await resolveAgentsDestination({
			env: {
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
				OPENAI_API_KEY: "sk-secret-must-not-leak",
			},
		});
		expect(dest.ok).toBe(true);
		if (!dest.ok) return;
		expect(dest.source).toBe("openai-base-url");
		expect(dest.openaiUrl).toBe("http://127.0.0.1:11434/v1");
		expect(dest.envKey).toBe("HOBO_CODE_SESSION_REF");
		expect(JSON.stringify(dest)).not.toMatch(/sk-secret/);
	});

	it("uses a live Ollama probe when no dest env is set", async () => {
		const dest = await resolveAgentsDestination({
			env: { PATH: "/empty", HOME: "/tmp" },
			probeOllamaHost: async () => true,
		});
		expect(dest.ok).toBe(true);
		if (!dest.ok) return;
		expect(dest.source).toBe("ollama");
		expect(dest.namedUrl).toBe("http://127.0.0.1:11434");
	});
});

describe("agents init plan", () => {
	it("plans a Codex hunk that uses env_key, not a minted secret", async () => {
		const home = tmp();
		mkdirSync(join(home, ".codex"), { recursive: true });
		writeFileSync(join(home, ".codex", "config.toml"), "model = \"gpt-5\"\n", "utf8");
		const plan = await planAgentsInit({
			home,
			cwd: home,
			env: {
				HOME: home,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["codex"],
		});
		expect(plan.ok).toBe(true);
		expect(plan.reason).toBe("planned");
		const entry = plan.entries.find((row) => row.id === "codex");
		expect(entry?.detected).toBe(true);
		expect(entry?.hunks[0]?.after).toMatch(/model_provider\s*=\s*"hobo"/);
		expect(entry?.hunks[0]?.after).toMatch(/env_key\s*=\s*"HOBO_CODE_SESSION_REF"/);
		expect(entry?.hunks.map((hunk) => hunk.after).join("\n")).not.toMatch(
			/sk-|vck_|secret-must-not/i,
		);
	});

	it("plans a Grok Build model.hobo block with env_key, not a secret", async () => {
		const home = tmp();
		mkdirSync(join(home, ".grok"), { recursive: true });
		writeFileSync(join(home, ".grok", "config.toml"), "[cli]\ninstaller = \"internal\"\n");
		const plan = await planAgentsInit({
			home,
			cwd: home,
			env: {
				HOME: home,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["grok"],
		});
		const entry = plan.entries.find((row) => row.id === "grok");
		expect(entry?.detected).toBe(true);
		expect(entry?.hunks[0]?.after).toMatch(/\[model\.hobo\]/);
		expect(entry?.hunks[0]?.after).toMatch(/env_key\s*=\s*"HOBO_CODE_SESSION_REF"/);
		expect(entry?.hunks[0]?.after).toMatch(/base_url\s*=\s*"http:\/\/127\.0\.0\.1:11434\/v1"/);
		expect(entry?.hunks.map((hunk) => hunk.after).join("\n")).not.toMatch(
			/sk-|vck_|api_key\s*=/i,
		);
	});

	it("plans a Pi models.json provider with env interpolation, not a secret", async () => {
		const home = tmp();
		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		writeFileSync(
			join(home, ".pi", "agent", "models.json"),
			`${JSON.stringify({ providers: { ollama: { baseUrl: "http://127.0.0.1:11434/v1" } } }, null, 2)}\n`,
		);
		const plan = await planAgentsInit({
			home,
			cwd: home,
			env: {
				HOME: home,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["pi"],
		});
		const entry = plan.entries.find((row) => row.id === "pi");
		expect(entry?.detected).toBe(true);
		expect(entry?.hunks[0]?.after).toMatch(/"hobo"/);
		expect(entry?.hunks[0]?.after).toMatch(/\$\{HOBO_CODE_SESSION_REF\}/);
		expect(entry?.hunks[0]?.after).toMatch(/127\.0\.0\.1:11434\/v1/);
		expect(entry?.hunks[0]?.after).toMatch(/"ollama"/);
		expect(entry?.hunks.map((hunk) => hunk.after).join("\n")).not.toMatch(
			/sk-|vck_|eyJ/i,
		);
	});

	it("discovers an Eve agent tree for VFS registration", async () => {
		const cwd = tmp();
		mkdirSync(join(cwd, "agent", "subagents", "implementer"), { recursive: true });
		writeFileSync(join(cwd, "agent", "instructions.md"), "coordinator\n", "utf8");
		writeFileSync(
			join(cwd, "agent", "subagents", "implementer", "instructions.md"),
			"implement\n",
			"utf8",
		);
		const trees = discoverEveAgentTrees(cwd);
		expect(trees.map((row) => row.id)).toEqual(["agent", "implementer"]);
		const plan = await planAgentsInit({
			home: cwd,
			cwd,
			env: {
				HOME: cwd,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["eve"],
		});
		const eve = plan.entries.find((row) => row.id === "eve");
		expect(eve?.kind).toBe("eve-agent");
		expect(eve?.hunks.some((hunk) => hunk.after.includes("/agents/implementer"))).toBe(
			true,
		);
	});
});

describe("agents init apply", () => {
	it("writes a Codex provider block and a secrets-free registry", async () => {
		const home = tmp();
		mkdirSync(join(home, ".codex"), { recursive: true });
		const config = join(home, ".codex", "config.toml");
		writeFileSync(config, "model = \"gpt-5\"\n", "utf8");
		const applied = await applyAgentsInit({
			home,
			cwd: home,
			hoboHome: join(home, ".hobo"),
			env: {
				HOME: home,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["codex"],
			yes: true,
		});
		expect(applied.ok).toBe(true);
		const next = readFileSync(config, "utf8");
		expect(next).toMatch(/model_provider\s*=\s*"hobo"/);
		expect(next).toMatch(/env_key\s*=\s*"HOBO_CODE_SESSION_REF"/);
		expect(next).not.toMatch(/sk-|vck_/i);
		expect(readFileSync(`${config}.bak`, "utf8")).toBe("model = \"gpt-5\"\n");
		const registry = readFileSync(
			join(home, ".hobo", "durable", "code", "agents", "registry.json"),
			"utf8",
		);
		expect(registry).toMatch(/"codex"/);
		expect(registry).not.toMatch(/sk-|vck_/i);
	});

	it("is a no-op when the harness is already configured", async () => {
		const home = tmp();
		mkdirSync(join(home, ".codex"), { recursive: true });
		const config = join(home, ".codex", "config.toml");
		writeFileSync(
			config,
			[
				'model_provider = "hobo"',
				"",
				"[model_providers.hobo]",
				'name = "HoBo Station"',
				'base_url = "http://127.0.0.1:11434/v1"',
				'env_key = "HOBO_CODE_SESSION_REF"',
				'wire_api = "responses"',
				"",
			].join("\n"),
			"utf8",
		);
		const first = await applyAgentsInit({
			home,
			cwd: home,
			hoboHome: join(home, ".hobo"),
			env: {
				HOME: home,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["codex"],
			yes: true,
		});
		expect(first.ok).toBe(true);
		expect(first.reason).toBe("already_configured");
		expect(first.written).toEqual([]);
	});
});
