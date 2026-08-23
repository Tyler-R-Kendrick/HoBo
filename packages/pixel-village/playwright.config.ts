/**
 * Experiential validation suite config (HIGHBALL plan).
 *
 * Deterministic by construction: fixed viewport, deviceScaleFactor 1, no
 * retries, ONE worker — every spec boots its own control-api + static server
 * from `scripts/demo-harness.mts` and those bind real ports.
 *
 * Playwright is resolved as a workspace module. It used to be imported by an
 * absolute path into one developer's home directory, which meant the suite
 * could only run on that one machine -- everywhere else the config failed to
 * load and `pnpm e2e` reported no tests rather than a missing dependency.
 */
import { defineConfig } from "playwright/test";

/**
 * Browser binary override.
 *
 * Playwright refuses to launch unless the installed browser build matches the
 * one its own version pins, and an image that ships a browser rarely matches
 * the version a lockfile resolves to. Rather than hardcode a path -- the
 * mistake this config used to make with the Playwright module itself -- the
 * location is taken from the environment when it is set, and left to
 * Playwright's own resolution when it is not.
 *
 *   HOBO_PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium pnpm e2e
 */
const chromiumExecutable = process.env.HOBO_PLAYWRIGHT_CHROMIUM;

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
	projects: [
		{
			name: "chromium",
			use: {
				browserName: "chromium",
				...(chromiumExecutable
					? { launchOptions: { executablePath: chromiumExecutable } }
					: undefined),
			},
		},
	],
});
