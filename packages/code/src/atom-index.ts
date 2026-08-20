import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { composeAtoms } from "./atom-compose.js";
import {
	ATOM_EMBEDDER_DIM,
	ATOM_EMBEDDER_HASH,
	ATOM_EMBEDDER_ID,
	cosineSimilarity,
	embedAtomText,
} from "./atom-embedder.js";
import { loadClosedIntents, matchClosedIntent } from "./atom-intent.js";
import { mergeAtomFiles } from "./atom-merge.js";
import {
	type AtomComposition,
	type AtomTemplate,
	fillAtomBody,
	loadAtomCorpus,
	parseAtomParams,
} from "./atom-template.js";

export { composeAtoms } from "./atom-compose.js";
export {
	ATOM_EMBEDDER_DIM,
	ATOM_EMBEDDER_HASH,
	ATOM_EMBEDDER_ID,
	ATOM_EMBEDDER_KIND,
	embedAtomText,
	HOBO_DOMAIN_VOCABULARY,
	hashedTrigramEmbedder,
} from "./atom-embedder.js";
export { loadClosedIntents, matchClosedIntent } from "./atom-intent.js";
export { mergeAtomFiles, parseSnippet } from "./atom-merge.js";
export { ATOMS_ROOT, loadAtomCorpus } from "./atom-template.js";

export const ATOM_RRF_K = 60;
export const ATOM_HIGH_SCORE = 0.018;

export type RetrievalConfidence = "high" | "low";
export type EmissionDecision = "emit" | "refuse" | "escalate";

export interface RankedHit {
	readonly id: string;
	readonly kind: "atom" | "composition";
	readonly score: number;
	readonly fts: boolean;
}

export interface RetrieveAtomsOptions {
	readonly allowEscalate?: boolean;
}

export interface RetrieveAtomsResult {
	readonly ok: boolean;
	readonly confidence: RetrievalConfidence;
	readonly decision: EmissionDecision;
	readonly composition?: AtomComposition;
	readonly atoms: readonly AtomTemplate[];
	readonly fallback?: "llm";
	readonly score: number;
	readonly ranked: readonly RankedHit[];
	readonly defaultParams?: Readonly<Record<string, string>>;
}

export interface EmitFromAtomsOptions {
	readonly intent: string;
	readonly outputDir: string;
	readonly params?: Readonly<Record<string, string>>;
	readonly allowEscalate?: boolean;
}

export interface EmitFromAtomsResult {
	readonly ok: boolean;
	readonly source: "atoms" | "none";
	readonly decision: EmissionDecision;
	readonly compositionId?: string;
	readonly files: readonly string[];
	readonly holes: readonly string[];
	readonly fallback?: "llm";
	readonly code?: string;
}

export interface RebuildAtomIndexResult {
	readonly path: string;
	readonly atomCount: number;
	readonly compositionCount: number;
	readonly embedderId: string;
	readonly embedderHash: string;
	readonly dimension: number;
	readonly sqliteVec: boolean;
	readonly corpusDigest: string;
}

function searchableText(
	item: Pick<AtomTemplate, "id" | "description" | "tags" | "queries">,
): string {
	return [item.id, item.description, ...item.tags, ...item.queries].join(" ");
}

function rrf(ranks: readonly number[]): number {
	return ranks.reduce((sum, rank) => sum + 1 / (ATOM_RRF_K + rank), 0);
}

function corpusDigest(
	atoms: readonly AtomTemplate[],
	compositions: readonly AtomComposition[],
): string {
	const payload = [
		...atoms.map((atom) =>
			JSON.stringify({
				id: atom.id,
				description: atom.description,
				tags: atom.tags,
				queries: atom.queries,
				requires: atom.requires,
				provides: atom.provides,
			}),
		),
		...compositions.map((item) =>
			JSON.stringify({
				id: item.id,
				description: item.description,
				tags: item.tags,
				queries: item.queries,
				atoms: item.atoms,
			}),
		),
	]
		.sort()
		.join("\n");
	return createHash("sha256").update(payload).digest("hex");
}

export function defaultAtomIndexPath(): string {
	if (process.env.HOBO_ATOM_INDEX && process.env.HOBO_ATOM_INDEX.length > 0) {
		return process.env.HOBO_ATOM_INDEX;
	}
	const home =
		process.env.HOBO_HOME && process.env.HOBO_HOME.length > 0
			? process.env.HOBO_HOME
			: join(homedir(), ".hobo");
	return join(home, "durable", "code", "template-index.sqlite");
}

function encodeEmbedding(vector: Float64Array): Buffer {
	return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

function tryLoadSqliteVec(db: DatabaseSync): boolean {
	const ext = process.env.HOBO_SQLITE_VEC;
	if (!ext || ext.length === 0) return false;
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const loader = db as DatabaseSync & {
			enableLoadExtension?: (enabled: boolean) => void;
			loadExtension?: (path: string) => void;
		};
		loader.enableLoadExtension?.(true);
		loader.loadExtension?.(ext);
		db.exec(
			`CREATE VIRTUAL TABLE IF NOT EXISTS atom_vec0 USING vec0(id TEXT PRIMARY KEY, embedding FLOAT[${ATOM_EMBEDDER_DIM}])`,
		);
		return true;
	} catch {
		return false;
	}
}

function applySqlitePragmas(db: DatabaseSync): void {
	db.exec(`
		PRAGMA journal_mode=WAL;
		PRAGMA synchronous=FULL;
		PRAGMA foreign_keys=ON;
	`);
}

function createIndexSchema(db: DatabaseSync): boolean {
	db.exec(`
		CREATE TABLE IF NOT EXISTS atom_index_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS atom_fts USING fts5(id, kind, body);
		CREATE TABLE IF NOT EXISTS atom_vec (
			id TEXT PRIMARY KEY,
			embedding BLOB NOT NULL
		);
	`);
	return tryLoadSqliteVec(db);
}

interface IndexedCorpus {
	readonly atoms: readonly AtomTemplate[];
	readonly compositions: readonly AtomComposition[];
	readonly byId: ReadonlyMap<string, AtomTemplate>;
	readonly db: DatabaseSync;
	readonly embeddings: ReadonlyMap<string, Float64Array>;
	readonly digest: string;
}

let cached: IndexedCorpus | undefined;

function populateIndex(
	db: DatabaseSync,
	corpus: ReturnType<typeof loadAtomCorpus>,
) {
	const sqliteVec = createIndexSchema(db);
	const insertFts = db.prepare(
		"INSERT INTO atom_fts (id, kind, body) VALUES (?, ?, ?)",
	);
	const insertVec = db.prepare(
		"INSERT INTO atom_vec (id, embedding) VALUES (?, ?)",
	);
	const insertVec0 = sqliteVec
		? db.prepare("INSERT INTO atom_vec0 (id, embedding) VALUES (?, ?)")
		: undefined;
	const embeddings = new Map<string, Float64Array>();
	const put = (id: string, kind: "atom" | "composition", body: string) => {
		insertFts.run(id, kind, body);
		const vector = embedAtomText(body);
		embeddings.set(id, vector);
		const blob = encodeEmbedding(vector);
		insertVec.run(id, blob);
		insertVec0?.run(id, blob);
	};
	for (const atom of corpus.atoms) {
		put(atom.id, "atom", searchableText(atom));
	}
	for (const composition of corpus.compositions) {
		put(composition.id, "composition", searchableText(composition));
	}
	const digest = corpusDigest(corpus.atoms, corpus.compositions);
	const putMeta = db.prepare(
		"INSERT OR REPLACE INTO atom_index_meta (key, value) VALUES (?, ?)",
	);
	putMeta.run("embedder_id", ATOM_EMBEDDER_ID);
	putMeta.run("embedder_hash", ATOM_EMBEDDER_HASH);
	putMeta.run("dimension", String(ATOM_EMBEDDER_DIM));
	putMeta.run("rrf_k", String(ATOM_RRF_K));
	putMeta.run("high_score", String(ATOM_HIGH_SCORE));
	putMeta.run("corpus_digest", digest);
	putMeta.run("sqlite_vec", sqliteVec ? "1" : "0");
	return { embeddings, sqliteVec, digest };
}

export function resetAtomIndexCache(): void {
	if (cached) {
		try {
			cached.db.close();
		} catch {
			// already closed
		}
	}
	cached = undefined;
}

function openIndex(): IndexedCorpus {
	if (cached) return cached;
	const corpus = loadAtomCorpus();
	const db = new DatabaseSync(":memory:");
	applySqlitePragmas(db);
	const built = populateIndex(db, corpus);
	cached = {
		atoms: corpus.atoms,
		compositions: corpus.compositions,
		byId: new Map(corpus.atoms.map((atom) => [atom.id, atom])),
		db,
		embeddings: built.embeddings,
		digest: built.digest,
	};
	return cached;
}

export function rebuildAtomIndex(
	options: { readonly path?: string } = {},
): RebuildAtomIndexResult {
	const path = options.path ?? defaultAtomIndexPath();
	const corpus = loadAtomCorpus();
	if (path !== ":memory:") {
		mkdirSync(dirname(path), { recursive: true });
	}
	const db = new DatabaseSync(path);
	applySqlitePragmas(db);
	db.exec("BEGIN IMMEDIATE");
	db.exec(
		"DROP TABLE IF EXISTS atom_fts; DROP TABLE IF EXISTS atom_vec; DROP TABLE IF EXISTS atom_vec0; DROP TABLE IF EXISTS atom_index_meta;",
	);
	const built = populateIndex(db, corpus);
	db.exec("COMMIT");
	db.close();
	resetAtomIndexCache();
	return {
		path,
		atomCount: corpus.atoms.length,
		compositionCount: corpus.compositions.length,
		embedderId: ATOM_EMBEDDER_ID,
		embedderHash: ATOM_EMBEDDER_HASH,
		dimension: ATOM_EMBEDDER_DIM,
		sqliteVec: built.sqliteVec,
		corpusDigest: built.digest,
	};
}

function ftsRanks(
	db: DatabaseSync,
	intent: string,
	kind: "atom" | "composition",
): Map<string, number> {
	const stop = new Set([
		"for",
		"the",
		"and",
		"with",
		"plus",
		"from",
		"that",
		"this",
		"into",
		"your",
		"you",
		"are",
		"not",
		"but",
		"can",
		"may",
		"used",
		"than",
	]);
	const terms = intent
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, " ")
		.trim()
		.split(" ")
		.filter((term) => term.length > 2 && !stop.has(term));
	const ranks = new Map<string, number>();
	if (terms.length === 0) return ranks;
	const match = terms
		.map((term) => `"${term.replaceAll('"', "")}"`)
		.join(" OR ");
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const rows = db
			.prepare(
				"SELECT id FROM atom_fts WHERE kind = ? AND atom_fts MATCH ? LIMIT 16",
			)
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			.all(kind, match) as Array<{ id: string }>;
		for (const [index, row] of rows.entries()) {
			ranks.set(row.id, index + 1);
		}
	} catch {
		return ranks;
	}
	return ranks;
}

function scoreItems(
	items: readonly { readonly id: string }[],
	queryVec: Float64Array,
	index: IndexedCorpus,
	fts: ReadonlyMap<string, number>,
): Array<{ id: string; score: number; fts: boolean; dense: number }> {
	const denseRanks = [...items]
		.map((item) => ({
			id: item.id,
			dense: cosineSimilarity(
				queryVec,
				index.embeddings.get(item.id) ?? new Float64Array(ATOM_EMBEDDER_DIM),
			),
		}))
		.sort((left, right) => right.dense - left.dense);
	return items
		.map((item) => {
			const dense = denseRanks.find((row) => row.id === item.id)?.dense ?? 0;
			const denseRank = denseRanks.findIndex((row) => row.id === item.id) + 1;
			const lexical = fts.get(item.id) ?? 10_000;
			return {
				id: item.id,
				dense,
				score: rrf([denseRank, lexical]) + dense,
				fts: fts.has(item.id),
			};
		})
		.sort((left, right) => right.score - left.score);
}

export function rankAtoms(intent: string, limit = 8): readonly RankedHit[] {
	const mapped = matchClosedIntent(intent, loadClosedIntents());
	if (mapped) {
		return [
			{ id: mapped.id, kind: "composition" as const, score: 1, fts: true },
			...mapped.atoms.map((id) => ({
				id,
				kind: "atom" as const,
				score: 1,
				fts: true,
			})),
		].slice(0, limit);
	}
	const index = openIndex();
	const queryVec = embedAtomText(intent);
	const ftsAtoms = ftsRanks(index.db, intent, "atom");
	const ftsCompositions = ftsRanks(index.db, intent, "composition");
	const scored = [
		...scoreItems(index.compositions, queryVec, index, ftsCompositions).map(
			(row) => ({
				id: row.id,
				kind: "composition" as const,
				score: row.score,
				fts: row.fts,
			}),
		),
		...scoreItems(index.atoms, queryVec, index, ftsAtoms).map((row) => ({
			id: row.id,
			kind: "atom" as const,
			score: row.score,
			fts: row.fts,
		})),
	].sort((left, right) => right.score - left.score);
	return scored.slice(0, limit);
}

export function retrieveAtoms(
	intent: string,
	options: RetrieveAtomsOptions = {},
): RetrieveAtomsResult {
	const index = openIndex();
	const mapped = matchClosedIntent(intent, loadClosedIntents());
	if (mapped) {
		const selected = mapped.atoms
			.map((id) => index.byId.get(id))
			.filter((atom): atom is AtomTemplate => atom !== undefined);
		const composed = composeAtoms(selected, index.atoms);
		if (composed.ok && composed.atoms.length > 0) {
			return {
				ok: true,
				confidence: "high",
				decision: "emit",
				composition: {
					id: mapped.id,
					description: mapped.description,
					tags: [...mapped.phrases],
					queries: [...mapped.phrases],
					atoms: [...mapped.atoms],
				},
				atoms: composed.atoms,
				score: 1,
				ranked: [
					{
						id: mapped.id,
						kind: "composition",
						score: 1,
						fts: true,
					},
				],
				...(Object.keys(mapped.params).length > 0
					? { defaultParams: mapped.params }
					: undefined),
			};
		}
	}
	const ranked = rankAtoms(intent, 12);
	const top = ranked.find((hit) => hit.fts);
	const refuse = (score: number): RetrieveAtomsResult => ({
		ok: false,
		confidence: "low",
		decision: options.allowEscalate === true ? "escalate" : "refuse",
		atoms: [],
		fallback: "llm",
		score,
		ranked,
	});
	if (!top || top.score < ATOM_HIGH_SCORE) {
		return refuse(top?.score ?? 0);
	}
	if (top.kind === "composition") {
		const composition = index.compositions.find((item) => item.id === top.id);
		if (!composition) return refuse(top.score);
		const selected = composition.atoms
			.map((id) => index.byId.get(id))
			.filter((atom): atom is AtomTemplate => atom !== undefined);
		const composed = composeAtoms(selected, index.atoms);
		if (!composed.ok || composed.atoms.length === 0) return refuse(top.score);
		return {
			ok: true,
			confidence: "high",
			decision: "emit",
			composition,
			atoms: composed.atoms,
			score: top.score,
			ranked,
		};
	}
	const atom = index.byId.get(top.id);
	if (!atom) return refuse(top.score);
	const composed = composeAtoms([atom], index.atoms);
	if (!composed.ok || composed.atoms.length === 0) return refuse(top.score);
	return {
		ok: true,
		confidence: "high",
		decision: "emit",
		atoms: composed.atoms,
		score: top.score,
		ranked,
	};
}

export function emitFromAtoms(
	options: EmitFromAtomsOptions,
): EmitFromAtomsResult {
	const retrieved = retrieveAtoms(
		options.intent,
		options.allowEscalate !== undefined
			? { allowEscalate: options.allowEscalate }
			: {},
	);
	if (!retrieved.ok || retrieved.atoms.length === 0) {
		return {
			ok: false,
			source: "none",
			decision: retrieved.decision,
			files: [],
			holes: [],
			fallback: "llm",
		};
	}
	const name = options.params?.name ?? retrieved.composition?.id ?? "app";
	const parsed = parseAtomParams(retrieved.atoms, {
		name,
		...retrieved.defaultParams,
		...options.params,
	});
	if (!parsed.ok) {
		return {
			ok: false,
			source: "none",
			decision: "refuse",
			files: [],
			holes: [],
			...(parsed.code !== undefined ? { code: parsed.code } : undefined),
		};
	}
	const materialized = materializeAtomFiles(retrieved.atoms, parsed.params);
	if (!materialized.ok) {
		return {
			ok: false,
			source: "none",
			decision: "refuse",
			files: [],
			holes: [],
			...(materialized.code !== undefined
				? { code: materialized.code }
				: undefined),
		};
	}
	const written: string[] = [];
	for (const [relativePath, body] of materialized.files) {
		const target = join(options.outputDir, relativePath);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, body);
		written.push(relativePath);
	}
	return {
		ok: true,
		source: "atoms",
		decision: "emit",
		...(retrieved.composition?.id !== undefined
			? { compositionId: retrieved.composition.id }
			: undefined),
		files: written,
		holes: materialized.holes,
	};
}

export function materializeAtomFiles(
	atoms: readonly AtomTemplate[],
	params: Readonly<Record<string, string>>,
): ReturnType<typeof mergeAtomFiles> {
	const contributions = atoms.flatMap((atom) =>
		atom.files.map((file) => ({
			atomId: atom.id,
			path: fillAtomBody(file.path, params),
			body: fillAtomBody(
				readFileSync(join(atom.dir, file.from), "utf8"),
				params,
			),
		})),
	);
	return mergeAtomFiles(contributions);
}

export function renderAtomCatalogInstructions(
	corpus = loadAtomCorpus(),
): string {
	const atoms = corpus.atoms.map(
		(atom) =>
			`- ${atom.id} (t${atom.tier}): ${atom.description} [${atom.tags.join(", ")}]`,
	);
	const compositions = corpus.compositions.map(
		(item) => `- ${item.id}: ${item.description} ← ${item.atoms.join(" + ")}`,
	);
	return [
		"Atomic templates load from @hobo/patterns (packages/patterns/atoms). CLI: hobo-code template list|search|render. When the user says a known phrase in this chat session, emit them — do not invent a second verb and do not fetch. High-confidence hits emit with zero inference. Low-confidence refuses (or escalates only when allowed).",
		"Compositions:",
		...compositions,
		"Atoms:",
		...atoms,
	].join("\n");
}

export function readPersistedIndexMeta(
	path: string,
): Readonly<Record<string, string>> {
	if (!existsSync(path)) return {};
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		const rows = db
			.prepare("SELECT key, value FROM atom_index_meta")
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			.all() as Array<{ key: string; value: string }>;
		return Object.fromEntries(rows.map((row) => [row.key, row.value]));
	} finally {
		db.close();
	}
}
