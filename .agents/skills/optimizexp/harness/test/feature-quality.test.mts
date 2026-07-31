/**
 * Unit tests: feature quality, discovery preference, rubberduck-check.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	checkGherkinQuality,
	checkRubberduckDoc,
	gherkinTemplate,
} from "../lib/feature-quality.mts";
import { pickPrimaryCommand, type DiscoveryReport } from "../lib/code-discovery.mts";
import { buildExperienceCatalog } from "../lib/experience-catalog.mts";
import type { SurfaceMap } from "../lib/surface-map.mts";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("feature-quality rubberduck", () => {
	it("rejects empty EXPERIENCE.md", () => {
		const r = checkRubberduckDoc("# hi\n");
		assert.equal(r.ok, false);
		assert.ok(r.problems.some((p) => /Rubber-duck/i.test(p)));
	});

	it("accepts filled EXPERIENCE with checked boxes and accept", () => {
		const md = `# EXPERIENCE: x

entryCommand: \`hobo-code help\`

## Rubber-duck (explain to a new teammate)

1. Who — developer finishing help discoverability in two minutes.
2. Path — \`hobo-code help\` from clean shell.
3. First see — verb list and First run section.
4. Wrong product — control-plane \`hobo\` alone.
5. Happy — run help, see verbs.
6. Failure — unknown verb gives remediation.
7. Evidence — cli capture of help stdout.
8. Out of scope — full Pi multi-turn chat.

## Adversarial critique (must check all)

- [x] Did not skip default entry because a secondary verb is easier to automate
- [x] Not testing a monorepo script instead of the product binary
- [x] No When-step is only “exercise the surface” without a real command
- [x] Scores cannot be invented without reading stdout/TUI
- [x] Persona vocabulary/asserts considered for shared paths
- [x] Security: secrets, destructive promote, network—fail-closed
- [x] Cognitive load: journey stays within persona thresholds
- [x] Confusion twin: stock UI / wrong binary / wrong verb—covered
- [x] If this feature were the only one we ship, the persona would not still be lost

## Verdict

- accept
- primaryCommand: \`hobo-code help\`
`;
		const r = checkRubberduckDoc(md);
		assert.equal(r.ok, true, r.problems.join("; "));
	});
});

describe("gherkin quality", () => {
	it("flags template-only When", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "oxp-gq-"));
		writeFileSync(
			path.join(dir, "x-developer.feature"),
			`@optimizexp @dx @persona:developer @interface:cli
Feature: x
  Scenario: a
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
  Scenario: b
    When I exercise the surface as this persona would
    Then I receive clear status about what happened
`,
		);
		const r = checkGherkinQuality(dir);
		assert.equal(r.ok, false);
		assert.equal(r.templateOnly, true);
	});

	it("accepts concrete When run backticks", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "oxp-gq2-"));
		const body = gherkinTemplate({
			kind: "help-discoverability",
			featureId: "hobo-code-help",
			title: "help",
			personaId: "developer",
			personaName: "developer",
			iface: "cli",
			experiences: ["dx"],
			bin: "hobo-code",
			entryCommand: "hobo-code help",
		});
		writeFileSync(path.join(dir, "hobo-code-help-developer.feature"), body);
		const r = checkGherkinQuality(dir);
		assert.equal(r.ok, true, r.problems.join("; "));
	});
});

describe("pickPrimaryCommand preference", () => {
	it("prefers hobo-code shell over agent:check script", () => {
		const report: DiscoveryReport = {
			featureId: "hobo-code-agent",
			seed: "agent inventory for coding agent",
			scannedAt: new Date().toISOString(),
			packageScripts: ["agent:check", "eval:agent:mock"],
			notes: [],
			bindings: [
				{
					kind: "package-script",
					id: "script:agent:check",
					scriptName: "agent:check",
					command: "pnpm run agent:check",
					confidence: "high",
					reason: "keyword",
					implementsSteps: [],
				},
				{
					kind: "shell-command",
					id: "shell:hobo-code agent",
					command: "hobo-code agent",
					confidence: "high",
					reason: "product CLI",
					implementsSteps: [],
				},
			],
		};
		const p = pickPrimaryCommand(report);
		assert.ok(p);
		assert.match(p!.command ?? "", /hobo-code agent/);
	});
});

describe("experience catalog", () => {
	it("includes cold-start and help P0 for interactive product", () => {
		const map: SurfaceMap = {
			schemaVersion: 1,
			projectId: "code",
			scannedAt: new Date().toISOString(),
			productName: "hobo-code",
			packageDir: "packages/code",
			binaries: [{ name: "hobo-code", binPath: "/tmp/hobo-code.js" }],
			defaultEntry: {
				command: "hobo-code",
				interactive: true,
				driver: "tui",
				notes: "test",
			},
			nonInteractiveHelp: { command: "hobo-code help", driver: "cli" },
			commands: [
				{ id: "help", argv: ["help"], kind: "discoverability" },
				{ id: "agent", argv: ["agent"], kind: "verb" },
			],
			interactiveSurfaces: [
				{ id: "default-tty-chat", entry: "bare-tty", driver: "tui" },
			],
			requiredJourneys: ["default-entry-cold-start", "help-discoverability"],
			probes: [],
		};
		const cat = buildExperienceCatalog({
			project: { id: "code", path: "packages/code", kind: "package", label: "code" },
			personaIds: ["developer"],
			surfaceMap: map,
		});
		assert.ok(
			cat.experiences.some((e) => e.experienceId === "cold-start-tty-chat"),
		);
		assert.ok(
			cat.experiences.some((e) => e.experienceId === "help-discoverability"),
		);
		assert.ok(cat.experiences.every((e) => e.priority === "P0" || e.priority === "P1" || e.priority === "P2"));
	});
});
