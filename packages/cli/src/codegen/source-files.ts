import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import ts from "typescript";
import { CodegenError, type CodegenLayout } from "./types.js";

/** A TypeScript source file: `.ts`, `.tsx`, `.mts` or `.cts`. */
const TYPESCRIPT_SOURCE = /\.(?:ts|tsx|mts|cts)$/u;

/** The layout's TypeScript sources, in a deterministic order, generated roots excluded. */
export async function scannedSources(
	projectRoot: string,
	layout: CodegenLayout,
): Promise<readonly string[]> {
	const scanRoot = join(projectRoot, layout.sources.scanDir);
	if (!existsSync(scanRoot)) return [];
	const excluded = layout.generatedRoots.map((root) => join(projectRoot, root));

	const files: string[] = [];
	async function visit(directory: string): Promise<void> {
		if (excluded.some((root) => directory.startsWith(root))) return;
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			if (TYPESCRIPT_SOURCE.test(entry.name)) files.push(path);
		}
	}
	await visit(scanRoot);
	return files.sort();
}

/** A source file's project-relative path, with posix separators. */
export function projectPath(projectRoot: string, file: string): string {
	return relative(projectRoot, file).split("\\").join("/");
}

/**
 * The path TypeScript emits a source file to, which an import of it names, as
 * its `getOutputExtension` decides: `.mts` becomes `.mjs`, `.cts` becomes
 * `.cjs`, `.ts` becomes `.js`, and `.tsx` becomes `.jsx` under
 * `jsx: preserve` (`preserveJsx`) and `.js` otherwise.
 */
export function emittedPath(file: string, preserveJsx: boolean): string {
	if (preserveJsx && file.endsWith(".tsx")) {
		return `${file.slice(0, -".tsx".length)}.jsx`;
	}
	return file.replace(
		/\.(?:([cm])ts|tsx?)$/u,
		(_extension, flavor: string | undefined) => `.${flavor ?? ""}js`,
	);
}

/** TS18003, "No inputs were found": only the options are read, not the file list. */
const NO_INPUTS = 18003;

/**
 * Whether the project's `tsconfig.json`, the one at its root that `tsc -p`
 * compiles (`extends` followed), sets `jsx: preserve`, under which TypeScript
 * emits a `.tsx` file as `.jsx`. A project with no `tsconfig.json` does not.
 * A config TypeScript cannot read is refused, since the extension would then
 * be a guess.
 */
export function preservesJsx(projectRoot: string): boolean {
	const configFile = join(projectRoot, "tsconfig.json");
	if (!existsSync(configFile)) return false;
	const problems: ts.Diagnostic[] = [];
	const parsed = ts.getParsedCommandLineOfConfigFile(configFile, undefined, {
		...ts.sys,
		readDirectory: () => [],
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
			problems.push(diagnostic);
		},
	});
	problems.push(
		...(parsed?.errors ?? []).filter(
			(diagnostic) => diagnostic.code !== NO_INPUTS,
		),
	);
	if (parsed === undefined || problems.length > 0) {
		const messages = problems.map(
			(diagnostic) =>
				`TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
		);
		throw new CodegenError(
			"HOBO_CODEGEN_SOURCE_PARSE",
			`Cannot read tsconfig.json, whose jsx option decides the file a .tsx source is emitted to: ${messages.join("; ")}`,
			{ file: "tsconfig.json", problems: messages },
		);
	}
	return parsed.options.jsx === ts.JsxEmit.Preserve;
}
