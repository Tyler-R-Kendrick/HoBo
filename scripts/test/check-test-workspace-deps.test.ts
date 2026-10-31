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
import { execFileSync } from "node:child_process";
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
