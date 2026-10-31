import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

// PostgreSQL/TLS process acceptance has its own explicit integration lane, and
// test/mirror/ runs only against a started mirror.cloud emulator
// (vitest.mirror.config.ts, `pnpm run test:mirror` at the root): left out here
// by configuration, not by a skip (ADR-0174).
export default mergeConfig(
	rootConfig,
	defineConfig({
		test: {
			isolate: true,
			include: ["test/**/*.test.ts"],
			exclude: ["e2e/**", "test/mirror/**"],
		},
	}),
);
