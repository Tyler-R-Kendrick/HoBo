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
		const dir = roots.pop();
		if (dir === undefined) {
			continue;
		}
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
		/**
		 * Isolated, unlike the fast lanes. `isolate: false` was a speed
		 * optimization, and in this lane it bought nondeterminism: two
		 * consecutive full runs of the same commit produced 253 and then 66
		 * failures, with cross-file pathologies like one test fetching another
		 * test file's server out of the shared module registry. A measurement
		 * lane whose failure set is a coin flip corrupts both signals it exists
		 * to produce — the failures are noise, and every flaked file's source
		 * drags the coverage number it was supposed to certify. Package-scoped
		 * runs pass with and without isolation, so the sharing only ever paid
		 * at full scale, which is exactly where it broke. The ordinary lanes
		 * keep their speed; this one buys back determinism.
		 */
		isolate: true,
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
		// Every test file gets a throwaway HOBO_HOME, so a test that omits an
		// explicit one cannot write into the developer's real ~/.hobo -- and, for
		// this lane especially, cannot *read* state an earlier file left there.
		// See test/setup/isolate-hobo-home.ts for the incident that prompted it: a
		// clean run left 33 files under ~/.hobo/durable, including an auth session
		// written by a test whose whole assertion was that `auth --help` prints a
		// help page.
		//
		// Even isolated, files race through one real ~/.hobo unless each gets
		// its own -- and, until this line came back, this was the only lane
		// without the guard.
		setupFiles: [
			fileURLToPath(new URL("./test/setup/isolate-hobo-home.ts", import.meta.url)),
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
			/**
			 * Write the report even when tests fail.
			 *
			 * The default is `false`, which means a single failing test anywhere in
			 * the workspace suppresses the coverage report entirely -- not the
			 * thresholds, the *report*. That is backwards for a ratchet: the moment
			 * you most need to know where coverage stands is when something is
			 * broken, and a lane that answers "no number" is indistinguishable from
			 * one that was never run.
			 *
			 * It cost this campaign five full runs, each ~25 minutes, that produced
			 * no summary at all. The thresholds below still fail the build; this
			 * only stops the measurement being thrown away with it.
			 */
			reportOnFailure: true,
			reportsDirectory: "./.coverage",
			/**
			 * A ratchet, not a target.
			 *
			 * Measured 2026-08-20 with the workspace src alias map above in place:
			 * statements 80.00%, branches 67.83%, functions 84.80%, lines 81.40%.
			 *
			 * Where those points came from, in order:
			 *   77.74 / 65.84 / 82.27 / 79.12  starting point
			 *   79.57 / 67.29 / 84.50 / 80.96  after the alias map — same tests,
			 *                                  corrected attribution, no new assertions
			 *   80.00 / 67.83 / 84.80 / 81.40  after new suites for genuinely
			 *                                  untested modules (layout-model,
			 *                                  netbird-api, ci-guard parse/
			 *                                  fixture-runner/workflows)
			 *
			 * Statements, functions and lines now clear the 80% goal. Branches do
			 * not, and that is the honest remaining work — see below.
			 *
			 * Set at the measured line rather than at the goal deliberately, for the
			 * reason the Stryker configs already give: a gate nobody can pass gets
			 * deleted, not met. Raise each number as the real one improves; never
			 * lower one to make a red build green.
			 *
			 * Branches at 67.83% are the long pole and a genuine programme of work,
			 * not an afternoon: ~7,000 uncovered branches remain. The leverage is
			 * concentrated rather than spread — `packages/code` is 15,445 statements
			 * on its own, and pixel-village, camps and control-yard all sit well
			 * under the average. Attack those before anything else.
			 */
			thresholds: {
				statements: 80.2,
				branches: 68.9,
				functions: 85.2,
				lines: 81.7,

				/**
				 * Per-package floors, so the repo-wide aggregate cannot hide a
				 * package sitting at 40%.
				 *
				 * Without these, adding well-covered code to a healthy package
				 * offsets a regression in a weak one and the single global number
				 * never moves. Each floor is that package's own measured coverage
				 * on 2026-08-20, minus two points -- enough slack to absorb harmless
				 * churn, tight enough to catch a real drop.
				 *
				 * These are a ratchet, not a target. The goal remains 80% on every
				 * metric everywhere; the floors below record where each package
				 * actually stands so the climb is monotonic. Raise one when its real
				 * number improves. Never lower one to make a red build green -- if a
				 * package genuinely needs to shed coverage, that is a conversation,
				 * not a config edit.
				 *
				 * Packages under 50 statements are not gated: the percentages swing
				 * too far on a single line to mean anything.
				 */
				"packages/adapters/**": { statements: 85, branches: 75, functions: 94, lines: 87 },
				"packages/auth-md/**": { statements: 85, branches: 79, functions: 81, lines: 86 },
				"packages/bindings/**": { statements: 94, branches: 89, functions: 95, lines: 94 },
				"packages/bindles/**": { statements: 74, branches: 65, functions: 79, lines: 75 },
				"packages/broker/**": { statements: 76, branches: 65, functions: 84, lines: 77 },
				"packages/camps/**": { statements: 60, branches: 50, functions: 70, lines: 62 },
				"packages/capability-matrix/**": { statements: 85, branches: 60, functions: 91, lines: 87 },
				"packages/capability-profiles/**": { statements: 86, branches: 74, functions: 98, lines: 89 },
				"packages/ci-guard/**": { statements: 84, branches: 77, functions: 93, lines: 83 },
				"packages/claims/**": { statements: 87, branches: 81, functions: 96, lines: 90 },
				"packages/cli/**": { statements: 80, branches: 62, functions: 92, lines: 81 },
				"packages/cloud/**": { statements: 86, branches: 72, functions: 88, lines: 88 },
				"packages/code/**": { statements: 75, branches: 63, functions: 81, lines: 77 },
				"packages/componentize/**": { statements: 88, branches: 73, functions: 93, lines: 88 },
				"packages/conformance/**": { statements: 78, branches: 66, functions: 84, lines: 78 },
				"packages/connectivity/**": { statements: 71, branches: 60, functions: 76, lines: 74 },
				"packages/connectors/**": { statements: 86, branches: 78, functions: 84, lines: 86 },
				"packages/contract-harness/**": { statements: 86, branches: 85, functions: 98, lines: 85 },
				"packages/contracts/**": { statements: 83, branches: 70, functions: 86, lines: 83 },
				"packages/control-api/**": { statements: 78, branches: 68, functions: 81, lines: 80 },
				"packages/control-yard/**": { statements: 59, branches: 35, functions: 63, lines: 60 },
				"packages/convex/**": { statements: 74, branches: 53, functions: 71, lines: 79 },
				"packages/core/**": { statements: 88, branches: 78, functions: 91, lines: 89 },
				"packages/data/**": { statements: 72, branches: 59, functions: 69, lines: 73 },
				"packages/data-postgres/**": { statements: 84, branches: 73, functions: 94, lines: 85 },
				"packages/dispatcher/**": { statements: 83, branches: 67, functions: 92, lines: 84 },
				"packages/evals/**": { statements: 90, branches: 89, functions: 94, lines: 91 },
				"packages/events/**": { statements: 83, branches: 70, functions: 87, lines: 85 },
				"packages/fuzz/**": { statements: 87, branches: 77, functions: 91, lines: 90 },
				"packages/hobo/**": { statements: 76, branches: 61, functions: 81, lines: 77 },
				"packages/iac/**": { statements: 70, branches: 59, functions: 77, lines: 70 },
				"packages/identity/**": { statements: 80, branches: 66, functions: 84, lines: 81 },
				"packages/junctions/**": { statements: 95, branches: 90, functions: 98, lines: 95 },
				"packages/kv-redis-compatible/**": { statements: 85, branches: 73, functions: 90, lines: 92 },
				"packages/management/**": { statements: 77, branches: 53, functions: 83, lines: 80 },
				"packages/manifest-capability/**": { statements: 93, branches: 89, functions: 95, lines: 93 },
				"packages/manifest-declaration/**": { statements: 96, branches: 94, functions: 98, lines: 96 },
				"packages/manifest-plan/**": { statements: 94, branches: 88, functions: 98, lines: 95 },
				"packages/manifest-request/**": { statements: 96, branches: 92, functions: 98, lines: 96 },
				"packages/manifest-round-trip/**": { statements: 94, branches: 91, functions: 98, lines: 98 },
				"packages/mcp/**": { statements: 95, branches: 85, functions: 96, lines: 97 },
				"packages/packs/**": { statements: 82, branches: 76, functions: 90, lines: 82 },
				"packages/patterns/**": { statements: 73, branches: 61, functions: 77, lines: 75 },
				"packages/pixel-village/**": { statements: 46, branches: 41, functions: 48, lines: 46 },
				"packages/policy/**": { statements: 82, branches: 76, functions: 91, lines: 82 },
				"packages/providers/provider-aws/**": { statements: 87, branches: 69, functions: 92, lines: 88 },
				"packages/providers/provider-ax/**": { statements: 88, branches: 55, functions: 98, lines: 95 },
				"packages/providers/provider-azure/**": { statements: 89, branches: 73, functions: 93, lines: 90 },
				"packages/providers/provider-browser-wasm/**": { statements: 74, branches: 71, functions: 78, lines: 75 },
				"packages/providers/provider-cloudflare/**": { statements: 80, branches: 67, functions: 83, lines: 80 },
				"packages/providers/provider-convex/**": { statements: 86, branches: 76, functions: 93, lines: 87 },
				"packages/providers/provider-digitalocean/**": { statements: 77, branches: 64, functions: 84, lines: 79 },
				"packages/providers/provider-flux/**": { statements: 79, branches: 74, functions: 98, lines: 79 },
				"packages/providers/provider-gcp/**": { statements: 87, branches: 72, functions: 90, lines: 88 },
				"packages/providers/provider-hetzner/**": { statements: 82, branches: 66, functions: 87, lines: 85 },
				"packages/providers/provider-hostinger/**": { statements: 87, branches: 70, functions: 92, lines: 88 },
				"packages/providers/provider-kafka/**": { statements: 80, branches: 64, functions: 84, lines: 81 },
				"packages/providers/provider-kubernetes/**": { statements: 81, branches: 70, functions: 90, lines: 81 },
				"packages/providers/provider-lakebed/**": { statements: 76, branches: 55, functions: 70, lines: 76 },
				"packages/providers/provider-neon/**": { statements: 84, branches: 73, functions: 93, lines: 86 },
				"packages/providers/provider-netlify/**": { statements: 60, branches: 52, functions: 57, lines: 61 },
				"packages/providers/provider-prisma-postgres/**": { statements: 86, branches: 77, functions: 96, lines: 87 },
				"packages/providers/provider-railway/**": { statements: 82, branches: 68, functions: 82, lines: 83 },
				"packages/providers/provider-ttl-sh/**": { statements: 91, branches: 87, functions: 91, lines: 91 },
				"packages/providers/provider-upstash/**": { statements: 84, branches: 76, functions: 87, lines: 85 },
				"packages/providers/provider-vercel/**": { statements: 81, branches: 73, functions: 78, lines: 82 },
				"packages/providers/provider-webernetes/**": { statements: 82, branches: 74, functions: 88, lines: 85 },
				"packages/providers/runner-blacksmith/**": { statements: 88, branches: 79, functions: 92, lines: 88 },
				"packages/providers/runner-depot/**": { statements: 80, branches: 73, functions: 87, lines: 80 },
				"packages/providers/runner-github/**": { statements: 82, branches: 78, functions: 87, lines: 83 },
				"packages/recipes/**": { statements: 89, branches: 82, functions: 95, lines: 90 },
				"packages/registry/**": { statements: 93, branches: 86, functions: 98, lines: 94 },
				"packages/replay/**": { statements: 82, branches: 71, functions: 80, lines: 85 },
				"packages/rift/**": { statements: 68, branches: 52, functions: 80, lines: 70 },
				"packages/runtime/**": { statements: 81, branches: 71, functions: 81, lines: 80 },
				"packages/runtimes/**": { statements: 70, branches: 55, functions: 74, lines: 70 },
				"packages/schema-tools/**": { statements: 75, branches: 63, functions: 86, lines: 77 },
				"packages/sdk/**": { statements: 96, branches: 89, functions: 98, lines: 96 },
				"packages/stage-gate/**": { statements: 62, branches: 57, functions: 70, lines: 63 },
				"packages/stations/**": { statements: 85, branches: 78, functions: 93, lines: 86 },
				"packages/status-page/**": { statements: 92, branches: 82, functions: 91, lines: 93 },
				"packages/storage-sqlite/**": { statements: 69, branches: 60, functions: 81, lines: 70 },
				"packages/testing/**": { statements: 89, branches: 81, functions: 94, lines: 91 },
				"packages/trails/**": { statements: 84, branches: 74, functions: 91, lines: 85 },
				"packages/training/**": { statements: 93, branches: 80, functions: 98, lines: 96 },
				"packages/training-pipeline/**": { statements: 92, branches: 85, functions: 94, lines: 93 },
				"packages/trust/**": { statements: 89, branches: 87, functions: 87, lines: 89 },
				"packages/wasp/**": { statements: 80, branches: 73, functions: 87, lines: 85 },
				"packages/wit/**": { statements: 76, branches: 63, functions: 77, lines: 76 },
				"packages/yard-world/**": { statements: 87, branches: 80, functions: 88, lines: 89 },
				"packages/yards/**": { statements: 87, branches: 84, functions: 88, lines: 87 },
			},
		},
	},
});
