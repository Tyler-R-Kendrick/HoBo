/**
 * Atom manifests — parsing them, and validating the params they declare.
 *
 * An atom's `meta.json` is authored by hand and read by the composer. Every
 * field it gets wrong is a scaffold that produces the wrong code, so the
 * parser's job is to refuse an atom outright rather than admit a half-usable
 * one.
 *
 * **An atom with no usable files is not an atom.** Nor is one with no id or no
 * description: the id is how compositions reference it and the description is
 * what retrieval ranks on. Each of those missing means `null` — the atom is
 * skipped by the corpus loader and never offered, which is strictly better
 * than being offered and failing at scaffold time.
 *
 * **Everything else defaults rather than refusing.** An unknown tier becomes
 * 1, a missing kind becomes `atom`, non-string entries are filtered out of
 * every list. These are recoverable: a wrong tier changes ranking, not
 * correctness, and refusing the whole atom over one malformed tag would lose a
 * working scaffold.
 *
 * **Params are validated against every atom in the composition at once.** Two
 * atoms may both declare `name` with different constraints, and a value has to
 * satisfy both — a composition is one scaffold, not two independent ones. That
 * is also why issues are reported per atom: the same value can be fine for one
 * and wrong for another, and the user needs to know which constraint it
 * violated.
 *
 * **Defaults fill empty strings, not just absent keys.** A CLI that passes
 * `--name ""` for an unset flag would otherwise defeat every default in the
 * corpus.
 */
import { describe, expect, it } from "vitest";

import {
	type AtomTemplate,
	applyAtomParamDefaults,
	fillAtomBody,
	parseAtomComposition,
	parseAtomParams,
	parseAtomTemplate,
	requiredParams,
} from "../src/atom-template.js";

const DIR = "/atoms/example";

/** A manifest that parses, for tests that vary one field at a time. */
function manifest(overrides: Record<string, unknown> = {}) {
	return {
		id: "atom:example",
		description: "an example atom",
		files: [{ path: "src/app.ts", from: "app.ts" }],
		...overrides,
	};
}

/** A parsed atom declaring the given param properties. */
function atomWith(
	properties: Record<string, unknown>,
	required: string[] = [],
	id = "atom:a",
): AtomTemplate {
	return parseAtomTemplate(
		DIR,
		manifest({ id, params: { required, properties } }),
	) as AtomTemplate;
}

describe("parseAtomTemplate — refusals", () => {
	it("refuses anything that is not an object", () => {
		for (const raw of [null, "atom", 7, undefined]) {
			expect(parseAtomTemplate(DIR, raw)).toBeNull();
		}
	});

	it("refuses a missing or empty id", () => {
		// The id is how compositions reference the atom. Without one it can be
		// loaded but never selected — worse than not being loaded at all.
		for (const id of [undefined, "", 7, null]) {
			expect(parseAtomTemplate(DIR, manifest({ id }))).toBeNull();
		}
	});

	it("refuses a non-string description", () => {
		// Retrieval ranks on the description. An atom without one would be in
		// the corpus and unreachable by any query.
		for (const description of [undefined, 7, null, {}]) {
			expect(parseAtomTemplate(DIR, manifest({ description }))).toBeNull();
		}
	});

	it("accepts an empty description string", () => {
		// Empty is a deliberate (if unhelpful) authoring choice; absent is a
		// mistake. Only the second is refused.
		expect(
			parseAtomTemplate(DIR, manifest({ description: "" })),
		).not.toBeNull();
	});

	it("refuses an atom with no usable file specs", () => {
		// Files are what an atom contributes. One with none would scaffold
		// nothing while appearing to succeed.
		for (const files of [undefined, [], "src/app.ts", [{ path: "a" }], [{}]]) {
			expect(parseAtomTemplate(DIR, manifest({ files }))).toBeNull();
		}
	});

	it("keeps only the file entries carrying both path and from", () => {
		// A half-specified entry has no source or no destination. Silently
		// treating one as the other would write a file to the wrong place.
		const atom = parseAtomTemplate(
			DIR,
			manifest({
				files: [
					{ path: "src/a.ts", from: "a.ts" },
					{ path: "src/b.ts" },
					{ from: "c.ts" },
					{ path: 7, from: "d.ts" },
					null,
				],
			}),
		);
		expect(atom?.files).toEqual([{ path: "src/a.ts", from: "a.ts" }]);
	});
});

describe("parseAtomTemplate — defaults", () => {
	it("defaults an unknown tier to 1 and keeps the three real ones", () => {
		// Tier changes ranking, not correctness, so a typo defaults rather than
		// refusing a working atom.
		for (const tier of [0, 1, 2]) {
			expect(parseAtomTemplate(DIR, manifest({ tier }))?.tier).toBe(tier);
		}
		for (const tier of [undefined, 3, -1, "1", null]) {
			expect(parseAtomTemplate(DIR, manifest({ tier }))?.tier).toBe(1);
		}
	});

	it("defaults a missing kind to atom", () => {
		expect(parseAtomTemplate(DIR, manifest({ kind: "recipe" }))?.kind).toBe(
			"recipe",
		);
		expect(parseAtomTemplate(DIR, manifest({ kind: 7 }))?.kind).toBe("atom");
		expect(parseAtomTemplate(DIR, manifest())?.kind).toBe("atom");
	});

	it("filters non-strings out of every list rather than refusing", () => {
		// One malformed tag must not cost the whole atom. Coercing would be
		// worse: `7` as a tag would match a query for "7".
		const atom = parseAtomTemplate(
			DIR,
			manifest({
				tags: ["web", 7, null, "api"],
				queries: ["make a site", {}],
				requires: [null],
				provides: "not-an-array",
			}),
		);
		expect(atom?.tags).toEqual(["web", "api"]);
		expect(atom?.queries).toEqual(["make a site"]);
		expect(atom?.requires).toEqual([]);
		expect(atom?.provides).toEqual([]);
	});

	it("records the directory it was loaded from", () => {
		// File specs are relative to it — without the directory the atom knows
		// what to copy but not from where.
		expect(parseAtomTemplate(DIR, manifest())?.dir).toBe(DIR);
	});
});

describe("parseAtomTemplate — param schema", () => {
	it("treats an absent or non-object params block as no params", () => {
		for (const params of [undefined, null, "name", 7]) {
			const atom = parseAtomTemplate(DIR, manifest({ params }));
			expect(atom?.params).toEqual({ required: [], properties: {} });
		}
	});

	it("keeps only string-typed properties", () => {
		// The scaffolder substitutes text. A number-typed property would be
		// declared, never satisfiable, and would fail validation for every value.
		const atom = parseAtomTemplate(
			DIR,
			manifest({
				params: {
					properties: {
						name: { type: "string" },
						count: { type: "number" },
						bad: null,
						alsoBad: "string",
					},
				},
			}),
		);
		expect(Object.keys(atom?.params.properties ?? {})).toEqual(["name"]);
	});

	it("keeps each constraint only when it has the right type", () => {
		// A `minLength` of `"3"` would be compared against a string length and
		// silently never fail. Dropping it is honest about what is enforced.
		const atom = parseAtomTemplate(
			DIR,
			manifest({
				params: {
					properties: {
						good: {
							type: "string",
							minLength: 3,
							pattern: "^[a-z]+$",
							default: "abc",
						},
						loose: {
							type: "string",
							minLength: "3",
							pattern: 7,
							default: 1,
						},
					},
				},
			}),
		);
		expect(atom?.params.properties.good).toEqual({
			type: "string",
			minLength: 3,
			pattern: "^[a-z]+$",
			default: "abc",
		});
		expect(atom?.params.properties.loose).toEqual({ type: "string" });
	});

	it("exposes the required list through requiredParams", () => {
		expect(
			requiredParams(atomWith({ name: { type: "string" } }, ["name"])),
		).toEqual(["name"]);
	});
});

describe("parseAtomComposition", () => {
	it("refuses anything without an id or without atoms", () => {
		// A composition is a list of atoms under a name. Missing either half
		// makes it unusable, and admitting it would produce an empty scaffold.
		expect(parseAtomComposition(null)).toBeNull();
		expect(parseAtomComposition({ atoms: ["atom:a"] })).toBeNull();
		expect(parseAtomComposition({ id: "", atoms: ["atom:a"] })).toBeNull();
		expect(parseAtomComposition({ id: "c" })).toBeNull();
		expect(parseAtomComposition({ id: "c", atoms: [] })).toBeNull();
		expect(parseAtomComposition({ id: "c", atoms: [7] })).toBeNull();
	});

	it("falls back to the id when no description is given", () => {
		// Compositions are listed to the user. An empty description would leave
		// a blank row; the id at least names the thing.
		expect(parseAtomComposition({ id: "c", atoms: ["a"] })?.description).toBe(
			"c",
		);
		expect(
			parseAtomComposition({ id: "c", atoms: ["a"], description: "real" })
				?.description,
		).toBe("real");
		expect(
			parseAtomComposition({ id: "c", atoms: ["a"], description: 7 })
				?.description,
		).toBe("c");
	});

	it("filters its tag and query lists like an atom's", () => {
		const composition = parseAtomComposition({
			id: "c",
			atoms: ["a", 7, "b"],
			tags: ["x", null],
			queries: "nope",
		});
		expect(composition?.atoms).toEqual(["a", "b"]);
		expect(composition?.tags).toEqual(["x"]);
		expect(composition?.queries).toEqual([]);
	});
});

describe("fillAtomBody", () => {
	it("substitutes every placeholder, tolerating inner whitespace", () => {
		// Templates are hand-written; `{{ name }}` and `{{name}}` both appear.
		expect(
			fillAtomBody("const a = '{{name}}'; // {{ name }}", { name: "x" }),
		).toBe("const a = 'x'; // x");
	});

	it("throws naming the parameter it could not fill", () => {
		// An unfilled placeholder written into a file would ship `{{name}}` as
		// source. Failing loudly, with the name, is what makes it fixable.
		expect(() => fillAtomBody("{{missing}}", {})).toThrow(
			"atom param missing is missing",
		);
	});

	it("substitutes an empty string when that is what was supplied", () => {
		// Empty is a value the caller chose; only absence is an error.
		expect(fillAtomBody("[{{name}}]", { name: "" })).toBe("[]");
	});

	it("leaves text that is not a placeholder alone", () => {
		expect(fillAtomBody("{ name } {{ a-b }} {{}}", {})).toBe(
			"{ name } {{ a-b }} {{}}",
		);
	});
});

describe("applyAtomParamDefaults", () => {
	it("fills a key the caller did not supply", () => {
		const filled = applyAtomParamDefaults(
			[atomWith({ name: { type: "string", default: "app" } })],
			{},
		);
		expect(filled.name).toBe("app");
	});

	it("fills a key supplied as an empty string", () => {
		// A CLI passing `--name ""` for an unset flag would otherwise defeat
		// every default in the corpus.
		const filled = applyAtomParamDefaults(
			[atomWith({ name: { type: "string", default: "app" } })],
			{ name: "" },
		);
		expect(filled.name).toBe("app");
	});

	it("leaves a real value alone", () => {
		const filled = applyAtomParamDefaults(
			[atomWith({ name: { type: "string", default: "app" } })],
			{ name: "chosen" },
		);
		expect(filled.name).toBe("chosen");
	});

	it("leaves a key with no default undefined", () => {
		// Inventing a value would produce a scaffold the user never described.
		expect(
			applyAtomParamDefaults([atomWith({ name: { type: "string" } })], {}),
		).toEqual({});
	});

	it("does not mutate the params it was given", () => {
		// The caller's object is often the parsed CLI flags, reused elsewhere.
		const params = {};
		applyAtomParamDefaults(
			[atomWith({ name: { type: "string", default: "app" } })],
			params,
		);
		expect(params).toEqual({});
	});

	it("lets the first atom that declares a default win", () => {
		// Two atoms in one composition may both default a shared key. The order
		// is the corpus order, and pinning it keeps a composition's output
		// stable across runs.
		const filled = applyAtomParamDefaults(
			[
				atomWith({ name: { type: "string", default: "first" } }, [], "a"),
				atomWith({ name: { type: "string", default: "second" } }, [], "b"),
			],
			{},
		);
		expect(filled.name).toBe("first");
	});
});

describe("parseAtomParams", () => {
	it("accepts params that satisfy every declared constraint", () => {
		const result = parseAtomParams(
			[atomWith({ name: { type: "string", minLength: 2 } }, ["name"])],
			{ name: "app" },
		);
		expect(result.ok).toBe(true);
		expect(result.issues).toEqual([]);
		expect(result.params.name).toBe("app");
	});

	it("returns the defaulted params even when validation fails", () => {
		// A caller reporting the failure can show what was actually attempted,
		// including the defaults it never saw the user type.
		const result = parseAtomParams(
			[
				atomWith({ name: { type: "string", minLength: 5, default: "ab" } }, [
					"name",
				]),
			],
			{},
		);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("ATOM_PARAMS_INVALID");
		expect(result.params.name).toBe("ab");
	});

	it("refuses a missing required param", () => {
		const result = parseAtomParams(
			[atomWith({ name: { type: "string" } }, ["name"])],
			{},
		);
		expect(result.ok).toBe(false);
		expect(result.issues[0]?.path).toBe("name");
	});

	it("allows an optional param to be absent", () => {
		// Optional means optional. Requiring every declared property would make
		// the required list meaningless.
		expect(
			parseAtomParams([atomWith({ nickname: { type: "string" } })], {}).ok,
		).toBe(true);
	});

	it("enforces minLength and pattern, together and separately", () => {
		// The four combinations build four different schemas, and a constraint
		// dropped in any of them is a value that reaches the scaffold unchecked.
		const cases: Array<[Record<string, unknown>, string, boolean]> = [
			[{ minLength: 3 }, "ab", false],
			[{ minLength: 3 }, "abc", true],
			[{ pattern: "^[a-z]+$" }, "AB", false],
			[{ pattern: "^[a-z]+$" }, "ab", true],
			[{ minLength: 3, pattern: "^[a-z]+$" }, "ab", false],
			[{ minLength: 3, pattern: "^[a-z]+$" }, "ABC", false],
			[{ minLength: 3, pattern: "^[a-z]+$" }, "abc", true],
			[{}, "", true],
		];
		for (const [spec, value, expected] of cases) {
			const result = parseAtomParams(
				[atomWith({ name: { type: "string", ...spec } }, ["name"])],
				{ name: value },
			);
			expect(result.ok, `${JSON.stringify(spec)} / ${value}`).toBe(expected);
		}
	});

	it("attributes each issue to the atom whose constraint it violated", () => {
		// Two atoms can declare the same key with different rules, and the user
		// needs to know which one refused — the fix differs.
		const result = parseAtomParams(
			[
				atomWith(
					{ name: { type: "string", minLength: 2 } },
					["name"],
					"atom:a",
				),
				atomWith(
					{ name: { type: "string", minLength: 10 } },
					["name"],
					"atom:b",
				),
			],
			{ name: "app" },
		);
		expect(result.ok).toBe(false);
		expect(result.issues.map((issue) => issue.atomId)).toEqual(["atom:b"]);
		expect(result.issues[0]?.message).toBeTruthy();
	});

	it("collects issues from every atom rather than stopping at the first", () => {
		// A user fixing one param at a time across a ten-atom composition is
		// exactly the experience reporting one issue would create.
		const result = parseAtomParams(
			[
				atomWith({ a: { type: "string" } }, ["a"], "atom:a"),
				atomWith({ b: { type: "string" } }, ["b"], "atom:b"),
			],
			{},
		);
		expect(result.issues.map((issue) => issue.atomId).sort()).toEqual([
			"atom:a",
			"atom:b",
		]);
	});

	it("succeeds for a composition that declares no params at all", () => {
		expect(parseAtomParams([atomWith({})], {}).ok).toBe(true);
		expect(parseAtomParams([], { stray: "value" }).ok).toBe(true);
	});
});
