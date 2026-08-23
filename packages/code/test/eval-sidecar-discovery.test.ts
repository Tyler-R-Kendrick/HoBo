/**
 * Finding the trainable parts of a project, and the tests that grade them.
 *
 * Both halves are discovery over a real directory: source files are scanned for
 * the four ways a method can declare itself trainable, and the project is
 * scanned for the eval suites that would exercise them. `eval-sidecar.test.ts`
 * covers the sidecar assembled from the result; this covers the scanning.
 *
 * What the scanner is careful about:
 *
 * **Four declaration forms, one shape out.** `training.define("ref")`, a
 * `"use training"` directive, an `@trainable` decorator, and a bare
 * `training(...)` call all produce a region with a method ref. They exist
 * because different codebases reach for different idioms, and a scanner that
 * only understood one would report a project as having no trainable surface
 * when it has a large one.
 *
 * **A method ref is found near the declaration, not anywhere in the file.**
 * The directive and decorator forms have no ref of their own, so the scanner
 * looks in a window around the match — an explicit `methodRef:` first, then the
 * enclosing function's name, then the filename. Searching the whole file would
 * attach the first ref it found to every declaration in the file.
 *
 * **A region is grounded only when it has both an intent and a contract.**
 * "Grounded" is what separates a method someone meant to train from one that
 * merely mentions training, and both halves are required because either alone
 * describes only half of what the trainer needs.
 *
 * **Refs are deduplicated across the whole project.** The same ref declared
 * twice is one trainable region, not two — otherwise a re-export or a copied
 * block would inflate the count the sidecar reports.
 *
 * The example blocks are parsed out of *source text*, so the parser accepts
 * JavaScript object literals rather than strict JSON: single quotes, unquoted
 * keys, and trailing commas all appear in real code and none of them is JSON.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	inspectProjectEvalTests,
	inspectTrainableRegions,
} from "../src/eval-sidecar.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** A throwaway project holding the given files, relative to its root. */
function project(files: Readonly<Record<string, string>>): string {
	const root = mkdtempSync(join(tmpdir(), "hobo-eval-scan-"));
	dirs.push(root);
	for (const [rel, body] of Object.entries(files)) {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body);
	}
	return root;
}

const regions = (files: Readonly<Record<string, string>>) =>
	inspectTrainableRegions(project(files));

const refs = (files: Readonly<Record<string, string>>) =>
	regions(files).map((row) => row.methodRef);

describe("the four ways to declare a trainable method", () => {
	it("finds a training.define call", () => {
		expect(
			refs({ "src/a.ts": `training.define("billing.classify", {});` }),
		).toContain("billing.classify");
	});

	it("takes the ref straight from the define call", () => {
		// The only form that names itself; everything else has to be inferred.
		expect(regions({ "src/a.ts": `training.define('a.b', {})` })[0]?.form).toBe(
			"define",
		);
	});

	it("finds every define in one file", () => {
		expect(
			refs({
				"src/a.ts": `training.define("one", {});\ntraining.define("two", {});`,
			}),
		).toEqual(["one", "two"]);
	});

	it("finds a use-training directive", () => {
		expect(
			refs({
				"src/a.ts": `"use training";\nconst spec = { methodRef: "svc.route" };`,
			}),
		).toContain("svc.route");
	});

	it("marks the directive form as a directive", () => {
		expect(
			regions({
				"src/a.ts": `"use training";\nconst spec = { methodRef: "svc.route" };`,
			})[0]?.form,
		).toBe("directive");
	});

	it("finds a trainable decorator", () => {
		expect(
			refs({
				"src/a.ts": `class S {\n  @trainable\n  route() {}\n}\nconst m = { methodRef: "svc.route" };`,
			}),
		).toContain("svc.route");
	});

	it("marks the decorator form as a decorator", () => {
		expect(
			regions({
				"src/a.ts": `@trainable\nconst m = { methodRef: "svc.route" };`,
			})[0]?.form,
		).toBe("decorator");
	});

	it("finds a bare training call", () => {
		expect(
			refs({ "src/a.ts": `const t = training({ methodRef: "svc.rank" });` }),
		).toContain("svc.rank");
	});

	it("marks the bare call as the training form", () => {
		expect(
			regions({
				"src/a.ts": `const t = training({ methodRef: "svc.rank" });`,
			})[0]?.form,
		).toBe("training");
	});

	it("does not report a bare call as its own region when a define is present", () => {
		// `training.define(...)` matches the bare-call pattern too. Reporting
		// both would count one declaration twice under two different forms.
		const found = regions({
			"src/a.ts": `training.define("svc.rank", { methodRef: "svc.rank" });`,
		});
		expect(found.map((row) => row.form)).toEqual(["define"]);
	});

	it("ignores a file that declares nothing", () => {
		expect(refs({ "src/a.ts": `export const two = 1 + 1;` })).toEqual([]);
	});
});

describe("finding the method ref", () => {
	it("prefers an explicit methodRef near the declaration", () => {
		expect(
			refs({
				"src/a.ts": `"use training";\nconst spec = { methodRef: "explicit.one" };\nexport function named() {}`,
			}),
		).toContain("explicit.one");
	});

	it("falls back to the enclosing function's name", () => {
		// No ref written down, but the function's name is the next best thing a
		// reader would use to identify it.
		expect(
			refs({
				"src/a.ts": `export function classify() {\n  "use training";\n}`,
			}),
		).toContain("classify");
	});

	it("falls back to the file name when there is neither", () => {
		// Still better than dropping the region: a trainable surface with an
		// awkward name is findable, one that was never reported is not.
		expect(refs({ "src/a.ts": `"use training";` })).toContain("src/a.ts");
	});

	it("finds an async function's name", () => {
		expect(
			refs({
				"src/a.ts": `export async function rank() {\n  "use training";\n}`,
			}),
		).toContain("rank");
	});

	it("finds a non-exported function's name", () => {
		expect(
			refs({ "src/a.ts": `function rank() {\n  "use training";\n}` }),
		).toContain("rank");
	});

	it("does not reach across a whole file for a ref", () => {
		// The window is bounded on purpose. A ref defined a thousand lines away
		// belongs to a different declaration, and attaching it here would
		// mislabel the region.
		const far = `const other = { methodRef: "far.away" };\n${"// filler\n".repeat(400)}export function near() {\n  "use training";\n}`;
		expect(refs({ "src/a.ts": far })).toContain("near");
	});
});

describe("grounding", () => {
	const grounded = (body: string) => regions({ "src/a.ts": body })[0]?.grounded;

	it("is grounded with both an intent and a contract", () => {
		expect(
			grounded(
				`training.define("a.b", { intent: "classify tickets", contract: "ticket -> category" });`,
			),
		).toBe(true);
	});

	it("is not grounded with only an intent", () => {
		// Either half alone describes only part of what the trainer needs, so
		// neither alone counts.
		expect(grounded(`training.define("a.b", { intent: "classify" });`)).toBe(
			false,
		);
	});

	it("is not grounded with only a contract", () => {
		expect(grounded(`training.define("a.b", { contract: "t -> c" });`)).toBe(
			false,
		);
	});

	it("is not grounded with neither", () => {
		expect(grounded(`training.define("a.b", {});`)).toBe(false);
	});
});

describe("training examples", () => {
	const examples = (body: string) => regions({ "src/a.ts": body })[0]?.examples;

	it("reads a plain example block", () => {
		expect(
			examples(
				`training.define("a.b", { examples: [{ input: "x", output: "y" }] });`,
			),
		).toEqual([{ input: "x", output: "y" }]);
	});

	it("accepts single quotes, because source is not JSON", () => {
		expect(
			examples(
				`training.define('a.b', { examples: [{ input: 'x', output: 'y' }] });`,
			),
		).toHaveLength(1);
	});

	it("accepts unquoted keys", () => {
		// The block is lifted out of real code, where nobody quotes their keys.
		expect(
			examples(
				`training.define("a.b", { examples: [{ input: "x", output: "y" }] });`,
			),
		).toHaveLength(1);
	});

	it("accepts a trailing comma", () => {
		expect(
			examples(
				`training.define("a.b", { examples: [{ input: "x", output: "y" }, ] });`,
			),
		).toHaveLength(1);
	});

	it("reads several examples", () => {
		expect(
			examples(
				`training.define("a.b", { examples: [{ input: "a", output: "1" }, { input: "b", output: "2" }] });`,
			),
		).toHaveLength(2);
	});

	it("has no examples when the block is absent", () => {
		expect(examples(`training.define("a.b", {});`)).toEqual([]);
	});

	it("skips a row missing its input", () => {
		// A half-written example teaches nothing and would be scored against a
		// value that was never recorded.
		expect(
			examples(`training.define("a.b", { examples: [{ output: "y" }] });`),
		).toEqual([]);
	});

	it("skips a row missing its output", () => {
		expect(
			examples(`training.define("a.b", { examples: [{ input: "x" }] });`),
		).toEqual([]);
	});

	it("keeps a row whose input is explicitly null", () => {
		// Null is a recorded input -- a method called with nothing -- and is
		// different from a row that never had one.
		expect(
			examples(
				`training.define("a.b", { examples: [{ input: null, output: "y" }] });`,
			),
		).toEqual([{ input: null, output: "y" }]);
	});

	it("keeps a structured input and output", () => {
		expect(
			examples(
				`training.define("a.b", { examples: [{ input: { ticket: "x" }, output: { category: "y" } }] });`,
			),
		).toEqual([{ input: { ticket: "x" }, output: { category: "y" } }]);
	});

	it("has no examples when the block will not parse", () => {
		// Better an empty list than a partial parse: a malformed block is a
		// thing to fix, not a source of half the examples.
		expect(
			examples(`training.define("a.b", { examples: [{ input: <<< }] });`),
		).toEqual([]);
	});
});

describe("scanning the project", () => {
	it("deduplicates a ref declared in two files", () => {
		// A re-export or a copied block would otherwise inflate the count the
		// sidecar reports.
		expect(
			refs({
				"src/a.ts": `training.define("same.ref", {});`,
				"src/b.ts": `training.define("same.ref", {});`,
			}),
		).toEqual(["same.ref"]);
	});

	it("sorts refs so the report is stable", () => {
		expect(
			refs({
				"src/z.ts": `training.define("z.one", {});`,
				"src/a.ts": `training.define("a.one", {});`,
			}),
		).toEqual(["a.one", "z.one"]);
	});

	it("records which file each region came from", () => {
		const found = regions({ "src/deep/a.ts": `training.define("a.b", {});` });
		expect(found[0]?.file).toContain("a.ts");
	});

	it("finds a declaration at the project root", () => {
		expect(refs({ "index.ts": `training.define("root.one", {});` })).toContain(
			"root.one",
		);
	});

	it("finds nothing in an empty project", () => {
		expect(inspectTrainableRegions(project({}))).toEqual([]);
	});

	it("ignores a dot directory", () => {
		// Build caches and vendored trees are not the project's own surface.
		expect(refs({ ".cache/a.ts": `training.define("cached", {});` })).toEqual(
			[],
		);
	});

	it("ignores a file that is not source", () => {
		expect(refs({ "src/notes.md": `training.define("doc", {});` })).toEqual([]);
	});
});

describe("finding the eval suites", () => {
	it("finds a suite under evals/", () => {
		const found = inspectProjectEvalTests(
			project({ "evals/route.test.ts": "" }),
		);
		expect(found?.files).toContain(join("evals", "route.test.ts"));
	});

	it("finds a suite under test/evals/", () => {
		const found = inspectProjectEvalTests(
			project({ "test/evals/route.test.ts": "" }),
		);
		expect(found?.files).toContain(join("test", "evals", "route.test.ts"));
	});

	it("finds an .eval.test file directly under test/", () => {
		// Outside the eval directories only the explicit `.eval.` marker counts
		// -- otherwise every unit test in the project would be run as an eval.
		const found = inspectProjectEvalTests(
			project({ "test/route.eval.test.ts": "" }),
		);
		expect(found?.files).toContain(join("test", "route.eval.test.ts"));
	});

	it("leaves an ordinary test under test/ alone", () => {
		expect(
			inspectProjectEvalTests(project({ "test/route.test.ts": "" })),
		).toBeUndefined();
	});

	it("accepts a spec suffix as well as test", () => {
		expect(
			inspectProjectEvalTests(project({ "evals/route.spec.ts": "" }))?.files,
		).toHaveLength(1);
	});

	it("reports nothing for a project with no evals at all", () => {
		// `undefined`, not an empty suite: there is no eval surface here, which
		// is different from one that exists and is empty.
		expect(inspectProjectEvalTests(project({}))).toBeUndefined();
	});

	it("builds a command that names the files it found", () => {
		const found = inspectProjectEvalTests(
			project({ "evals/route.test.ts": "" }),
		);
		expect(found?.command).toContain("route.test.ts");
	});

	it("names the source it discovered them from", () => {
		expect(
			inspectProjectEvalTests(project({ "evals/route.test.ts": "" }))?.source,
		).toBe("project-test-suite");
	});

	it("sorts the files it found", () => {
		const found = inspectProjectEvalTests(
			project({ "evals/z.test.ts": "", "evals/a.test.ts": "" }),
		);
		expect(found?.files?.[0]).toContain("a.test.ts");
	});

	it("does not list a directory as a suite", () => {
		expect(
			inspectProjectEvalTests(project({ "evals/nested.test.ts/keep.txt": "" })),
		).toBeUndefined();
	});
});
