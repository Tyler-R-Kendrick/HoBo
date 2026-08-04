import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Optimizexp feature binding tests live under .optimizexp/ and run via root test:file
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.optimizexp/**",
		],
	},
});
