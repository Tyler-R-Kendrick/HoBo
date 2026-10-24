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

/**
 * TS5083 and TS5012, "Cannot read file", and TS6053, "File not found": a
 * config the tsconfig extends that TypeScript cannot read or find.
 */
const UNREADABLE = new Set([5083, 5012, 6053]);

/**
 * TS6046, "Argument for '--x' option must be", and TS5024, "Compiler option
 * 'x' requires a value of type": an option value TypeScript does not accept.
 */
const INVALID_VALUE = new Set([6046, 5024]);

/**
 * Whether a problem TypeScript reports reading a tsconfig leaves its `jsx`
 * unknown: a syntax error (TypeScript numbers those from 1000 to 1999) or a
 * config it cannot read or find, either of which can drop the `jsx` that
 * config holds, or a `jsx` value it does not accept. An option, or an option
 * value, that it does not know leaves `jsx` as read.
 */
function leavesJsxUnknown(diagnostic: ts.Diagnostic): boolean {
	if (diagnostic.code >= 1000 && diagnostic.code < 2000) return true;
	if (UNREADABLE.has(diagnostic.code)) return true;
	return (
		INVALID_VALUE.has(diagnostic.code) &&
		/'(?:--)?jsx'/u.test(
			ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
		)
	);
}

/**
 * Whether the project's `tsconfig.json`, the one at its root that `tsc -p`
 * compiles (`extends` followed), sets `jsx: preserve`, under which TypeScript
 * emits a `.tsx` file as `.jsx`. A project with no `tsconfig.json` does not.
 * The cli reads it with its own TypeScript, which can be older than the
 * project's and not know a newer `target` or option. Of the options only `jsx`
 * changes the emitted extension, so a tsconfig is refused only when its `jsx`
 * is unknown (`leavesJsxUnknown`), since the extension would then be a guess.
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
	problems.push(...(parsed?.errors ?? []).filter(leavesJsxUnknown));
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
