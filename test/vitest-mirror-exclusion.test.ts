/**
 * The mirror lane's test files run under a package's `vitest.mirror.config.ts`
 * and nowhere else (ADR-0174, decision 3).
 *
 * A mirror test needs a started emulator: without `HOBO_MIRROR_URL` it fails at
 * import with `MIRROR_URL_REQUIRED`, by design. So every other vitest config in
 * the repository must leave `test/mirror/` out. The root coverage config and
 * the bare root config once did not, and `test:coverage` and `verify:extended`
 * went red on every machine without an emulator.
 *
 * The configs are read from `git ls-files`, so a config added later is checked
 * the day it lands. Each is imported and asked what vitest would collect:
 * its `include` (or vitest's default) minus its `exclude` (or the default),
 * relative to the directory it scans. A config named `vitest.config.*` is also
 * the one vitest finds by walking up from a package without its own, so it is
 * evaluated from every such package too.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function tracked(): readonly string[] {
	const listing = spawnSync("git", ["ls-files", "-z"], {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	expect(listing.status, `${listing.error ?? ""}${listing.stderr}`).toBe(0);
	return listing.stdout.split("\0").filter((file) => file !== "");
}

const FILES = tracked();
const VITEST_CONFIG = /(?:^|\/)vitest(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/u;
const DEFAULT_NAME = /(?:^|\/)vitest\.config\.[cm]?[jt]s$/u;
const MIRROR_CONFIG = /(?:^|\/)vitest\.mirror\.config\.ts$/u;
const MIRROR_TEST = /(?:^|\/)test\/mirror\/.*\.test\.[cm]?[jt]sx?$/u;

const CONFIGS = FILES.filter((file) => VITEST_CONFIG.test(file));
const MIRROR_TESTS = FILES.filter((file) => MIRROR_TEST.test(file));
const PACKAGE_DIRS = FILES.filter(
	(file) => path.posix.basename(file) === "package.json",
).map((file) => path.posix.dirname(file));

/** What a config collects, as vitest reads it. */
interface Collection {
	readonly dir: string;
	readonly include: readonly string[];
	readonly exclude: readonly string[];
}

interface TestOptions {
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
	readonly dir?: string;
	readonly root?: string;
	readonly projects?: unknown;
	readonly setupFiles?: unknown;
	readonly globalSetup?: unknown;
	readonly pool?: unknown;
	readonly isolate?: unknown;
	readonly testTimeout?: unknown;
	readonly hookTimeout?: unknown;
}

interface UserConfig {
	readonly root?: string;
	readonly test?: TestOptions;
}

async function loadUserConfig(config: string): Promise<UserConfig> {
	const absolute = path.join(ROOT, config);
	// A config listed by git but absent here (a sparse checkout) is a failure,
	// not a pass: the guard cannot vouch for a file it did not read.
	expect(existsSync(absolute), `${config} is tracked but not on disk`).toBe(
		true,
	);
	const module: { readonly default: unknown } = await import(
		pathToFileURL(absolute).href
	);
	const exported =
		module.default instanceof Function
			? await module.default({ command: "serve", mode: "test" })
			: await module.default;
	// SAFETY: a vitest config module's default export is a UserConfig; only `root` and `test` are read, and each reader checks what it uses.
	return (exported ?? {}) as UserConfig;
}

async function load(config: string): Promise<Collection> {
	const user = await loadUserConfig(config);
	const test = user.test ?? {};
	expect(
		test.projects,
		`${config} declares projects; this guard reads one collection per config`,
	).toBeUndefined();
	const own = path.posix.dirname(config);
	const base = test.dir ?? test.root ?? user.root;
	return {
		dir:
			base === undefined
				? own === "."
					? ""
					: own
				: path.relative(ROOT, path.resolve(ROOT, own, base)),
		include: test.include ?? configDefaults.include,
		exclude: test.exclude ?? configDefaults.exclude,
	};
}

function under(dir: string, file: string): string | undefined {
	if (dir === "") return file;
	return file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : undefined;
}

function collects(collection: Collection, dir: string, file: string): boolean {
	const relative = under(dir, file);
	if (relative === undefined) return false;
	return (
		collection.include.some((glob) => path.matchesGlob(relative, glob)) &&
		!collection.exclude.some((glob) => path.matchesGlob(relative, glob))
	);
}

/** The `vitest.config.*` vitest finds walking up from `dir`. */
function nearestDefaultConfig(dir: string): string | undefined {
	for (let at = dir; ; at = path.posix.dirname(at)) {
		const prefix = at === "." || at === "" ? "" : `${at}/`;
		const found = CONFIGS.find(
			(config) =>
				DEFAULT_NAME.test(config) &&
				config.startsWith(prefix) &&
				!config.slice(prefix.length).includes("/"),
		);
		if (found !== undefined) return found;
		if (at === "." || at === "") return undefined;
	}
}

/** Where `config` runs from: its own directory, and every package that walks up to it. */
function runsFrom(config: string, collection: Collection): readonly string[] {
	if (!DEFAULT_NAME.test(config)) return [collection.dir];
	const walkers = PACKAGE_DIRS.filter(
		(dir) =>
			MIRROR_TESTS.some((file) => under(dir === "." ? "" : dir, file)) &&
			nearestDefaultConfig(dir) === config,
	).map((dir) => (dir === "." ? "" : dir));
	return [...new Set([collection.dir, ...walkers])];
}

describe("only a vitest.mirror.config.ts collects test/mirror", () => {
	it("finds the lane's files and the configs to hold to it", () => {
		expect(MIRROR_TESTS.length).toBeGreaterThan(0);
		expect(CONFIGS.filter((config) => MIRROR_CONFIG.test(config))).not.toEqual(
			[],
		);
	});

	it("no other vitest config in the repository collects a test/mirror file", async () => {
		const collected: string[] = [];
		for (const config of CONFIGS.filter((name) => !MIRROR_CONFIG.test(name))) {
			const collection = await load(config);
			for (const dir of runsFrom(config, collection)) {
				for (const file of MIRROR_TESTS) {
					if (collects(collection, dir, file)) {
						collected.push(
							`${config} (run from ${dir === "" ? "the root" : dir}) collects ${file}`,
						);
					}
				}
			}
		}
		expect(collected).toEqual([]);
	});

	it("each vitest.mirror.config.ts collects its own package's test/mirror files", async () => {
		for (const config of CONFIGS.filter((name) => MIRROR_CONFIG.test(name))) {
			const collection = await load(config);
			const own = MIRROR_TESTS.filter(
				(file) => under(collection.dir, file) !== undefined,
			);
			expect(own, config).not.toEqual([]);
			for (const file of own) {
				expect(collects(collection, collection.dir, file), file).toBe(true);
			}
		}
	});
});

describe("a package with a mirror lane keeps the root config in its default lane", () => {
	const packages = CONFIGS.filter((config) => MIRROR_CONFIG.test(config)).map(
		(config) => path.posix.dirname(config),
	);

	it.each(
		packages,
	)("%s/vitest.config.ts merges the root config: its setup files, global setup, pool and timeouts", async (dir) => {
		const root = (await loadUserConfig("vitest.config.ts")).test ?? {};
		const own = `${dir}/vitest.config.ts`;
		expect(CONFIGS).toContain(own);
		const test = (await loadUserConfig(own)).test ?? {};

		expect(test.setupFiles).toEqual(root.setupFiles);
		expect(test.globalSetup).toEqual(root.globalSetup);
		expect(test.pool).toEqual(root.pool);
		expect(test.testTimeout).toEqual(root.testTimeout);
		expect(test.hookTimeout).toEqual(root.hookTimeout);
		expect(test.exclude).toEqual(
			expect.arrayContaining([...(root.exclude ?? [])]),
		);
	});

	it.each(
		packages.filter((dir) => dir.startsWith("packages/providers/")),
	)("%s/vitest.config.ts keeps the root's isolate setting", async (dir) => {
		const root = (await loadUserConfig("vitest.config.ts")).test ?? {};
		const test = (await loadUserConfig(`${dir}/vitest.config.ts`)).test ?? {};
		expect(test.isolate).toBe(root.isolate);
	});
});
