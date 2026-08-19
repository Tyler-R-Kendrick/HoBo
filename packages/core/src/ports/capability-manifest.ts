/**
 * Codec for the published `/.well-known/capability-manifest/*` documents.
 *
 * Eight provider packages each carried their own byte-identical copy of this:
 * the same canonical-JSON writer, the same digest walk, and in four cases the
 * same parser. They belong here because the schema ids below are *platform*
 * contract, not any one provider's concern — a provider that spells
 * `hobo.capabilities/v1` differently is broken, not customised.
 *
 * **These implementations were moved verbatim, deliberately.** The output of
 * `canonicalJson` is what every published digest is computed over, so a
 * "tidier" rewrite that reorders a key or drops the trailing newline silently
 * invalidates every manifest already published against it. `stableDigest` is
 * likewise a document-integrity reference and *not* a security primitive —
 * upgrading it to SHA-256 during a move would be a behaviour change wearing a
 * refactor's clothes. `capability-manifest.test.ts` pins both against the exact
 * bytes the providers produced before the move.
 */

// public-contract: capability-manifest document schema ids (Plan 6 signs).
export const MANIFEST_SCHEMA = "hobo.capability-manifest/v1";
// public-contract: capabilities document schema id.
export const CAPABILITIES_SCHEMA = "hobo.capabilities/v1";
// public-contract: auth document schema id.
export const AUTH_SCHEMA = "hobo.provider-auth/v1";
// public-contract: cost document schema id.
export const COST_SCHEMA = "hobo.cost/v1";
// public-contract: the index document's own schema id.
export const MANIFEST_INDEX_SCHEMA = "hobo.capability-manifest-index/v1";

// public-contract: the four well-known pathnames a published manifest occupies.
export const MANIFEST_PATHS = Object.freeze({
	index: "/.well-known/capability-manifest/index.json",
	capabilities: "/.well-known/capability-manifest/capabilities.json",
	auth: "/.well-known/capability-manifest/auth.json",
	cost: "/.well-known/capability-manifest/cost.json",
} as const);

/** Deterministic JSON: keys sorted at every depth, 2-space indent, trailing newline. */
export function canonicalJson(value: unknown): string {
	return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sortKeys(item));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, sortKeys(child)]),
		);
	}
	return value;
}

/**
 * Deterministic non-cryptographic digest for document integrity references
 * inside the published bundle (the Registry hashes the index separately).
 *
 * Not a security primitive. It exists so a bundle can name its own parts, and
 * changing it changes every published reference.
 */
export function stableDigest(value: unknown): string {
	const text = JSON.stringify(sortKeys(value));
	let hash = 0;
	for (let index = 0; index < text.length; index += 1) {
		hash = (hash * 31 + text.charCodeAt(index)) | 0;
	}
	return `fnv:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** A digest over a seed string, for cost-fact source references. */
export function digestRef(seed: string): string {
	return stableDigest({ seed });
}

export interface PublishedManifestParseResult {
	ok: boolean;
	errors: string[];
	index: Record<string, unknown>;
	capabilities: Record<string, unknown>;
	auth: Record<string, unknown>;
	cost: Record<string, unknown>;
}

/**
 * Parse-don't-validate boundary: untrusted well-known manifest documents become
 * a parsed derived type or structured errors — no broad DTO checks downstream.
 *
 * The two auth checks are the load-bearing ones. A manifest is fetched from a
 * provider-controlled origin, so `staticKey`/`clientSecret` appearing at all
 * means either the provider is publishing a credential or something upstream
 * rewrote the document; both are refusals, not warnings.
 */
export function parsePublishedManifest(
	documents: Readonly<Record<string, string>>,
): PublishedManifestParseResult {
	const index = JSON.parse(documents[MANIFEST_PATHS.index] ?? "{}");
	const capabilities = JSON.parse(
		documents[MANIFEST_PATHS.capabilities] ?? "{}",
	);
	const auth = JSON.parse(documents[MANIFEST_PATHS.auth] ?? "{}");
	const cost = JSON.parse(documents[MANIFEST_PATHS.cost] ?? "{}");
	const errors: string[] = [];

	if (index.manifestSchema !== MANIFEST_SCHEMA) {
		errors.push(`index.manifestSchema must be ${MANIFEST_SCHEMA}`);
	}
	if (auth.schema !== AUTH_SCHEMA) {
		errors.push(`auth.schema must be ${AUTH_SCHEMA}`);
	}
	if (cost.schema !== COST_SCHEMA) {
		errors.push(`cost.schema must be ${COST_SCHEMA}`);
	}
	if ("staticKey" in auth || "clientSecret" in auth) {
		errors.push("auth must not publish static secrets");
	}
	if (auth.staticSecrets !== false) {
		errors.push("auth.staticSecrets must be false (keyless federation only)");
	}
	if (
		!Array.isArray(capabilities.capabilities) ||
		capabilities.capabilities.length === 0
	) {
		errors.push("capabilities.capabilities must be non-empty");
	}

	return { ok: errors.length === 0, errors, index, capabilities, auth, cost };
}
