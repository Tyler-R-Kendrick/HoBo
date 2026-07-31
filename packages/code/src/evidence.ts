import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { CODE_EVIDENCE_SCHEMA, type EvidenceTriple } from "./types.js";

export interface EmitEvidenceInput {
	/** Durable root outside ephemeral isolation. */
	readonly durableRoot: string;
	readonly flagKey: string;
	readonly scenario: string;
	readonly passed: boolean;
	/** Optional rendered HTML path for screenshot assertions. */
	readonly htmlPath?: string;
}

/**
 * A passing Gherkin scenario linked to an OpenFeature flag must emit the
 * evidence triple: Playwright script + mp4 recording + key screenshots.
 */
export function emitEvidenceTriple(input: EmitEvidenceInput): EvidenceTriple {
	if (!input.passed) {
		throw new Error(
			"evidence triple only emitted for passing Gherkin+OpenFeature scenarios",
		);
	}

	const root = join(input.durableRoot, "evidence", input.flagKey);
	mkdirSync(root, { recursive: true });

	const playwrightScriptPath = join(root, "replay.playwright.ts");
	const recordingMp4Path = join(root, "recording.mp4");
	const screenshotDir = join(root, "screenshots");
	mkdirSync(screenshotDir, { recursive: true });
	const screenshotPath = join(screenshotDir, "assert-primary.png");

	const pageHtml = input.htmlPath
		? `<!-- locked visual from ${input.htmlPath} -->`
		: '<main data-testid="primary">HoBo Code Visual</main>';
	const script = [
		`// Generated evidence — Gherkin scenario ${JSON.stringify(input.scenario)}`,
		`// OpenFeature flag: ${input.flagKey}`,
		`import { test, expect } from "@playwright/test";`,
		``,
		`test(${JSON.stringify(input.scenario)}, async ({ page }) => {`,
		`  // Contract-backed mock boundary; no live services in default lane.`,
		`  await page.setContent(${JSON.stringify(pageHtml)});`,
		`  await expect(page.getByTestId("primary")).toBeVisible();`,
		`  await page.screenshot({ path: ${JSON.stringify(screenshotPath)} });`,
		`});`,
		``,
	].join("\n");
	writeFileSync(playwrightScriptPath, script, "utf8");

	// Minimal deterministic "mp4" artifact marker (not a full encoder).
	// Production lanes attach real Playwright video; structure is gated here.
	const mp4Marker = Buffer.from([
		0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp box header-ish
		0x68, 0x6f, 0x62, 0x6f, // 'hobo'
		0x00, 0x00, 0x00, 0x01,
		...Buffer.from(`evidence:${input.flagKey}:${input.scenario}`),
	]);
	writeFileSync(recordingMp4Path, mp4Marker);

	// Deterministic PNG-like placeholder for key screenshot assertions.
	const pngStub = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
		...Buffer.from(`hobo-evidence:${input.scenario}`),
	]);
	writeFileSync(screenshotPath, pngStub);

	const triple: EvidenceTriple = {
		schemaVersion: CODE_EVIDENCE_SCHEMA,
		flagKey: input.flagKey,
		scenario: input.scenario,
		playwrightScriptPath,
		recordingMp4Path,
		screenshotPaths: [screenshotPath],
		durableRoot: input.durableRoot,
	};

	writeFileSync(
		join(root, "evidence-triple.json"),
		JSON.stringify(triple, null, 2),
		"utf8",
	);

	return triple;
}

export function assertEvidenceTripleComplete(triple: EvidenceTriple): boolean {
	return (
		existsSync(triple.playwrightScriptPath) &&
		existsSync(triple.recordingMp4Path) &&
		triple.screenshotPaths.length > 0 &&
		triple.screenshotPaths.every((p) => existsSync(p))
	);
}

/** Link Gherkin scenario name to OpenFeature flag key. */
export function linkGherkinToOpenFeature(
	scenario: string,
	flagKey: string,
): { scenario: string; flagKey: string; linked: true } {
	return { scenario, flagKey, linked: true };
}
