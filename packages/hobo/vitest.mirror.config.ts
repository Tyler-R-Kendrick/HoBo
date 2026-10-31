import { defineConfig } from "vitest/config";

// The mirror lane (ADR-0174): the composed hobo's Vercel client and deploy
// provider, and the provider side of contracts/hobo-vercel-api.pact.json,
// against the mirror.cloud emulator `pnpm run test:mirror` starts and names in
// HOBO_MIRROR_URL. Without one the global setup fails the run; it never
// skips. Standalone rather than merged with the root config: these files
// touch no HOBO_HOME and need none of its global setup. One file at a time:
// the files share one emulator and its clock.
export default defineConfig({
	test: {
		include: ["test/mirror/**/*.mirror.test.ts"],
		globalSetup: ["test/mirror/global-setup.ts"],
		fileParallelism: false,
		maxWorkers: 1,
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
