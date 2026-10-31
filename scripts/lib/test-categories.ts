/**
 * The file globs of the root test lanes `scripts/run-tests.ts` runs
 * (`--category=<name>`), by category. Each glob is a git pathspec, anchored at
 * the repository root, as `git ls-files` reads it. `--root-only` narrows
 * `unit` to the root `test/`.
 *
 * Its own module so that a test can hold the lanes to what they must not
 * collect (`test/vitest-mirror-exclusion.test.ts`: no lane reaches a
 * `test/mirror/` file, which needs a started emulator, ADR-0174).
 */
export function testCategories(rootOnly: boolean) {
	return {
		unit: rootOnly
			? ["test/*test.ts", "test/*test.mjs"]
			: [
					"test/*test.ts",
					"test/*test.mjs",
					"src/draft/*/*/test/*test.ts",
					"src/draft/exp-proofs/*/*/test/*test.ts",
					"src/draft/*/*/test/*test.mjs",
					"src/draft/exp-proofs/*/*/test/*test.mjs",
					"src/draft/*/*/tests/*test.ts",
					"src/draft/exp-proofs/*/*/tests/*test.ts",
					"src/draft/*/*/tests/*test.mjs",
					"src/draft/exp-proofs/*/*/tests/*test.mjs",
				],
		types: [
			"src/draft/*/*/type-tests/*.ts",
			"src/draft/exp-proofs/*/*/type-tests/*.ts",
			"src/draft/*/*/test-types/*.ts",
			"src/draft/exp-proofs/*/*/test-types/*.ts",
			"**/*.test-d.ts",
		],
		"contract-consumer": [
			"src/draft/*/*/test/*contract*.test.ts",
			"src/draft/exp-proofs/*/*/test/*contract*.test.ts",
			"src/draft/*/*/test/*contract*.test.mjs",
			"src/draft/exp-proofs/*/*/test/*contract*.test.mjs",
			"src/draft/*/*/tests/*contract*.test.ts",
			"src/draft/exp-proofs/*/*/tests/*contract*.test.ts",
			"src/draft/*/*/tests/*contract*.test.mjs",
			"src/draft/exp-proofs/*/*/tests/*contract*.test.mjs",
			"src/draft/*/*/contracts/consumer/*test.ts",
			"src/draft/exp-proofs/*/*/contracts/consumer/*test.ts",
			"packages/runtimes/*/contracts/consumer/*test.ts",
			// Every package-level contract test, wherever it lives in the tree. The
			// `.contract.test.ts` suffix is the repo's deliberate marker for "this
			// test holds code to a published contract", so it is the thing to key
			// on. Before this pattern existed the category reached only
			// `src/draft/**` plus one runtimes path, so 30-odd real contract tests
			// under `packages/**` — including pact-driven ones — were unreachable
			// from `pnpm run test:contract` and could rot silently.
			"packages/**/*.contract.test.ts",
			"test/*contract*.test.ts",
		],
		"contract-provider": [
			"src/draft/*/*/test/*provider*.test.ts",
			"src/draft/exp-proofs/*/*/test/*provider*.test.ts",
			"src/draft/*/*/test/*provider*.test.mjs",
			"src/draft/exp-proofs/*/*/test/*provider*.test.mjs",
			"src/draft/*/*/tests/*provider*.test.ts",
			"src/draft/exp-proofs/*/*/tests/*provider*.test.ts",
			"src/draft/*/*/tests/*provider*.test.mjs",
			"src/draft/exp-proofs/*/*/tests/*provider*.test.mjs",
			"src/draft/*/*/contracts/provider/*test.ts",
			// Deliberately NOT extended to `packages/**`: in this repo "provider"
			// names a *cloud* provider far more often than a pact provider, so a
			// `*provider*` glob there would sweep in dozens of unrelated suites
			// (`add-aws-provider.test.ts`, `local-provider.test.ts`, every
			// `provider-*/test/provider.test.ts`) and make the category meaningless.
			// Package-level contract tests are matched by the `.contract.test.ts`
			// marker in `contract-consumer` above instead.
			"test/*provider*.test.ts",
		],
		// Chaos suites already existed and were documented in AGENTS.md ("Chaos
		// lanes, and which one proves what") but had no lane of their own: they ran
		// only as a side effect of a package's broad test run, so there was no way
		// to ask "is the chaos surface green" without running everything. The glob
		// keys on the `chaos` marker in the filename, which is how the two suites
		// AGENTS.md distinguishes are already named.
		chaos: ["packages/**/test/*chaos*.test.ts"],
		dom: ["tests/dom/**/*test.ts", "test/dom/**/*test.ts"],
		component: ["tests/component/**/*test.ts", "test/component/**/*test.ts"],
		behavior: ["tests/behavior/**/*test.ts", "features/**/*.feature"],
		visual: ["tests/visual/**/*test.ts"],
		property: ["packages/fuzz/test/property/**/*test.ts"],
		fuzz: [
			"packages/fuzz/test/harness/**/*test.ts",
			"packages/fuzz/test/api/**/*test.ts",
		],
		"agent-mock": ["evals/**/*.mock.test.ts", "test/evals/**/*.mock.test.ts"],
		"agent-live": ["evals/**/*.live.test.ts", "test/evals/**/*.live.test.ts"],
	};
}
