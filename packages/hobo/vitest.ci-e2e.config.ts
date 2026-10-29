import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["e2e/ci.test.ts"],
		testTimeout: 30000,
		hookTimeout: 60000,
		fileParallelism: false,
	},
});
