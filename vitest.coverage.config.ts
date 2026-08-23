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
		// Every test file gets a throwaway HOBO_HOME, so a test that omits an
		// explicit one cannot write into the developer's real ~/.hobo.
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
				 *
				 * Picking what to cover next: rank files by *uncovered branches in
				 * a full-package run*, reading `.coverage/coverage-summary.json`
				 * after `vitest run --config vitest.coverage.config.ts <package>`.
				 *
				 * Do not rank by running one module's own test file and measuring
				 * that. It answers a different question -- "what does this file's
				 * dedicated test reach" -- and files with wide incidental coverage
				 * from elsewhere look far emptier than they are. Measured cost of
				 * getting this wrong: `harness-session-view.ts` read 86/255 under
				 * its own test alone and 160 new tests took it to 239/255, but the
				 * package moved 78.00 -> 78.06. Nearly all of those arms were
				 * already reached by other suites. The same tranche's per-file
				 * figures overstated package yield by roughly twenty to one.
				 */
				"packages/adapters/**": { statements: 91, branches: 84, functions: 97, lines: 93 },
				"packages/auth-md/**": { statements: 87, branches: 80, functions: 83, lines: 88 },
				"packages/bindings/**": { statements: 94, branches: 89, functions: 95, lines: 94 },
				"packages/bindles/**": { statements: 86, branches: 80, functions: 90, lines: 87 },
				"packages/broker/**": { statements: 87, branches: 80, functions: 92, lines: 87 },
				"packages/camps/**": { statements: 99, branches: 98, functions: 100, lines: 100 },
				"packages/capability-matrix/**": { statements: 97, branches: 83, functions: 97, lines: 99 },
				"packages/capability-profiles/**": { statements: 92, branches: 82, functions: 100, lines: 93 },
				"packages/ci-guard/**": { statements: 93, branches: 91, functions: 95, lines: 93 },
				"packages/claims/**": { statements: 87, branches: 81, functions: 96, lines: 90 },
				"packages/cli/**": { statements: 91, branches: 80, functions: 98, lines: 91 },
				"packages/cloud/**": { statements: 91, branches: 80, functions: 92, lines: 91 },
				// functions is 88.4 rather than 88.5 on purpose. 88.5 was set from a
				// single reading of 2366/2673; two consecutive full runs since then
				// both measure 2365, so one function in this package is covered
				// non-deterministically and 88.5 is not reliably passable. Correcting
				// a floor set from a flaky reading is not the same as lowering a
				// ratchet — the honest number is the one every run can clear.
				// Suspected cause: `vshell` reads real stdin, so which of its paths
				// executes depends on how the run is scheduled.
				"packages/code/**": { statements: 87.4, branches: 79.2, functions: 89.3, lines: 89.2 },
				"packages/componentize/**": { statements: 93, branches: 83, functions: 94, lines: 93 },
				"packages/conformance/**": { statements: 91, branches: 80, functions: 94, lines: 91 },
				"packages/connectivity/**": { statements: 87, branches: 80, functions: 89, lines: 88 },
				"packages/connectors/**": { statements: 88, branches: 80, functions: 86, lines: 88 },
				"packages/contract-harness/**": { statements: 86, branches: 85, functions: 98, lines: 85 },
				"packages/contracts/**": { statements: 90, branches: 81, functions: 89, lines: 90 },
				"packages/control-api/**": { statements: 96, branches: 90, functions: 100, lines: 96 },
				"packages/control-yard/**": { statements: 93, branches: 87, functions: 91, lines: 93 },
				"packages/convex/**": { statements: 99, branches: 94, functions: 99, lines: 99 },
				"packages/core/**": { statements: 91, branches: 83, functions: 94, lines: 92 },
				"packages/data/**": { statements: 89, branches: 84, functions: 85, lines: 91 },
				"packages/data-postgres/**": { statements: 97, branches: 94, functions: 97, lines: 96 },
				"packages/dispatcher/**": { statements: 97, branches: 89, functions: 100, lines: 98 },
				"packages/evals/**": { statements: 90, branches: 89, functions: 94, lines: 91 },
				"packages/events/**": { statements: 91, branches: 82, functions: 87, lines: 93 },
				"packages/fuzz/**": { statements: 90, branches: 80, functions: 94, lines: 92 },
				"packages/hobo/**": { statements: 89, branches: 80, functions: 88, lines: 89 },
				"packages/iac/**": { statements: 86, branches: 80, functions: 89, lines: 86 },
				"packages/identity/**": { statements: 90, branches: 80, functions: 92, lines: 90 },
				"packages/junctions/**": { statements: 95, branches: 90, functions: 98, lines: 95 },
				"packages/kv-redis-compatible/**": { statements: 91, branches: 82, functions: 92, lines: 95 },
				"packages/management/**": { statements: 99, branches: 87, functions: 96, lines: 98 },
				"packages/manifest-capability/**": { statements: 93, branches: 89, functions: 95, lines: 93 },
				"packages/manifest-declaration/**": { statements: 96, branches: 94, functions: 98, lines: 96 },
				"packages/manifest-plan/**": { statements: 94, branches: 88, functions: 98, lines: 95 },
				"packages/manifest-request/**": { statements: 96, branches: 92, functions: 98, lines: 96 },
				"packages/manifest-round-trip/**": { statements: 94, branches: 91, functions: 98, lines: 98 },
				"packages/mcp/**": { statements: 95, branches: 85, functions: 96, lines: 97 },
				"packages/packs/**": { statements: 88, branches: 83, functions: 93, lines: 87 },
				"packages/patterns/**": { statements: 90, branches: 82, functions: 95, lines: 91 },
				// Ceiling, measured 2026-08-22: 66.23% branches even with every
				// reachable branch covered. Of 448 uncovered branches, 389 need a
				// real browser and cannot run in this lane at all:
				//   214  src/main.ts            browser entry; the only module that
				//                               instantiates Phaser.Game (ADR-0147)
				//    85  src/dom-overlay.ts     createDomOverlay needs a live Document
				//    37  src/phaser/scenes.ts   Phaser Scene subclasses
				//    27  src/phaser/yard-presenter.ts
				//    14  src/scenes/yard-scene.ts
				//    12  src/phaser/{game-config,boot-scene}.ts
				// All of it *is* exercised — by the 18 Playwright specs under
				// test/e2e, whose coverage never reaches this gate. So 80% here is
				// not a testing gap to close by writing more vitest; it needs a
				// decision: merge the Playwright coverage in, add a DOM environment
				// (the repo has neither jsdom nor happy-dom today), or exclude the
				// browser-only modules from this denominator. Raising the floor past
				// ~66 without one of those would be a gate nobody can pass.
				"packages/pixel-village/**": { statements: 61, branches: 61, functions: 65, lines: 62 },
				"packages/policy/**": { statements: 97, branches: 95, functions: 100, lines: 97 },
				"packages/providers/provider-aws/**": { statements: 93, branches: 80, functions: 98, lines: 93 },
				// Branches sit below the 80 target by construction, not by neglect.
				// `engine.ts` defends against trajectory shapes that
				// `parseOptimizeRequest` already refuses upstream (an orphan root
				// span, an absent reward, a missing rubric or contract), so those
				// `??` arms are unreachable through the port — verified one by one.
				// branches is 73.8 and will not reach 80. The remaining seventeen arms in
				// engine.ts are defensive `?? ""` / `?? 0` fallbacks on fields the port's
				// own parser makes mandatory -- rubric, rubric.objective, contract, and
				// trajectory.reward were each probed directly and each refused at
				// `parseOptimizeRequest` before the fallback could run. They are dead
				// code guarded by a stricter parser, not untested behaviour.
				"packages/providers/provider-ax/**": { statements: 95, branches: 73.8, functions: 100, lines: 100 },
				"packages/providers/provider-azure/**": { statements: 94, branches: 80, functions: 98, lines: 94 },
				"packages/providers/provider-browser-wasm/**": { statements: 87, branches: 83, functions: 92, lines: 87 },
				"packages/providers/provider-cloudflare/**": { statements: 90, branches: 80, functions: 93, lines: 91 },
				"packages/providers/provider-convex/**": { statements: 89, branches: 80, functions: 94, lines: 89 },
				"packages/providers/provider-digitalocean/**": { statements: 93, branches: 80, functions: 97, lines: 93 },
				"packages/providers/provider-flux/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
				"packages/providers/provider-gcp/**": { statements: 92, branches: 80, functions: 96, lines: 92 },
				"packages/providers/provider-hetzner/**": { statements: 95, branches: 82, functions: 97, lines: 95 },
				"packages/providers/provider-hostinger/**": { statements: 91, branches: 80, functions: 98, lines: 92 },
				"packages/providers/provider-kafka/**": { statements: 88, branches: 84, functions: 93, lines: 88 },
				"packages/providers/provider-kubernetes/**": { statements: 89, branches: 81, functions: 98, lines: 89 },
				"packages/providers/provider-lakebed/**": { statements: 87, branches: 87, functions: 80, lines: 87 },
				"packages/providers/provider-neon/**": { statements: 89, branches: 81, functions: 97, lines: 89 },
				"packages/providers/provider-netlify/**": { statements: 84, branches: 80, functions: 82, lines: 84 },
				"packages/providers/provider-prisma-postgres/**": { statements: 92, branches: 83, functions: 97, lines: 92 },
				"packages/providers/provider-railway/**": { statements: 98, branches: 97, functions: 100, lines: 98 },
				"packages/providers/provider-ttl-sh/**": { statements: 91, branches: 87, functions: 91, lines: 91 },
				"packages/providers/provider-upstash/**": { statements: 88, branches: 80, functions: 92, lines: 88 },
				"packages/providers/provider-vercel/**": { statements: 89, branches: 82, functions: 91, lines: 89 },
				"packages/providers/provider-webernetes/**": { statements: 95, branches: 94, functions: 92, lines: 95 },
				"packages/providers/runner-blacksmith/**": { statements: 90, branches: 81, functions: 100, lines: 90 },
				"packages/providers/runner-depot/**": { statements: 89, branches: 81, functions: 96, lines: 89 },
				"packages/providers/runner-github/**": { statements: 90, branches: 87, functions: 88, lines: 90 },
				"packages/recipes/**": { statements: 89, branches: 82, functions: 95, lines: 90 },
				"packages/registry/**": { statements: 93, branches: 86, functions: 98, lines: 94 },
				"packages/replay/**": { statements: 87, branches: 81, functions: 82, lines: 89 },
				"packages/rift/**": { statements: 91, branches: 86, functions: 91, lines: 93 },
				"packages/runtime/**": { statements: 89, branches: 83, functions: 88, lines: 89 },
				"packages/runtimes/**": { statements: 82, branches: 80, functions: 83, lines: 82 },
				"packages/schema-tools/**": { statements: 90, branches: 84, functions: 94, lines: 91 },
				"packages/sdk/**": { statements: 96, branches: 89, functions: 98, lines: 96 },
				"packages/stage-gate/**": { statements: 88, branches: 91, functions: 91, lines: 88 },
				"packages/stations/**": { statements: 95, branches: 91, functions: 98, lines: 95 },
				"packages/status-page/**": { statements: 92, branches: 82, functions: 91, lines: 93 },
				"packages/storage-sqlite/**": { statements: 88, branches: 81, functions: 94, lines: 89 },
				"packages/testing/**": { statements: 89, branches: 81, functions: 94, lines: 91 },
				"packages/trails/**": { statements: 88, branches: 80, functions: 92, lines: 89 },
				"packages/training/**": { statements: 93, branches: 80, functions: 98, lines: 96 },
				"packages/training-pipeline/**": { statements: 92, branches: 85, functions: 94, lines: 93 },
				"packages/trust/**": { statements: 89, branches: 87, functions: 87, lines: 89 },
				"packages/wasp/**": { statements: 90, branches: 83, functions: 95, lines: 92 },
				"packages/wit/**": { statements: 91, branches: 84, functions: 94, lines: 91 },
				"packages/yard-world/**": { statements: 87, branches: 80, functions: 88, lines: 89 },
				"packages/yards/**": { statements: 87, branches: 84, functions: 88, lines: 87 },
			},
		},
	},
});
