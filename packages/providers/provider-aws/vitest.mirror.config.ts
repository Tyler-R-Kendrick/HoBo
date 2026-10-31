import { defineConfig } from "vitest/config";

// The mirror lane (ADR-0174): the SigV4 resolvers against the mirror.cloud
// emulator that `pnpm run test:mirror` starts and names in HOBO_MIRROR_URL.
// Without one the global setup fails the run; it never skips. One file at a
// time: the files share one emulator and read its journal.
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
