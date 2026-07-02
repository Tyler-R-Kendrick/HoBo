import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const SIGNATURE_ALG = "Ed25519";

/** Dev/fixture signing key — not a production secret. */
export const FIXTURE_SIGNING_KEY = Object.freeze({
	keyId: "hello-bindle-fixture-key",
	builderId: "spiffe://hobo/fixtures/hello-bindle",
	publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANNgktYzR5vPRGO6moCfcNyw8o12iBpcl7PNYOWju4fw=
-----END PUBLIC KEY-----`,
	privateKeyPem: `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIGSQV7mv78PbfAJernqO3r5ooUOZzMQNNsfFptOZmiFL
-----END PRIVATE KEY-----`,
});

export interface SignedArtifactEnvelope {
	digest: string;
	signature: {
		alg: string;
		keyId: string;
		payloadDigest: string;
		value: string;
	};
	provenanceTier: "slsa-build-l3";
	conformanceSuiteId: string;
}

export function signComponentDigest(digest: string): SignedArtifactEnvelope {
	const payload = stableStringify({ digest, provenanceTier: "slsa-build-l3" });
	const signatureValue = sign(
		null,
		Buffer.from(payload),
		createPrivateKey(FIXTURE_SIGNING_KEY.privateKeyPem),
	).toString("base64url");

	return {
		digest,
		signature: {
			alg: SIGNATURE_ALG,
			keyId: FIXTURE_SIGNING_KEY.keyId,
			payloadDigest: digest,
			value: signatureValue,
		},
		provenanceTier: "slsa-build-l3",
		conformanceSuiteId: "@hobo/conformance/hello-bindle@0.1.0",
	};
}

export function verifySignedArtifact(envelope: SignedArtifactEnvelope): boolean {
	if (!envelope?.signature) return false;
	if (envelope.signature.alg !== SIGNATURE_ALG) return false;
	if (envelope.signature.payloadDigest !== envelope.digest) return false;
	if (envelope.provenanceTier !== "slsa-build-l3") return false;
	const payload = stableStringify({ digest: envelope.digest, provenanceTier: envelope.provenanceTier });
	return verify(
		null,
		Buffer.from(payload),
		createPublicKey(FIXTURE_SIGNING_KEY.publicKeyPem),
		Buffer.from(envelope.signature.value, "base64url"),
	);
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	return `{${Object.keys(value as Record<string, unknown>)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
		.join(",")}}`;
}
