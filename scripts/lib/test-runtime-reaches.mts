/**
 * Reaches into another workspace package that a file makes at run time, by a
 * path it assembles rather than an import the reader can follow, and the
 * registry that declares what each one needs.
 *
 * A path the file assembles (lib/test-import-specifiers `ModuleFacts.paths`)
 * names package P where, from its start, a computed root (`*`), `..` or
 * `node_modules`, it continues with P's directory, P's package name, or a run
 * of P's directory's trailing segments: `packages/runtimes/runtime-local` is
 * named by `../../runtimes/runtime-local` and `*`/`runtime-local` alike. A
 * path that starts `./` or `../` is also read from the file's directory, as
 * `new URL(…, import.meta.url)` resolves it: from `packages/cli/test/`,
 * `../../core` is `packages/core`. The file reaches P at run time when the
 * path:
 * - goes on into `dist/` (`join(dir, "packages", "hobo", "dist", "bin",
 *   "hobo.js")`, `"../../bindles/dist/index.js"`); or
 * - ends at P's directory or name, or goes on into a computed segment
 *   (`join(hoboDir, file)`), in a file that runs or loads something by a
 *   computed path (`spawn`, `import()` of a non-literal, `createRequire`,
 *   `symlink`, `new Worker`): `join(root, "packages", "adapters",
 *   "adapter-hono")` linked into a generated app, or
 *   `new URL("../../hobo", import.meta.url)` linked into a temporary root. It
 *   ends at P where it names P in more than one segment (`packages/hobo`,
 *   `@hobo/hobo`, `runtimes/runtime-local`), right after `..`, or by P's name
 *   right after `node_modules`. One segment after a computed root
 *   (`join(evidence, "events")`) is a name, not a path to P.
 *
 * A path that names a package by a computed segment reaches a package the
 * check cannot name, and counts the same way: a directory that holds workspace
 * packages (`packages`, `packages/runtimes`, or `runtimes` after an anchor) or
 * a scope they are under (`@hobo`), then a computed segment, then `dist/`, the
 * end, or another computed segment (`join(root, "packages", name, "dist")`,
 * `` `node_modules/@hobo/${name}` ``, `` new URL(`../../${name}`, …) ``).
 * `join(root, "packages", name, "package.json")` reads a tracked file and does
 * not count.
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
import { posix } from "node:path";

import { z } from "zod";

import { COMPUTED, type ModuleFacts } from "./test-import-specifiers.mts";

/** The registry, relative to the repository root. */
export const RUNTIME_REACHES_FILE = "scripts/test-deps-runtime-reaches.json";

export interface PackageDir {
	readonly name: string;
	/** Repository-relative, `/`-separated. */
	readonly dir: string;
}

/** What a file reaches at run time through the paths it assembles. */
export interface RuntimeReaches {
	/** Each package a path names, with the first path that names it. */
	readonly named: ReadonlyMap<string, string>;
	/** The first path that names a package by a computed segment, if one does. */
	readonly computed: string | undefined;
}

/** One way a path names a package, or a directory or scope that holds packages. */
interface Form {
	/** The package; undefined for a group of packages. */
	readonly name: string | undefined;
	readonly parts: readonly string[];
	/** It is the package's name, not its directory. */
	readonly byName: boolean;
	/** A group that may start a path: a whole directory, or a scope. */
	readonly whole: boolean;
}

/** The literal segments after which a path may start naming a package; a computed one is one too. */
const ANCHORS = new Set(["..", "node_modules"]);

const isComputed = (part: string | undefined) =>
	part?.includes(COMPUTED) === true;

/** A path as the check reports it: each computed part reads `*`. */
export const shownPath = (text: string) => text.replaceAll(COMPUTED, "*");

const segments = (path: string) =>
	path.split(/[\\/]/u).filter((part) => part !== "" && part !== ".");

/** The segments of `text`, and, where it starts `./` or `../`, of it read from `file`'s directory. */
function readings(text: string, file: string): string[][] {
	const own = segments(text);
	if (!/^\.\.?(?:[\\/]|$)/u.test(text)) return [own];
	const resolved = posix.join(posix.dirname(file), text.replaceAll("\\", "/"));
	return resolved === ".." || resolved.startsWith("../")
		? [own]
		: [own, segments(resolved)];
}

/** Reads what a file reaches at run time, against these workspace packages. */
export function runtimeReachReader(
	packages: readonly PackageDir[],
): (facts: ModuleFacts, file: string) => RuntimeReaches {
	// Each way a path can name a package: its directory, its name, and each
	// run of its directory's trailing segments (`runtimes/runtime-local`,
	// `runtime-local`), as a path relative to a sibling or to the packages
	// directory reads it. And each group: the directory that holds a package,
	// each run of that one's trailing segments, and its name's scope.
	const forms = new Map<string, Form[]>();
	const add = (form: Form) => {
		const first = form.parts[0]!;
		forms.set(first, [...(forms.get(first) ?? []), form]);
	};
	const groups = new Map<string, boolean>();
	const group = (parts: readonly string[], whole: boolean) => {
		const key = parts.join("/");
		groups.set(key, whole || groups.get(key) === true);
	};
	for (const { name, dir } of packages) {
		const parts = dir.split("/");
		add({ name, parts, byName: false, whole: false });
		add({ name, parts: name.split("/"), byName: true, whole: false });
		parts.slice(1).forEach((_, k) => {
			add({ name, parts: parts.slice(k + 1), byName: false, whole: false });
		});
		const holder = parts.slice(0, -1);
		holder.forEach((_, k) => {
			group(holder.slice(k), k === 0);
		});
		if (name.startsWith("@") && name.includes("/"))
			group([name.slice(0, name.indexOf("/"))], true);
	}
	for (const [key, whole] of groups)
		add({ name: undefined, parts: key.split("/"), byName: false, whole });
	return (facts, file) => {
		const named = new Map<string, string>();
		let computed: string | undefined;
		for (const text of facts.paths)
			for (const parts of readings(text, file))
				parts.forEach((part, i) => {
					const anchor = parts[i - 1];
					if (
						anchor !== undefined &&
						!isComputed(anchor) &&
						!ANCHORS.has(anchor)
					)
						return;
					for (const form of forms.get(part) ?? []) {
						if (!form.parts.every((item, j) => parts[i + j] === item)) continue;
						const next = parts[i + form.parts.length];
						if (form.name === undefined) {
							// A group, then a package it computes, then what of that package.
							if ((anchor === undefined && !form.whole) || !isComputed(next))
								continue;
							const then = parts[i + form.parts.length + 1];
							if (
								then === "dist" ||
								((then === undefined || isComputed(then)) &&
									facts.loadsComputed)
							)
								computed ??= text;
							continue;
						}
						// Where a path that stops here is a path to the package.
						const ends =
							form.parts.length > 1 ||
							anchor === ".." ||
							(anchor === "node_modules" && form.byName);
						if (
							next === "dist" ||
							((next === undefined || isComputed(next)) &&
								ends &&
								facts.loadsComputed)
						)
							if (!named.has(form.name)) named.set(form.name, text);
					}
				});
		return { named, computed };
	};
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
