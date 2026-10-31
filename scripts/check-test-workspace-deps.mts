#!/usr/bin/env node
/**
 * Every workspace package a test loads must be built before the turbo task
 * that runs the test.
 *
 * turbo orders a task only on what `turbo.json` and `package.json` say. A test
 * that loads a sibling package — by name (`@hobo/runtime-local`) or by a
 * relative path into the sibling's directory
 * (`../../../runtimes/runtime-local/dist/actor-host/in-memory.js`) — passes
 * only when something else happened to build that sibling first, and fails on
 * a clean checkout or a filtered run. This check finds those imports.
 *
 * - Scope: the workspace packages under `packages/`, `examples/` and
 *   `src/draft/` that have the script for the task.
 * - Files: everything under a `test/`, `tests/` or `__tests__/` directory
 *   (fixtures and helpers included), `*.test.*` and `*.spec.*` anywhere, and
 *   `vitest*.config.*`. In a git repository only tracked files are read.
 * - Tasks: every test file runs under `test`; a file under
 *   `contracts/consumer/` or `contracts/provider/` also runs under
 *   `test:contract:consumer` / `test:contract:provider` where the package has
 *   that script. A test file another one in its package imports (a helper or
 *   fixture) also runs under every task of the files that import it, so a
 *   `test/` helper a `contracts/consumer/` test imports is checked under
 *   `test:contract:consumer` too. A file outside those paths that a test
 *   imports (`src/`, `services/`) is not read. Each task must have the sibling
 *   built (lib/turbo-task-graph).
 * - A type-only import counts only where the package's tsconfig compiles the
 *   file: anywhere else it is erased before the test runs.
 * - Imports are read from the syntax tree (lib/test-import-specifiers). A
 *   specifier computed at run time, and a `dist/` path built for a child
 *   process or a URL, cannot be read and are not checked.
 * - A declaration orders the sibling's build only with a `workspace:`
 *   specifier, unless pnpm's link-workspace-packages is on
 *   (lib/turbo-task-graph `orderedDependency`); a violation says how the
 *   package declared the sibling, and which file sets the setting or which
 *   default applies.
 * - Files git tracks that the checkout leaves out (a sparse checkout, or a
 *   submodule never initialised) cannot be read. The check names how many it
 *   skipped and passes with a warning; under `--strict`, or in CI (`CI` set,
 *   and not `0` or `false`), it fails instead.
 *
 * Fix one by declaring the sibling in `devDependencies` as `"workspace:*"`
 * where the test imports it by name, or, for a relative import (which needs no
 * declaration to resolve), by naming its build on the task:
 * `"@hobo/runtime#test": { "dependsOn": ["build", "@hobo/runtime-local#build"] }`.
 * A devDependency widens the package's own `build` and `typecheck`, and every
 * dependent's; a task override orders that task only.
 *
 * Usage: node --import tsx scripts/check-test-workspace-deps.mts [--json] [--strict] [--root <dir>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { GIT_OUTPUT_MAX_BUFFER } from "./lib/git-output.ts";
import {
	type ImportSpecifier,
	importSpecifiersOf,
} from "./lib/test-import-specifiers.mts";
import {
	type GraphPackage,
	type LinkWorkspacePackages,
	linkWorkspacePackages,
	orderedDependency,
	type TaskConfig,
	TurboTaskGraph,
	type WorkspaceIndex,
} from "./lib/turbo-task-graph.mts";

export interface Violation {
	/** The importing package's name. */
	readonly package: string;
	/** The test file, relative to the repository root. */
	readonly file: string;
	/** The turbo task that runs the file. */
	readonly task: string;
	/** The workspace package it reaches. */
	readonly imports: string;
	/** The specifier as written. */
	readonly specifier: string;
	/**
	 * Where the package declares the sibling in a field turbo orders and turbo
	 * does not count the declaration: the specifier, and why. Else undefined.
	 */
	readonly declared: string | undefined;
}

/** What a checkout leaves out, which the check cannot read. */
export interface Skipped {
	/** Tracked files the check reads that are not on disk (a sparse checkout, or deleted). */
	readonly files: readonly string[];
	/** Submodules with no checkout, none of whose files git lists. */
	readonly submodules: readonly string[];
}

export interface Report {
	readonly violations: readonly Violation[];
	readonly skipped: Skipped;
}

export interface CheckOptions {
	/** Repository-relative paths to read; by default git's tracked files, or a walk outside a repository. */
	readonly files?: readonly string[];
}

interface Manifest {
	readonly name?: string;
	readonly packageManager?: string;
	readonly scripts?: Readonly<Record<string, string>>;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly optionalDependencies?: Readonly<Record<string, string>>;
}

export interface WorkspacePackage extends GraphPackage {
	/** Repository-relative, `/`-separated. */
	readonly dir: string;
	/** Workspace packages it declares in an ordering field with a specifier turbo does not count, and why. */
	readonly unordered: ReadonlyMap<string, string>;
}

/** The workspace as turbo sees it. */
export interface Workspace {
	readonly packages: readonly WorkspacePackage[];
	readonly graph: TurboTaskGraph;
	readonly link: LinkWorkspacePackages;
}

const ORDERING_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
] as const;

const SCOPES = ["packages/", "examples/", "src/draft/"];
const CONTRACT_TASKS = [
	["contracts/consumer/", "test:contract:consumer"],
	["contracts/provider/", "test:contract:provider"],
] as const;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/u;
const TEST_NAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const VITEST_CONFIG = /^vitest[^/]*\.config\.[cm]?[jt]s$/u;
const TEST_DIRS = new Set(["test", "tests", "__tests__"]);
const WALK_SKIP = new Set([
	"node_modules",
	".git",
	"dist",
	"coverage",
	".turbo",
]);

function readJson<T>(path: string): T | undefined {
	try {
		// SAFETY: the callers read only the fields their type names, each optional.
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return undefined;
	}
}

function walk(root: string, dir = ""): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
		if (WALK_SKIP.has(entry.name)) continue;
		const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
		if (entry.isDirectory()) out.push(...walk(root, path));
		else if (entry.isFile()) out.push(path);
	}
	return out;
}

/**
 * git's tracked files (submodules' included) when `root` is a work tree's top,
 * else undefined; and the submodules that are not checked out.
 */
function trackedFiles(
	root: string,
): { files: string[]; submodules: string[] } | undefined {
	try {
		const git = (args: string[]) =>
			execFileSync("git", ["-C", root, ...args], {
				encoding: "utf8",
				maxBuffer: GIT_OUTPUT_MAX_BUFFER,
				stdio: ["ignore", "pipe", "ignore"],
			});
		if (
			realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !==
			realpathSync(root)
		)
			return undefined;
		const lines = (args: string[]) => git(args).split("\0").filter(Boolean);
		return {
			files: lines(["ls-files", "-z", "--recurse-submodules"]),
			// `<mode> <object> <stage>\t<path>`; a gitlink is mode 160000.
			submodules: lines(["ls-files", "-z", "--stage"])
				.filter((line) => line.startsWith("160000 "))
				.map((line) => line.slice(line.indexOf("\t") + 1))
				.filter((path) => !existsSync(join(root, path, ".git"))),
		};
	} catch {
		return undefined;
	}
}

/** The `packages:` globs of pnpm-workspace.yaml (`*` segments, as this repository writes them). */
function workspaceGlobs(root: string): string[][] {
	const globs: string[][] = [];
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
		if (match?.[1] && !match[1].startsWith("!"))
			globs.push(match[1].split("/"));
		else if (/^\S/u.test(line)) break;
	}
	return globs;
}

function matches(glob: readonly string[], dir: string): boolean {
	const parts = dir.split("/");
	return (
		glob.length === parts.length &&
		glob.every((part, i) => part === "*" || part === parts[i])
	);
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/** The workspace packages among `files`, their dependencies as turbo orders them, and the graph over them. */
export function readWorkspace(
	root: string,
	files: readonly string[],
): Workspace {
	const globs = workspaceGlobs(root);
	const listed = new Set(files);
	const found: { dir: string; manifest: Manifest }[] = [];
	for (const file of files) {
		if (!file.endsWith("/package.json")) continue;
		const dir = file.slice(0, -"/package.json".length);
		if (!globs.some((glob) => matches(glob, dir))) continue;
		const manifest = readJson<Manifest>(join(root, file));
		if (manifest?.name) found.push({ dir, manifest });
	}
	const link = linkWorkspacePackages({
		packageManager: readJson<Manifest>(join(root, "package.json"))
			?.packageManager,
		npmrc: readText(join(root, ".npmrc")),
		workspaceYaml: readText(join(root, "pnpm-workspace.yaml")),
	});
	const names = new Set(found.map((item) => item.manifest.name!));
	const atDir = new Map(found.map((item) => [item.dir, item.manifest.name!]));
	const packages = found.map(({ dir, manifest }): WorkspacePackage => {
		const index: WorkspaceIndex = {
			byName: (name) => (names.has(name) ? name : undefined),
			// From the dependent's directory, else (as turbo also tries) from the root.
			byPath: (path) =>
				atDir.get(posix.normalize(posix.join(dir, path))) ??
				atDir.get(posix.normalize(path)),
			inside: (path) => {
				const target = posix.normalize(posix.join(dir, path));
				return (
					posix.isAbsolute(path) ||
					(target !== ".." && !target.startsWith("../"))
				);
			},
		};
		const dependencies: string[] = [];
		const unordered = new Map<string, string>();
		for (const field of ORDERING_FIELDS)
			for (const [key, specifier] of Object.entries(manifest[field] ?? {})) {
				if (!specifier.startsWith("workspace:") && !names.has(key)) continue;
				const ordered = orderedDependency(key, specifier, link, index);
				if (ordered.target !== undefined) dependencies.push(ordered.target);
				else if (names.has(key)) unordered.set(key, ordered.reason);
			}
		return {
			name: manifest.name!,
			dir,
			scripts: new Set(Object.keys(manifest.scripts ?? {})),
			dependencies,
			unordered,
			tasks: listed.has(`${dir}/turbo.json`)
				? readJson<{ tasks?: Record<string, TaskConfig> }>(
						join(root, dir, "turbo.json"),
					)?.tasks
				: undefined,
		};
	});
	const graph = new TurboTaskGraph(
		new Map(packages.map((pkg) => [pkg.name, pkg])),
		readJson<{ tasks?: Record<string, TaskConfig> }>(join(root, "turbo.json"))
			?.tasks ?? {},
	);
	return { packages, graph, link };
}

/** Whether `path` (relative to its package) is a test file, a test helper or a vitest config. */
function isTestFile(path: string): boolean {
	if (!SOURCE.test(path) || path.endsWith(".d.ts")) return false;
	const parts = path.split("/");
	const name = parts.at(-1)!;
	return (
		(parts.length === 1 && VITEST_CONFIG.test(name)) ||
		TEST_NAME.test(name) ||
		parts.slice(0, -1).some((part) => TEST_DIRS.has(part))
	);
}

/** The tasks that run `path` (relative to its package) by where it is, or none. */
function tasksRunning(path: string, scripts: ReadonlySet<string>): string[] {
	if (!isTestFile(path)) return [];
	const config = !path.includes("/") && VITEST_CONFIG.test(path);
	const tasks = scripts.has("test") ? ["test"] : [];
	for (const [prefix, task] of CONTRACT_TASKS)
		if ((config || path.includes(prefix)) && scripts.has(task))
			tasks.push(task);
	return tasks;
}

const RESOLVE_SUFFIXES = [
	"",
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".mjs",
	".cjs",
	".jsx",
	"/index.ts",
	"/index.tsx",
	"/index.js",
];

/** The listed file a relative import of `path` loads: as written, its TypeScript source, or with an extension or `/index` added. */
function resolveLocal(
	path: string,
	files: ReadonlySet<string>,
): string | undefined {
	const source = path.replace(/\.([cm]?)js(x?)$/u, ".$1ts$2");
	for (const base of source === path ? [path] : [source, path])
		for (const suffix of RESOLVE_SUFFIXES)
			if (files.has(base + suffix)) return base + suffix;
	return undefined;
}

function isRelative(specifier: string): boolean {
	return (
		specifier === "." ||
		specifier === ".." ||
		specifier.startsWith("./") ||
		specifier.startsWith("../")
	);
}

/** Whether the package's tsconfig compiles `file` (an absolute path). */
function compiledBy(
	root: string,
	pkg: WorkspacePackage,
	cache: Map<string, Set<string>>,
	file: string,
): boolean {
	let names = cache.get(pkg.dir);
	if (names === undefined) {
		names = new Set<string>();
		const dir = join(root, pkg.dir);
		const configPath = join(dir, "tsconfig.json");
		const read = ts.readConfigFile(configPath, ts.sys.readFile);
		if (read.config !== undefined)
			for (const name of ts.parseJsonConfigFileContent(
				read.config,
				ts.sys,
				dir,
				undefined,
				configPath,
			).fileNames)
				names.add(resolve(name));
		cache.set(pkg.dir, names);
	}
	return names.has(resolve(file));
}

/** The violations under `root` (see the header). */
export function checkTestWorkspaceDeps(
	root: string,
	options: CheckOptions = {},
): Violation[] {
	return [...scanTestWorkspaceDeps(root, options).violations];
}

/** The tracked files under a workspace package that the check reads and that are not on disk. */
function missingFiles(
	root: string,
	files: readonly string[],
	isPackageDir: (dir: string) => boolean,
): string[] {
	const missing = files.filter(
		(file) =>
			(SOURCE.test(file) ||
				file.endsWith("/package.json") ||
				file.endsWith("/turbo.json")) &&
			!existsSync(join(root, file)),
	);
	if (missing.length === 0) return [];
	const dirs = files
		.filter((file) => file.endsWith("/package.json"))
		.map((file) => file.slice(0, -"/package.json".length))
		.filter(isPackageDir)
		.sort((a, b) => b.length - a.length);
	return missing.filter((file) => {
		const dir = dirs.find((item) => file.startsWith(`${item}/`));
		if (dir === undefined) return false;
		const path = file.slice(dir.length + 1);
		return (
			path === "package.json" ||
			path === "turbo.json" ||
			(SCOPES.some((scope) => dir.startsWith(scope)) && isTestFile(path))
		);
	});
}

/** The violations under `root`, and what the checkout left out (see the header). */
export function scanTestWorkspaceDeps(
	root: string,
	options: CheckOptions = {},
): Report {
	const tracked = options.files === undefined ? trackedFiles(root) : undefined;
	const files = options.files ?? tracked?.files ?? walk(root);
	const globs = workspaceGlobs(root);
	const skipped: Skipped = {
		files: missingFiles(root, files, (dir) =>
			globs.some((glob) => matches(glob, dir)),
		),
		submodules: tracked?.submodules ?? [],
	};
	const { packages, graph } = readWorkspace(root, files);
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const byDir = [...packages].sort((a, b) => b.dir.length - a.dir.length);
	const owner = (path: string) =>
		byDir.find((pkg) => path === pkg.dir || path.startsWith(`${pkg.dir}/`));
	const tsconfigs = new Map<string, Set<string>>();
	const listed = new Set(files);
	const sources = new Map<string, ImportSpecifier[]>();
	const specifiersOf = (file: string): ImportSpecifier[] => {
		let found = sources.get(file);
		if (found === undefined) {
			let source = "";
			try {
				source = readFileSync(join(root, file), "utf8");
			} catch {
				// An unreadable file names nothing.
			}
			found = importSpecifiersOf(source, file);
			sources.set(file, found);
		}
		return found;
	};
	const loads = (pkg: WorkspacePackage, file: string, typeOnly: boolean) =>
		!typeOnly || compiledBy(root, pkg, tsconfigs, join(root, file));
	// The test files each task runs: by where a file is, and a test file
	// (a helper or fixture) inherits every task of the test files in its own
	// package that import it.
	const running = new Map<string, Set<string>>();
	for (const file of files) {
		const pkg = owner(file);
		if (pkg === undefined || !SCOPES.some((scope) => pkg.dir.startsWith(scope)))
			continue;
		const tasks = tasksRunning(file.slice(pkg.dir.length + 1), pkg.scripts);
		if (tasks.length > 0) running.set(file, new Set(tasks));
	}
	const queue = [...running.keys()];
	while (queue.length > 0) {
		const file = queue.pop()!;
		const pkg = owner(file)!;
		const tasks = running.get(file)!;
		for (const { specifier, typeOnly } of specifiersOf(file)) {
			if (!isRelative(specifier)) continue;
			const local = resolveLocal(
				posix.normalize(posix.join(posix.dirname(file), specifier)),
				listed,
			);
			if (
				local === undefined ||
				owner(local) !== pkg ||
				!isTestFile(local.slice(pkg.dir.length + 1)) ||
				!loads(pkg, file, typeOnly)
			)
				continue;
			const inherited = running.get(local) ?? new Set<string>();
			const before = inherited.size;
			for (const task of tasks) inherited.add(task);
			running.set(local, inherited);
			if (inherited.size > before) queue.push(local);
		}
	}
	const seen = new Set<string>();
	const violations: Violation[] = [];
	for (const [file, tasks] of running) {
		const pkg = owner(file)!;
		for (const { specifier, typeOnly } of specifiersOf(file)) {
			let target: WorkspacePackage | undefined;
			if (isRelative(specifier))
				target = owner(
					posix.normalize(posix.join(posix.dirname(file), specifier)),
				);
			else {
				const parts = specifier.split("/");
				target = byName.get(
					specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!,
				);
			}
			if (target === undefined || target === pkg) continue;
			if (!loads(pkg, file, typeOnly)) continue;
			const needed = graph.needsBuilt(target.name);
			for (const task of tasks) {
				const built = graph.buildsBefore(pkg.name, task);
				if (needed.every((name) => built.has(name))) continue;
				const key = `${file}\0${task}\0${target.name}\0${specifier}`;
				if (seen.has(key)) continue;
				seen.add(key);
				violations.push({
					package: pkg.name,
					file,
					task,
					imports: target.name,
					specifier,
					declared: pkg.unordered.get(target.name),
				});
			}
		}
	}
	const order = (item: Violation) =>
		`${item.file}\0${item.task}\0${item.imports}\0${item.specifier}`;
	violations.sort((a, b) =>
		order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0,
	);
	return { violations, skipped };
}

/** Whether `CI` names a CI run: set, and not empty, `0` or `false`. */
export function inCi(ci: string | undefined): boolean {
	return ci !== undefined && !["", "0", "false"].includes(ci.toLowerCase());
}

/** What the CLI says about a checkout's left-out files, as `warning` or, failing, `error`. */
export function skippedLines(
	skipped: Skipped,
	level: "warning" | "error",
): string[] {
	const lines: string[] = [];
	const { files, submodules } = skipped;
	if (files.length > 0) {
		const one = files.length === 1;
		const more = files.length > 5 ? ` and ${files.length - 5} more` : "";
		lines.push(
			`${level}: ${files.length} tracked ${one ? "file this check reads is" : "files this check reads are"} not checked out, so it skipped ${one ? "it" : "them"}: ${files.slice(0, 5).join(", ")}${more} (git sparse-checkout disable checks ${one ? "it" : "them"} out)`,
		);
	}
	if (submodules.length > 0) {
		const one = submodules.length === 1;
		lines.push(
			`${level}: ${submodules.length} ${one ? "submodule is" : "submodules are"} not checked out, so none of ${one ? "its" : "their"} files were read: ${submodules.join(", ")} (pnpm run pins:fetch checks ${one ? "it" : "them"} out)`,
		);
	}
	if (lines.length > 0 && level === "warning")
		lines.push(
			"warning: this pass covers only what is checked out; --strict, or CI=1, fails instead",
		);
	return lines;
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
	const strict = args.includes("--strict") || inCi(process.env.CI);
	const { violations, skipped } = scanTestWorkspaceDeps(root);
	if (args.includes("--json"))
		process.stdout.write(
			`${JSON.stringify({ violations, skipped }, null, "\t")}\n`,
		);
	else
		for (const item of violations)
			process.stderr.write(
				item.declared === undefined
					? `${item.file}: ${item.package}#${item.task} loads ${item.imports} (${item.specifier}), and turbo builds it after; declare it in devDependencies with "workspace:*" if the test imports it by name, else add "${item.imports}#build" to "${item.package}#${item.task}".dependsOn in turbo.json\n`
					: `${item.file}: ${item.package}#${item.task} loads ${item.imports} (${item.specifier}), and turbo builds it after: ${item.package} declares it as ${item.declared}; write "workspace:*"\n`,
			);
	const lines = skippedLines(skipped, strict ? "error" : "warning");
	for (const line of lines) process.stderr.write(`${line}\n`);
	process.exitCode =
		violations.length === 0 && (!strict || lines.length === 0) ? 0 : 1;
}
