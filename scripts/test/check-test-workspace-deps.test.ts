/**
 * Regression guard: a package's tests may only reach workspace packages turbo
 * builds before them.
 *
 * `@hobo/runtime`'s `test/authoring/actor.test.ts` imported
 * `../../../runtimes/runtime-local/dist/actor-host/in-memory.js`, and
 * `@hobo/runtime` did not declare `@hobo/runtime-local`. So
 * `turbo run test --filter=@hobo/runtime` never built it, and the test failed on
 * any checkout where nothing else had. The fixtures below hold the checker to
 * both spellings of such an import and to both ways of declaring one. The last
 * test holds the repository to zero.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
	checkTestWorkspaceDeps,
	specifiersOf,
} from "../check-test-workspace-deps.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function workspace(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-test-deps-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	return dir;
}

const manifest = (name: string, devDependencies: Record<string, string> = {}) =>
	JSON.stringify({ name, version: "0.0.0", devDependencies });

const base = {
	"pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
	"packages/lib/package.json": manifest("@s/lib"),
	"packages/lib/src/index.ts": "export const x = 1;\n",
};

describe("check-test-workspace-deps", () => {
	it("reads static, side-effect and dynamic imports, not ones quoted in a message", () => {
		assert.deepEqual(
			specifiersOf(
				[
					'import { a } from "@s/lib";',
					"import {",
					"\tb,",
					'} from "../../lib/src/index.js";',
					'import "@s/side-effect";',
					'const c = await import("@s/dynamic");',
					"throw new Error('run: import { x } from \"@s/quoted\"');",
					'// import { y } from "@s/commented";',
					'export { z } from "@s/reexport";',
				].join("\n"),
			),
			[
				"@s/lib",
				"../../lib/src/index.js",
				"@s/side-effect",
				"@s/dynamic",
				"@s/reexport",
			],
		);
	});

	it("does not read an import out of source text a test holds in a template literal", () => {
		// runtime-local's link-table and capability-grant-gate tests hold a
		// Bindle's source as a string, `import { api, kv } from "@hobo/bindles"`
		// included; they never load @hobo/bindles.
		assert.deepEqual(
			specifiersOf(
				[
					'import { a } from "@s/lib";',
					"const sourceText = `",
					'  import { api, kv } from "@s/in-template";',
					'  ${`nested ${"x"}`}',
					'  import { more } from "@s/after-nested";',
					"`;",
					'/* import { w } from "@s/block"; */',
					"const quotes = /[\"'`]/u;",
					'const b = await import("@s/after-regex");',
				].join("\n"),
			),
			["@s/lib", "@s/after-regex"],
		);
	});

	it("refuses a test that reaches an undeclared sibling by name or by a relative path", () => {
		const dir = workspace({
			...base,
			"packages/app/package.json": manifest("@s/app"),
			"packages/app/test/by-name.test.ts": 'import { x } from "@s/lib";\n',
			"packages/app/test/by-path.test.ts":
				'import { x } from "../../lib/src/index.js";\n',
			"packages/app/src/own.test.ts": 'import { y } from "./own.js";\n',
		});
		try {
			assert.deepEqual(
				checkTestWorkspaceDeps(dir).map((item) => [
					item.package,
					item.file,
					item.imports,
				]),
				[
					["@s/app", "packages/app/test/by-name.test.ts", "@s/lib"],
					["@s/app", "packages/app/test/by-path.test.ts", "@s/lib"],
				],
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("accepts a declared devDependency, and a build turbo.json orders before the package's task", () => {
		const dir = workspace({
			...base,
			"packages/declared/package.json": manifest("@s/declared", {
				"@s/lib": "workspace:*",
			}),
			"packages/declared/test/a.test.ts": 'import { x } from "@s/lib";\n',
			"packages/ordered/package.json": manifest("@s/ordered"),
			"packages/ordered/test/a.test.ts":
				'import { x } from "../../lib/src/index.js";\n',
			"turbo.json": JSON.stringify({
				tasks: { "@s/ordered#test": { dependsOn: ["build", "@s/lib#build"] } },
			}),
		});
		try {
			assert.deepEqual(checkTestWorkspaceDeps(dir), []);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("finds no such test in this repository", () => {
		const violations = checkTestWorkspaceDeps(root);
		assert.deepEqual(
			violations.map(
				(item) => `${item.file}: ${item.package} -> ${item.imports}`,
			),
			[],
		);
	});
});
