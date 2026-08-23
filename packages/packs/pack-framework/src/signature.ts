/* eslint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- canonical JSON owns the erased JSON boundary. */
/**
 * Pack manifest signing.
 *
 * The framework never holds a key and never links a crypto library: a host
 * supplies a {@link PackSignatureVerifier}. What the framework does own is the
 * part that is easy to get wrong — the canonical byte string that gets signed,
 * and the rule that an `unknown` verdict fails closed exactly like `invalid`.
 */
import { createHash } from "node:crypto";

import { PackError } from "./errors.js";

export const PACK_SIGNATURE_ALGORITHMS = [
	"ed25519",
	"ecdsa-p256-sha256",
	"rsa-pss-sha256",
] as const;

export type PackSignatureAlgorithm = (typeof PACK_SIGNATURE_ALGORITHMS)[number];

export type PackSignature = {
	readonly algorithm: PackSignatureAlgorithm;
	/** Key identity the verifier resolves. Never key material. */
	readonly keyId: string;
	/** Base64 detached signature over the canonical manifest bytes. */
	readonly value: string;
	/** Digest of the canonical payload the signer claims to have signed. */
	readonly payloadDigest: string;
	/** ISO instant the signature was produced, as reported by the signer. */
	readonly signedAt: string;
};

export type PackSignatureVerdict = "valid" | "invalid" | "unknown";

export type PackSignatureVerificationRequest = {
	/** Exactly the bytes {@link canonicalizeForSigning} produced. */
	readonly payload: string;
	readonly signature: PackSignature;
};

/**
 * Implementations MUST return `unknown` rather than guessing when the key is
 * unavailable, and MUST NOT fetch a key over the network as a side effect of
 * verification.
 */
export interface PackSignatureVerifier {
	verify(request: PackSignatureVerificationRequest): PackSignatureVerdict;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export function parsePackSignature(input: PackSignature): PackSignature {
	if (
		!(PACK_SIGNATURE_ALGORITHMS as readonly string[]).includes(input.algorithm)
	) {
		throw new PackError(
			"PACK_INTEGRITY_UNVERIFIED",
			`signature algorithm ${JSON.stringify(String(input.algorithm))} is not supported`,
		);
	}
	if (!KEY_ID.test(input.keyId)) {
		throw new PackError(
			"PACK_INTEGRITY_UNVERIFIED",
			"signature keyId is not a valid identifier",
		);
	}
	if (input.value.length === 0 || !BASE64.test(input.value)) {
		throw new PackError(
			"PACK_INTEGRITY_UNVERIFIED",
			"signature value must be non-empty base64",
		);
	}
	if (!SHA256.test(input.payloadDigest)) {
		throw new PackError(
			"PACK_INTEGRITY_UNVERIFIED",
			"signature payloadDigest must be sha256:<64 hex>",
		);
	}
	if (!ISO_INSTANT.test(input.signedAt)) {
		throw new PackError(
			"PACK_INTEGRITY_UNVERIFIED",
			"signature signedAt must be an ISO-8601 UTC instant",
		);
	}
	return input;
}

/**
 * Deterministic JSON serialization: object keys sorted at every depth, arrays
 * kept in authored order, `undefined` members dropped.
 *
 * Array order is preserved because it is semantic here — argv order, probe
 * order, and the order of configuration fields all matter.
 */
export function canonicalJson(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) {
		return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
	}
	switch (typeof value) {
		case "string":
			return JSON.stringify(value);
		case "number":
			if (!Number.isFinite(value)) {
				throw new PackError(
					"PACK_MANIFEST_INVALID",
					"a pack manifest cannot contain a non-finite number",
				);
			}
			return JSON.stringify(value);
		case "boolean":
			return value ? "true" : "false";
		case "undefined":
			return "null";
		case "object": {
			// SAFETY: this branch is the object arm of canonical JSON serialization.
			const entries = Object.entries(value as Record<string, unknown>)
				.filter(([, entryValue]) => entryValue !== undefined)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
			return `{${entries
				.map(
					([key, entryValue]) =>
						`${JSON.stringify(key)}:${canonicalJson(entryValue)}`,
				)
				.join(",")}}`;
		}
		default:
			throw new PackError(
				"PACK_MANIFEST_INVALID",
				`a pack manifest cannot contain a ${typeof value} value`,
			);
	}
}

export function sha256Of(payload: string): string {
	return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

/**
 * The signing payload: the whole manifest minus its own signature block.
 *
 * Excluding the signature is what makes the payload stable — including it would
 * mean the signer had to sign a document containing its own output.
 */
export function canonicalizeForSigning(manifest: {
	readonly signature?: PackSignature;
}): string {
	const { signature: _signature, ...rest } = manifest;
	return canonicalJson(rest);
}
