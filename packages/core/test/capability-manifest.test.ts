/**
 * These are pinning tests, not behaviour tests.
 *
 * The codec they cover was moved out of eight provider packages verbatim. Every
 * published manifest digest is computed over `canonicalJson`'s exact bytes, so
 * the risk in a move like this is not that the code stops working — it is that
 * it keeps working while producing *different* bytes, invalidating references
 * that already exist. The literals below were captured from the pre-move
 * implementation, so drift fails here rather than at a consumer.
 */
import { describe, expect, it } from "vitest";

import {
	AUTH_SCHEMA,
	COST_SCHEMA,
	canonicalJson,
	digestRef,
	MANIFEST_PATHS,
	MANIFEST_SCHEMA,
	parsePublishedManifest,
	stableDigest,
} from "../src/ports/capability-manifest.js";

const NESTED = { b: 1, a: { d: [3, { f: 1, e: 2 }], c: "x" } };

describe("canonicalJson", () => {
	it("emits the exact bytes the providers emitted before the move", () => {
		expect(canonicalJson(NESTED)).toBe(
			'{\n  "a": {\n    "c": "x",\n    "d": [\n      3,\n      {\n        "e": 2,\n        "f": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
		);
	});

	it("sorts at every depth and keeps array order", () => {
		// Arrays are sequences, not sets: sorting them would change meaning, and
		// the capabilities document relies on port order being stable.
		expect(canonicalJson({ z: [3, 1, 2] })).toBe(
			'{\n  "z": [\n    3,\n    1,\n    2\n  ]\n}\n',
		);
	});

	it("ends with a trailing newline", () => {
		// Load-bearing: the digest is over JSON.stringify, but the *published*
		// file is this string, and a missing newline is a diff on every publish.
		expect(canonicalJson({})).toBe("{}\n");
	});

	it("is insensitive to the order keys were written in", () => {
		expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
	});
});

describe("stableDigest", () => {
	it("reproduces the pre-move digests exactly", () => {
		expect(stableDigest(NESTED)).toBe("fnv:754f6090");
		expect(stableDigest({})).toBe("fnv:00000f62");
		expect(digestRef("cost:x")).toBe("fnv:02e2d5b8");
	});

	it("agrees for documents that differ only in key order", () => {
		expect(stableDigest({ a: 1, b: 2 })).toBe(stableDigest({ b: 2, a: 1 }));
	});

	it("changes when the document changes", () => {
		expect(stableDigest({ a: 1 })).not.toBe(stableDigest({ a: 2 }));
	});

	it("is always eight hex digits behind the fnv: prefix", () => {
		// The padStart is what makes references fixed-width; dropping it produces
		// shorter digests for small hashes and breaks nothing until it does.
		for (const seed of ["", "a", "cost:aws.s3", "x".repeat(500)]) {
			expect(stableDigest(seed)).toMatch(/^fnv:[0-9a-f]{8}$/u);
		}
	});
});

describe("parsePublishedManifest", () => {
	function bundle(overrides: Record<string, unknown> = {}) {
		const auth = {
			schema: AUTH_SCHEMA,
			staticSecrets: false,
			...(overrides.auth as object),
		};
		return {
			[MANIFEST_PATHS.index]: JSON.stringify({
				manifestSchema: MANIFEST_SCHEMA,
				...(overrides.index as object),
			}),
			[MANIFEST_PATHS.capabilities]: JSON.stringify({
				capabilities: [{ port: "kv" }],
				...(overrides.capabilities as object),
			}),
			[MANIFEST_PATHS.auth]: JSON.stringify(auth),
			[MANIFEST_PATHS.cost]: JSON.stringify({
				schema: COST_SCHEMA,
				...(overrides.cost as object),
			}),
		};
	}

	it("accepts a well-formed bundle", () => {
		const result = parsePublishedManifest(bundle());
		expect(result.errors).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it.each([
		[
			"a published static key",
			{ auth: { staticKey: "AKIA…" } },
			/static secrets/,
		],
		[
			"a published client secret",
			{ auth: { clientSecret: "s3cr3t" } },
			/static secrets/,
		],
		[
			"staticSecrets not false",
			{ auth: { staticSecrets: true } },
			/keyless federation/,
		],
		[
			"a wrong index schema",
			{ index: { manifestSchema: "nope/v1" } },
			/manifestSchema/,
		],
		["a wrong auth schema", { auth: { schema: "nope/v1" } }, /auth\.schema/],
		["a wrong cost schema", { cost: { schema: "nope/v1" } }, /cost\.schema/],
		["no capabilities", { capabilities: { capabilities: [] } }, /non-empty/],
	])("refuses %s", (_label, overrides, expected) => {
		const result = parsePublishedManifest(bundle(overrides));
		expect(result.ok).toBe(false);
		expect(result.errors.join(" ")).toMatch(expected);
	});

	it("reports every problem at once rather than the first", () => {
		// A caller fixing one field at a time against a provider it cannot
		// redeploy quickly is the case this serves.
		const result = parsePublishedManifest(
			bundle({ auth: { schema: "nope/v1", staticSecrets: true } }),
		);
		expect(result.errors.length).toBeGreaterThan(1);
	});

	it("does not throw on a bundle missing documents entirely", () => {
		// Fetched from a provider-controlled origin, so "absent" is a real input.
		const result = parsePublishedManifest({});
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});
