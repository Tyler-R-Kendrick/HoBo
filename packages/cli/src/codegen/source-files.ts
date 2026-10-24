import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { CodegenLayout } from "./types.js";

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
			if (/\.(ts|tsx|mts)$/.test(entry.name)) files.push(path);
		}
	}
	await visit(scanRoot);
	return files.sort();
}

/** A source file's project-relative path, with posix separators. */
export function projectPath(projectRoot: string, file: string): string {
	return relative(projectRoot, file).split("\\").join("/");
}
