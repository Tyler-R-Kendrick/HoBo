import { readFile } from "node:fs/promises";
import path from "node:path";

import { type ManifestV1, parseManifest } from "@hobo/bindles";

// Resolve the Bindle manifest a project-scoped cloud verb operates on. The
// mocked lane reads the project's `hobo.bindle.json` and parses it into a
// ManifestV1 via @hobo/bindles (the same parser the Yard gateway hashes). A
// missing or non-manifest file surfaces as `null` so the caller can fall back to
// the shell stub rather than throwing an internal error.

export const BINDLE_MANIFEST_FILE = "hobo.bindle.json";

export async function loadProjectManifest(
	projectDir: string,
): Promise<ManifestV1 | null> {
	let raw: string;
	try {
		raw = await readFile(path.join(projectDir, BINDLE_MANIFEST_FILE), "utf8");
	} catch {
		return null;
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	try {
		return parseManifest(json);
	} catch {
		return null;
	}
}

export function deploymentIdFor(projectDir: string): string {
	const base = path
		.basename(projectDir)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-");
	return base.length > 0 ? base : "hobo-deployment";
}
