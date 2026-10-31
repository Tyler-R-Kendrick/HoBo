/**
 * Reaches into another workspace package that a file makes at run time, by a
 * path it assembles rather than an import the reader can follow, and the
 * registry that declares what each one needs.
 *
 * A path the file assembles (lib/test-import-specifiers `ModuleFacts.paths`)
 * names package P where, from its start, a computed root (`*`), `..` or
 * `node_modules`, it continues with P's directory, P's package name, or a run
 * of P's directory's trailing segments: `packages/runtimes/runtime-local` is
 * named by `../../runtimes/runtime-local` and `*`/`runtime-local` alike. The
 * file reaches P at run time when the path:
 * - goes on into `dist/` (`join(dir, "packages", "hobo", "dist", "bin",
 *   "hobo.js")`, `"../../bindles/dist/index.js"`); or
 * - ends at P's directory or name, in a file that runs or loads something by a
 *   computed path (`spawn`, `import()` of a non-literal, `createRequire`,
 *   `symlink`, `new Worker`): `join(root, "packages", "adapters",
 *   "adapter-hono")` linked into a generated app.
 *
 * A path that goes on into P's tracked source, or its `node_modules`, needs no
 * build of P and is not a reach; nor is one that names P only in the middle of
 * another directory (`…/s0-04-protobuf-cue-codegen/packages/schema-tools`).
 *
 * The check cannot see what such a reach loads, so an undeclared one fails.
 * A declaration in `scripts/test-deps-runtime-reaches.json` says what the file
 * needs built, `{ "from": "<file>", "needs": ["<package>#build"], "why": "…" }`,
 * and the check holds every test task that loads the file to those builds.
 */
import { z } from "zod";

import type { ModuleFacts } from "./test-import-specifiers.mts";

/** The registry, relative to the repository root. */
export const RUNTIME_REACHES_FILE = "scripts/test-deps-runtime-reaches.json";

export interface PackageDir {
	readonly name: string;
	/** Repository-relative, `/`-separated. */
	readonly dir: string;
}

/** Where a path may start naming a package: its start, a computed root, `..`, or `node_modules`. */
const ANCHORS = new Set(["*", "..", "node_modules"]);

/** The packages a file reaches at run time, each with one path that names it. */
export function runtimeReaches(
	facts: ModuleFacts,
	packages: readonly PackageDir[],
): Map<string, string> {
	const reached = new Map<string, string>();
	// Each way a path can name a package, and whether it may end there: its
	// directory, its name, and each run of its directory's trailing segments
	// (`runtimes/runtime-local`, `runtime-local`), as a path relative to a
	// sibling or to the packages directory reads it.
	const names = packages.flatMap((pkg) => {
		const dir = pkg.dir.split("/");
		return [
			{ name: pkg.name, parts: dir, whole: dir.length > 1 },
			{ name: pkg.name, parts: pkg.name.split("/"), whole: true },
			...dir
				.slice(1)
				.map((_, k) => ({
					name: pkg.name,
					parts: dir.slice(k + 1),
					whole: false,
				})),
		];
	});
	for (const text of facts.paths) {
		const parts = text
			.split(/[\\/]/u)
			.filter((part) => part !== "" && part !== ".");
		parts.forEach((_, i) => {
			if (i > 0 && !ANCHORS.has(parts[i - 1]!)) return;
			for (const { name, parts: named, whole } of names) {
				if (!named.every((part, j) => parts[i + j] === part)) continue;
				const next = parts[i + named.length];
				if (
					next === "dist" ||
					(next === undefined && whole && facts.loadsComputed)
				)
					if (!reached.has(name)) reached.set(name, text);
			}
		});
	}
	return reached;
}

const RuntimeReachSchema = z.object({
	from: z.string(),
	needs: z.array(z.string()),
	why: z.string().trim().min(1),
});

export type RuntimeReach = z.infer<typeof RuntimeReachSchema>;

const RegistrySchema = z.object({ reaches: z.array(z.json()) });

/** The registry's declarations, and what is wrong with its shape. */
export interface RuntimeReachRegistry {
	readonly reaches: readonly RuntimeReach[];
	readonly problems: readonly string[];
}

/** The registry's declarations, parsed from its text; absent text declares nothing. */
export function parseRuntimeReaches(
	text: string | undefined,
): RuntimeReachRegistry {
	if (text === undefined) return { reaches: [], problems: [] };
	let json: z.core.util.JSONType;
	try {
		json = z.json().parse(JSON.parse(text));
	} catch (error) {
		return { reaches: [], problems: [`is not JSON: ${String(error)}`] };
	}
	const registry = RegistrySchema.safeParse(json);
	if (!registry.success)
		return { reaches: [], problems: ['has no "reaches" list'] };
	const reaches: RuntimeReach[] = [];
	const problems: string[] = [];
	registry.data.reaches.forEach((entry, i) => {
		const parsed = RuntimeReachSchema.safeParse(entry);
		if (parsed.success) reaches.push(parsed.data);
		else
			problems.push(
				`entry ${i} is not { "from": string, "needs": string[], "why": string }`,
			);
	});
	return { reaches, problems };
}
