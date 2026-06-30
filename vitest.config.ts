import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    isolate: false,
    fileParallelism: true,
    pool: "threads",
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: { enabled: false },
    reporters: ["dot"],
  },
});
