/**
 * Vitest globalSetup: warm a shared wasmtime toolchain cache once per run.
 *
 * Wasm-dependent tests use throwaway HOBO_HOME dirs, so without this hook every
 * test re-downloads the ~40MB wasmtime release and re-probes it; under parallel
 * turbo/vitest sweeps that saturates the box and flakes timeouts. Here we ensure
 * the toolchain once into a repository-local cache and export
 * HOBO_WASMTIME_BIN so every worker resolves the pre-seeded binary instead of
 * downloading per test.
 *
 * The cache is `<repo>/.cache/hobo-test-tools` (gitignored; the binary lands in
 * its `tools/wasmtime`), never the developer's HoBo home. A global setup runs
 * in vitest's main process, before any per-file isolation, so `defaultHoboHome()`
 * here was the real `~/.hobo`: a test run installed wasmtime into it, and the
 * code suite's real-home guard, running at the same time, blamed packages/code.
 * `HOBO_TEST_TOOLS_HOME` points the cache elsewhere (this file's own test uses
 * it).
 *
 * Real-user semantics are untouched: tests still exercise the same
 * ensure/probe/download code paths; the env override is a supported resolution
 * source (source: "env").
 */
import { fileURLToPath } from "node:url";
import { ensureWasmtimeBinary } from "../src/index.js";

/** Where the run's tools live: `HOBO_TEST_TOOLS_HOME`, else `<repo>/.cache/hobo-test-tools`. */
export function testToolsHome(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.HOBO_TEST_TOOLS_HOME;
	if (override !== undefined && override.trim().length > 0) return override;
	return fileURLToPath(
		new URL("../../../../.cache/hobo-test-tools", import.meta.url),
	);
}

export default async function setup(): Promise<void> {
	if (process.env.HOBO_WASMTIME_BIN) return; // caller pre-seeded; respect it.
	try {
		const wasmtime = await ensureWasmtimeBinary({
			hoboHome: testToolsHome(),
		});
		process.env.HOBO_WASMTIME_BIN = wasmtime.binPath;
	} catch (error) {
		// Offline / download failure: leave env unset so tests fall back to the
		// per-test behavior (own download or explicit skip), exactly as before.
		console.warn(
			`wasmtime global setup: warm cache unavailable (${String(error)}); tests will resolve wasmtime individually`,
		);
	}
}
