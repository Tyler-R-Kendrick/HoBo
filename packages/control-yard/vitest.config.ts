import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Playwright specs live beside the unit tests but are driven by the
		// Playwright runner (`pnpm run e2e`); collecting them under vitest fails
		// at import time on `test.beforeAll`.
		exclude: ["**/node_modules/**", "**/dist/**", "test/e2e/**"],
	},
});
