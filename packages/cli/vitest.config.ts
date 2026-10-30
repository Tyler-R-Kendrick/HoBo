import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config.js";

export default mergeConfig(
	rootConfig,
	defineConfig({
		test: {
			// Whole-app compiler acceptances share a four-core runner with package
			// suites. Keep their original deadlines by bounding compiler concurrency.
			fileParallelism: false,
			// Load the shipped compiler through Node, matching the product CLI.
			// Transforming its internals consumes compiler integration test budgets.
			server: { deps: { external: [/[/\\]node_modules[/\\]typescript[/\\]/] } },
		},
	}),
);
