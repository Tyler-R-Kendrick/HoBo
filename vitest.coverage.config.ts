/**
 * Coverage lane. Deliberately separate from `vitest.config.ts`, which keeps
 * `coverage: { enabled: false }` so the ordinary test lanes stay fast.
 *
 * Scoped to first-party package sources. The root config's default discovery
 * also sweeps in `external/` (vendored projects that are not ours),
 * `src/draft/` (proof material with its own gates), `site/`, and generated
 * `.optimizexp/` feature suites — measuring those as if they were HoBo package
 * coverage would report a number that means nothing.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		isolate: false,
		fileParallelism: true,
		pool: "threads",
		globalSetup: [
			fileURLToPath(
				new URL(
					"./packages/runtimes/runtime-wasm/test/wasmtime-global-setup.ts",
					import.meta.url,
				),
			),
		],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		reporters: ["dot"],
		include: ["packages/**/test/**/*.test.ts"],
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.optimizexp/**",
			// Live lanes: these fail by design when their binary or toolchain is
			// absent, which is a deliberate "no silent skip" policy, not coverage.
			"**/test/live-*.test.ts",
			"**/*.integration.test.ts",
		],
		coverage: {
			enabled: true,
			provider: "v8",
			all: true,
			include: ["packages/*/src/**/*.ts", "packages/*/*/src/**/*.ts"],
			exclude: [
				"**/*.test.ts",
				"**/dist/**",
				"**/node_modules/**",
				"**/*.d.ts",
				"**/_generated/**",
			],
			reporter: ["text-summary", "json-summary"],
			reportsDirectory: "./.coverage",
			/**
			 * A ratchet, not a target.
			 *
			 * Measured 2026-08-20 over 766 files / 8,532 tests:
			 * statements 77.74%, branches 65.84%, functions 82.27%, lines 79.12%.
			 * These thresholds sit a hair under those numbers so the lane fails on
			 * *regression* while the climb to the 80% goal is in progress.
			 *
			 * Set at the measured line rather than at the goal deliberately, for the
			 * reason the Stryker configs already give: a gate nobody can pass gets
			 * deleted, not met. Raise each number as the real one improves; never
			 * lower one to make a red build green.
			 *
			 * The goal is 80% on every metric. Branches are the long pole at 65.84%,
			 * and the leverage is concentrated — `packages/code` is 15,445 statements
			 * at 77.1%, and packages/testing, pixel-village, ci-guard, camps and
			 * control-yard all sit under 62%.
			 */
			thresholds: {
				statements: 77.5,
				branches: 65.5,
				functions: 82,
				lines: 79,
			},
		},
	},
});
