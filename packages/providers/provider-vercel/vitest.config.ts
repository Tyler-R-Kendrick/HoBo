import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../../vitest.config.js";

// The root config, as before this package had a config of its own: its setup
// files (a throwaway HOBO_HOME per file), global setup, pool, isolation and
// HOBO_TEST_TIMEOUT timeouts. mergeConfig appends to the root's excludes.
// `test/mirror/` runs against a started mirror.cloud under
// vitest.mirror.config.ts (`pnpm run test:mirror` at the root) and is left out
// here by configuration, not by a skip: a skipped emulator test reads as a
// passed one (ADR-0174).
export default mergeConfig(
	rootConfig,
	defineConfig({
		test: {
			exclude: ["test/mirror/**"],
		},
	}),
);
