import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { create } from "@bufbuild/protobuf";
import { digest, normalizePath, normalizeText } from "./text.js";
import {
	type CodegenArtifact,
	type DriftEntry,
	DriftEntrySchema,
} from "./types.js";

// Generated-tree operations: write an artifact set into a project (clearing
// the roots the engine owns first), and diff a project's on-disk tree against
// an expected artifact set for the drift gate.

export async function writeGeneratedTree(
	projectRoot: string,
	artifacts: readonly CodegenArtifact[],
	generatedRoots: readonly string[],
): Promise<void> {
	for (const root of generatedRoots) {
		await rm(join(projectRoot, root), { recursive: true, force: true });
	}

	const sorted = [...artifacts].sort((left, right) =>
		left.path.localeCompare(right.path),
	);
	for (const artifact of sorted) {
		const target = join(projectRoot, artifact.path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, normalizeText(artifact.content));
	}
}

export async function compareGeneratedTree(
	projectRoot: string,
	artifacts: readonly CodegenArtifact[],
	generatedRoots: readonly string[],
): Promise<readonly DriftEntry[]> {
	const expected = new Map(
		artifacts.map((artifact) => [
			normalizePath(artifact.path),
			normalizeText(artifact.content),
		]),
	);
	const actual = await readGeneratedTree(projectRoot, generatedRoots);
	const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
	const drift: DriftEntry[] = [];

	for (const path of paths) {
		const expectedContent = expected.get(path);
		const actualContent = actual.get(path);
		if (expectedContent === undefined) {
			drift.push(
				create(DriftEntrySchema, {
					path,
					status: "extra",
					actualDigest: digest(actualContent ?? ""),
				}),
			);
			continue;
		}
		if (actualContent === undefined) {
			drift.push(
				create(DriftEntrySchema, {
					path,
					status: "missing",
					expectedDigest: digest(expectedContent),
				}),
			);
			continue;
		}
		if (actualContent !== expectedContent) {
			drift.push(
				create(DriftEntrySchema, {
					path,
					status: "changed",
					expectedDigest: digest(expectedContent),
					actualDigest: digest(actualContent),
				}),
			);
		}
	}

	return drift;
}

async function readGeneratedTree(
	projectRoot: string,
	generatedRoots: readonly string[],
): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	for (const root of generatedRoots) {
		const absoluteRoot = join(projectRoot, root);
		if (!existsSync(absoluteRoot)) continue;
		for (const path of await listFiles(absoluteRoot)) {
			const fullPath = join(absoluteRoot, path);
			files.set(
				normalizePath(join(root, path)),
				normalizeText(await readFile(fullPath, "utf8")),
			);
		}
	}
	return files;
}

async function listFiles(root: string): Promise<readonly string[]> {
	const files: string[] = [];

	async function visit(directory: string): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			files.push(relative(root, path).replace(/\\/g, "/"));
		}
	}

	await visit(root);
	return files.sort();
}
