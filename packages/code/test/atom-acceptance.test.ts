import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	fillAtomBody,
	loadAtomCorpus,
	parseAtomParams,
} from "../src/atom-template.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

interface AcceptanceFixture {
	readonly params?: Record<string, string>;
	readonly expectFiles?: string[];
	readonly expectContains?: Record<string, string[]>;
}

describe("atom acceptance fixtures", () => {
	const corpus = loadAtomCorpus();

	it("has an acceptance.json for every atom", () => {
		expect(corpus.atoms.length).toBeGreaterThanOrEqual(16);
		for (const atom of corpus.atoms) {
			expect(
				() =>
					// SAFETY: parsed or fixture value is the named domain type after this assertion.
					JSON.parse(
						readFileSync(join(atom.dir, "acceptance.json"), "utf8"),
						// SAFETY: parsed or fixture value is the named domain type after this assertion.
					) as AcceptanceFixture,
			).not.toThrow();
		}
	});

	for (const atom of corpus.atoms) {
		it(`renders ${atom.id} deterministically`, () => {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const fixture = JSON.parse(
				readFileSync(join(atom.dir, "acceptance.json"), "utf8"),
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
			) as AcceptanceFixture;
			const parsed = parseAtomParams([atom], fixture.params ?? {});
			expect(parsed.ok).toBe(true);
			const out = mkdtempSync(join(tmpdir(), `hobo-acc-${atom.id}-`));
			roots.push(out);
			const written = new Map<string, string>();
			for (const file of atom.files) {
				const relativePath = fillAtomBody(file.path, parsed.params);
				const body = fillAtomBody(
					readFileSync(join(atom.dir, file.from), "utf8"),
					parsed.params,
				);
				written.set(relativePath, body);
			}
			for (const expected of fixture.expectFiles ?? []) {
				expect([...written.keys()]).toContain(expected);
			}
			for (const [path, needles] of Object.entries(
				fixture.expectContains ?? {},
			)) {
				const body = written.get(path);
				expect(body, path).toBeDefined();
				for (const needle of needles) {
					expect(body).toContain(needle);
				}
			}
			const again = fillAtomBody(
				readFileSync(join(atom.dir, atom.files[0]?.from ?? ""), "utf8"),
				parsed.params,
			);
			expect(again).toBe(
				written.get(fillAtomBody(atom.files[0]?.path ?? "", parsed.params)),
			);
		});
	}
});
