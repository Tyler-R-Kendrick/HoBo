import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { sanitizeNodeOptions } from "./lib/env.ts";
import { testCategories } from "./lib/test-categories.ts";

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

const categories = testCategories(rootOnly);

type CategoryKey = keyof typeof categories;
function isCategoryKey(name: string): name is CategoryKey {
	return Object.hasOwn(categories, name);
}
const patterns = isCategoryKey(category) ? categories[category] : undefined;
if (!patterns) {
	console.error(`unknown test category: ${category}`);
	process.exit(1);
}

// Category lanes run under Vitest, which cannot load node:test-style files.
// Files that import node:test belong to package-level `node --test` lanes
// (their package.json test:contract:* scripts), so exclude them here; the
// turbo part of the root lane still executes them under their owning engine.
const nodeTestFiles = new Set<string>();
const testFiles = gitLsFiles(patterns).filter((file) => {
	if (file.endsWith(".feature")) return false;
	if (isNodeTestFile(file)) {
		nodeTestFiles.add(file);
		return false;
	}
	return true;
});
if (nodeTestFiles.size > 0) {
	console.log(
		`Skipping ${nodeTestFiles.size} node:test-style file(s) covered by package lanes:`,
	);
	for (const file of nodeTestFiles) console.log(`  ${file}`);
}

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
const baseConfigUrl = pathToFileURL(
	resolve(process.cwd(), "vitest.config.ts"),
).href;
const maxWorkers = Math.max(
	1,
	Number.parseInt(process.env.HOBO_RELEVANT_CHECK_CONCURRENCY ?? "4", 10) || 4,
);
writeFileSync(
	configPath,
	`import baseConfig from ${JSON.stringify(baseConfigUrl)};\nexport default { ...baseConfig, test: { ...baseConfig.test, include: ${JSON.stringify(testFiles)}, maxWorkers: ${maxWorkers}, pool: "forks", watch: false } };\n`,
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
			env: sanitizeNodeOptions(),
		},
	);
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(configDir, { force: true, recursive: true });
}

function isNodeTestFile(file: string): boolean {
	const source = readFileSync(file, "utf8");
	return /from\s+["']node:test["']|require\(\s*["']node:test["']\s*\)|import\s+["']node:test["']/.test(
		source,
	);
}

function gitLsFiles(globPatterns: string[]): string[] {
	const result = spawnSync("git", ["ls-files", ...globPatterns], {
		encoding: "utf8",
		shell: false,
		maxBuffer: 32 * 1024 * 1024,
	});
	if (result.error || result.status !== 0) {
		process.stderr.write(result.stderr || result.error?.message || "");
		process.exit(result.status ?? 1);
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}
