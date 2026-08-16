import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHoboCodeCli } from "../src/cli.js";
import {
	EXAMPLES_ROOT,
	loadExampleCatalog,
	matchExampleRequest,
	materializeExample,
} from "../src/example-catalog.js";
import { HOBO_AGENT_INSTRUCTIONS } from "../src/harness-customization.js";

const homes: string[] = [];
afterEach(() => {
	for (const dir of homes) rmSync(dir, { recursive: true, force: true });
	homes.length = 0;
});

function temp(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	homes.push(dir);
	return dir;
}

describe("hobo-code example catalog", () => {
	it("loads hello-world and barebones from the package examples folder", () => {
		const catalog = loadExampleCatalog();
		expect(catalog.some((entry) => entry.id === "hello-world")).toBe(true);
		expect(
			catalog.some((entry) => entry.id === "barebones" && entry.fallback),
		).toBe(true);
		expect(catalog.every((entry) => existsSync(entry.sourceDir))).toBe(true);
		expect(EXAMPLES_ROOT.endsWith("examples")).toBe(true);
	});

	it("matches hello-world phrases and leaves a bare hello as dispatch", () => {
		expect(matchExampleRequest("hello world app")?.id).toBe("hello-world");
		expect(matchExampleRequest("make me a hello-world")?.id).toBe(
			"hello-world",
		);
		expect(matchExampleRequest("hello bindle")?.id).toBe("hello-world");
		expect(matchExampleRequest("hello")).toBeUndefined();
		expect(matchExampleRequest("refine the app")).toBeUndefined();
		expect(matchExampleRequest("refine the openui bindle")).toBeUndefined();
		expect(matchExampleRequest("add a settings page")).toBeUndefined();
	});

	it("uses the barebones example when a new app request matches nothing", () => {
		expect(matchExampleRequest("make me an app")?.id).toBe("barebones");
		expect(matchExampleRequest("create a brand new bindle project")?.id).toBe(
			"barebones",
		);
	});

	it("copies the matched example without fetching or using hobo", () => {
		const out = temp("hobo-code-example-");
		const result = materializeExample({
			exampleId: "hello-world",
			outputDir: out,
			appName: "greeter",
		});
		expect(result.templateId).toBe("hello-world");
		expect(existsSync(join(out, "src", "bindle.ts"))).toBe(true);
		expect(existsSync(join(out, "src", "webapp.ts"))).toBe(true);
		expect(readFileSync(join(out, "src", "bindle.ts"), "utf8")).toMatch(
			/bindle\(/,
		);
		expect(existsSync(join(out, "node_modules"))).toBe(false);
		// A named catalog example copies verbatim (deployable via hobo up/dev);
		// atoms compositions serve free-form intents only.
		expect(result.source).toBe("repo");
	});

	it("bakes the repo catalog into Bo so the agent does not fetch state", () => {
		expect(HOBO_AGENT_INSTRUCTIONS).toContain("hello-world");
		expect(HOBO_AGENT_INSTRUCTIONS).toContain("barebones");
		expect(HOBO_AGENT_INSTRUCTIONS).toMatch(
			/do not fetch|never fetch|from this repo/i,
		);
		expect(HOBO_AGENT_INSTRUCTIONS).not.toMatch(/https:\/\//);
	});
});

describe("hobo-code produces examples from a prompt", () => {
	it("materializes hello-world when asked for a hello-world app", async () => {
		const home = temp("hc-ex-home-");
		const project = temp("hc-ex-proj-");
		const result = await runHoboCodeCli(["hello", "world", "app"], {
			hoboHome: home,
			cwd: project,
		});
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_EXAMPLE");
		expect(existsSync(join(project, "hello-world", "src", "bindle.ts"))).toBe(
			true,
		);
		expect(result.message).toMatch(/hello-world|hello world/i);
	});
});
