import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	ATOM_EMBEDDER_DIM,
	ATOM_EMBEDDER_HASH,
	ATOM_EMBEDDER_ID,
	ATOMS_ROOT,
	embedAtomText,
	emitFromAtoms,
	loadAtomCorpus,
	readPersistedIndexMeta,
	rebuildAtomIndex,
	retrieveAtoms,
} from "../src/atom-index.js";
import { HOBO_AGENT_INSTRUCTIONS } from "../src/harness-customization.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots.length = 0;
});

describe("atomic template retrieval", () => {
	it("loads git-backed meta.json atoms without a network fetch", () => {
		const corpus = loadAtomCorpus();
		expect(ATOMS_ROOT.replace(/\\/gu, "/")).toMatch(/templates\/atoms$/u);
		expect(corpus.atoms.some((atom) => atom.id === "bindle.web-api")).toBe(
			true,
		);
		expect(corpus.atoms.some((atom) => atom.id === "arch.proto-cue-pair")).toBe(
			true,
		);
		expect(
			corpus.atoms.every((atom) => existsSync(join(atom.dir, "meta.json"))),
		).toBe(true);
		expect(corpus.compositions.some((item) => item.id === "hello-world")).toBe(
			true,
		);
		expect(
			corpus.atoms.find((atom) => atom.id === "bindle.web-api")?.requires,
		).toEqual(
			expect.arrayContaining([
				"bindle.env",
				"http.handler.api",
				"http.handler.web",
			]),
		);
	});

	it("uses one pinned local encoder for index and query", () => {
		expect(ATOM_EMBEDDER_ID).toBe("hobo-hashed-trigram-v1");
		expect(ATOM_EMBEDDER_HASH).toMatch(/^[a-f0-9]{64}$/u);
		const a = embedAtomText("hello world bindle");
		const b = embedAtomText("hello world bindle");
		const c = embedAtomText("station trail junction");
		expect(a.length).toBe(ATOM_EMBEDDER_DIM);
		expect([...a]).toEqual([...b]);
		const dot = a.reduce((sum, value, i) => sum + value * (c[i] ?? 0), 0);
		const self = a.reduce((sum, value) => sum + value * value, 0);
		expect(self).toBeGreaterThan(dot);
	});

	it("retrieves hello-world atoms from a natural-language create intent", () => {
		const hit = retrieveAtoms("create a hello world app");
		expect(hit.ok).toBe(true);
		expect(hit.confidence).toBe("high");
		expect(hit.decision).toBe("emit");
		expect(hit.composition?.id).toBe("hello-world");
		expect(hit.atoms.map((atom) => atom.id)).toEqual(
			expect.arrayContaining([
				"bindle.web-api",
				"http.api.hello",
				"http.web.hello",
				"bindle.camp-env",
				"arch.proto-cue-pair",
			]),
		);
	});

	it("fills and emits a Bindle that still typechecks as HoBo source", () => {
		const out = mkdtempSync(join(tmpdir(), "hobo-atoms-"));
		roots.push(out);
		const result = emitFromAtoms({
			intent: "hello world app",
			outputDir: out,
			params: { name: "greeter" },
		});
		expect(result.ok).toBe(true);
		expect(result.source).toBe("atoms");
		expect(result.decision).toBe("emit");
		const bindle = readFileSync(join(out, "src", "bindle.ts"), "utf8");
		expect(bindle).toContain('bindle("greeter"');
		expect(bindle).toContain("honoEntrypoint");
		expect(existsSync(join(out, "src", "api.ts"))).toBe(true);
		expect(existsSync(join(out, "src", "webapp.ts"))).toBe(true);
		expect(existsSync(join(out, "src", "camp-env.ts"))).toBe(true);
		expect(readFileSync(join(out, "package.json"), "utf8")).toContain(
			"@hobo/app-greeter",
		);
	});

	it("refuses when no atom is close enough", () => {
		const hit = retrieveAtoms("quantize a mesh shader for a flight stick");
		expect(hit.ok).toBe(false);
		expect(hit.confidence).toBe("low");
		expect(hit.decision).toBe("refuse");
		expect(hit.fallback).toBe("llm");
	});

	it("escalates only when explicitly allowed", () => {
		const hit = retrieveAtoms("quantize a mesh shader for a flight stick", {
			allowEscalate: true,
		});
		expect(hit.ok).toBe(false);
		expect(hit.decision).toBe("escalate");
	});

	it("rebuilds a derived one-writer SQLite cache offline", () => {
		const dir = mkdtempSync(join(tmpdir(), "hobo-atom-index-"));
		roots.push(dir);
		const path = join(dir, "template-index.sqlite");
		const rebuilt = rebuildAtomIndex({ path });
		expect(rebuilt.atomCount).toBeGreaterThanOrEqual(16);
		expect(rebuilt.embedderId).toBe(ATOM_EMBEDDER_ID);
		expect(rebuilt.sqliteVec).toBe(false);
		expect(existsSync(path)).toBe(true);
		const meta = readPersistedIndexMeta(path);
		expect(meta.embedder_hash).toBe(ATOM_EMBEDDER_HASH);
		expect(meta.dimension).toBe(String(ATOM_EMBEDDER_DIM));
	});

	it("bakes the atom taxonomy into Bo", () => {
		expect(HOBO_AGENT_INSTRUCTIONS).toContain("bindle.web-api");
		expect(HOBO_AGENT_INSTRUCTIONS).toContain("arch.proto-cue-pair");
		expect(HOBO_AGENT_INSTRUCTIONS).toMatch(/atomic|atoms/i);
		expect(HOBO_AGENT_INSTRUCTIONS).not.toMatch(/https:\/\//u);
	});
});
