import { createHash } from "node:crypto";

/** Pinned local encoder. No network. No model file. ONNX swaps behind LocalEmbedder. */
// public-contract: stable encoder identity so index and query share one vocabulary.
export const ATOM_EMBEDDER_ID = "hobo-hashed-trigram-v1" as const;
export const ATOM_EMBEDDER_DIM = 256;
export const ATOM_EMBEDDER_NGRAM = 3;
// public-contract: encoder family tag; ONNX swap keeps this slot.
export const ATOM_EMBEDDER_KIND = "local-hashed-ngram" as const;

/** HoBo surface terms that must stay in the common encoder vocabulary. */
export const HOBO_DOMAIN_VOCABULARY = [
	"bindle",
	"campEnv",
	"dependsOn",
	"honoEntrypoint",
	"services__api__http__0",
	"stationId",
	"station",
	"trail",
	"junction",
	"openFeature",
	"litestream",
	"NATS",
	"JetStream",
	"Object Store",
	"konsistent",
	"protobuf",
	"cue",
	"pact",
	"_generated",
	"mediatedOnly",
	"HOBO_HOME",
	"connector",
	"GREETING_PREFIX",
	"APP_TITLE",
	"yard",
	"camp",
	"OpenFeature",
	"Gherkin",
] as const;

export const ATOM_EMBEDDER_HASH = createHash("sha256")
	.update(
		[
			ATOM_EMBEDDER_ID,
			String(ATOM_EMBEDDER_DIM),
			String(ATOM_EMBEDDER_NGRAM),
			HOBO_DOMAIN_VOCABULARY.join(","),
		].join("|"),
	)
	.digest("hex");

export interface LocalEmbedder {
	readonly id: string;
	readonly kind: string;
	readonly dimension: number;
	readonly contentHash: string;
	embed(text: string): Float64Array;
}

function fnv1a(text: string): number {
	let hash = 2_166_136_261;
	for (let i = 0; i < text.length; i += 1) {
		hash = Math.imul(hash ^ text.charCodeAt(i), 16_777_619);
	}
	return hash >>> 0;
}

function hashedTrigram(text: string): Float64Array {
	const vector = new Float64Array(ATOM_EMBEDDER_DIM);
	const normalized = text.toLowerCase();
	if (normalized.length < ATOM_EMBEDDER_NGRAM) {
		vector[fnv1a(normalized) % ATOM_EMBEDDER_DIM] = 1;
		return l2normalize(vector);
	}
	for (let i = 0; i <= normalized.length - ATOM_EMBEDDER_NGRAM; i += 1) {
		const slot =
			fnv1a(normalized.slice(i, i + ATOM_EMBEDDER_NGRAM)) % ATOM_EMBEDDER_DIM;
		vector[slot] = (vector[slot] ?? 0) + 1;
	}
	return l2normalize(vector);
}

function l2normalize(vector: Float64Array): Float64Array {
	let norm = 0;
	for (const value of vector) norm += value * value;
	norm = Math.sqrt(norm) || 1;
	for (let i = 0; i < vector.length; i += 1) {
		vector[i] = (vector[i] ?? 0) / norm;
	}
	return vector;
}

/** Fixed local encoder shared by index and query. Domain terms boost matching slots. */
export function embedAtomText(text: string): Float64Array {
	const hits = HOBO_DOMAIN_VOCABULARY.filter((term) =>
		text.toLowerCase().includes(term.toLowerCase()),
	);
	return hashedTrigram(hits.length === 0 ? text : `${text} ${hits.join(" ")}`);
}

export const hashedTrigramEmbedder: LocalEmbedder = {
	id: ATOM_EMBEDDER_ID,
	kind: ATOM_EMBEDDER_KIND,
	dimension: ATOM_EMBEDDER_DIM,
	contentHash: ATOM_EMBEDDER_HASH,
	embed: embedAtomText,
};

export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
	const n = Math.min(a.length, b.length);
	let sum = 0;
	for (let i = 0; i < n; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
	return sum;
}
