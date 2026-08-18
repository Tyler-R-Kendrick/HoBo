/**
 * The harness needs its own tests, and it did not have any.
 *
 * Everything below is a way `describeConcern` could pass while checking
 * nothing, which is the only failure mode that matters in a test harness: a
 * broken assertion library reports green and takes every suite built on it with
 * it. `parseConcernCases` and `callableMembers` are exercised directly because
 * `describeConcern` itself can only be observed by running a suite.
 */
import { describe, expect, it } from "vitest";

import { callableMembers, parseConcernCases } from "../src/concern.js";

const row = (extra: string) => `{"method":"f",${extra}}`;

describe("parseConcernCases", () => {
	it("reads rows, skipping blanks and # comments", () => {
		const cases = parseConcernCases(
			`# a note\n\n${row('"expect":1')}\n${row('"expect":2')}\n`,
		);
		expect(cases).toHaveLength(2);
	});

	it.each([
		["an unknown key", row('"expcet":1'), /unknown key "expcet"/u],
		["no method", '{"expect":1}', /non-empty "method"/u],
		["an empty method", '{"method":"","expect":1}', /non-empty "method"/u],
		["nothing asserted", row('"name":"x"'), /asserts nothing/u],
		["a throw and a value", row('"throws":"x","expect":1'), /both a throw/u],
		[
			"a throwsSubset and a value",
			row('"throwsSubset":{"name":"E"},"subset":{}'),
			/both a throw/u,
		],
		["malformed JSON", "{not json", /is not JSON/u],
		["no cases at all", "# only a comment\n", /declares no cases/u],
	])("refuses %s", (_label, text, expected) => {
		expect(() => parseConcernCases(text, "cases")).toThrow(expected);
	});

	it("names the line so a bad row is findable in a long file", () => {
		expect(() =>
			parseConcernCases(`${row('"expect":1')}\n{"expcet":2}\n`, "f.jsonl"),
		).toThrow(/f\.jsonl:2/u);
	});
});

describe("callableMembers", () => {
	it("finds inherited methods, not just own ones", () => {
		class Base {
			inherited() {}
		}
		class Derived extends Base {
			own() {}
		}
		expect(callableMembers(new Derived())).toEqual(["inherited", "own"]);
	});

	it("counts a getter without invoking it", () => {
		let reads = 0;
		const subject = {
			get computed() {
				reads += 1;
				return 1;
			},
		};
		expect(callableMembers(subject)).toEqual(["computed"]);
		// Listing must not run it: a getter with a side effect would otherwise
		// fire once per suite just by being enumerated.
		expect(reads).toBe(0);
	});

	it("ignores plain data on an object", () => {
		expect(callableMembers({ value: 1, method() {} })).toEqual(["method"]);
	});

	it("treats a module namespace as functions only", () => {
		// Every export of an ES module is a getter, so without this a plain
		// constant would be demanded as a member needing its own cases.
		const namespace = Object.create(null, {
			[Symbol.toStringTag]: { value: "Module" },
			CONSTANT: { get: () => "x", enumerable: true },
			fn: { get: () => () => undefined, enumerable: true },
		}) as object;
		expect(callableMembers(namespace)).toEqual(["fn"]);
	});
});
