import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
	type BindleDefinition,
	type CollectionContext,
	type CollectionTarget,
	collectBindleManifest,
	type ManifestV1,
} from "@hobo/bindles";

import { BindleImportError } from "../shell/errors.js";

// The TypeScript-source bindle loader (docs/plans/0006 item 3-1). It
// materializes the collection target the cloud verbs operate on from the
// project's own `src/bindle.ts` (the flagship authoring flow the site
// teaches), instead of requiring a hand-written `hobo.bindle.json`. The
// compiled JSON stays the committed artifact — `loadProjectManifest` still
// prefers it — so this loader is the source path, not a second format.

// Candidate module locations, preferred order: a built artifact first (no
// TS loader needed), then the TS source (importable when the process runs
// under a TS-aware loader, e.g. `node --import tsx` — the repo's own lanes).
export const BINDLE_SOURCE_CANDIDATES = [
	"dist/bindle.js",
	"dist/src/bindle.js",
	"src/bindle.js",
	"src/bindle.mjs",
	"src/bindle.ts",
	"src/bindle.mts",
	// The try-site catalog convention (examples/try-site/apps/<id>/app.ts):
	// same `export default bindle(...)` shape, so the CLI deploys the exact
	// apps the GitHub Pages Examples console shows. bindle.* stays preferred.
	"dist/app.js",
	"app.js",
	"app.mjs",
	"app.ts",
	"app.mts",
] as const;

export const DEFAULT_COMPONENT_HOST = {
	kind: "wasmtime",
	version: "46.0.1",
} as const;

// Import the project's bindle module and return its BindleDefinition, or null
// when the project has no bindle source, the module cannot be imported in this
// process (e.g. a .ts source without a TS loader), or the default export is
// not a bindle() definition. Null means "fall back", never "crash the verb".
export async function loadBindleDefinition(
	projectDir: string,
): Promise<BindleDefinition | null> {
	for (const candidate of BINDLE_SOURCE_CANDIDATES) {
		const absolute = path.join(projectDir, candidate);
		if (!existsSync(absolute)) {
			continue;
		}

		let module: Record<string, unknown>;
		try {
			module = (await import(pathToFileURL(absolute).href)) as Record<
				string,
				unknown
			>;
		} catch (error) {
			if (isUncompiledTypeScript(candidate, error)) {
				continue;
			}
			throw new BindleImportError(absolute, error);
		}

		const definition = (module.default ?? module.bindle) as unknown;
		return isBindleDefinition(definition) ? definition : null;
	}

	return null;
}

function isUncompiledTypeScript(candidate: string, error: unknown): boolean {
	if (!/\.(ts|mts)$/u.test(candidate)) return false;
	const message = error instanceof Error ? error.message : String(error);
	return /ERR_UNKNOWN_FILE_EXTENSION|Unknown file extension|\.ts['"]/u.test(
		message,
	);
}

function isBindleDefinition(value: unknown): value is BindleDefinition {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const candidate = value as {
		name?: unknown;
		resources?: unknown;
		edges?: unknown;
	};
	return (
		typeof candidate.name === "string" &&
		candidate.name.length > 0 &&
		candidate.resources !== null &&
		typeof candidate.resources === "object" &&
		Array.isArray(candidate.edges)
	);
}

// Component-shaped kinds compile to manifest components (service.v1); the
// rest are backing resources the components bind to.
const COMPONENT_KINDS = new Set(["api", "web", "service"]);

// The wiring layer's `data()` paradigm string for each backing-resource kind.
const DATA_PARADIGM: Record<string, string> = {
	data: "relational",
	kv: "key-value",
	bucket: "object",
	queue: "queue",
	topic: "topic",
	secret: "secret",
};

// Adapt a bindle() definition into the CollectionTarget run-to-collect runs.
// Backing resources are declared first so component bind maps can reference
// their handles; component→component edges (e.g. web dependsOn api) are
// app-level dependencies that ride outside the manifest bind map, exactly as
// the static compile treats them.
export function targetFromBindleDefinition(
	definition: BindleDefinition,
	componentHost: {
		readonly kind: string;
		readonly version: string;
	} = DEFAULT_COMPONENT_HOST,
): CollectionTarget {
	return {
		bindleId: definition.name,
		componentHost,
		define(collect: CollectionContext): void {
			const backing = new Map<string, ReturnType<CollectionContext["data"]>>();

			for (const [name, record] of Object.entries(definition.resources)) {
				if (COMPONENT_KINDS.has(record.kind)) {
					continue;
				}
				backing.set(
					name,
					collect.data(name, {
						paradigm: DATA_PARADIGM[record.kind] ?? record.kind,
					}),
				);
			}

			for (const [name, record] of Object.entries(definition.resources)) {
				if (!COMPONENT_KINDS.has(record.kind)) {
					continue;
				}
				const bind: Record<string, ReturnType<CollectionContext["data"]>> = {};
				for (const edge of definition.edges) {
					if (edge.from !== name) {
						continue;
					}
					const handle = backing.get(edge.to);
					if (handle) {
						bind[edge.to] = handle;
					}
				}
				collect.service(name, Object.keys(bind).length > 0 ? { bind } : {});
			}
		},
	};
}

// Load the project's bindle source and adapt it to a CollectionTarget, or
// null when no loadable bindle source exists.
export async function loadProjectCollectionTarget(
	projectDir: string,
): Promise<CollectionTarget | null> {
	const definition = await loadBindleDefinition(projectDir);
	return definition === null ? null : targetFromBindleDefinition(definition);
}

// Compile the project's TS-source bindle straight to the manifest IR the
// cloud verbs parse — the same run-to-collect fold the static compile uses,
// so the hash is identical to `hobo collect` output for the same source.
export async function compileProjectManifest(
	projectDir: string,
): Promise<ManifestV1 | null> {
	const target = await loadProjectCollectionTarget(projectDir);
	if (target === null) {
		return null;
	}
	try {
		return collectBindleManifest(target).manifest;
	} catch {
		return null;
	}
}
