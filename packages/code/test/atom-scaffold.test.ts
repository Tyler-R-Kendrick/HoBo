import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	HIGH_VALUE_TEMPLATE_ID,
	scaffoldFromAtoms,
	scaffoldFromIntent,
	scaffoldHighValueTemplate,
} from "../src/scaffolding.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

describe("ScaffoldingAgent atom path", () => {
	it("emits a hello-world Bindle that satisfies architecture-guard files", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-scf-atoms-"));
		roots.push(out);
		const result = scaffoldFromIntent({
			outputDir: out,
			appName: "greeter",
			intent: "create a hello world app",
		});
		expect(result.ok).toBe(true);
		expect(result.decision).toBe("emit");
		expect(result.result?.respectsKonsistent).toBe(true);
		expect(result.result?.respectsGenerated).toBe(true);
		expect(existsSync(join(out, "src", "bindle.ts"))).toBe(true);
		expect(existsSync(join(out, "src", "_generated", ".gitkeep"))).toBe(true);
		expect(existsSync(join(out, "data-models", "greeter.proto"))).toBe(true);
		expect(existsSync(join(out, "data-models", "greeter.cue"))).toBe(true);
		expect(
			existsSync(
				join(out, "contracts", "pacts", "greeter-web-to-api.pact.json"),
			),
		).toBe(true);
		expect(readFileSync(join(out, "src", "bindle.ts"), "utf8")).toContain(
			'bindle("greeter"',
		);
	});

	it("scaffolds an explicit atom set without retrieval", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-scf-explicit-"));
		roots.push(out);
		const result = scaffoldFromAtoms({
			outputDir: out,
			appName: "local",
			atomIds: ["station.init"],
		});
		expect(result.ok).toBe(true);
		expect(readFileSync(join(out, "src", "station.ts"), "utf8")).toContain(
			"initStation",
		);
	});

	it("refuses low-confidence intents instead of emitting", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-scf-refuse-"));
		roots.push(out);
		const result = scaffoldFromIntent({
			outputDir: out,
			appName: "nope",
			intent: "quantize a mesh shader for a flight stick",
		});
		expect(result.ok).toBe(false);
		expect(result.decision).toBe("refuse");
		expect(existsSync(join(out, "src", "bindle.ts"))).toBe(false);
	});

	it("keeps the high-value OpenUI template path unchanged", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-scf-openui-"));
		roots.push(out);
		const result = scaffoldHighValueTemplate({
			outputDir: out,
			appName: "demo",
		});
		expect(result.templateId).toBe(HIGH_VALUE_TEMPLATE_ID);
		expect(() =>
			scaffoldHighValueTemplate({
				outputDir: join(out, "missing"),
				appName: "demo",
				templateId: "not-a-catalog-starter",
			}),
		).toThrow(/template not found/);
		expect(result.openFeatureFlag).toBe("app.visual.primary");
		expect(existsSync(join(out, "public", "index.html"))).toBe(true);
		expect(existsSync(join(out, "features", "visual.feature"))).toBe(true);
	});
});
