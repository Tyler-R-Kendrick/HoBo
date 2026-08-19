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
		},
	},
});
