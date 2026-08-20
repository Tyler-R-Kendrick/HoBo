/**
 * Coverage lane. Deliberately separate from `vitest.config.ts`, which keeps
 * `coverage: { enabled: false }` so the ordinary test lanes stay fast.
 *
 * Scoped to first-party package sources. The root config's default discovery
 * also sweeps in `external/` (vendored projects that are not ours),
 * `src/draft/` (proof material with its own gates), `site/`, and generated
 * `.optimizexp/` feature suites — measuring those as if they were HoBo package
 * coverage would report a number that means nothing.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Resolve every workspace package to its `src` entrypoint for the coverage lane.
 *
 * Without this the reported number is badly wrong — understated, not inflated.
 * Workspace packages publish `exports` pointing at `dist/`, so a cross-package
 * import executes the built JavaScript. Coverage instruments `src/**` with
 * `all: true`, which loads every un-executed source file to give it a zero
 * baseline. A file whose logic ran *via dist* never merges with its `src` entry,
 * so it lands in that zero baseline and reports ~0% despite being exercised.
 *
 * Measured on `packages/testing`: **47.2% without this alias map, 91.0% with
 * it** — identical tests, identical 142 passing assertions. `pact-chaos.ts`
 * alone went 0.7% → 92.8%.
 *
 * This matters beyond a nicer number: chasing the un-aliased figure would mean
 * writing duplicate tests for code that is already covered, which is worse than
 * doing nothing.
 *
 * Only the bare specifier is aliased, and it is matched with an anchored regex
 * rather than a string. A string alias in Vite is a *prefix* match, so
 * `"@hobo/core"` also swallows `@hobo/core/total-access` and rewrites it to
 * `packages/core/src/index.ts/total-access` — that mistake failed 301 test
 * files here before the anchor was added. Subpath imports must keep resolving
 * through the package's own `exports` map, because mapping a subpath to a
 * source file is the package's business, not this config's.
 */
function workspaceSrcAliases(): { find: RegExp; replacement: string }[] {
	const aliases: { find: RegExp; replacement: string }[] = [];
	const roots = [path.join(root, "packages")];
	while (roots.length > 0) {
		const dir = roots.pop() as string;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		if (entries.includes("package.json")) {
			const manifest = path.join(dir, "package.json");
			let name: string | undefined;
			try {
				name = JSON.parse(readFileSync(manifest, "utf8")).name;
			} catch {
				name = undefined;
			}
			const entry = ["src/index.ts", "src/index.tsx"]
				.map((candidate) => path.join(dir, candidate))
				.find((candidate) => existsSync(candidate));
			if (name?.startsWith("@hobo/") && entry !== undefined)
				aliases.push({
					find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
					replacement: entry,
				});
			continue;
		}
		for (const entry of entries)
			if (!entry.startsWith(".") && entry !== "node_modules")
				roots.push(path.join(dir, entry));
	}
	return aliases;
}

export default defineConfig({
	resolve: { alias: workspaceSrcAliases() },
	test: {
		environment: "node",
		isolate: false,
		fileParallelism: true,
		pool: "threads",
		globalSetup: [
			fileURLToPath(
				new URL(
					"./packages/runtimes/runtime-wasm/test/wasmtime-global-setup.ts",
					import.meta.url,
				),
			),
		],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		reporters: ["dot"],
		include: ["packages/**/test/**/*.test.ts"],
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.optimizexp/**",
			// Live lanes: these fail by design when their binary or toolchain is
			// absent, which is a deliberate "no silent skip" policy, not coverage.
			"**/test/live-*.test.ts",
			"**/*.integration.test.ts",
			// Asserts that a bindle importing an *uninstalled* workspace package
			// surfaces BindleImportError rather than a confusing "no bindle". Its
			// premise is a module that cannot resolve, and this lane's alias map
			// (above) deliberately makes every workspace package resolvable from
			// anywhere — so the import succeeds and the expected throw never
			// happens. Excluded here only; it runs in every other lane, which is
			// where that behaviour actually needs proving.
			"packages/cli/test/loader.test.ts",
		],
		coverage: {
			enabled: true,
			provider: "v8",
			all: true,
			include: ["packages/*/src/**/*.ts", "packages/*/*/src/**/*.ts"],
			exclude: [
				"**/*.test.ts",
				"**/dist/**",
				"**/node_modules/**",
				"**/*.d.ts",
				"**/_generated/**",
			],
			reporter: ["text-summary", "json-summary"],
			reportsDirectory: "./.coverage",
			/**
			 * A ratchet, not a target.
			 *
			 * Measured 2026-08-20 over 765 files / 8,528 tests, with the workspace
			 * src alias map above in place:
			 * statements 79.57%, branches 67.29%, functions 84.50%, lines 80.96%.
			 *
			 * Before the alias map the same suite reported 77.74 / 65.84 / 82.27 /
			 * 79.12. Nothing was tested that was not tested before — those points
			 * came from correcting attribution, not from new assertions.
			 *
			 * These thresholds sit a hair under the measured numbers so the lane
			 * fails on *regression* while the climb continues. Lines and functions
			 * are over the 80% goal; statements is 0.4 short; branches is the real
			 * work at 67.29%.
			 *
			 * Set at the measured line rather than at the goal deliberately, for the
			 * reason the Stryker configs already give: a gate nobody can pass gets
			 * deleted, not met. Raise each number as the real one improves; never
			 * lower one to make a red build green.
			 *
			 * Branches are the long pole, and the leverage is concentrated rather
			 * than spread: `packages/code` is 15,445 statements, and pixel-village,
			 * ci-guard, camps and control-yard all sit well under the average.
			 */
			thresholds: {
				statements: 79.5,
				branches: 67,
				functions: 84,
				lines: 80.5,
			},
		},
	},
});
