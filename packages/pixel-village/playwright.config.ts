/**
 * Experiential validation suite config (HIGHBALL plan).
 *
 * Deterministic by construction: fixed viewport, deviceScaleFactor 1, no
 * retries, ONE worker — every spec boots its own control-api + static server
 * from `scripts/demo-harness.mts` and those bind real ports.
 *
 * Playwright is installed globally in this environment, not in the workspace,
 * so the config and specs import it by absolute path (see PLAYWRIGHT_MODULE).
 */
// @ts-expect-error - global playwright install, resolved by absolute path
import { defineConfig } from "/home/codex/.local/lib/node_modules/playwright/test.mjs";

export default defineConfig({
	testDir: "./test/e2e",
	testMatch: /.*\.spec\.ts/,
	// The harness binds ports and the specs drive a single deterministic clock.
	fullyParallel: false,
	workers: 1,
	// No retries: a flaky experiential assertion is a finding, not a re-run.
	retries: 0,
	timeout: 120_000,
	expect: { timeout: 15_000 },
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI
		? [["list"], ["json", { outputFile: "tmp/e2e-report.json" }]]
		: [["list"]],
	outputDir: "tmp/e2e-artifacts",
	use: {
		viewport: { width: 1400, height: 920 },
		deviceScaleFactor: 1,
		// Screenshot/pixel work must not be perturbed by device pixel ratio,
		// scrollbars, or animation-driven color scheme shifts.
		colorScheme: "light",
		timezoneId: "UTC",
		locale: "en-US",
		trace: "off",
		video: "off",
		screenshot: "off",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
