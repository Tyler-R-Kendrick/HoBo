/**
 * Pact v3 response matching rules on the provider side (src/matching.ts), as
 * the Pact Specification v3 defines them
 * (https://github.com/pact-foundation/pact-specification/tree/version-3):
 *
 * - "Matching Rules": rules cascade, "a rule can be specified on a value and
 *   will apply to all children of that value"; the most specific path wins.
 * - "Supported matchers": Type ("equal if they are the same type"), MinType
 *   and MaxType ("if the values represent a collection, the length of the
 *   actual value is compared against the minimum" / "maximum"), Regex, and
 *   Equality, the default, which resets a cascading rule on a child.
 * - "Allow arrays of matchers": `combine` is AND (the default) or OR.
 *
 * Anything this harness does not implement is refused when the rules are
 * read, never ignored.
 */
import { describe, expect, it } from "vitest";

import {
	MatchingRuleError,
	matchResponseBody,
	type PactJsonValue,
	parseMatchingPath,
	parseResponseMatchingRules,
	type ResponseMatchingRule,
} from "../src/matching.js";
import { type PactResponse, parsePactDocument } from "../src/pact.js";
import { type ProviderStub, verifyPact } from "../src/verify.js";

const EXAMPLE = {
	id: "prj_8b8788b1b182",
	name: "a",
	tags: [{ at: 1 }],
	project: { id: "prj_1", name: "site", framework: null },
} as const;

function document(
	matchingRules: PactJsonValue | undefined,
	example: PactJsonValue = EXAMPLE,
): PactJsonValue {
	return {
		consumer: { name: "TestConsumer" },
		provider: { name: "VercelApi" },
		interactions: [
			{
				description: "create a project",
				request: { method: "POST", path: "/v9/projects", body: { name: "a" } },
				response: {
					status: 200,
					body: example,
					...(matchingRules === undefined ? undefined : { matchingRules }),
				},
			},
			{
				description: "unknown project",
				request: { method: "GET", path: "/v9/projects/b" },
				response: { status: 404, body: { error: { code: "not_found" } } },
			},
		],
		metadata: { pactSpecification: { version: "3.0.0" } },
	};
}

const ID_RULE = {
	body: {
		"$.id": { matchers: [{ match: "regex", regex: "^prj_[0-9a-f]{12}$" }] },
	},
};

function provider(body: PactResponse["body"]): ProviderStub {
	return {
		name: "VercelApi",
		handle: (request) =>
			request.method === "POST"
				? { status: 200, body }
				: { status: 404, body: { error: { code: "not_found", message: "x" } } },
	};
}

async function verify(raw: PactJsonValue, body: PactResponse["body"]) {
	return verifyPact(parsePactDocument(raw), provider(body), {
		responseMatchingRules: parseResponseMatchingRules(raw),
	});
}

function rulesOf(body: PactJsonValue): readonly ResponseMatchingRule[] {
	const [first] = parseResponseMatchingRules(document({ body }));
	return first?.rules ?? [];
}

/** The first mismatch of `actual` against EXAMPLE under `body`'s rules, or undefined. */
function mismatch(body: PactJsonValue, actual: PactJsonValue) {
	return matchResponseBody(rulesOf(body), EXAMPLE, actual);
}

describe("parseMatchingPath", () => {
	it("reads $, .name and [index] steps", () => {
		expect(parseMatchingPath("$")).toEqual([]);
		expect(parseMatchingPath("$.a[0].b-c")).toEqual(["a", 0, "b-c"]);
	});

	it.each([
		"a.b",
		"$a",
		"$.a..b",
		"$.a[x]",
		"$['a']",
		"$.a[*]",
		"$.*",
	])("refuses %s", (path) => {
		expect(() => parseMatchingPath(path)).toThrow(MatchingRuleError);
	});
});

describe("a regex rule", () => {
	it("admits a generated id that matches, so it verifies against the pact's example", async () => {
		const report = await verify(document(ID_RULE), {
			...EXAMPLE,
			id: "prj_07c967ca6d97",
		});
		expect(report).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
	});

	it("refuses an id that does not match, at its path", async () => {
		const report = await verify(document(ID_RULE), {
			...EXAMPLE,
			id: "project-7",
		});
		expect(report.failures).toEqual([
			{
				description: "create a project",
				reason: "body field $.id does not match regex ^prj_[0-9a-f]{12}$",
			},
		]);
	});

	it("is what admits the id: without it the generated id fails", async () => {
		const report = await verify(document(undefined), {
			...EXAMPLE,
			id: "prj_07c967ca6d97",
		});
		expect(report.ok).toBe(false);
	});

	it("does not admit a missing field", async () => {
		const { id: _dropped, ...rest } = EXAMPLE;
		const report = await verify(document(ID_RULE), rest);
		expect(report.failures[0]?.reason).toBe("body field $.id is missing");
	});
});

describe("a type rule cascades to every child of the value it names", () => {
	const PROJECT_TYPE = { "$.project": { matchers: [{ match: "type" }] } };

	it("refuses an object that lacks the example's keys: {project:{}} is not the example's type", () => {
		expect(mismatch(PROJECT_TYPE, { ...EXAMPLE, project: {} })).toBe(
			"body field $.project.id is missing",
		);
	});

	it("checks each child by type: a number where the example has a string fails", () => {
		expect(
			mismatch(PROJECT_TYPE, {
				...EXAMPLE,
				project: { id: 7, name: "site", framework: null },
			}),
		).toBe(
			"body field $.project.id is a number, not a string like the example (type rule at $.project)",
		);
	});

	it("admits other values of the same types, and keys the example does not have", () => {
		expect(
			mismatch(PROJECT_TYPE, {
				...EXAMPLE,
				project: { id: "prj_2", name: "other", framework: null, extra: true },
			}),
		).toBeUndefined();
	});

	it("an equality rule on a child resets the cascade back to comparing by value", () => {
		const rules = {
			...PROJECT_TYPE,
			"$.project.name": { matchers: [{ match: "equality" }] },
		};
		expect(
			mismatch(rules, {
				...EXAMPLE,
				project: { id: "prj_2", name: "other", framework: null },
			}),
		).toBe("body field $.project.name does not match");
		expect(
			mismatch(rules, {
				...EXAMPLE,
				project: { id: "prj_2", name: "site", framework: null },
			}),
		).toBeUndefined();
	});

	it("a more specific rule wins over the cascading one", () => {
		const rules = {
			...PROJECT_TYPE,
			"$.project.id": { matchers: [{ match: "regex", regex: "^prj_\\d+$" }] },
		};
		expect(
			mismatch(rules, {
				...EXAMPLE,
				project: { id: "prj_x", name: "site", framework: null },
			}),
		).toBe("body field $.project.id does not match regex ^prj_\\d+$");
	});
});

describe("a type rule on an array", () => {
	const TAGS = (matcher: PactJsonValue) => ({
		"$.tags": { matchers: [matcher] },
	});

	it("holds every element to the example's first element", () => {
		expect(
			mismatch(TAGS({ match: "type" }), {
				...EXAMPLE,
				tags: [{ at: 2 }, { at: 3 }, { at: 4 }],
			}),
		).toBeUndefined();
		expect(
			mismatch(TAGS({ match: "type" }), {
				...EXAMPLE,
				tags: [{ at: 2 }, { at: "3" }],
			}),
		).toBe(
			"body field $.tags[1].at is a string, not a number like the example (type rule at $.tags)",
		);
		expect(
			mismatch(TAGS({ match: "type" }), { ...EXAMPLE, tags: [{ at: 2 }, {}] }),
		).toBe("body field $.tags[1].at is missing");
	});

	it("with min 1 refuses []", () => {
		expect(
			mismatch(TAGS({ match: "type", min: 1 }), { ...EXAMPLE, tags: [] }),
		).toBe(
			"body field $.tags has 0 elements, fewer than min 1 (type rule at $.tags)",
		);
	});

	it("enforces max", () => {
		const rule = TAGS({ match: "type", max: 2 });
		expect(
			mismatch(rule, { ...EXAMPLE, tags: [{ at: 1 }, { at: 2 }] }),
		).toBeUndefined();
		expect(
			mismatch(rule, { ...EXAMPLE, tags: [{ at: 1 }, { at: 2 }, { at: 3 }] }),
		).toBe(
			"body field $.tags has 3 elements, more than max 2 (type rule at $.tags)",
		);
	});

	it("refuses something that is not an array", () => {
		expect(
			mismatch(TAGS({ match: "type" }), { ...EXAMPLE, tags: { at: 1 } }),
		).toBe(
			"body field $.tags is an object, not an array like the example (type rule at $.tags)",
		);
	});
});

describe("combine", () => {
	const both = (combine: PactJsonValue) => ({
		"$.id": {
			combine,
			matchers: [
				{ match: "regex", regex: "^prj_" },
				{ match: "regex", regex: "[0-9a-f]{12}$" },
			],
		},
	});

	it("AND, the default, needs every matcher", () => {
		expect(mismatch(both("AND"), { ...EXAMPLE, id: "prj_x" })).toBe(
			"body field $.id does not match regex [0-9a-f]{12}$",
		);
		expect(
			mismatch(both("AND"), { ...EXAMPLE, id: "prj_0123456789ab" }),
		).toBeUndefined();
	});

	it("OR needs one", () => {
		expect(mismatch(both("OR"), { ...EXAMPLE, id: "prj_x" })).toBeUndefined();
		expect(mismatch(both("OR"), { ...EXAMPLE, id: "dpl_x" })).toBe(
			"body field $.id matches none of the rule at $.id: does not match regex ^prj_; does not match regex [0-9a-f]{12}$",
		);
	});
});

describe("parseResponseMatchingRules refuses what it does not implement", () => {
	it.each([
		[
			"a matcher it does not implement",
			{ body: { "$.id": { matchers: [{ match: "include", value: "x" }] } } },
			/only regex, type and equality/u,
		],
		[
			"a regex that does not compile",
			{ body: { "$.id": { matchers: [{ match: "regex", regex: "(" }] } } },
			/does not compile/u,
		],
		[
			"an empty matchers list",
			{ body: { "$.id": { matchers: [] } } },
			/non-empty matchers/u,
		],
		[
			"rules outside the body",
			{ header: { "content-type": { matchers: [{ match: "type" }] } } },
			/only body rules/u,
		],
		[
			"a path without $",
			{ body: { id: { matchers: [{ match: "type" }] } } },
			/must start with \$/u,
		],
		[
			"an unknown key on a matcher",
			{ body: { "$.id": { matchers: [{ match: "type", minimum: 1 }] } } },
			/has key "minimum"/u,
		],
		[
			"a key another matcher owns",
			{ body: { "$.id": { matchers: [{ match: "type", regex: "^p" }] } } },
			/has key "regex"/u,
		],
		[
			"min on a regex matcher",
			{
				body: {
					"$.id": { matchers: [{ match: "regex", regex: "^p", min: 1 }] },
				},
			},
			/has key "min"/u,
		],
		[
			"an unknown key on a rule",
			{ body: { "$.id": { matchers: [{ match: "type" }], weight: 2 } } },
			/has key "weight"/u,
		],
		[
			"a combine other than AND or OR",
			{ body: { "$.id": { matchers: [{ match: "type" }], combine: "XOR" } } },
			/combine must be AND or OR/u,
		],
		[
			"a min that is not a non-negative integer",
			{ body: { "$.tags": { matchers: [{ match: "type", min: "1" }] } } },
			/min must be a non-negative integer/u,
		],
		[
			"a max below min",
			{ body: { "$.tags": { matchers: [{ match: "type", min: 2, max: 1 }] } } },
			/max 1 is below min 2/u,
		],
		[
			"a path the example does not have",
			{ body: { "$.missing": { matchers: [{ match: "type" }] } } },
			/names no field of the example/u,
		],
		[
			"an example that fails its own rule",
			{ body: { "$.id": { matchers: [{ match: "regex", regex: "^dpl_" }] } } },
			/the example does not satisfy its own rules: body field \$\.id does not match regex/u,
		],
		[
			"a min the example itself does not meet",
			{ body: { "$.tags": { matchers: [{ match: "type", min: 2 }] } } },
			/fewer than min 2/u,
		],
	])("refuses %s", (_name, rules, reason) => {
		expect(() => parseResponseMatchingRules(document(rules))).toThrow(reason);
		expect(() => parseResponseMatchingRules(document(rules))).toThrow(
			MatchingRuleError,
		);
	});

	it("names its refusals with a code", () => {
		let refusal: MatchingRuleError | undefined;
		try {
			parseResponseMatchingRules(document({ body: { "$.id": {} } }));
		} catch (error) {
			if (error instanceof MatchingRuleError) refusal = error;
		}
		expect(refusal?.code).toBe("MATCHING_RULE_INVALID");
	});
});

describe("verifyPact with response matching rules", () => {
	it("compares interactions without rules by value, as without the option", async () => {
		const raw = document(ID_RULE);
		const report = await verifyPact(
			parsePactDocument(raw),
			{
				name: "VercelApi",
				handle: (request) =>
					request.method === "POST"
						? { status: 200, body: EXAMPLE }
						: { status: 404, body: { error: { code: "gone" } } },
			},
			{ responseMatchingRules: parseResponseMatchingRules(raw) },
		);
		expect(report.failures).toEqual([
			{
				description: "unknown project",
				reason: "body field $.error.code does not match",
			},
		]);
	});

	it("refuses rules read from another pact", async () => {
		const raw = document(ID_RULE);
		const other = parseResponseMatchingRules(raw).slice(0, 1);
		const report = await verifyPact(parsePactDocument(raw), provider(EXAMPLE), {
			responseMatchingRules: other,
		});
		expect(report.ok).toBe(false);
		expect(report.failures[0]?.reason).toMatch(
			/matching rules were read from another pact/u,
		);
	});
});
