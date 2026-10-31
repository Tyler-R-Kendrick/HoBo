import { describe, expect, it } from "vitest";

import {
	MatchingRuleError,
	type PactJsonValue,
	parseMatchingPath,
	parseResponseMatchingRules,
	withResponseMatchingRules,
} from "../src/matching.js";
import { parsePactDocument, type PactResponse } from "../src/pact.js";
import { type ProviderStub, verifyPact } from "../src/verify.js";

function document(matchingRules: PactJsonValue | undefined): PactJsonValue {
	return {
		consumer: { name: "TestConsumer" },
		provider: { name: "VercelApi" },
		interactions: [
			{
				description: "create a project",
				request: { method: "POST", path: "/v9/projects", body: { name: "a" } },
				response: {
					status: 200,
					body: { id: "prj_8b8788b1b182", name: "a", tags: [{ at: 1 }] },
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
	return verifyPact(
		parsePactDocument(raw),
		withResponseMatchingRules(provider(body), parseResponseMatchingRules(raw)),
	);
}

describe("parseMatchingPath", () => {
	it("reads $, .name and [index] steps", () => {
		expect(parseMatchingPath("$")).toEqual([]);
		expect(parseMatchingPath("$.a[0].b-c")).toEqual(["a", 0, "b-c"]);
	});

	it.each(["a.b", "$a", "$.a..b", "$.a[x]", "$['a']"])("refuses %s", (path) => {
		expect(() => parseMatchingPath(path)).toThrow(MatchingRuleError);
	});
});

describe("withResponseMatchingRules", () => {
	it("a generated id that matches the regex verifies against the pact's example", async () => {
		const report = await verify(document(ID_RULE), {
			id: "prj_07c967ca6d97",
			name: "a",
			tags: [{ at: 1 }],
		});
		expect(report).toEqual({
			providerName: "VercelApi",
			ok: true,
			failures: [],
		});
	});

	it("an id that does not match the regex still fails, at its path", async () => {
		const report = await verify(document(ID_RULE), {
			id: "project-7",
			name: "a",
			tags: [{ at: 1 }],
		});
		expect(report.ok).toBe(false);
		expect(report.failures).toEqual([
			{
				description: "create a project",
				reason: "body field $.id does not match",
			},
		]);
	});

	it("without the rule the generated id fails: the rule is what admits it", async () => {
		const report = await verify(document(undefined), {
			id: "prj_07c967ca6d97",
			name: "a",
			tags: [{ at: 1 }],
		});
		expect(report.ok).toBe(false);
	});

	it("a type rule admits any value of the example's kind, inside arrays too", async () => {
		const rules = {
			body: { "$.tags[0].at": { matchers: [{ match: "type" }] } },
		};
		const ok = await verify(document(rules), {
			id: "prj_8b8788b1b182",
			name: "a",
			tags: [{ at: 99 }],
		});
		const wrongKind = await verify(document(rules), {
			id: "prj_8b8788b1b182",
			name: "a",
			tags: [{ at: "99" }],
		});
		expect(ok.ok).toBe(true);
		expect(wrongKind.ok).toBe(false);
	});

	it("a missing field is not admitted by a rule", async () => {
		const report = await verify(document(ID_RULE), {
			name: "a",
			tags: [{ at: 1 }],
		});
		expect(report.failures[0]?.reason).toBe("body field $.id is missing");
	});
});

describe("parseResponseMatchingRules", () => {
	it.each([
		[
			{ body: { "$.id": { matchers: [{ match: "include", value: "x" }] } } },
			/only regex, type and equality/u,
		],
		[
			{ body: { "$.id": { matchers: [{ match: "regex", regex: "(" }] } } },
			/does not compile/u,
		],
		[{ body: { "$.id": { matchers: [] } } }, /non-empty matchers/u],
		[
			{ header: { "content-type": { matchers: [{ match: "type" }] } } },
			/only body rules/u,
		],
		[
			{ body: { id: { matchers: [{ match: "type" }] } } },
			/must start with \$/u,
		],
	])("refuses %j rather than ignoring it", (rules, reason) => {
		expect(() => parseResponseMatchingRules(document(rules))).toThrow(reason);
	});
});
