import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

// PostgreSQL/TLS process acceptance has its own explicit integration lane.
export default mergeConfig(
	rootConfig,
	defineConfig({
		test: {
			isolate: true,
			include: ["test/**/*.test.ts"],
			exclude: ["e2e/**"],
		},
	}),
);
