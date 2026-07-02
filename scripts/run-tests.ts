import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const quiet = args.has("--quiet");
const categoryArg = process.argv.find((arg) => arg.startsWith("--category="));
const category = categoryArg?.slice("--category=".length) ?? "unit";
const rootOnly = process.argv.includes("--root-only");
const finalValidation = process.argv.includes("--final");
const changedScope = process.argv.includes("--changed");
const isAgent =
	process.env.CI_AGENT === "true" ||
	process.env.CODEX === "true" ||
	process.env.CLAUDECODE === "true" ||
	process.env.CURSOR_AGENT === "true";
const broadAgentCategories = new Set([
	"contract-provider",
	"contract-consumer",
	"contract",
	"unit",
	"all",
]);

const categories: Record<string, string[]> = {
	unit: rootOnly
		? ["test/*test.ts", "test/*test.mjs"]
		: [
				"test/*test.ts",
				"test/*test.mjs",
				"src/draft/*/*/test/*test.ts",
				"src/draft/exp-proofs/*/*/test/*test.ts",
				"src/draft/*/*/test/*test.mjs",
				"src/draft/exp-proofs/*/*/test/*test.mjs",
				"src/draft/*/*/tests/*test.ts",
				"src/draft/exp-proofs/*/*/tests/*test.ts",
				"src/draft/*/*/tests/*test.mjs",
				"src/draft/exp-proofs/*/*/tests/*test.mjs",
			],
	types: [
		"src/draft/*/*/type-tests/*.ts",
		"src/draft/exp-proofs/*/*/type-tests/*.ts",
		"src/draft/*/*/test-types/*.ts",
		"src/draft/exp-proofs/*/*/test-types/*.ts",
		"**/*.test-d.ts",
	],
	"contract-consumer": [
		"src/draft/*/*/test/*contract*.test.ts",
		"src/draft/exp-proofs/*/*/test/*contract*.test.ts",
		"src/draft/*/*/test/*contract*.test.mjs",
		"src/draft/exp-proofs/*/*/test/*contract*.test.mjs",
		"src/draft/*/*/tests/*contract*.test.ts",
		"src/draft/exp-proofs/*/*/tests/*contract*.test.ts",
		"src/draft/*/*/tests/*contract*.test.mjs",
		"src/draft/exp-proofs/*/*/tests/*contract*.test.mjs",
		"src/draft/*/*/contracts/consumer/*test.ts",
		"src/draft/exp-proofs/*/*/contracts/consumer/*test.ts",
		"packages/runtimes/*/contracts/consumer/*test.ts",
		"test/*contract*.test.ts",
	],
	"contract-provider": [
		"src/draft/*/*/test/*provider*.test.ts",
		"src/draft/exp-proofs/*/*/test/*provider*.test.ts",
		"src/draft/*/*/test/*provider*.test.mjs",
		"src/draft/exp-proofs/*/*/test/*provider*.test.mjs",
		"src/draft/*/*/tests/*provider*.test.ts",
		"src/draft/exp-proofs/*/*/tests/*provider*.test.ts",
		"src/draft/*/*/tests/*provider*.test.mjs",
		"src/draft/exp-proofs/*/*/tests/*provider*.test.mjs",
		"src/draft/*/*/contracts/provider/*test.ts",
		"test/*provider*.test.ts",
	],
	dom: ["tests/dom/**/*test.ts", "test/dom/**/*test.ts"],
	component: ["tests/component/**/*test.ts", "test/component/**/*test.ts"],
	behavior: ["tests/behavior/**/*test.ts", "features/**/*.feature"],
	visual: ["tests/visual/**/*test.ts"],
	"agent-mock": ["evals/**/*.mock.test.ts", "test/evals/**/*.mock.test.ts"],
	"agent-live": ["evals/**/*.live.test.ts", "test/evals/**/*.live.test.ts"],
};

const patterns = categories[category];
if (!patterns) {
	console.error(`unknown test category: ${category}`);
	process.exit(1);
}

const testFiles = gitLsFiles(patterns).filter(
	(file) => !file.endsWith(".feature"),
);

if (isAgent && broadAgentCategories.has(category) && !finalValidation) {
	throw new Error(
		[
			`Refusing broad test category during agent edit loop: ${category}`,
			"Use:",
			"  pnpm run test:smoke <path>",
			"  pnpm run test:file <path>",
			"  pnpm run test:name <pattern> <path>",
			"  pnpm run test:changed",
			"Pass --final only after the implementation is complete.",
		].join("\n"),
	);
}

if (isAgent && testFiles.length > 3 && !changedScope && !finalValidation) {
	throw new Error(
		`Refusing ${testFiles.length} test files during agent edit loop. Use a targeted file, --changed, or --final.`,
	);
}

if (testFiles.length === 0) {
	console.log(`No ${category} tests found; lane skipped.`);
	process.exit(0);
}

// The tracked-file list goes through a temporary Vitest config instead of the
// command line so large categories cannot exceed the Windows command-length
// limit (the reason the old runner batched files by character budget).
const configDir = mkdtempSync(join(tmpdir(), "hobo-vitest-"));
const configPath = join(configDir, "vitest.config.mjs");
writeFileSync(
	configPath,
	`export default { test: { include: ${JSON.stringify(testFiles)}, watch: false } };\n`,
);

try {
	const vitestEntry = resolve(
		process.cwd(),
		"node_modules",
		"vitest",
		"vitest.mjs",
	);
	const result = spawnSync(
		process.execPath,
		[
			vitestEntry,
			"run",
			"--root",
			process.cwd(),
			"--config",
			configPath,
			...(quiet ? ["--silent", "--reporter=dot"] : []),
		],
		{
			stdio: "inherit",
			shell: false,
			env: { ...process.env, NODE_OPTIONS: "" },
		},
	);
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(configDir, { force: true, recursive: true });
}

function gitLsFiles(globPatterns: string[]): string[] {
	const result = spawnSync("git", ["ls-files", ...globPatterns], {
		encoding: "utf8",
		shell: false,
	});
	if (result.status !== 0) {
		process.stderr.write(result.stderr);
		process.exit(result.status ?? 1);
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}
