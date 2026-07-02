import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
	digestSource,
	loadToolchainLock,
	resolvePackagePath,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WIT_SOURCE = join(PACKAGE_ROOT, "wit", "hobo-sdk.wit");
const GENERATED_ROOT = join(PACKAGE_ROOT, "generated");
const LOCK_PATH = join(PACKAGE_ROOT, "wit-lock.json");

async function main() {
	const checkMode = process.argv.includes("--check");
	await loadToolchainLock(LOCK_PATH);

	if (checkMode) {
		const result = await assertGeneratedMatches();
		console.log(
			`codegen --check ok (${result.checked} generated declaration files)`,
		);
		return;
	}

	const files = await writeGeneratedBindings();
	console.log(`codegen wrote ${files.length} declaration files`);
}

async function writeGeneratedBindings(options: { outDir?: string } = {}) {
	const outDir = options.outDir ?? GENERATED_ROOT;
	const jcoPath = join(
		PACKAGE_ROOT,
		"node_modules",
		"@bytecodealliance",
		"jco",
		"src",
		"jco.js",
	);

	await rm(outDir, { recursive: true, force: true });
	await execFileAsync(
		process.execPath,
		[jcoPath, "types", WIT_SOURCE, "--world-name", "sdk", "--out-dir", outDir],
		{ cwd: PACKAGE_ROOT },
	);
	await normalizeGeneratedTree(outDir);

	return listDeclarationFiles(outDir);
}

async function assertGeneratedMatches() {
	const tempDir = await mkdtemp(join(tmpdir(), "hobo-wit-jco-"));

	try {
		const expectedFileNames = await writeGeneratedBindings({ outDir: tempDir });
		const actualFileNames = await listDeclarationFiles(GENERATED_ROOT);

		if (actualFileNames.join("\n") !== expectedFileNames.join("\n")) {
			throw new Error(
				`wit_toolchain.generated_file_drift: expected ${expectedFileNames.join(",")}, got ${actualFileNames.join(",")}`,
			);
		}

		for (const fileName of expectedFileNames) {
			const expected = await readFile(join(tempDir, fileName), "utf8");
			const actual = await readFile(join(GENERATED_ROOT, fileName), "utf8");
			if (actual !== expected) {
				throw new Error(`wit_toolchain.generated_content_drift: ${fileName}`);
			}
		}

		return { checked: expectedFileNames.length };
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

async function listDeclarationFiles(root: string) {
	const files: string[] = [];

	async function visit(directory: string) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			if (entry.name.endsWith(".d.ts")) {
				files.push(relative(root, path).replace(/\\/g, "/"));
			}
		}
	}

	await visit(root);
	return files.sort();
}

async function normalizeGeneratedTree(root: string) {
	for (const fileName of await listDeclarationFiles(root)) {
		const path = join(root, fileName);
		const text = await readFile(path, "utf8");
		const normalized = text
			.replace(/\r\n/g, "\n")
			.replace(/[ \t]+$/gm, "")
			.replace(/\s+$/u, "");
		const moduleText = /\b(export|import)\b/.test(normalized)
			? normalized
			: `${normalized}\nexport {};`;
		await writeFile(path, `${moduleText}\n`);
	}
}

void main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});

export { digestSource, resolvePackagePath };
