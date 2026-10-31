import { configDefaults, defineConfig } from "vitest/config";

// The default lane needs no emulator. `test/mirror/` runs against a started
// mirror.cloud under vitest.mirror.config.ts (`pnpm run test:mirror` at the
// root) and is left out here by configuration, not by a skip: a skipped
// emulator test reads as a passed one (ADR-0174).
export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "test/mirror/**"],
	},
});
