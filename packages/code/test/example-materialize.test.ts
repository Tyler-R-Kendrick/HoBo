/**
 * Scaffolding a named example has to produce *that* example.
 *
 * `example-catalog-match.test.ts` beside this file covers picking an entry
 * from a prompt. This file covers what happens next, and the rule it exists
 * to protect is the one stated in the source:
 *
 * **A catalog example that carries a real Bindle is copied verbatim.** If the
 * user asks for `hello-world`, they get the shipped `hello-world` — a tree
 * that actually deploys under `hobo up` — not an atoms approximation wearing
 * the same name. An approximation is worse than a refusal here: it scaffolds,
 * it looks right, and it fails at deploy time with an error that points at the
 * user's app rather than at the scaffold that lied.
 *
 * Everything downstream of that follows from it:
 *
 * **The scaffold is renamed but not rewritten.** The copy takes the app name
 * into `package.json` and leaves the rest byte-for-byte. Anything else and the
 * "verbatim" claim is false.
 *
 * **Every scaffold records where it came from.** `hobo.scaffold.json` names
 * the template and whether the tree was copied (`repo`) or generated
 * (`atoms`), because those two have different support answers and there is
 * otherwise no way to tell them apart after the fact.
 *
 * **Build detritus never ships.** `node_modules`, `dist`, `.git`, `.hobo` and
 * `coverage` are skipped at every level — a copied `.git` would splice the
 * repo's history into the user's new project.
 *
 * All of it runs against an injected catalog pointing at temp directories, so
 * no test depends on which examples happen to be shipped today.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	type ExampleCatalogEntry,
	materializeExample,
	renderExampleCatalogInstructions,
} from "../src/example-catalog.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function temp(prefix = "hobo-example-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}

function write(root: string, relativePath: string, body: string): void {
	const full = join(root, relativePath);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, body);
}

/**
 * An example directory carrying one of the four Bindle markers, which is what
 * makes it "deployable" and therefore copied verbatim.
 */
function deployableExample(
	id: string,
	options: {
		readonly marker?: string;
		readonly packageJson?: string;
		readonly extra?: Readonly<Record<string, string>>;
	} = {},
): ExampleCatalogEntry {
	const sourceDir = temp(`hobo-example-${id}-`);
	write(sourceDir, options.marker ?? "src/bindle.ts", "export default {};\n");
	if (options.packageJson !== undefined)
		write(sourceDir, "package.json", options.packageJson);
	for (const [path, body] of Object.entries(options.extra ?? {}))
		write(sourceDir, path, body);
	return {
		id,
		title: id,
		blurb: "",
		aliases: [],
		tags: [],
		fallback: false,
		sourceDir,
		source: "repo",
	};
}

/** An entry with no Bindle marker — the plain-copy path, not the verbatim one. */
function plainExample(id: string): ExampleCatalogEntry {
	const sourceDir = temp(`hobo-plain-${id}-`);
	write(sourceDir, "README.md", `# ${id}\n`);
	return {
		id,
		title: id,
		blurb: "",
		aliases: [],
		tags: [],
		fallback: false,
		sourceDir,
		source: "repo",
	};
}

const scaffoldOf = (outputDir: string) =>
	JSON.parse(readFileSync(join(outputDir, "hobo.scaffold.json"), "utf8")) as {
		templateId: string;
		appName: string;
		source: string;
		files?: string[];
	};

describe("copying a deployable example verbatim", () => {
	const materialize = (entry: ExampleCatalogEntry, appName = "my-app") => {
		const outputDir = join(temp(), "out");
		return {
			outputDir,
			result: materializeExample({
				exampleId: entry.id,
				outputDir,
				appName,
				catalog: [entry],
			}),
		};
	};

	it("reports the copy as coming from the repo, not from atoms", async () => {
		// This is the load-bearing distinction: `repo` means the tree deploys,
		// `atoms` means it was generated and may not.
		const entry = deployableExample("hello-world");
		expect(materialize(entry).result.source).toBe("repo");
	});

	it("names the template it copied", () => {
		const entry = deployableExample("hello-world");
		expect(materialize(entry).result.templateId).toBe("hello-world");
	});

	it("brings the Bindle across", () => {
		// Without it the scaffold is not the example — it is a directory with
		// the example's name.
		const { outputDir } = materialize(deployableExample("hello-world"));
		expect(existsSync(join(outputDir, "src/bindle.ts"))).toBe(true);
	});

	for (const marker of ["src/bindle.ts", "app.ts", "src/bindle.js", "app.js"]) {
		it(`recognises ${marker} as a Bindle`, () => {
			// Four spellings are in the wild across the shipped examples; missing
			// one would silently route that example down the atoms path.
			const entry = deployableExample("marked", { marker });
			expect(materialize(entry).result.source).toBe("repo");
		});
	}

	it("copies nested files, not just the top level", () => {
		const entry = deployableExample("nested", {
			extra: { "src/lib/deep.ts": "export const x = 1;\n" },
		});
		const { outputDir } = materialize(entry);
		expect(existsSync(join(outputDir, "src/lib/deep.ts"))).toBe(true);
	});

	it("leaves copied file contents byte-for-byte", () => {
		// "Verbatim" is the promise; a rewritten file would break at deploy in a
		// way that looks like the user's bug.
		const body = "export const marker = 'unchanged';\n";
		const entry = deployableExample("verbatim", {
			extra: { "src/thing.ts": body },
		});
		const { outputDir } = materialize(entry);
		expect(readFileSync(join(outputDir, "src/thing.ts"), "utf8")).toBe(body);
	});

	it("creates the output directory rather than requiring it to exist", () => {
		// The caller has just chosen a name; making them mkdir first is a
		// pointless failure mode.
		const { outputDir } = materialize(deployableExample("fresh"));
		expect(existsSync(outputDir)).toBe(true);
	});

	it("lists the files it wrote", () => {
		const entry = deployableExample("listed");
		const { result } = materialize(entry);
		expect(result.files).toContain("src/bindle.ts");
	});

	it("counts its own scaffold record among the files", () => {
		expect(materialize(deployableExample("listed")).result.files).toContain(
			"hobo.scaffold.json",
		);
	});
});

describe("skipping build detritus", () => {
	for (const junk of ["node_modules", "dist", ".git", ".hobo", "coverage"]) {
		it(`does not copy ${junk}`, () => {
			// A copied `.git` splices the repo's history into the user's new
			// project; the others are just large and stale, but all five are
			// wrong to ship.
			const entry = deployableExample("junky", {
				extra: { [`${junk}/file.txt`]: "junk\n" },
			});
			const outputDir = join(temp(), "out");
			materializeExample({
				exampleId: entry.id,
				outputDir,
				appName: "app",
				catalog: [entry],
			});
			expect(existsSync(join(outputDir, junk))).toBe(false);
		});
	}

	it("skips detritus nested below the top level too", () => {
		// The filter runs on every path segment, not just the first — a
		// `packages/foo/node_modules` is the common real shape.
		const entry = deployableExample("nested-junk", {
			extra: { "packages/foo/node_modules/dep.js": "junk\n" },
		});
		const outputDir = join(temp(), "out");
		materializeExample({
			exampleId: entry.id,
			outputDir,
			appName: "app",
			catalog: [entry],
		});
		expect(existsSync(join(outputDir, "packages/foo/node_modules"))).toBe(
			false,
		);
	});

	it("keeps a legitimate file beside the skipped one", () => {
		// The filter must not take the whole directory down with it.
		const entry = deployableExample("mixed", {
			extra: { "dist/out.js": "junk\n", "src/keep.ts": "keep\n" },
		});
		const outputDir = join(temp(), "out");
		materializeExample({
			exampleId: entry.id,
			outputDir,
			appName: "app",
			catalog: [entry],
		});
		expect(existsSync(join(outputDir, "src/keep.ts"))).toBe(true);
	});
});

describe("naming the scaffolded package", () => {
	const materializeWith = (entry: ExampleCatalogEntry, appName: string) => {
		const outputDir = join(temp(), "out");
		materializeExample({
			exampleId: entry.id,
			outputDir,
			appName,
			catalog: [entry],
		});
		return JSON.parse(
			readFileSync(join(outputDir, "package.json"), "utf8"),
		) as Record<string, unknown>;
	};

	it("renames an existing package.json to the app name", () => {
		const entry = deployableExample("named", {
			packageJson: JSON.stringify({ name: "@hobo/example-named" }),
		});
		expect(materializeWith(entry, "my-app").name).toBe("@hobo/app-my-app");
	});

	it("keeps the rest of an existing package.json", () => {
		// Only the name is the scaffold's business; dropping scripts or deps
		// would break an example that was working a moment ago.
		const entry = deployableExample("keeps", {
			packageJson: JSON.stringify({
				name: "@hobo/example-keeps",
				scripts: { dev: "hobo dev" },
			}),
		});
		expect(materializeWith(entry, "my-app").scripts).toStrictEqual({
			dev: "hobo dev",
		});
	});

	it("writes a package.json when the example had none", () => {
		// Try-site app directories lean on their parent package for deps; a
		// scaffold stands alone, so it has to declare what it imports.
		const entry = deployableExample("bare");
		expect(materializeWith(entry, "my-app").name).toBe("@hobo/app-my-app");
	});

	it("declares the bindles dependency in a generated package.json", () => {
		// This is the one dependency `app.ts` actually imports; without it the
		// standalone scaffold does not install.
		const entry = deployableExample("bare");
		expect(materializeWith(entry, "my-app").dependencies).toStrictEqual({
			"@hobo/bindles": "workspace:*",
		});
	});

	it("marks a generated package.json private", () => {
		// A scaffold is somebody's new app, not something to publish by
		// accident on a stray `npm publish`.
		expect(materializeWith(deployableExample("bare"), "my-app").private).toBe(
			true,
		);
	});

	it("declares a generated package.json as ESM", () => {
		expect(materializeWith(deployableExample("bare"), "my-app").type).toBe(
			"module",
		);
	});
});

describe("the scaffold record", () => {
	const record = (entry: ExampleCatalogEntry, appName = "my-app") => {
		const outputDir = join(temp(), "out");
		materializeExample({
			exampleId: entry.id,
			outputDir,
			appName,
			catalog: [entry],
		});
		return scaffoldOf(outputDir);
	};

	it("names the template that produced the tree", () => {
		// Support's first question is "which example is this from"; without the
		// record the only answer is guesswork from file names.
		expect(record(deployableExample("hello-world")).templateId).toBe(
			"hello-world",
		);
	});

	it("names the app it was scaffolded as", () => {
		expect(record(deployableExample("hello-world"), "shopfront").appName).toBe(
			"shopfront",
		);
	});

	it("records a verbatim copy as sourced from the repo", () => {
		expect(record(deployableExample("hello-world")).source).toBe("repo");
	});

	it("is written even when the example carried no package.json", () => {
		// The record is what distinguishes copied from generated; skipping it on
		// the bare path would leave exactly the trees that need it unlabelled.
		expect(record(deployableExample("bare")).source).toBe("repo");
	});
});

describe("an example with no Bindle to copy", () => {
	it("still produces a tree rather than refusing", () => {
		// A catalog entry without a Bindle marker is documentation-shaped, not
		// broken; the user asked for it by name and should get it.
		const entry = plainExample("docs-only");
		const outputDir = join(temp(), "out");
		const result = materializeExample({
			exampleId: entry.id,
			outputDir,
			appName: "app",
			catalog: [entry],
			intent: "xyzzy plugh frobnicate quux",
		});
		expect(["repo", "atoms"]).toContain(result.source);
		expect(result.files.length).toBeGreaterThan(0);
	});

	it("generates from atoms when the intent matches a composition", () => {
		// A catalog with no deployable tree for this id is exactly when atoms
		// earn their keep — the user still gets working code, and the scaffold
		// record says it was generated rather than copied so nobody mistakes it
		// for a shipped example.
		const outputDir = join(temp(), "out");
		const result = materializeExample({
			exampleId: "trainable-hello",
			outputDir,
			appName: "app",
			catalog: [],
			intent: "trainable hello",
		});
		expect(result.source).toBe("atoms");
		expect(scaffoldOf(outputDir).source).toBe("atoms");
	});

	it("records the composition the atoms path used, not the requested id", () => {
		// The id was a guess; the composition is what actually produced the
		// files, and it is what a support answer has to name.
		const outputDir = join(temp(), "out");
		materializeExample({
			exampleId: "some-guess",
			outputDir,
			appName: "app",
			catalog: [],
			intent: "trainable hello",
		});
		expect(scaffoldOf(outputDir).templateId).not.toBe("some-guess");
	});

	it("lists the generated files in the scaffold record", () => {
		const outputDir = join(temp(), "out");
		materializeExample({
			exampleId: "trainable-hello",
			outputDir,
			appName: "app",
			catalog: [],
			intent: "trainable hello",
		});
		expect(scaffoldOf(outputDir).files?.length).toBeGreaterThan(0);
	});

	it("defaults the intent from the example id and app name", () => {
		// A caller that knows the example but not how to phrase an intent still
		// gets a sensible query rather than an empty one.
		const outputDir = join(temp(), "out");
		expect(() =>
			materializeExample({
				exampleId: "trainable hello",
				outputDir,
				appName: "app",
				catalog: [],
			}),
		).not.toThrow();
	});

	it("refuses by name when the id is in no catalog at all", () => {
		// The id came from somewhere — a stale bookmark, a typo, a removed
		// example. Naming it is the difference between a fixable message and
		// "something went wrong".
		expect(() =>
			materializeExample({
				exampleId: "no-such-example",
				outputDir: join(temp(), "out"),
				appName: "app",
				catalog: [],
				intent: "xyzzy plugh frobnicate quux zork",
			}),
		).toThrow(/no-such-example/);
	});
});

describe("the catalog blurb handed to the model", () => {
	const entry = (
		id: string,
		extra: Partial<ExampleCatalogEntry> = {},
	): ExampleCatalogEntry => ({
		id,
		title: id,
		blurb: "",
		aliases: [],
		tags: [],
		fallback: false,
		sourceDir: "/nowhere",
		source: "package",
		...extra,
	});

	it("tells the model not to fetch templates from the network", () => {
		// The whole catalog exists so scaffolding is offline and deterministic;
		// an agent that fetches would produce a different app each run.
		expect(renderExampleCatalogInstructions([])).toMatch(/[Nn]ever fetch/);
	});

	it("tells the model to materialize rather than to hand over a command", () => {
		// "run `hobo`" is the failure this product exists to remove — the reader
		// may not have a shell they are comfortable in.
		expect(renderExampleCatalogInstructions([])).toMatch(/Do not tell them/);
	});

	it("lists an example by id", () => {
		expect(renderExampleCatalogInstructions([entry("hello-world")])).toContain(
			"hello-world",
		);
	});

	it("prefers the blurb over the title when there is one", () => {
		// The blurb is written to be read; the title is a label.
		expect(
			renderExampleCatalogInstructions([
				entry("x", { title: "Ex", blurb: "a tiny greeting service" }),
			]),
		).toContain("a tiny greeting service");
	});

	it("falls back to the title when the blurb is empty", () => {
		expect(
			renderExampleCatalogInstructions([entry("x", { title: "Ex" })]),
		).toContain("Ex");
	});

	it("lists aliases so a near-miss prompt still resolves", () => {
		expect(
			renderExampleCatalogInstructions([
				entry("x", { aliases: ["greeter", "hello service"] }),
			]),
		).toContain("aliases: greeter, hello service");
	});

	it("omits the alias clause entirely when there are none", () => {
		// An empty "(aliases: )" is noise in a prompt that is paying for every
		// token.
		expect(renderExampleCatalogInstructions([entry("x")])).not.toContain(
			"aliases:",
		);
	});

	it("shows at most four aliases", () => {
		expect(
			renderExampleCatalogInstructions([
				entry("x", {
					aliases: ["one", "two", "three", "four", "zzfifth"],
				}),
			]),
		).not.toContain("zzfifth");
	});

	it("marks the fallback example", () => {
		// The model needs to know which entry answers "make me an app" with no
		// further detail.
		expect(
			renderExampleCatalogInstructions([entry("x", { fallback: true })]),
		).toContain("[fallback]");
	});

	it("does not mark a non-fallback example", () => {
		expect(renderExampleCatalogInstructions([entry("x")])).not.toContain(
			"[fallback]",
		);
	});

	it("caps the list at twenty-four entries", () => {
		// The instructions go into every prompt; an unbounded catalog would grow
		// the system prompt without bound as examples are added.
		const many = Array.from({ length: 40 }, (_unused, index) =>
			entry(`example-${index}`),
		);
		const text = renderExampleCatalogInstructions(many);
		expect(text).toContain("example-23");
		expect(text).not.toContain("example-24");
	});

	it("renders with no examples at all rather than throwing", () => {
		// A fresh checkout with no examples folder still has to produce a usable
		// system prompt.
		expect(renderExampleCatalogInstructions([]).length).toBeGreaterThan(0);
	});
});
