import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    isolate: false,
    fileParallelism: true,
    pool: "threads",
    // Warm the shared wasmtime toolchain cache once per run so wasm tests on
    // throwaway HOBO_HOME dirs don't each re-download under parallel load.
    // Absolute: vitest resolves globalSetup against the project root (cwd),
    // which is a package dir when running filtered test commands.
    globalSetup: [
      fileURLToPath(
        new URL(
          "./packages/runtimes/runtime-wasm/test/wasmtime-global-setup.ts",
          import.meta.url,
        ),
      ),
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: { enabled: false },
    reporters: ["dot"],
  },
});
