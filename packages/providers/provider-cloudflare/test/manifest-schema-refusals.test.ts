/**
 * What `parsePublishedManifest` refuses, one arm at a time.
 *
 * `manifest.test.ts` proves a freshly published bundle parses, and pins the
 * static-secret refusal. This covers the remaining refusals, which are all
 * schema-version checks, plus the empty-capabilities case.
 *
 * **These documents are fetched, not built.** The parser exists because a
 * manifest arrives over the network from a provider this process does not
 * control — so "the bundle we just published parses" is the least interesting
 * thing it can prove. What matters is that a bundle which is *almost* right
 * gets rejected with a reason.
 *
 * **Every arm accumulates rather than short-circuiting.** A bundle wrong in
 * three ways reports three errors, so one fetch tells an operator everything to
 * fix rather than one thing per round trip. That is asserted directly, because
 * an early `return` in any arm would still pass every single-fault test here.
 *
 * **The version checks are pinned, not ranged.** A future manifest may mean
 * something different by the same field names, so a document declaring an
 * unknown schema is refused rather than read optimistically.
 */
import { describe, expect, it } from "vitest";

import {
	AUTH_SCHEMA,
	COST_SCHEMA,
	MANIFEST_SCHEMA,
	parsePublishedManifest,
	publishCapabilityManifest,
} from "../src/manifest.js";

const PATHS = {
	index: "/.well-known/capability-manifest/index.json",
	capabilities: "/.well-known/capability-manifest/capabilities.json",
	auth: "/.well-known/capability-manifest/auth.json",
	cost: "/.well-known/capability-manifest/cost.json",
} as const;

/** A freshly published bundle with one document rewritten. */
function bundleWith(
	path: string,
	mutate: (document: Record<string, unknown>) => void,
) {
	const documents = publishCapabilityManifest();
	const parsed = JSON.parse(
		documents[path as keyof typeof documents],
	) as Record<string, unknown>;
	mutate(parsed);
	documents[path as keyof typeof documents] =
		`${JSON.stringify(parsed, null, 2)}\n`;
	return documents;
}

const errorsFor = (
	path: string,
	mutate: (document: Record<string, unknown>) => void,
) => parsePublishedManifest(bundleWith(path, mutate)).errors;

describe("a bundle that is exactly right", () => {
	it("parses with no errors", () => {
		// The baseline the rest of this file mutates away from: without it, a
		// refusal below could be caused by the fixture rather than the fault.
		const parsed = parsePublishedManifest(publishCapabilityManifest());
		expect(parsed.ok).toBe(true);
		expect(parsed.errors).toEqual([]);
	});
});

describe("schema versions it does not implement", () => {
	it("refuses an index declaring another manifest schema", () => {
		expect(errorsFor(PATHS.index, (d) => (d.manifestSchema = "v0"))).toContain(
			`index.manifestSchema must be ${MANIFEST_SCHEMA}`,
		);
	});

	it("refuses an auth document declaring another schema", () => {
		expect(errorsFor(PATHS.auth, (d) => (d.schema = "v0"))).toContain(
			`auth.schema must be ${AUTH_SCHEMA}`,
		);
	});

	it("refuses a cost document declaring another schema", () => {
		expect(errorsFor(PATHS.cost, (d) => (d.schema = "v0"))).toContain(
			`cost.schema must be ${COST_SCHEMA}`,
		);
	});

	it("refuses a document that omits its schema entirely", () => {
		// Absent is not "assume the current one". A manifest that never declared
		// a version is one whose meaning nobody stated.
		expect(errorsFor(PATHS.auth, (d) => delete d.schema)).toContain(
			`auth.schema must be ${AUTH_SCHEMA}`,
		);
	});

	it("names the schema it wanted, not just that the value was wrong", () => {
		// The publisher's next move is to emit the right version, so the message
		// has to carry it.
		const [error] = errorsFor(PATHS.cost, (d) => (d.schema = "v0"));
		expect(error).toContain(COST_SCHEMA);
	});
});

describe("a capabilities document that lists nothing", () => {
	it("refuses an empty list", () => {
		// A provider advertising no capabilities cannot be matched against any
		// request, so an empty manifest is a publication bug rather than a
		// provider with nothing to offer.
		expect(
			errorsFor(PATHS.capabilities, (d) => (d.capabilities = [])),
		).toContain("capabilities.capabilities must be non-empty");
	});

	it("refuses a capabilities field that is not a list", () => {
		// Guarded with `isJsonArray`, so an object or a string is refused rather
		// than read for a `length`.
		for (const value of [{}, "compute", 3, null]) {
			expect(
				errorsFor(PATHS.capabilities, (d) => (d.capabilities = value)),
			).toContain("capabilities.capabilities must be non-empty");
		}
	});

	it("refuses a capabilities document with no capabilities field at all", () => {
		expect(
			errorsFor(PATHS.capabilities, (d) => delete d.capabilities),
		).toContain("capabilities.capabilities must be non-empty");
	});
});

describe("reporting more than one fault", () => {
	it("collects every error rather than stopping at the first", () => {
		// One fetch should tell an operator everything to fix. An early return in
		// any arm would still pass every single-fault test above, so this is
		// asserted directly.
		const documents = publishCapabilityManifest();
		for (const [path, mutate] of [
			[PATHS.index, (d: Record<string, unknown>) => (d.manifestSchema = "v0")],
			[PATHS.auth, (d: Record<string, unknown>) => (d.schema = "v0")],
			[PATHS.cost, (d: Record<string, unknown>) => (d.schema = "v0")],
		] as const) {
			const parsed = JSON.parse(
				documents[path as keyof typeof documents],
			) as Record<string, unknown>;
			mutate(parsed);
			documents[path as keyof typeof documents] =
				`${JSON.stringify(parsed, null, 2)}\n`;
		}
		const parsed = parsePublishedManifest(documents);
		expect(parsed.ok).toBe(false);
		expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
	});

	it("still returns the parsed documents alongside the errors", () => {
		// The caller may want to show what was published even though it was
		// refused; returning only errors would make that impossible.
		const parsed = parsePublishedManifest(
			bundleWith(PATHS.cost, (d) => (d.schema = "v0")),
		);
		expect(parsed.ok).toBe(false);
		expect(parsed.auth.schema).toBe(AUTH_SCHEMA);
	});
});
