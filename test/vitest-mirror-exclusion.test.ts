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
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";

import { testCategories } from "../scripts/lib/test-categories.ts";

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

/** What `support/read-vitest-configs.mts` reports for one config. */
interface TestOptions {
	readonly include?: readonly string[];
	readonly exclude?: readonly string[];
	readonly dir?: string;
	readonly root?: string;
	readonly projectsDeclared: boolean;
	readonly setupFiles?: readonly string[] | string;
	readonly globalSetup?: readonly string[] | string;
	readonly pool?: string;
	readonly isolate?: boolean;
	readonly testTimeout?: number;
	readonly hookTimeout?: number;
}

interface UserConfig {
	readonly config: string;
	readonly root?: string;
	readonly test: TestOptions;
}

/**
 * Every tracked config, read once in a child process under tsx, so a config
 * whose own directory's toolchain is not installed here (site/'s tsconfig
 * extends a package only site installs) still loads.
 */
const READ = (() => {
	let read: Promise<ReadonlyMap<string, UserConfig>> | undefined;
	return () => {
		read ??= new Promise((resolveRead, rejectRead) => {
			for (const config of CONFIGS) {
				// A config listed by git but absent here (a sparse checkout) is a
				// failure, not a pass: the guard cannot vouch for a file it did not read.
				if (!existsSync(path.join(ROOT, config))) {
					rejectRead(new Error(`${config} is tracked but not on disk`));
					return;
				}
			}
			const reader = spawnSync(
				process.execPath,
				[
					"--import",
					"tsx",
					path.join(ROOT, "test/support/read-vitest-configs.mts"),
					...CONFIGS.map((config) => path.join(ROOT, config)),
				],
				{
					cwd: ROOT,
					encoding: "utf8",
					env: { ...process.env, NODE_OPTIONS: "" },
					maxBuffer: 64 * 1024 * 1024,
				},
			);
			if (reader.status !== 0) {
				rejectRead(
					new Error(`reading the vitest configs failed:\n${reader.stderr}`),
				);
				return;
			}
			// SAFETY: the reader prints exactly one JSON list of UserConfig, one per config it was given.
			const configs = JSON.parse(reader.stdout) as readonly UserConfig[];
			resolveRead(
				new Map(
					configs.map((user) => [path.relative(ROOT, user.config), user]),
				),
			);
		});
		return read;
	};
})();

async function loadUserConfig(config: string): Promise<UserConfig> {
	const user = (await READ()).get(config);
	expect(user, `${config} was not read`).toBeDefined();
	// SAFETY: the assertion above fails the test when the reader did not report this config.
	return user as UserConfig;
}

async function load(config: string): Promise<Collection> {
	const user = await loadUserConfig(config);
	const test = user.test;
	expect(
		test.projectsDeclared,
		`${config} declares projects; this guard reads one collection per config`,
	).toBe(false);
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
		const root = (await loadUserConfig("vitest.config.ts")).test;
		const own = `${dir}/vitest.config.ts`;
		expect(CONFIGS).toContain(own);
		const test = (await loadUserConfig(own)).test;

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
		const root = (await loadUserConfig("vitest.config.ts")).test;
		const test = (await loadUserConfig(`${dir}/vitest.config.ts`)).test;
		expect(test.isolate).toBe(root.isolate);
	});
});

describe("the root lanes collect no test/mirror file", () => {
	// `scripts/run-tests.ts` lists each lane's files with `git ls-files` over
	// its globs. `contract-consumer` reaches `packages/` only through
	// `*.contract.test.ts`, and `contract-provider`'s `*provider*` globs only
	// `src/draft/` and the root `test/`: a package's mirror file may carry
	// `provider` in its name (hobo-vercel-api.provider.mirror.test.ts does).
	for (const rootOnly of [false, true]) {
		for (const [category, globs] of Object.entries(testCategories(rootOnly))) {
			it(`${category}${rootOnly ? " (--root-only)" : ""}`, () => {
				const listing = spawnSync("git", ["ls-files", "--", ...globs], {
					cwd: ROOT,
					encoding: "utf8",
					maxBuffer: 64 * 1024 * 1024,
				});
				expect(listing.status, listing.stderr).toBe(0);
				const mirror = listing.stdout
					.split("\n")
					.filter((file) => MIRROR_TEST.test(file));
				expect(mirror).toEqual([]);
			});
		}
	}
});
