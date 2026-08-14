import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	loadHarnessCatalog,
	planSpecHunks,
	registerHarness,
	resetRegisteredHarnesses,
	seatingOrder,
} from "../src/agent-harness-catalog.js";
import { planAgentsInit } from "../src/agent-harness-init.js";

const dirs: string[] = [];
afterEach(() => {
	resetRegisteredHarnesses();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs.length = 0;
});

function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-harness-cat-"));
	dirs.push(dir);
	return dir;
}

describe("harness catalog", () => {
	it("loads bundled plugins without a TypeScript id list", () => {
		const ids = loadHarnessCatalog().map((spec) => spec.id);
		expect(ids).toEqual(
			expect.arrayContaining([
				"codex",
				"claude",
				"grok",
				"pi",
				"cursor",
				"eve",
			]),
		);
		expect(seatingOrder(loadHarnessCatalog())[0]).toBe("codex");
	});

	it("picks up a drop-in JSON plugin without new switch cases", async () => {
		const home = tmp();
		const pluginDir = join(home, "durable", "code", "harnesses");
		mkdirSync(pluginDir, { recursive: true });
		writeFileSync(
			join(pluginDir, "newbot.json"),
			JSON.stringify({
				id: "newbot",
				label: "New Bot",
				kind: "coding-agent",
				configPaths: [".newbot"],
				command: "newbot",
				config: {
					format: "toml-append",
					path: ".newbot/config.toml",
					configuredWhen: ["[model.hobo]"],
					block: "[model.hobo]\nbase_url = \"{{openaiUrl}}\"\nenv_key = \"{{envKey}}\"\n",
				},
			}),
			"utf8",
		);
		mkdirSync(join(home, ".newbot"), { recursive: true });
		const plan = await planAgentsInit({
			home,
			cwd: home,
			hoboHome: home,
			env: {
				HOME: home,
				PATH: "/empty",
				OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
			},
			ids: ["newbot"],
		});
		const entry = plan.entries.find((row) => row.id === "newbot");
		expect(entry).toBeDefined();
		expect(entry?.hunks[0]?.after).toMatch(/\[model\.hobo\]/);
		expect(entry?.hunks[0]?.after).toMatch(/127\.0\.0\.1:11434/);
	});

	it("registerHarness adds an in-process plugin", () => {
		registerHarness({
			id: "live",
			label: "Live",
			kind: "coding-agent",
			config: {
				format: "note",
				path: ".live",
				summary: "live plugin",
				after: "base_url={{openaiUrl}}",
			},
		});
		const spec = loadHarnessCatalog().find((row) => row.id === "live");
		expect(spec?.label).toBe("Live");
		const planned = planSpecHunks(spec!, {
			home: "/tmp",
			dest: {
				source: "ollama",
				openaiUrl: "http://x/v1",
				anthropicUrl: "http://x/coding-agent",
				namedUrl: "http://x",
				envKey: "HOBO_CODE_SESSION_REF",
			},
		});
		expect(planned.hunks[0]?.after).toBe("base_url=http://x/v1");
	});
});
