import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { must } from "@hobo/core/total-access";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type HarnessCatalogDiagnostic,
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
					block:
						'[model.hobo]\nbase_url = "{{openaiUrl}}"\nenv_key = "{{envKey}}"\n',
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
		const planned = planSpecHunks(must(spec), {
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

	it("reports a diagnostic per bad plugin file while the rest still load", () => {
		const home = tmp();
		const pluginDir = join(home, "durable", "code", "harnesses");
		mkdirSync(pluginDir, { recursive: true });
		writeFileSync(join(pluginDir, "broken.json"), "{ not json", "utf8");
		writeFileSync(
			join(pluginDir, "typo.json"),
			JSON.stringify({ id: "typo", label: "Typo", kind: "coding-agnet" }),
			"utf8",
		);
		writeFileSync(
			join(pluginDir, "good.json"),
			JSON.stringify({
				id: "goodbot",
				label: "Good Bot",
				kind: "coding-agent",
			}),
			"utf8",
		);
		const diagnostics: HarnessCatalogDiagnostic[] = [];
		const specs = loadHarnessCatalog({
			hoboHome: home,
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});
		expect(specs.some((spec) => spec.id === "goodbot")).toBe(true);
		expect(specs.some((spec) => spec.id === "typo")).toBe(false);
		expect(diagnostics).toHaveLength(2);
		expect(diagnostics.some((diag) => diag.file.endsWith("broken.json"))).toBe(
			true,
		);
		const typo = diagnostics.find((diag) => diag.file.endsWith("typo.json"));
		expect(typo?.message).toContain("kind");
		expect(typo?.message).toContain("coding-agnet");
	});

	it("defaults to a one-line stderr warning naming the bad file", () => {
		const home = tmp();
		const pluginDir = join(home, "durable", "code", "harnesses");
		mkdirSync(pluginDir, { recursive: true });
		writeFileSync(join(pluginDir, "oops.json"), "{ not json", "utf8");
		const write = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		try {
			loadHarnessCatalog({ hoboHome: home });
			const warning = write.mock.calls
				.map(([chunk]) => String(chunk))
				.find((line) => line.includes("oops.json"));
			expect(warning).toBeDefined();
			expect(warning).toMatch(/^hobo-code: skipped harness spec .*oops\.json/);
			expect(warning?.trimEnd()).not.toContain("\n");
		} finally {
			write.mockRestore();
		}
	});
});
