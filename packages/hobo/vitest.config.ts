import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

// PostgreSQL/TLS process acceptance has its own explicit integration lane.
export default mergeConfig(
	rootConfig,
	defineConfig({
		test: {
			isolate: true,
			// Native compiler and process acceptance must fit a bounded runner.
			fileParallelism: false,
			// Load each installed compiler natively, as the product CLI does.
			server: { deps: { external: [/[/\\]node_modules[/\\]typescript[/\\]/] } },
			include: ["test/**/*.test.ts"],
			exclude: ["e2e/**"],
		},
	}),
);
