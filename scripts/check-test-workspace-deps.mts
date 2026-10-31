#!/usr/bin/env node
/**
 * Every workspace package a package's tests import must be one the package
 * declares.
 *
 * turbo builds a package's dependencies before its tests (`test` depends on
 * `^build`), and it knows them only from `package.json`. A test that imports a
 * sibling the package does not declare — by name (`@hobo/runtime-local`) or by
 * a relative path into the sibling's directory
 * (`../../../runtimes/runtime-local/dist/actor-host/in-memory.js`) — passes
 * only when something else happened to build that sibling first, and fails on
 * a clean checkout or a filtered run. This check finds those imports.
 *
 * Usage: node --import tsx scripts/check-test-workspace-deps.mts [--json] [--root <dir>]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export interface Violation {
	/** The importing package's name. */
	readonly package: string;
	/** The test file, relative to the repository root. */
	readonly file: string;
	/** The workspace package it reaches. */
	readonly imports: string;
	/** The specifier as written. */
	readonly specifier: string;
}

interface WorkspacePackage {
	readonly name: string;
	readonly dir: string;
	readonly declared: ReadonlySet<string>;
}

/** The `packages:` globs of pnpm-workspace.yaml (only the `*` forms this repository uses). */
function workspaceGlobs(root: string): string[] {
	const globs: string[] = [];
	let inPackages = false;
	for (const line of readFileSync(
		join(root, "pnpm-workspace.yaml"),
		"utf8",
	).split("\n")) {
		if (line.startsWith("packages:")) {
			inPackages = true;
			continue;
		}
		if (!inPackages) continue;
		const match = /^\s+-\s+["']?([^"'\s]+)["']?\s*$/u.exec(line);
		if (match?.[1]) globs.push(match[1]);
		else if (/^\S/u.test(line)) break;
	}
	return globs;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function expand(root: string, glob: string): string[] {
	let candidates = [root];
	for (const part of glob.split("/")) {
		const next: string[] = [];
		for (const base of candidates) {
			if (part !== "*") {
				if (isDirectory(join(base, part))) next.push(join(base, part));
				continue;
			}
			let names: string[] = [];
			try {
				names = readdirSync(base);
			} catch {
				continue;
			}
			for (const name of names)
				if (name !== "node_modules" && isDirectory(join(base, name)))
					next.push(join(base, name));
		}
		candidates = next;
	}
	return candidates;
}

/** The fields of a package.json this check reads. */
interface Manifest {
	readonly name?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
	readonly optionalDependencies?: Readonly<Record<string, string>>;
}

/** A directory's package.json, or undefined where it has none or it does not parse. */
function manifestOf(dir: string): Manifest | undefined {
	try {
		// SAFETY: a workspace package.json is an object whose dependency fields map names to specifiers; only those fields and `name` are read.
		return JSON.parse(
			readFileSync(join(dir, "package.json"), "utf8"),
		) as Manifest;
	} catch {
		return undefined;
	}
}

function workspacePackages(root: string): WorkspacePackage[] {
	const found = new Map<string, WorkspacePackage>();
	for (const glob of workspaceGlobs(root))
		for (const dir of expand(root, glob)) {
			const manifest = manifestOf(dir);
			if (!manifest?.name) continue;
			const declared = new Set<string>([
				...Object.keys(manifest.dependencies ?? {}),
				...Object.keys(manifest.devDependencies ?? {}),
				...Object.keys(manifest.peerDependencies ?? {}),
				...Object.keys(manifest.optionalDependencies ?? {}),
			]);
			found.set(dir, { name: manifest.name, dir, declared });
		}
	return [...found.values()];
}

const SKIP = new Set([
	"node_modules",
	"dist",
	"coverage",
	".turbo",
	"fixtures",
]);

/** Test files of a package: anything under test/ or tests/, and *.test.* / *.spec.* anywhere else. */
function testFiles(dir: string, inTests = false): string[] {
	const out: string[] = [];
	let entries: string[] = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const name of entries) {
		if (SKIP.has(name)) continue;
		const path = join(dir, name);
		let stats;
		try {
			stats = statSync(path);
		} catch {
			continue;
		}
		if (stats.isDirectory()) {
			// A nested workspace package is its own package.
			if (statSafe(join(path, "package.json"))) continue;
			out.push(
				...testFiles(path, inTests || name === "test" || name === "tests"),
			);
			continue;
		}
		if (!/\.(?:[cm]?[jt]sx?)$/u.test(name)) continue;
		if (inTests || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name)) out.push(path);
	}
	return out;
}

function statSafe(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * The import specifiers of a file: static and type imports, re-exports,
 * side-effect imports, `import()` and `require()`. TypeScript's own scanner
 * reads them, so text inside a comment, a string or a template literal is not
 * an import (runtime-local's tests hold a Bindle's source, imports and all, in
 * a template literal).
 */
export function specifiersOf(source: string): string[] {
	return ts
		.preProcessFile(source, true, true)
		.importedFiles.map((file) => file.fileName);
}

/**
 * The builds the root turbo.json orders before a package's tasks by name
 * (`"@hobo/runtime#test": { "dependsOn": ["build", "@hobo/runtime-local#build"] }`).
 * That is how a test reaches a sibling that cannot be a dependency because the
 * sibling already depends on the package (a cycle turbo refuses).
 */
function turboTaskBuilds(root: string): Map<string, Set<string>> {
	const ordered = new Map<string, Set<string>>();
	let config: { tasks?: Record<string, { dependsOn?: string[] }> };
	try {
		// SAFETY: the root turbo.json is turbo's own schema; only `tasks.<key>.dependsOn` (string arrays) is read.
		config = JSON.parse(
			readFileSync(join(root, "turbo.json"), "utf8"),
		) as typeof config;
	} catch {
		return ordered;
	}
	for (const [key, task] of Object.entries(config.tasks ?? {})) {
		const at = key.lastIndexOf("#");
		if (at <= 0) continue;
		const owner = key.slice(0, at);
		for (const dependency of task.dependsOn ?? []) {
			const match = /^(.+)#build$/u.exec(dependency);
			if (!match?.[1]) continue;
			const set = ordered.get(owner) ?? new Set<string>();
			set.add(match[1]);
			ordered.set(owner, set);
		}
	}
	return ordered;
}

/**
 * The violations under `root`, for the production packages (those under
 * `packages/`, as `check-package-boundaries.mts` scopes itself): a test of one
 * that reaches a workspace package it neither declares nor has built first by
 * name in turbo.json.
 */
export function checkTestWorkspaceDeps(root: string): Violation[] {
	const packages = workspacePackages(root);
	const ordered = turboTaskBuilds(root);
	const production = join(root, "packages");
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const byDir = [...packages].sort((a, b) => b.dir.length - a.dir.length);
	const owner = (path: string) =>
		byDir.find(
			(pkg) => path === pkg.dir || path.startsWith(`${pkg.dir}${sep}`),
		);
	const violations: Violation[] = [];
	for (const pkg of packages.filter((item) =>
		item.dir.startsWith(`${production}${sep}`),
	))
		for (const file of testFiles(pkg.dir)) {
			for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
				let target: WorkspacePackage | undefined;
				if (specifier.startsWith(".")) {
					const reached = owner(resolve(dirname(file), specifier));
					if (reached && reached !== pkg) target = reached;
				} else {
					const parts = specifier.split("/");
					const name = specifier.startsWith("@")
						? parts.slice(0, 2).join("/")
						: parts[0]!;
					const named = byName.get(name);
					if (named && named !== pkg) target = named;
				}
				if (
					target &&
					!pkg.declared.has(target.name) &&
					!ordered.get(pkg.name)?.has(target.name)
				)
					violations.push({
						package: pkg.name,
						file: relative(root, file),
						imports: target.name,
						specifier,
					});
			}
		}
	return violations.sort(
		(a, b) =>
			a.package.localeCompare(b.package) ||
			a.file.localeCompare(b.file) ||
			a.specifier.localeCompare(b.specifier),
	);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const args = process.argv.slice(2);
	const rootArg = args.indexOf("--root");
	const root =
		rootArg >= 0 && args[rootArg + 1]
			? resolve(args[rootArg + 1]!)
			: join(dirname(fileURLToPath(import.meta.url)), "..");
	const violations = checkTestWorkspaceDeps(root);
	if (args.includes("--json"))
		process.stdout.write(`${JSON.stringify({ violations }, null, "\t")}\n`);
	else
		for (const item of violations)
			process.stderr.write(
				`${item.file}: ${item.package} imports ${item.imports} (${item.specifier}) but does not declare it in package.json; turbo will not build it before these tests\n`,
			);
	process.exitCode = violations.length === 0 ? 0 : 1;
}
