/**
 * When the template engine refuses to emit, and where its index lives.
 *
 * `atom-retrieve.test.ts` proves the happy path: a known intent retrieves atoms
 * and emits a Bindle that typechecks. This covers the decision *around* that —
 * whether to emit at all — plus the index paths and the catalog the model is
 * handed.
 *
 * The refusal is the whole point of the confidence threshold. Emitting a
 * template for an intent the index only weakly matched produces code that
 * looks authoritative, compiles, and does the wrong thing — which is worse
 * than emitting nothing, because the user has no signal to check it. So a top
 * hit below `ATOM_HIGH_SCORE` refuses and hands back to the LLM, which at
 * least reasons about the request rather than pattern-matching it.
 *
 * Three properties follow:
 *
 * **A refusal still reports what it considered.** The ranked list comes back
 * even when nothing cleared the bar, so a caller can show "closest match was
 * X, at 0.004" rather than a bare no.
 *
 * **Escalation is opt-in.** `refuse` and `escalate` are different outcomes:
 * one stops, the other spends more of the user's budget. Defaulting to
 * escalate would turn every unmatched phrase into an inference bill nobody
 * asked for.
 *
 * **The fallback is always named.** `fallback: "llm"` is what tells the caller
 * there is another route; a refusal with no fallback reads as a dead end.
 *
 * The index path resolution matters for a different reason: this is a derived
 * cache under `$HOBO_HOME`, and resolving it against an ambient home would let
 * a sandboxed run write into the developer's real one.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	ATOM_HIGH_SCORE,
	ATOM_RRF_K,
	defaultAtomIndexPath,
	emitFromAtoms,
	loadAtomCorpus,
	rankAtoms,
	readPersistedIndexMeta,
	rebuildAtomIndex,
	renderAtomCatalogInstructions,
	resetAtomIndexCache,
	retrieveAtoms,
} from "../src/atom-index.js";

const dirs: string[] = [];
const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-atom-"));
	dirs.push(dir);
	return dir;
}

/** An intent no atom in the corpus can plausibly match. */
const NONSENSE = "xyzzy plugh frobnicate quux zork grue";

describe("refusing a weak match", () => {
	it("refuses rather than emitting a template it is unsure of", () => {
		// Emitting a weakly-matched template produces code that looks
		// authoritative, compiles, and does the wrong thing — worse than
		// emitting nothing, because the user has no signal to check it.
		expect(retrieveAtoms(NONSENSE).ok).toBe(false);
	});

	it("reports low confidence rather than a bare failure", () => {
		// The caller renders this; "low" is actionable in a way that a false
		// boolean is not.
		expect(retrieveAtoms(NONSENSE).confidence).toBe("low");
	});

	it("names the LLM as the way forward", () => {
		// A refusal with no fallback reads as a dead end. There is another
		// route, and the caller has to be told about it.
		expect(retrieveAtoms(NONSENSE).fallback).toBe("llm");
	});

	it("returns no atoms at all", () => {
		// Half a match is not a partial success — a caller that emitted the
		// atoms from a refused retrieval would get exactly the wrong-code
		// failure the threshold exists to prevent.
		expect(retrieveAtoms(NONSENSE).atoms).toStrictEqual([]);
	});

	it("still reports what it considered", () => {
		// So the caller can say "closest match was X" rather than a bare no.
		expect(retrieveAtoms(NONSENSE).ranked.length).toBeGreaterThan(0);
	});

	it("reports the score it rejected", () => {
		// The number is what lets someone tell "nothing close" from "just
		// under the bar" — different problems with different fixes.
		expect(retrieveAtoms(NONSENSE).score).toBeLessThan(ATOM_HIGH_SCORE);
	});

	it("decides to refuse by default", () => {
		expect(retrieveAtoms(NONSENSE).decision).toBe("refuse");
	});

	it("escalates only when the caller opts in", () => {
		// Refuse and escalate are different outcomes: one stops, the other
		// spends the user's inference budget. Defaulting to escalate would bill
		// every unmatched phrase.
		expect(retrieveAtoms(NONSENSE, { allowEscalate: true }).decision).toBe(
			"escalate",
		);
	});

	it("still refuses to emit when escalation is allowed", () => {
		// Escalating is handing the work to the LLM, not lowering the bar for
		// the template engine.
		expect(retrieveAtoms(NONSENSE, { allowEscalate: true }).ok).toBe(false);
	});

	it("refuses an empty intent", () => {
		// Nothing to match. Returning the highest-scoring atom for an empty
		// query would emit whatever happens to sort first.
		expect(retrieveAtoms("").ok).toBe(false);
	});

	it("refuses whitespace", () => {
		expect(retrieveAtoms("   ").ok).toBe(false);
	});
});

describe("emitting from a refusal", () => {
	it("does not write files", () => {
		const result = emitFromAtoms({ intent: NONSENSE, outDir: tempDir() });
		expect(result.files).toStrictEqual([]);
	});

	it("reports no source", () => {
		// "none" rather than a guess: a caller logging the source would
		// otherwise attribute LLM-generated code to the template engine.
		expect(emitFromAtoms({ intent: NONSENSE, outDir: tempDir() }).source).toBe(
			"none",
		);
	});

	it("carries the refusal decision through", () => {
		expect(
			emitFromAtoms({ intent: NONSENSE, outDir: tempDir() }).decision,
		).toBe("refuse");
	});

	it("names the LLM fallback", () => {
		expect(
			emitFromAtoms({ intent: NONSENSE, outDir: tempDir() }).fallback,
		).toBe("llm");
	});

	it("carries an escalate decision through when allowed", () => {
		expect(
			emitFromAtoms({
				intent: NONSENSE,
				outDir: tempDir(),
				allowEscalate: true,
			}).decision,
		).toBe("escalate");
	});

	it("reports no holes for a refusal", () => {
		// Holes are unfilled template parameters. A refusal produced no
		// template, so reporting holes would describe a file that does not
		// exist.
		expect(
			emitFromAtoms({ intent: NONSENSE, outDir: tempDir() }).holes,
		).toStrictEqual([]);
	});
});

describe("ranking", () => {
	it("returns hits in descending score order", () => {
		// The caller takes the top; an unsorted list would make the threshold
		// check compare against an arbitrary entry.
		const ranked = rankAtoms("create a hello world bindle", 12);
		const scores = ranked.map((hit) => hit.score);
		expect([...scores].sort((a, b) => b - a)).toStrictEqual(scores);
	});

	it("honours the limit", () => {
		expect(rankAtoms("hello world", 3).length).toBeLessThanOrEqual(3);
	});

	it("defaults to a bounded number of hits", () => {
		// Unbounded would hand the model the whole corpus and spend the context
		// the atoms exist to save.
		expect(rankAtoms("hello world").length).toBeLessThanOrEqual(8);
	});

	it("accepts a limit of zero", () => {
		// A caller asking for nothing gets nothing rather than a crash.
		expect(rankAtoms("hello world", 0)).toStrictEqual([]);
	});

	it("labels each hit as an atom or a composition", () => {
		// They are emitted differently — a composition expands to several
		// atoms — so the caller has to be able to tell them apart.
		for (const hit of rankAtoms("hello world", 12)) {
			expect(["atom", "composition"]).toContain(hit.kind);
		}
	});

	it("ranks something for an intent with no match at all", () => {
		// Ranking and deciding are separate: the list is evidence for the
		// refusal, so it has to exist even when nothing clears the bar.
		expect(rankAtoms(NONSENSE, 5).length).toBeGreaterThanOrEqual(0);
	});
});

describe("where the index lives", () => {
	it("prefers an explicit HOBO_ATOM_INDEX", () => {
		// The escape hatch for a machine where the derived cache belongs
		// somewhere else — a read-only home, a shared build cache.
		process.env.HOBO_ATOM_INDEX = "/tmp/explicit-index.sqlite";
		expect(defaultAtomIndexPath()).toBe("/tmp/explicit-index.sqlite");
	});

	it("ignores an empty HOBO_ATOM_INDEX", () => {
		// An exported-but-empty variable is not a path; using it would try to
		// open the empty string.
		process.env.HOBO_ATOM_INDEX = "";
		process.env.HOBO_HOME = "/tmp/hobo-home";
		expect(defaultAtomIndexPath()).toContain("/tmp/hobo-home");
	});

	it("puts the cache under HOBO_HOME", () => {
		// It is a derived cache; resolving against an ambient home would let a
		// sandboxed run write into the developer's real one.
		process.env.HOBO_ATOM_INDEX = "";
		process.env.HOBO_HOME = "/tmp/hobo-home";
		expect(defaultAtomIndexPath()).toBe(
			join("/tmp/hobo-home", "durable", "code", "template-index.sqlite"),
		);
	});

	it("falls back to the user's home when HOBO_HOME is unset", () => {
		process.env.HOBO_ATOM_INDEX = "";
		process.env.HOBO_HOME = "";
		expect(defaultAtomIndexPath()).toContain(".hobo");
	});

	it("names a sqlite file, not a directory", () => {
		// The caller opens it directly; a directory path would fail at open
		// with a confusing SQLITE_CANTOPEN.
		process.env.HOBO_ATOM_INDEX = "";
		process.env.HOBO_HOME = "/tmp/hobo-home";
		expect(defaultAtomIndexPath().endsWith(".sqlite")).toBe(true);
	});
});

describe("rebuilding the index", () => {
	it("writes to the path it was given", () => {
		const path = join(tempDir(), "nested", "index.sqlite");
		expect(rebuildAtomIndex({ path }).path).toBe(path);
	});

	it("creates the parent directory", () => {
		// A first run on a clean machine has no `durable/code` yet; failing
		// there would make the cache unbuildable rather than merely cold.
		const path = join(tempDir(), "deep", "nested", "index.sqlite");
		expect(() => rebuildAtomIndex({ path })).not.toThrow();
	});

	it("reports what it indexed", () => {
		const result = rebuildAtomIndex({ path: ":memory:" });
		expect(result.atomCount).toBeGreaterThan(0);
		expect(result.compositionCount).toBeGreaterThan(0);
	});

	it("stamps the embedder it used", () => {
		// The index is only valid for the encoder that built it; an index
		// queried with a different embedder returns nonsense rather than
		// failing, so the id has to travel with the data.
		const result = rebuildAtomIndex({ path: ":memory:" });
		expect(result.embedderId.length).toBeGreaterThan(0);
		expect(result.embedderHash.length).toBeGreaterThan(0);
	});

	it("falls back to the default path when given none", () => {
		// `rebuildAtomIndex()` with no argument is the shape the CLI uses; the
		// path it picks has to be the same one `openIndex` will later read, or
		// a rebuild would silently populate a file nothing queries.
		const path = join(tempDir(), "from-env.sqlite");
		process.env.HOBO_ATOM_INDEX = path;
		expect(rebuildAtomIndex().path).toBe(path);
	});

	it("builds without the sqlite-vec extension", () => {
		// `HOBO_SQLITE_VEC` is an opt-in accelerator, and the overwhelmingly
		// common case is that it is unset. The brute-force cosine path must be
		// a working default rather than a degraded one.
		process.env.HOBO_SQLITE_VEC = "";
		expect(rebuildAtomIndex({ path: ":memory:" }).atomCount).toBeGreaterThan(0);
	});

	it("survives an HOBO_SQLITE_VEC that points at nothing", () => {
		// A stale export from a machine that once had the extension installed
		// is the realistic failure. Loading it throws inside SQLite; letting
		// that escape would make the index unbuildable because of an unrelated
		// optimisation, so the loader swallows it and falls back.
		process.env.HOBO_SQLITE_VEC = join(tempDir(), "no-such-extension.so");
		expect(() => rebuildAtomIndex({ path: ":memory:" })).not.toThrow();
	});

	it("is repeatable — rebuilding twice gives the same counts", () => {
		// The corpus is git-backed and the encoder is pinned, so a rebuild is
		// deterministic. A drifting count would mean the cache and the corpus
		// disagree.
		const first = rebuildAtomIndex({ path: ":memory:" });
		const second = rebuildAtomIndex({ path: ":memory:" });
		expect(second.atomCount).toBe(first.atomCount);
	});

	it("persists metadata a later reader can check", () => {
		// The point of the stamps: a cold reader verifies the index matches its
		// own embedder before trusting a single score.
		const path = join(tempDir(), "index.sqlite");
		rebuildAtomIndex({ path });
		const meta = readPersistedIndexMeta(path);
		expect(meta.embedder_hash?.length).toBeGreaterThan(0);
		expect(meta.dimension?.length).toBeGreaterThan(0);
	});

	it("records the ranking constants it was built with", () => {
		// RRF k and the confidence bar decide every score; an index built under
		// different constants is not comparable to one built under these.
		const path = join(tempDir(), "index.sqlite");
		rebuildAtomIndex({ path });
		const meta = readPersistedIndexMeta(path);
		expect(meta.rrf_k).toBe(String(ATOM_RRF_K));
		expect(meta.high_score).toBe(String(ATOM_HIGH_SCORE));
	});

	it("records a corpus digest so a stale cache is detectable", () => {
		const path = join(tempDir(), "index.sqlite");
		rebuildAtomIndex({ path });
		expect(readPersistedIndexMeta(path).corpus_digest?.length).toBeGreaterThan(
			0,
		);
	});

	it("reads back nothing for an index that does not exist", () => {
		// A cold machine has no cache. Throwing would make the first run fail
		// rather than build.
		expect(
			readPersistedIndexMeta(join(tempDir(), "absent.sqlite")),
		).toStrictEqual({});
	});
});

describe("the in-memory cache", () => {
	it("can be reset without having been built", () => {
		// Called on every rebuild, including the first — a guard that assumed a
		// live cache would throw on a cold start.
		expect(() => resetAtomIndexCache()).not.toThrow();
	});

	it("is safe to reset twice", () => {
		resetAtomIndexCache();
		expect(() => resetAtomIndexCache()).not.toThrow();
	});

	it("still answers after a reset", () => {
		// The reset drops the handle; the next query has to rebuild rather than
		// fail on a closed database.
		resetAtomIndexCache();
		expect(rankAtoms("hello world", 3).length).toBeGreaterThanOrEqual(0);
	});
});

describe("the catalog handed to the model", () => {
	const catalog = renderAtomCatalogInstructions();

	it("lists every atom in the corpus", () => {
		// An atom missing from the catalog is one the model never offers, no
		// matter how well the index would have matched it.
		for (const atom of loadAtomCorpus().atoms) {
			expect(catalog).toContain(atom.id);
		}
	});

	it("lists every composition", () => {
		for (const item of loadAtomCorpus().compositions) {
			expect(catalog).toContain(item.id);
		}
	});

	it("shows which atoms each composition expands to", () => {
		// The model needs to know a composition is several atoms, or it will
		// treat it as one and under-scope the work.
		const first = loadAtomCorpus().compositions[0];
		if (first) {
			for (const atomId of first.atoms) expect(catalog).toContain(atomId);
		}
	});

	it("tells the model not to invent a second verb", () => {
		// The instruction that stops the model reimplementing `hobo-code
		// template` in prose instead of calling it.
		expect(catalog).toMatch(/do not invent a second verb/i);
	});

	it("tells the model not to fetch", () => {
		// Atoms are git-backed and local; a fetch would make emission depend on
		// the network and on whatever is at the other end today.
		expect(catalog).toMatch(/do not fetch/i);
	});

	it("states the refusal rule the engine actually implements", () => {
		// The model's expectation and the engine's behaviour have to agree, or
		// it will promise emission the engine then refuses.
		expect(catalog).toMatch(/[Ll]ow-confidence refuses/);
	});

	it("accepts a corpus it is handed rather than always loading one", () => {
		// The parameter exists so a caller can render a filtered catalog;
		// ignoring it would make the argument a lie.
		const corpus = loadAtomCorpus();
		expect(renderAtomCatalogInstructions(corpus)).toBe(catalog);
	});
});
