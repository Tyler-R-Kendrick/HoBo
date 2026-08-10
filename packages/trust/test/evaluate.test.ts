import { describe, expect, it } from "vitest";

import {
	DEFAULT_TRUST_REQUIREMENT,
	computeEvidenceDigest,
	evaluateTrust,
	parseTrustEvidence,
	parseTrustRequirement,
	type EvidenceVerifier,
	type TrustEvidenceInput,
	type TrustReasonCode,
} from "../src/index.js";

const TESTED_AT = Date.UTC(2026, 7, 1);
const NOW = Date.UTC(2026, 7, 8);
const DAY = 24 * 60 * 60 * 1000;

const validVerifier: EvidenceVerifier = {
	id: "test.always-valid/v1",
	verify: () => "valid",
};

const invalidVerifier: EvidenceVerifier = {
	id: "test.always-invalid/v1",
	verify: () => "invalid",
};

const input = (overrides: Partial<TrustEvidenceInput> = {}): TrustEvidenceInput => {
	const draft: TrustEvidenceInput = {
		schemaVersion: "hobo.trust-evidence/v1",
		providerId: "cloudflare",
		productDefinitionId: "cloudflare.workers/v1",
		adapterVersion: "0.3.1",
		providerClass: "established",
		testedAt: TESTED_AT,
		expiresAt: TESTED_AT + 30 * DAY,
		checks: {
			"bootstrap.official-contract": "pass",
			"claim.documented-contract": "pass",
			"conformance.suite": "pass",
		},
		creatorAuthorityAfterClaim: "rotatable",
		claimActionCount: 1,
		realizations: ["native"],
		sponsorBacked: false,
		evidenceDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
		signature: "sig:test",
		sourceRefs: [
			{ url: "https://developers.cloudflare.com/workers/", checkedAt: "2026-08-08" },
		],
		...overrides,
	};
	return { ...draft, evidenceDigest: computeEvidenceDigest(draft) };
};

const evidence = (overrides: Partial<TrustEvidenceInput> = {}) =>
	parseTrustEvidence(input(overrides));

const codes = (reasons: readonly { readonly code: TrustReasonCode }[]) =>
	reasons.map((reason) => reason.code);

describe("evaluateTrust", () => {
	it("passes clean, signed, fresh evidence", () => {
		const verdict = evaluateTrust(
			evidence(),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(verdict.selectable).toBe(true);
		expect(verdict.reasons).toEqual([]);
		expect(verdict.signatureOutcome).toBe("valid");
	});

	it("fails closed when evidence is absent", () => {
		const verdict = evaluateTrust(
			undefined,
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(verdict.selectable).toBe(false);
		expect(codes(verdict.reasons)).toEqual(["EVIDENCE_ABSENT"]);
	});

	it("fails closed when no verifier is injected", () => {
		const verdict = evaluateTrust(evidence(), DEFAULT_TRUST_REQUIREMENT, NOW);
		expect(verdict.selectable).toBe(false);
		expect(codes(verdict.reasons)).toContain("EVIDENCE_UNSIGNED");
		expect(verdict.signatureOutcome).toBe("unknown");
	});

	it("fails closed when the signature does not verify", () => {
		const verdict = evaluateTrust(
			evidence(),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			invalidVerifier,
		);
		expect(verdict.selectable).toBe(false);
		expect(codes(verdict.reasons)).toContain("EVIDENCE_UNSIGNED");
	});

	it("fails closed when the recorded digest does not describe the body", () => {
		const tampered = parseTrustEvidence({
			...input(),
			evidenceDigest:
				"sha256:1111111111111111111111111111111111111111111111111111111111111111",
		});
		const verdict = evaluateTrust(
			tampered,
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("EVIDENCE_DIGEST_MISMATCH");
		// A mismatched digest also invalidates the signature: it signed something else.
		expect(verdict.signatureOutcome).toBe("invalid");
		expect(verdict.selectable).toBe(false);
	});

	it("fails closed when evidence has expired", () => {
		const verdict = evaluateTrust(
			evidence({ expiresAt: NOW - 1 }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("EVIDENCE_STALE");
		expect(verdict.selectable).toBe(false);
	});

	it("fails closed when evidence is older than the maximum age", () => {
		const verdict = evaluateTrust(
			evidence(),
			parseTrustRequirement({
				minimumProviderClass: "established",
				requireOfficialBootstrapContract: true,
				requireDocumentedClaimContract: true,
				creatorAuthorityAfterClaim: "must-be-rotatable",
				maximumClaimActions: 2,
				maximumEvidenceAgeMs: DAY,
			}),
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("EVIDENCE_STALE");
	});

	it("fails closed when evidence is dated after the evaluation instant", () => {
		const verdict = evaluateTrust(
			evidence({ testedAt: NOW + DAY, expiresAt: NOW + 30 * DAY }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("EVIDENCE_STALE");
	});

	it("treats a failed check as a gate", () => {
		const verdict = evaluateTrust(
			evidence({
				checks: {
					"bootstrap.official-contract": "pass",
					"claim.documented-contract": "pass",
					"conformance.suite": "fail",
				},
			}),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("CONFORMANCE_FAILED");
		expect(verdict.selectable).toBe(false);
	});

	it("treats an unknown check as a gate, not as a pass", () => {
		const verdict = evaluateTrust(
			evidence({
				checks: {
					"bootstrap.official-contract": "pass",
					"claim.documented-contract": "pass",
					"conformance.suite": "unknown",
				},
			}),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("CONFORMANCE_FAILED");
		expect(verdict.selectable).toBe(false);
	});

	it("treats an absent required check as a gate", () => {
		const requirement = parseTrustRequirement({
			minimumProviderClass: "established",
			requireOfficialBootstrapContract: true,
			requireDocumentedClaimContract: true,
			creatorAuthorityAfterClaim: "must-be-rotatable",
			maximumClaimActions: 2,
			maximumEvidenceAgeMs: 30 * DAY,
			requiredChecks: ["claim.verification"],
		});
		const verdict = evaluateTrust(evidence(), requirement, NOW, validVerifier);
		expect(codes(verdict.reasons)).toContain("CONFORMANCE_FAILED");
	});

	it("denies a missing bootstrap or claim contract with distinct codes", () => {
		const verdict = evaluateTrust(
			evidence({ checks: { "conformance.suite": "pass" } }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("BOOTSTRAP_POLICY_DENIED");
		expect(codes(verdict.reasons)).toContain("CLAIM_MODE_INSUFFICIENT");
	});

	it("denies a provider below the minimum maturity", () => {
		const verdict = evaluateTrust(
			evidence({ providerClass: "experimental" }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("PROVIDER_MATURITY_DENIED");
	});

	it("demands a strong claim when the requirement does", () => {
		const requirement = parseTrustRequirement({
			minimumProviderClass: "established",
			requireOfficialBootstrapContract: true,
			requireDocumentedClaimContract: true,
			creatorAuthorityAfterClaim: "must-be-absent",
			maximumClaimActions: 2,
			maximumEvidenceAgeMs: 30 * DAY,
		});
		expect(
			codes(evaluateTrust(evidence(), requirement, NOW, validVerifier).reasons),
		).toContain("STRONG_CLAIM_REQUIRED");
		expect(
			codes(
				evaluateTrust(
					evidence({ creatorAuthorityAfterClaim: "retained" }),
					DEFAULT_TRUST_REQUIREMENT,
					NOW,
					validVerifier,
				).reasons,
			),
		).toContain("STRONG_CLAIM_REQUIRED");
	});

	it("gates too many human claim actions", () => {
		const verdict = evaluateTrust(
			evidence({ claimActionCount: 5 }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(codes(verdict.reasons)).toContain("TOO_MANY_CLAIM_ACTIONS");
	});

	it("gates unstated realization and sponsor facts when the requirement narrows them", () => {
		const requirement = parseTrustRequirement({
			minimumProviderClass: "established",
			requireOfficialBootstrapContract: true,
			requireDocumentedClaimContract: true,
			creatorAuthorityAfterClaim: "must-be-rotatable",
			maximumClaimActions: 2,
			maximumEvidenceAgeMs: 30 * DAY,
			allowPack: false,
			allowSponsor: false,
		});
		const { realizations: _realizations, sponsorBacked: _sponsorBacked, ...bare } = input();
		const silent = parseTrustEvidence({
			...bare,
			evidenceDigest: computeEvidenceDigest(bare),
		});
		const reasons = codes(evaluateTrust(silent, requirement, NOW, validVerifier).reasons);
		expect(reasons).toContain("REALIZATION_DENIED");
		expect(reasons).toContain("BOOTSTRAP_POLICY_DENIED");

		const packed = evidence({ realizations: ["pack"] });
		expect(codes(evaluateTrust(packed, requirement, NOW, validVerifier).reasons)).toContain(
			"REALIZATION_DENIED",
		);

		const sponsored = evidence({ sponsorBacked: true });
		expect(
			codes(evaluateTrust(sponsored, requirement, NOW, validVerifier).reasons),
		).toContain("BOOTSTRAP_POLICY_DENIED");
	});

	it("demands standard binding and export evidence when asked", () => {
		const requirement = parseTrustRequirement({
			minimumProviderClass: "established",
			requireOfficialBootstrapContract: true,
			requireDocumentedClaimContract: true,
			creatorAuthorityAfterClaim: "must-be-rotatable",
			maximumClaimActions: 2,
			maximumEvidenceAgeMs: 30 * DAY,
			requireStandardBinding: true,
			requireExportProfile: true,
		});
		const reasons = codes(
			evaluateTrust(evidence(), requirement, NOW, validVerifier).reasons,
		);
		expect(reasons).toContain("BINDING_UNAVAILABLE");
		expect(reasons).toContain("MIGRATION_REQUIRED_BUT_UNAVAILABLE");
	});

	it("is deterministic: identical inputs produce identical verdicts and digests", () => {
		const first = evaluateTrust(
			evidence({ providerClass: "experimental", claimActionCount: 9 }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		const second = evaluateTrust(
			evidence({ claimActionCount: 9, providerClass: "experimental" }),
			DEFAULT_TRUST_REQUIREMENT,
			NOW,
			validVerifier,
		);
		expect(second).toEqual(first);
		expect(second.verdictDigest).toBe(first.verdictDigest);
	});

	it("reads no clock: the same evidence flips only when nowMs moves past expiry", () => {
		const record = evidence();
		const before = evaluateTrust(
			record,
			DEFAULT_TRUST_REQUIREMENT,
			record.expiresAt - 1,
			validVerifier,
		);
		const after = evaluateTrust(
			record,
			DEFAULT_TRUST_REQUIREMENT,
			record.expiresAt,
			validVerifier,
		);
		expect(before.selectable).toBe(true);
		expect(after.selectable).toBe(false);
		expect(codes(after.reasons)).toContain("EVIDENCE_STALE");
	});
});
