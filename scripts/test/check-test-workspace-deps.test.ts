/**
 * Regression guard: a package's tests may only reach workspace packages turbo
 * builds before the task that runs them.
 *
 * `@hobo/runtime`'s `test/authoring/actor.test.ts` imported
 * `../../../runtimes/runtime-local/dist/actor-host/in-memory.js`, and nothing
 * ordered `@hobo/runtime-local#build` before `@hobo/runtime#test`. So
 * `turbo run test --filter=@hobo/runtime` never built it, and the test failed on
 * any checkout where nothing else had. The fixtures below hold the checker to
 * turbo's own graph: which dependency fields it orders, which task an
 * override names, which files a task runs, and every way a test file names a
 * module. The last test holds the repository to zero.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { checkTestWorkspaceDeps } from "../check-test-workspace-deps.mts";
import { importSpecifiersOf } from "../lib/test-import-specifiers.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function workspace(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-test-deps-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	return dir;
}

function within<T>(files: Record<string, string>, run: (dir: string) => T): T {
	const dir = workspace(files);
	try {
		return run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

interface ManifestFields {
	readonly scripts?: Record<string, string>;
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly peerDependencies?: Record<string, string>;
}

const manifest = (name: string, fields: ManifestFields = {}) =>
	JSON.stringify({
		name,
		version: "0.0.0",
		scripts: { build: "tsc", test: "vitest run" },
		...fields,
	});

const turbo = (tasks: Record<string, { dependsOn?: string[] }> = {}) =>
	JSON.stringify({
		tasks: {
			build: { dependsOn: ["^build"] },
			test: { dependsOn: ["build"] },
			"test:contract:consumer": { dependsOn: ["^build"] },
			lint: {},
			...tasks,
		},
	});

const base = {
	"pnpm-workspace.yaml":
		'packages:\n  - "packages/*"\n  - "examples/*"\n  - "src/draft/technical-proofs/*"\n',
	"turbo.json": turbo(),
	"packages/lib/package.json": manifest("@s/lib"),
	"packages/lib/src/index.ts": "export const x = 1;\n",
};

const found = (dir: string) =>
	checkTestWorkspaceDeps(dir).map(
		(item) => `${item.file} [${item.task}] -> ${item.imports}`,
	);

describe("importSpecifiersOf", () => {
	it("reads every literal way a file names a module", () => {
		const source = [
			'import { a } from "@s/static";',
			'import "@s/side-effect";',
			'export { b } from "@s/reexport";',
			'import c = require("@s/import-equals");',
			'const d = await import("@s/dynamic");',
			"const e = await import(`@s/no-substitution`);",
			'const f = require("@s/require");',
			'const g = require.resolve("@s/require-resolve");',
			'const h = createRequire(import.meta.url)("@s/create-require-call");',
			"const req = createRequire(import.meta.url);",
			'req("@s/bound-require");',
			'req.resolve("@s/bound-require-resolve");',
			'const i = import.meta.resolve("@s/meta-resolve");',
			'vi.mock("@s/vi-mock");',
			'const j = await vi.importActual("@s/vi-import-actual");',
		].join("\n");
		assert.deepEqual(
			importSpecifiersOf(source, "a.test.ts").map((item) => item.specifier),
			[
				"@s/static",
				"@s/side-effect",
				"@s/reexport",
				"@s/import-equals",
				"@s/dynamic",
				"@s/no-substitution",
				"@s/require",
				"@s/require-resolve",
				"@s/create-require-call",
				"@s/bound-require",
				"@s/bound-require-resolve",
				"@s/meta-resolve",
				"@s/vi-mock",
				"@s/vi-import-actual",
			],
		);
	});

	it("reads a require bound by a later assignment, and vitest's vi under another name", () => {
		const source = [
			"let req;",
			"req = createRequire(import.meta.url);",
			'req("@s/assigned-require");',
			'req.resolve("@s/assigned-require-resolve");',
			'import { vi as v } from "vitest";',
			'v.mock("@s/aliased-vi-mock");',
			'await v.importActual("@s/aliased-vi-import-actual");',
			'other.mock("@s/not-vi");',
			'notRequire("@s/not-require");',
		].join("\n");
		assert.deepEqual(
			importSpecifiersOf(source, "a.test.ts").map((item) => item.specifier),
			[
				"@s/assigned-require",
				"@s/assigned-require-resolve",
				"vitest",
				"@s/aliased-vi-mock",
				"@s/aliased-vi-import-actual",
			],
		);
	});

	it("reads nothing out of strings, comments or a test's source text, and nothing computed", () => {
		// runtime-local's link-table and capability-grant-gate tests hold a
		// Bindle's source as a string, `import { api, kv } from "@hobo/bindles"`
		// included; they never load @hobo/bindles.
		const source = [
			"throw new Error('run: import { x } from \"@s/quoted\"');",
			'// import { y } from "@s/line-comment";',
			'/* import { w } from "@s/block-comment"; */',
			"const sourceText = `",
			'  import { api, kv } from "@s/in-template";',
			'  ${`nested ${"x"}`}',
			"`;",
			"const name = 'computed';",
			"await import(`@s/${name}`);",
			'require("@s/" + name);',
		].join("\n");
		assert.deepEqual(importSpecifiersOf(source, "a.test.ts"), []);
	});

	it("is not misled by a regular expression that holds a backtick", () => {
		const source = [
			"const quotes = /[\"'`]/u;",
			'import { after } from "@s/after-regex";',
			"const fence = /```/u;",
			'const later = await import("@s/after-second-regex");',
		].join("\n");
		assert.deepEqual(
			importSpecifiersOf(source, "a.test.ts").map((item) => item.specifier),
			["@s/after-regex", "@s/after-second-regex"],
		);
	});

	it("marks the imports a compiler erases as type-only", () => {
		const source = [
			'import type { A } from "@s/import-type";',
			'import { type B } from "@s/inline-types";',
			'import { type C, d } from "@s/mixed";',
			'export type { E } from "@s/export-type";',
			'type F = typeof import("@s/import-type-node");',
		].join("\n");
		assert.deepEqual(
			importSpecifiersOf(source, "a.test.ts").map(
				(item) => `${item.specifier} ${item.typeOnly}`,
			),
			[
				"@s/import-type true",
				"@s/inline-types true",
				"@s/mixed false",
				"@s/export-type true",
				"@s/import-type-node true",
			],
		);
	});
});

describe("checkTestWorkspaceDeps", () => {
	it("refuses a test that reaches an undeclared sibling by name or by a relative path", () => {
		within(
			{
				...base,
				"packages/app/package.json": manifest("@s/app"),
				"packages/app/test/by-name.test.ts": 'import { x } from "@s/lib";\n',
				"packages/app/test/by-path.test.ts":
					'import { x } from "../../lib/src/index.js";\n',
				"packages/app/src/own.test.ts": 'import { y } from "./own.js";\n',
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/app/test/by-name.test.ts [test] -> @s/lib",
					"packages/app/test/by-path.test.ts [test] -> @s/lib",
				]),
		);
	});

	it("accepts a declared devDependency, and the build an override of the test task names", () => {
		within(
			{
				...base,
				"turbo.json": turbo({
					"@s/ordered#test": { dependsOn: ["build", "@s/lib#build"] },
				}),
				"packages/declared/package.json": manifest("@s/declared", {
					devDependencies: { "@s/lib": "workspace:*" },
				}),
				"packages/declared/test/a.test.ts": 'import { x } from "@s/lib";\n',
				"packages/ordered/package.json": manifest("@s/ordered"),
				"packages/ordered/test/a.test.ts":
					'import { x } from "../../lib/src/index.js";\n',
			},
			(dir) => assert.deepEqual(found(dir), []),
		);
	});

	it("does not count a peerDependency: turbo orders no build for one", () => {
		within(
			{
				...base,
				"packages/app/package.json": manifest("@s/app", {
					peerDependencies: { "@s/lib": "workspace:*" },
				}),
				"packages/app/test/a.test.ts": 'import { x } from "@s/lib";\n',
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/app/test/a.test.ts [test] -> @s/lib",
				]),
		);
	});

	it("counts a declaration only with a workspace: specifier, as pnpm 9 leaves link-workspace-packages off", () => {
		// turbo 2.11.10 on a scratch workspace: `"a": "1.0.0"`, `"^1.0.0"`, `"*"`
		// and `"link:../a"` schedule no a#build; `"workspace:*"`,
		// `"workspace:^1.0.0"`, `"workspace:a@*"` and `"workspace:../a"` do.
		const loads = 'import "../../lib/src/index.js";\n';
		const declares = (
			name: string,
			devDependencies: Record<string, string>,
		) => ({
			[`packages/${name}/package.json`]: manifest(`@s/${name}`, {
				devDependencies,
			}),
			[`packages/${name}/test/a.test.ts`]: loads,
		});
		within(
			{
				...base,
				...declares("plain", { "@s/lib": "0.0.0" }),
				...declares("star", { "@s/lib": "*" }),
				...declares("ranged", { "@s/lib": "workspace:^0.0.0" }),
				...declares("aliased", { "lib-alias": "workspace:@s/lib@*" }),
				...declares("pathed", { anything: "workspace:../lib" }),
			},
			(dir) => {
				const violations = checkTestWorkspaceDeps(dir);
				assert.deepEqual(
					violations.map((item) => `${item.file} -> ${item.imports}`),
					[
						"packages/plain/test/a.test.ts -> @s/lib",
						"packages/star/test/a.test.ts -> @s/lib",
					],
				);
				assert.deepEqual(
					violations.map((item) => item.declared),
					[
						'"0.0.0", and turbo orders only a workspace: specifier: link-workspace-packages is off (the default from pnpm 9; neither pnpm-workspace.yaml nor .npmrc sets it)',
						'"*", and turbo orders only a workspace: specifier: link-workspace-packages is off (the default from pnpm 9; neither pnpm-workspace.yaml nor .npmrc sets it)',
					],
				);
			},
		);
	});

	it("counts a plain version where link-workspace-packages is on, pnpm-workspace.yaml over .npmrc", () => {
		const fixture = {
			...base,
			"packages/app/package.json": manifest("@s/app", {
				devDependencies: { "@s/lib": "0.0.0" },
			}),
			"packages/app/test/a.test.ts": 'import "../../lib/src/index.js";\n',
			"packages/git/package.json": manifest("@s/git", {
				devDependencies: { "@s/lib": "github:s/lib" },
			}),
			"packages/git/test/a.test.ts": 'import "../../lib/src/index.js";\n',
		};
		const yaml = `${base["pnpm-workspace.yaml"]}linkWorkspacePackages: `;
		const reported = (files: Record<string, string>) =>
			within({ ...fixture, ...files }, (dir) =>
				checkTestWorkspaceDeps(dir).map(
					(item) => `${item.imports} <- ${item.package}: ${item.declared}`,
				),
			);
		const git = (setting: string) =>
			`@s/lib <- @s/git: "github:s/lib", and turbo orders no github: specifier although link-workspace-packages is on (${setting})`;
		assert.deepEqual(reported({ ".npmrc": "link-workspace-packages=true\n" }), [
			git(".npmrc sets it"),
		]);
		assert.deepEqual(reported({ "pnpm-workspace.yaml": `${yaml}deep\n` }), [
			git("pnpm-workspace.yaml sets it"),
		]);
		assert.deepEqual(
			reported({
				".npmrc": "link-workspace-packages=true\n",
				"pnpm-workspace.yaml": `${yaml}false\n`,
			}),
			[
				'@s/lib <- @s/app: "0.0.0", and turbo orders only a workspace: specifier: link-workspace-packages is off (pnpm-workspace.yaml sets it)',
				'@s/lib <- @s/git: "github:s/lib", and turbo orders only a workspace: specifier: link-workspace-packages is off (pnpm-workspace.yaml sets it)',
			],
		);
		assert.deepEqual(
			reported({
				"package.json": JSON.stringify({ packageManager: "pnpm@8.15.0" }),
				"pnpm-workspace.yaml": `${yaml}false\n`,
			}),
			[git("the default before pnpm 9, which reads it from .npmrc only")],
		);
	});

	it("accepts a sibling the declared dependencies already build", () => {
		within(
			{
				...base,
				"packages/mid/package.json": manifest("@s/mid", {
					dependencies: { "@s/lib": "workspace:*" },
				}),
				"packages/app/package.json": manifest("@s/app", {
					devDependencies: { "@s/mid": "workspace:*" },
				}),
				"packages/app/test/a.test.ts":
					'import { x } from "../../lib/src/index.js";\n',
			},
			(dir) => assert.deepEqual(found(dir), []),
		);
	});

	it("counts an override only for the task that runs the file", () => {
		within(
			{
				...base,
				"turbo.json": turbo({
					"@s/app#lint": { dependsOn: ["@s/lib#build"] },
					"@s/both#test": { dependsOn: ["build", "@s/lib#build"] },
				}),
				"packages/app/package.json": manifest("@s/app"),
				"packages/app/test/a.test.ts":
					'import { x } from "../../lib/src/index.js";\n',
				"packages/both/package.json": manifest("@s/both", {
					scripts: {
						build: "tsc",
						test: "vitest run",
						"test:contract:consumer": "vitest run contracts/consumer",
					},
				}),
				// `vitest run` runs this file too, so it needs the build before both tasks.
				"packages/both/contracts/consumer/a.consumer.pact.test.ts":
					'import { x } from "../../../lib/src/index.js";\n',
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/app/test/a.test.ts [test] -> @s/lib",
					"packages/both/contracts/consumer/a.consumer.pact.test.ts [test:contract:consumer] -> @s/lib",
				]),
		);
	});

	it("appends the inherited dependsOn where a package's turbo.json names $TURBO_EXTENDS$, and replaces it where not", () => {
		// turbo 2.11.10 on a scratch workspace: with the root's `test` on
		// ["build", "c#build"], a package's `["$TURBO_EXTENDS$", "a#build"]`
		// schedules a, c and the package's own build, and `["a#build"]` only a.
		// The inherited list is the root's `<pkg>#test` where it has one.
		const extend = (dependsOn: string[]) =>
			JSON.stringify({ extends: ["//"], tasks: { test: { dependsOn } } });
		const app = (name: string) =>
			manifest(name, { devDependencies: { "@s/mid": "workspace:*" } });
		// mid's build is the package's own build's ^build; lib, x and y are named outright.
		const loads = [
			'import "../../mid/src/index.js";',
			'import "../../lib/src/index.js";',
			'import "../../x/src/index.js";',
			'import "../../y/src/index.js";',
		].join("\n");
		within(
			{
				...base,
				"turbo.json": turbo({
					test: { dependsOn: ["build", "@s/x#build"] },
					"@s/over#test": { dependsOn: ["build", "@s/y#build"] },
				}),
				"packages/mid/package.json": manifest("@s/mid"),
				"packages/x/package.json": manifest("@s/x"),
				"packages/y/package.json": manifest("@s/y"),
				"packages/extends/package.json": app("@s/extends"),
				"packages/extends/turbo.json": extend([
					"$TURBO_EXTENDS$",
					"@s/lib#build",
					"@s/y#build",
				]),
				"packages/extends/test/a.test.ts": loads,
				"packages/over/package.json": app("@s/over"),
				"packages/over/turbo.json": extend([
					"@s/lib#build",
					"@s/x#build",
					"$TURBO_EXTENDS$",
				]),
				"packages/over/test/a.test.ts": loads,
				"packages/replaces/package.json": app("@s/replaces"),
				"packages/replaces/turbo.json": extend([
					"@s/lib#build",
					"@s/x#build",
					"@s/y#build",
				]),
				"packages/replaces/test/a.test.ts": loads,
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/replaces/test/a.test.ts [test] -> @s/mid",
				]),
		);
	});

	it("reads fixture helpers, __tests__ helpers and vitest configs", () => {
		within(
			{
				...base,
				"packages/app/package.json": manifest("@s/app"),
				"packages/app/test/fixtures/helper.ts":
					'export { x } from "../../../lib/src/index.js";\n',
				"packages/app/src/__tests__/setup.ts": 'import "@s/lib";\n',
				"packages/app/vitest.config.ts":
					'import { x } from "../lib/src/index.js";\nexport default {};\n',
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/app/src/__tests__/setup.ts [test] -> @s/lib",
					"packages/app/test/fixtures/helper.ts [test] -> @s/lib",
					"packages/app/vitest.config.ts [test] -> @s/lib",
				]),
		);
	});

	it("checks a helper under every task of the test files that import it", () => {
		within(
			{
				...base,
				"turbo.json": turbo({
					"@s/app#test": { dependsOn: ["build", "@s/lib#build"] },
				}),
				"packages/app/package.json": manifest("@s/app", {
					scripts: {
						build: "tsc",
						test: "vitest run",
						"test:contract:consumer": "vitest run contracts/consumer",
					},
				}),
				// The contract test reaches lib through two test/ helpers.
				"packages/app/contracts/consumer/a.consumer.test.ts":
					'import { x } from "../../test/helpers/outer.js";\n',
				"packages/app/test/helpers/outer.ts": 'export * from "./inner";\n',
				"packages/app/test/helpers/inner.ts":
					'export { x } from "../../../lib/src/index.js";\n',
				// No contract test imports this one, so it runs under test only.
				"packages/app/test/unit-helper.ts":
					'export { x } from "../../lib/src/index.js";\n',
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/app/test/helpers/inner.ts [test:contract:consumer] -> @s/lib",
				]),
		);
	});

	it("counts a type-only import only where the package's tsconfig compiles the test", () => {
		const types = 'import type { X } from "../../lib/src/index.js";\n';
		within(
			{
				...base,
				"packages/erased/package.json": manifest("@s/erased"),
				"packages/erased/tsconfig.json": JSON.stringify({ include: ["src"] }),
				"packages/erased/test/a.test.ts": types,
				"packages/compiled/package.json": manifest("@s/compiled"),
				"packages/compiled/tsconfig.json": JSON.stringify({
					include: ["src", "test"],
				}),
				"packages/compiled/test/a.test.ts": types,
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"packages/compiled/test/a.test.ts [test] -> @s/lib",
				]),
		);
	});

	it("covers examples and draft proofs, and only packages turbo runs the task for", () => {
		const reaches = 'import { x } from "@s/lib";\n';
		within(
			{
				...base,
				"examples/demo/package.json": manifest("@s/demo"),
				"examples/demo/test/a.test.ts": reaches,
				"src/draft/technical-proofs/p/package.json": manifest("@s/p"),
				"src/draft/technical-proofs/p/test/a.test.ts": reaches,
				"packages/untested/package.json": JSON.stringify({
					name: "@s/untested",
					scripts: { build: "tsc" },
				}),
				"packages/untested/test/a.test.ts": reaches,
			},
			(dir) =>
				assert.deepEqual(found(dir), [
					"examples/demo/test/a.test.ts [test] -> @s/lib",
					"src/draft/technical-proofs/p/test/a.test.ts [test] -> @s/lib",
				]),
		);
	});

	it("reads a git repository's tracked files, not whatever is in the tree", () => {
		within(
			{
				...base,
				"packages/app/package.json": manifest("@s/app"),
				"packages/app/test/tracked.test.ts": 'import { x } from "@s/lib";\n',
			},
			(dir) => {
				execFileSync("git", ["init", "-q"], { cwd: dir });
				execFileSync("git", ["add", "."], { cwd: dir });
				writeFileSync(
					join(dir, "packages/app/test/untracked.test.ts"),
					'import { x } from "@s/lib";\n',
				);
				assert.deepEqual(found(dir), [
					"packages/app/test/tracked.test.ts [test] -> @s/lib",
				]);
			},
		);
	});

	it("warns about tracked files a sparse checkout left out, and fails on them under --strict or in CI", () => {
		const reaches = 'import { x } from "@s/lib";\n';
		within(
			{
				...base,
				"packages/app/package.json": manifest("@s/app", {
					devDependencies: { "@s/lib": "workspace:*" },
				}),
				"packages/app/test/kept.test.ts": reaches,
				"packages/app/test/left-out-1.test.ts": reaches,
				"packages/app/test/left-out-2.test.ts": reaches,
			},
			(dir) => {
				const git = (...args: string[]) =>
					execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
						cwd: dir,
						stdio: "pipe",
					});
				git("init", "-q");
				git("add", ".");
				git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "t");
				git(
					"sparse-checkout",
					"set",
					"--no-cone",
					"/*",
					"!/packages/app/test/left-out-*",
				);
				// A gitlink with no checkout behind it: a submodule never initialised.
				const head = git("rev-parse", "HEAD").toString().trim();
				git(
					"update-index",
					"--add",
					"--cacheinfo",
					`160000,${head},external/sub`,
				);
				const run = (args: string[], ci: string | undefined) => {
					const env = { ...process.env };
					delete env.CI;
					if (ci !== undefined) env.CI = ci;
					return spawnSync(
						process.execPath,
						[
							"--import",
							"tsx",
							join(root, "scripts/check-test-workspace-deps.mts"),
							"--root",
							dir,
							...args,
						],
						{ cwd: root, encoding: "utf8", env },
					);
				};
				const files =
					/2 tracked files this check reads are not checked out, so it skipped them: packages\/app\/test\/left-out-1\.test\.ts, packages\/app\/test\/left-out-2\.test\.ts/u;
				const submodule =
					/1 submodule is not checked out, so none of its files were read: external\/sub/u;
				const quiet = run([], undefined);
				assert.equal(quiet.status, 0, quiet.stderr);
				assert.match(quiet.stderr, new RegExp(`warning: ${files.source}`, "u"));
				assert.match(
					quiet.stderr,
					new RegExp(`warning: ${submodule.source}`, "u"),
				);
				assert.equal(run([], "0").status, 0);
				for (const [args, ci] of [
					[["--strict"], undefined],
					[[], "1"],
					[[], "true"],
				] as const) {
					const loud = run([...args], ci);
					assert.equal(loud.status, 1, `${args.join(" ")} CI=${ci}`);
					assert.match(loud.stderr, new RegExp(`error: ${files.source}`, "u"));
					assert.match(
						loud.stderr,
						new RegExp(`error: ${submodule.source}`, "u"),
					);
				}
			},
		);
	});

	it("finds no such test in this repository", () => {
		const violations = checkTestWorkspaceDeps(root);
		assert.deepEqual(
			violations.map(
				(item) =>
					`${item.file} [${item.task}]: ${item.package} -> ${item.imports}`,
			),
			[],
		);
	});
});
