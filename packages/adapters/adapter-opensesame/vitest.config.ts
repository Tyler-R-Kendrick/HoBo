import { configDefaults, defineConfig } from "vitest/config";

// The default lane needs no OpenSesame. `test/real/` runs against a locally
// built kit under vitest.real.config.ts (`pnpm run test:real`) and is left out
// here by configuration, not by a skip: a skipped real test reads as a passed one.
export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "test/real/**"],
	},
});
