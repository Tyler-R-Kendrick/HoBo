import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts", "contracts/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: [
				"src/live.ts",
				"src/artifacts.ts",
				"src/project.ts",
				"src/environment.ts",
				"src/pipeline.ts",
			],
			reporter: ["text", "json-summary"],
			reportsDirectory: ".coverage",
			skipFull: false,
			thresholds: { statements: 98, branches: 97, functions: 98, lines: 99 },
		},
	},
});
