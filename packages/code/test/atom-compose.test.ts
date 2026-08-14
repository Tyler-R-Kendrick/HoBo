import { describe, expect, it } from "vitest";

import { composeAtoms } from "../src/atom-compose.js";
import type { AtomTemplate } from "../src/atom-template.js";
import { loadAtomCorpus } from "../src/atom-template.js";

function stub(
	id: string,
	requires: readonly string[],
	provides: readonly string[],
): AtomTemplate {
	return {
		id,
		tier: 1,
		kind: "test",
		description: id,
		tags: [],
		queries: [],
		requires,
		provides,
		params: { required: [], properties: {} },
		files: [{ path: `${id}.ts`, from: `${id}.ts` }],
		dir: "/tmp",
	};
}

describe("composeAtoms", () => {
	it("topo-sorts hello-world requires/provides", () => {
		const corpus = loadAtomCorpus();
		const selected = ["bindle.web-api"]
			.map((id) => corpus.atoms.find((atom) => atom.id === id))
			.filter((atom): atom is NonNullable<typeof atom> => atom !== undefined);
		const composed = composeAtoms(selected, corpus.atoms);
		expect(composed.ok).toBe(true);
		const ids = composed.atoms.map((atom) => atom.id);
		expect(ids).toEqual(
			expect.arrayContaining([
				"bindle.camp-env",
				"http.api.hello",
				"http.web.hello",
				"bindle.web-api",
			]),
		);
		expect(ids.indexOf("http.api.hello")).toBeLessThan(
			ids.indexOf("http.web.hello"),
		);
		expect(ids.indexOf("bindle.camp-env")).toBeLessThan(
			ids.indexOf("bindle.web-api"),
		);
	});

	it("fails closed when a required capability is missing", () => {
		const composed = composeAtoms(
			[stub("need", ["missing.cap"], ["x"])],
			[stub("need", ["missing.cap"], ["x"])],
		);
		expect(composed.ok).toBe(false);
		expect(composed.code).toBe("ATOM_COMPOSE_MISSING");
		expect(composed.missing).toContain("missing.cap");
	});

	it("fails closed on a requires/provides cycle", () => {
		const a = stub("a", ["cap.b"], ["cap.a"]);
		const b = stub("b", ["cap.a"], ["cap.b"]);
		const composed = composeAtoms([a, b], [a, b]);
		expect(composed.ok).toBe(false);
		expect(composed.code).toBe("ATOM_COMPOSE_CYCLE");
	});
});
