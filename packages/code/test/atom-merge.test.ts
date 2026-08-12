import { describe, expect, it } from "vitest";
import { materializeAtomFiles } from "../src/atom-index.js";
import { mergeAtomFiles } from "../src/atom-merge.js";
import { loadAtomCorpus, parseAtomParams } from "../src/atom-template.js";

describe("entity-aware snippet merge", () => {
	it("appends camps in one Yard without clobbering the provider pin", () => {
		const corpus = loadAtomCorpus();
		const selected = ["yard.azure", "camp.colocate"]
			.map((id) => corpus.atoms.find((atom) => atom.id === id))
			.filter((atom): atom is NonNullable<typeof atom> => atom !== undefined);
		const parsed = parseAtomParams(selected, {
			name: "shop",
			provider: "azure",
			campName: "prod",
			peerCamp: "api",
			network: "shared",
		});
		expect(parsed.ok).toBe(true);
		const merged = materializeAtomFiles(selected, parsed.params);
		expect(merged.ok).toBe(true);
		const yard = merged.files.get("src/yard.ts");
		expect(yard).toContain('provider: "azure"');
		expect(yard).toContain('camp("prod")');
		expect(yard).toContain('camp("api")');
		expect(yard).toContain('"shared"');
	});

	it("fails closed when unmarked files disagree", () => {
		const result = mergeAtomFiles([
			{ path: "src/a.ts", atomId: "one", body: "export const a = 1;\n" },
			{ path: "src/a.ts", atomId: "two", body: "export const a = 2;\n" },
		]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("ATOM_MERGE_UNMARKED");
	});

	it("keeps a trainable hole instead of inventing handler logic", () => {
		const corpus = loadAtomCorpus();
		const atom = corpus.atoms.find((item) => item.id === "http.api.trainable");
		expect(atom).toBeDefined();
		if (!atom) return;
		const parsed = parseAtomParams([atom], { name: "greeter" });
		const merged = materializeAtomFiles([atom], parsed.params);
		expect(merged.ok).toBe(true);
		expect(merged.holes).toContain("greet");
		const api = merged.files.get("src/api.ts");
		expect(api).toContain('"use training"');
		expect(api).toContain("training.define");
		expect(api).not.toContain("greetingPrefix");
	});
});
