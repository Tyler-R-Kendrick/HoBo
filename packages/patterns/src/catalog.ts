import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { PatternManifest } from "./_generated/patterns_pb.js";
import { canonicalJson, parsePatternManifest } from "./parse.js";

export type PatternCatalog = {
	readonly root: string;
	readonly digest: string;
	readonly patterns: readonly PatternManifest[];
};

function walk(dir: string): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir).sort()) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			out.push(...walk(full));
		} else if (name === "pattern.json") {
			out.push(full);
		}
	}
	return out;
}

export function defaultCatalogRoot(): string {
	return join(dirname(fileURLToPath(import.meta.url)), "..", "patterns");
}

export function openUiStarterRoot(): string {
	return join(
		defaultCatalogRoot(),
		"starter",
		"code",
		"openui-astryx-bindle",
		"project",
	);
}

export function loadPatternCatalog(
	options: { readonly root?: string } = {},
): PatternCatalog {
	const root = options.root ?? defaultCatalogRoot();
	const files = walk(root);
	const patterns = files.map((file) => {
		const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
		const parsed = parsePatternManifest(raw);
		const dir = dirname(file);
		for (const rendering of parsed.renderings) {
			const body = join(dir, rendering.sourcePath);
			if (!existsSync(body)) {
				throw new Error(
					`${parsed.id}: missing rendering ${rendering.sourcePath}`,
				);
			}
			rendering.contentDigest = createHash("sha256")
				.update(readFileSync(body))
				.digest("hex");
		}
		parsed.contentDigest = createHash("sha256")
			.update(
				canonicalJson({
					id: parsed.id,
					version: parsed.version,
					renderings: parsed.renderings.map((item) => item.contentDigest),
				}),
			)
			.digest("hex");
		return parsed;
	});
	const digest = createHash("sha256")
		.update(
			canonicalJson(
				patterns.map((item) => ({
					id: item.id,
					version: item.version,
					digest: item.contentDigest,
				})),
			),
		)
		.digest("hex");
	return { root, digest, patterns };
}

export function readRenderingBody(
	catalog: PatternCatalog,
	pattern: PatternManifest,
	renderingId: string,
): string {
	const rendering = pattern.renderings.find(
		(item) => item.renderingId === renderingId,
	);
	if (!rendering) {
		throw new Error(`${pattern.id}: unknown rendering ${renderingId}`);
	}
	const file = walk(catalog.root).find((path) => {
		const dir = dirname(path);
		return (
			existsSync(join(dir, rendering.sourcePath)) &&
			relative(catalog.root, dir).split("/").every(Boolean) &&
			JSON.parse(readFileSync(path, "utf8")).id === pattern.id
		);
	});
	if (!file) {
		throw new Error(`${pattern.id}: catalog file missing`);
	}
	return readFileSync(join(dirname(file), rendering.sourcePath), "utf8");
}
