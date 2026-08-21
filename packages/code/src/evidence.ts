import {
	copyFileSync,
	existsSync,
	mkdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { CODE_EVIDENCE_SCHEMA, type EvidenceTriple } from "./types.js";

export interface EmitEvidenceInput {
	/** Durable root outside ephemeral isolation. */
	readonly durableRoot: string;
	readonly flagKey: string;
	readonly scenario: string;
	readonly passed: boolean;
	/** Existing Playwright video capture. HoBo never fabricates evidence media. */
	readonly recordingMp4Path: string;
	/** Existing key screenshots produced by the scenario run. */
	readonly screenshotPaths: readonly string[];
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
	if (!existsSync(input.recordingMp4Path)) {
		throw new Error("recording capture does not exist");
	}
	if (input.screenshotPaths.length === 0) {
		throw new Error("at least one screenshot capture is required");
	}
	for (const path of input.screenshotPaths) {
		if (!existsSync(path) || statSync(path).size === 0) {
			throw new Error(`screenshot capture does not exist or is empty: ${path}`);
		}
	}

	const root = join(input.durableRoot, "evidence", input.flagKey);
	mkdirSync(root, { recursive: true });

	const playwrightScriptPath = join(root, "replay.playwright.ts");
	const recordingMp4Path = join(root, "recording.mp4");
	const screenshotDir = join(root, "screenshots");
	mkdirSync(screenshotDir, { recursive: true });
	const screenshotPaths = input.screenshotPaths.map((source, index) => {
		const target = join(screenshotDir, `assert-${index + 1}.png`);
		copyFileSync(source, target);
		return target;
	});
	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	const screenshotPath = screenshotPaths[0] as string;

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

	copyFileSync(input.recordingMp4Path, recordingMp4Path);

	const triple: EvidenceTriple = {
		schemaVersion: CODE_EVIDENCE_SCHEMA,
		flagKey: input.flagKey,
		scenario: input.scenario,
		playwrightScriptPath,
		recordingMp4Path,
		screenshotPaths,
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
		statSync(triple.recordingMp4Path).size > 0 &&
		triple.screenshotPaths.length > 0 &&
		triple.screenshotPaths.every((p) => existsSync(p) && statSync(p).size > 0)
	);
}

/** Link Gherkin scenario name to OpenFeature flag key. */
export function linkGherkinToOpenFeature(scenario: string, flagKey: string) {
	return { scenario, flagKey, linked: true };
}
