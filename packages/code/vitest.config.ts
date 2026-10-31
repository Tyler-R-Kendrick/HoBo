import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// One root of throwaway homes per run, and a guard that fails the run
		// when a test wrote into a real HoBo home (test/real-home-guard.ts).
		globalSetup: ["test/real-home-guard.ts"],
		// Each file gets its own HOBO_HOME and each worker its own HOME inside
		// that root, so a call that omits its home cannot reach ~/.hobo.
		setupFiles: [
			"test/isolate-git-env.ts",
			"../../test/setup/isolate-hobo-home.ts",
			"test/isolate-user-home.ts",
		],
		// Optimizexp feature binding tests live under .optimizexp/ and run via root test:file
		exclude: ["**/node_modules/**", "**/dist/**", "**/.optimizexp/**"],
		// This suite drives real subprocesses — `git init`, commit, `worktree
		// add`/`remove`, spawned sidecars — so its wall time tracks how loaded
		// the machine is rather than how much work the test does. Vitest's
		// 5s default is not a budget these tests were ever written against:
		// `session-orchestrator.test.ts` alone spends ~8.6s in test bodies
		// unloaded, and "keeps checkpoint refs when worktree removal fails"
		// timed out at 10.4s under a 4-way `turbo run test` on a 4-core box
		// while passing in isolation. 20s is the subprocess allowance; a real
		// hang still fails, it just fails for being a hang.
		testTimeout: Number(process.env.HOBO_TEST_TIMEOUT ?? 20_000),
		hookTimeout: Number(process.env.HOBO_TEST_TIMEOUT ?? 20_000),
		maxWorkers:
			process.env.HOBO_TEST_MAX_WORKERS === undefined
				? undefined
				: Number(process.env.HOBO_TEST_MAX_WORKERS),
	},
});
