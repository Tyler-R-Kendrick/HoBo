import { describe, expect, it } from "vitest";

import {
	DEFAULT_TRUST_POLICY,
	STANDARD_CAPABILITY_PROFILES,
	createCapabilityProfileRegistry,
	parseCapabilityRequirement,
	selectCapabilityImplementation,
	type SelectionCandidate,
	type TrustPolicy,
} from "../src/index.js";

const registry = createCapabilityProfileRegistry(STANDARD_CAPABILITY_PROFILES);
const NOW = Date.UTC(2026, 7, 8);
const FRESH = NOW + 20 * 24 * 60 * 60 * 1000;

function candidate(overrides: Partial<SelectionCandidate>): SelectionCandidate {
	return {
		definitionId: "test.definition/v1",
		providerId: "test",
		implementsProfiles: [
			{
				profileId: "data.postgres/v1",
				versionRange: ">=1",
				realization: "native",
				conformanceRef: "conformance.data.postgres/v1",
				conformance: "pass",
			},
		],
		runtimeModels: ["paas"],
		structuredCapabilities: {},
		producesBindingProfiles: ["binding.postgresql/v1"],
		migrationProfiles: ["migration.postgres.pg-dump/v1"],
		providerClass: "verified-emerging",
		evidenceExpiresAtMs: FRESH,
		evidenceSignatureValid: true,
		creatorAuthorityAfterClaim: "rotatable",
		claimAtomicity: "single-resource",
		claimActionCount: 1,
		continuity: { endpoint: "preserved", data: "preserved", credentials: "rotated" },
		supportsExport: true,
		supportsRotation: true,
		supportsRevocation: true,
		sponsorExposureMinorUnits: 0,
		hasRegisteredDriver: true,
		secretCustodyAvailable: true,
		...overrides,
	};
}

const postgresRequirement = parseCapabilityRequirement({
	requiredProfiles: [{ profileId: "data.postgres/v1" }],
});

const run = (
	candidates: readonly SelectionCandidate[],
	policy: TrustPolicy = DEFAULT_TRUST_POLICY,
	requirement = postgresRequirement,
) =>
	selectCapabilityImplementation({
		requirement,
		registry,
		candidates,
		policy,
		nowMs: NOW,
	});

describe("hard gates", () => {
	it("selects a conformant candidate", () => {
		const result = run([candidate({ definitionId: "neon.claimable-postgres/v1" })]);
		expect(result.winner?.definitionId).toBe("neon.claimable-postgres/v1");
		expect(result.rejections).toEqual([]);
	});

	it("never lets a relational-only product satisfy a postgres requirement", () => {
		const d1 = candidate({
			definitionId: "cloudflare.temporary-d1/v1",
			implementsProfiles: [
				{
					profileId: "data.sqlite/v1",
					versionRange: ">=1",
					realization: "native",
					conformanceRef: "conformance.data.sqlite/v1",
					conformance: "pass",
				},
			],
		});
		const result = run([d1]);
		expect(result.winner).toBeUndefined();
		expect(result.rejections[0]?.code).toBe("PROFILE_INCOMPATIBLE");
	});

	it("accepts D1 for a relational requirement", () => {
		const relational = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.relational/v1" }],
		});
		const d1 = candidate({
			definitionId: "cloudflare.temporary-d1/v1",
			implementsProfiles: [
				{
					profileId: "data.sqlite/v1",
					versionRange: ">=1",
					realization: "native",
					conformanceRef: "conformance.data.sqlite/v1",
					conformance: "pass",
				},
			],
		});
		expect(run([d1], DEFAULT_TRUST_POLICY, relational).winner?.definitionId).toBe(
			"cloudflare.temporary-d1/v1",
		);
	});

	it("fails closed on unknown conformance", () => {
		const result = run([
			candidate({
				implementsProfiles: [
					{
						profileId: "data.postgres/v1",
						versionRange: ">=1",
						realization: "native",
						conformanceRef: "c",
						conformance: "unknown",
					},
				],
			}),
		]);
		expect(result.rejections[0]?.code).toBe("CONFORMANCE_FAILED");
	});

	it("fails closed on absent, unsigned, and expired evidence", () => {
		const noEvidence = candidate({ definitionId: "a", evidenceExpiresAtMs: undefined });
		const unsigned = candidate({ definitionId: "b", evidenceSignatureValid: false });
		const expired = candidate({ definitionId: "c", evidenceExpiresAtMs: NOW - 1 });
		const result = run([noEvidence, unsigned, expired]);
		expect(result.winner).toBeUndefined();
		expect(result.rejections.map((r) => r.code)).toEqual([
			"EVIDENCE_STALE",
			"EVIDENCE_STALE",
			"EVIDENCE_STALE",
		]);
	});

	it("rejects a candidate with no registered driver", () => {
		expect(run([candidate({ hasRegisteredDriver: false })]).rejections[0]?.code).toBe(
			"NO_REGISTERED_DRIVER",
		);
	});

	it("rejects when secret custody is unavailable", () => {
		expect(run([candidate({ secretCustodyAvailable: false })]).rejections[0]?.code).toBe(
			"SECRET_CUSTODY_UNAVAILABLE",
		);
	});

	it("requires an explicit policy opt-in for pack realization", () => {
		const pack = candidate({
			definitionId: "postgres.oci-pack/v1",
			implementsProfiles: [
				{
					profileId: "data.postgres/v1",
					versionRange: ">=1",
					realization: "pack",
					conformanceRef: "c",
					conformance: "pass",
				},
			],
		});
		expect(run([pack]).winner?.definitionId).toBe("postgres.oci-pack/v1");
		expect(
			run([pack], { ...DEFAULT_TRUST_POLICY, allowPack: false }).rejections[0]?.code,
		).toBe("REALIZATION_DENIED");
	});

	it("enforces the strong-claim gate on retained creator authority", () => {
		const retained = candidate({ creatorAuthorityAfterClaim: "retained" });
		expect(run([retained]).rejections[0]?.code).toBe("STRONG_CLAIM_REQUIRED");
		expect(
			run([retained], {
				...DEFAULT_TRUST_POLICY,
				creatorAuthorityAfterClaim: "may-be-retained",
			}).winner,
		).toBeDefined();
	});

	it("caps human claim actions", () => {
		expect(run([candidate({ claimActionCount: 3 })]).rejections[0]?.code).toBe(
			"TOO_MANY_CLAIM_ACTIONS",
		);
	});

	it("gates sponsor exposure against the budget", () => {
		const sponsored = candidate({ sponsorExposureMinorUnits: 500 });
		expect(run([sponsored]).rejections[0]?.code).toBe("SPONSOR_BUDGET_EXCEEDED");
		expect(
			run([sponsored], { ...DEFAULT_TRUST_POLICY, allowSponsor: false }).rejections[0]?.code,
		).toBe("BOOTSTRAP_POLICY_DENIED");
		expect(
			run([sponsored], { ...DEFAULT_TRUST_POLICY, sponsorBudgetMinorUnits: 1000 }).winner,
		).toBeDefined();
	});

	it("rejects a candidate whose binding the workload cannot consume", () => {
		const result = selectCapabilityImplementation({
			requirement: postgresRequirement,
			registry,
			candidates: [candidate({ producesBindingProfiles: ["binding.neon-serverless/v1"] })],
			policy: DEFAULT_TRUST_POLICY,
			nowMs: NOW,
			consumableBindingProfiles: ["binding.postgresql/v1"],
		});
		expect(result.rejections[0]?.code).toBe("BINDING_UNAVAILABLE");
	});

	it("rejects a missing required migration profile", () => {
		const requirement = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.postgres/v1" }],
			portability: { requiredMigrationProfiles: ["migration.postgres.logical-copy/v1"] },
		});
		expect(run([candidate({})], DEFAULT_TRUST_POLICY, requirement).rejections[0]?.code).toBe(
			"MIGRATION_REQUIRED_BUT_UNAVAILABLE",
		);
	});

	it("rejects a prohibited profile", () => {
		const requirement = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.relational/v1" }],
			prohibitedProfiles: [{ profileId: "data.sqlite/v1" }],
		});
		const sqlite = candidate({
			implementsProfiles: [
				{
					profileId: "data.sqlite/v1",
					versionRange: ">=1",
					realization: "native",
					conformanceRef: "c",
					conformance: "pass",
				},
			],
		});
		expect(run([sqlite], DEFAULT_TRUST_POLICY, requirement).rejections[0]?.code).toBe(
			"PROFILE_PROHIBITED",
		);
	});

	it("enforces required structured features", () => {
		const requirement = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.postgres/v1" }],
			features: [
				{ key: "maxStorageBytes", operator: "at-least", value: 1_000_000_000, necessity: "required" },
			],
		});
		expect(
			run(
				[candidate({ structuredCapabilities: { maxStorageBytes: 100_000_000 } })],
				DEFAULT_TRUST_POLICY,
				requirement,
			).rejections[0]?.code,
		).toBe("FEATURE_UNSATISFIED");
		expect(
			run(
				[candidate({ structuredCapabilities: { maxStorageBytes: 10_000_000_000 } })],
				DEFAULT_TRUST_POLICY,
				requirement,
			).winner,
		).toBeDefined();
	});

	it("enforces a required runtime model", () => {
		const requirement = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.postgres/v1" }],
			runtime: { required: "oci" },
		});
		expect(run([candidate({})], DEFAULT_TRUST_POLICY, requirement).rejections[0]?.code).toBe(
			"RUNTIME_UNSUPPORTED",
		);
	});
});

describe("lexicographic ranking", () => {
	it("prefers absent creator authority over a cheaper retained one", () => {
		const strong = candidate({
			definitionId: "zz.strong/v1",
			creatorAuthorityAfterClaim: "absent",
			sponsorExposureMinorUnits: 0,
		});
		const weak = candidate({
			definitionId: "aa.weak/v1",
			creatorAuthorityAfterClaim: "rotatable",
		});
		expect(run([weak, strong]).ranked.map((c) => c.definitionId)).toEqual([
			"zz.strong/v1",
			"aa.weak/v1",
		]);
	});

	it("prefers fewer claim actions over provider maturity", () => {
		const oneAction = candidate({
			definitionId: "emerging.one/v1",
			claimActionCount: 1,
			providerClass: "verified-emerging",
		});
		const twoActions = candidate({
			definitionId: "established.two/v1",
			claimActionCount: 2,
			providerClass: "established",
		});
		expect(run([twoActions, oneAction]).winner?.definitionId).toBe("emerging.one/v1");
	});

	it("prefers single-resource claims over a best-effort saga", () => {
		const saga = candidate({
			definitionId: "aaa.saga/v1",
			claimAtomicity: "best-effort-saga",
		});
		const single = candidate({ definitionId: "zzz.single/v1" });
		expect(run([saga, single]).winner?.definitionId).toBe("zzz.single/v1");
	});

	it("is stable under candidate reordering", () => {
		const candidates = [
			candidate({ definitionId: "a/v1" }),
			candidate({ definitionId: "b/v1" }),
			candidate({ definitionId: "c/v1" }),
		];
		const forward = run(candidates).ranked.map((c) => c.definitionId);
		const reversed = run([...candidates].reverse()).ranked.map((c) => c.definitionId);
		expect(reversed).toEqual(forward);
	});

	it("does not change the winner when an incompatible candidate is added", () => {
		const winner = candidate({ definitionId: "neon/v1" });
		const incompatible = candidate({
			definitionId: "aaa.cheap-but-wrong/v1",
			implementsProfiles: [
				{
					profileId: "data.sqlite/v1",
					versionRange: ">=1",
					realization: "native",
					conformanceRef: "c",
					conformance: "pass",
				},
			],
		});
		expect(run([winner]).winner?.definitionId).toBe("neon/v1");
		expect(run([winner, incompatible]).winner?.definitionId).toBe("neon/v1");
	});

	it("produces deterministic rejection evidence", () => {
		const a = candidate({ definitionId: "a/v1", hasRegisteredDriver: false });
		const b = candidate({ definitionId: "b/v1", claimActionCount: 9 });
		expect(run([b, a]).rejections).toEqual(run([a, b]).rejections);
	});
});

describe("requirement parsing", () => {
	it("rejects a provider-shaped key on a Bindle requirement", () => {
		expect(() =>
			parseCapabilityRequirement({
				requiredProfiles: [{ profileId: "data.postgres/v1" }],
				providerId: "neon",
			} as never),
		).toThrow(/provider-neutral/u);
	});

	it("rejects an empty requirement", () => {
		expect(() => parseCapabilityRequirement({ requiredProfiles: [] })).toThrow(
			/at least one required profile/u,
		);
	});

	it("rejects a profile that is both required and prohibited", () => {
		expect(() =>
			parseCapabilityRequirement({
				requiredProfiles: [{ profileId: "data.postgres/v1" }],
				prohibitedProfiles: [{ profileId: "data.postgres/v1" }],
			}),
		).toThrow(/both required and prohibited/u);
	});

	it("canonically orders profiles so authoring order cannot change decisions", () => {
		const a = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.postgres/v1" }, { profileId: "data.vector/v1" }],
		});
		const b = parseCapabilityRequirement({
			requiredProfiles: [{ profileId: "data.vector/v1" }, { profileId: "data.postgres/v1" }],
		});
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("rejects an unknown required profile id at parse time", () => {
		expect(() =>
			parseCapabilityRequirement({ requiredProfiles: [{ profileId: "not-a-profile" }] }),
		).toThrow();
	});

	it("requires at least one realization kind", () => {
		expect(() =>
			parseCapabilityRequirement({
				requiredProfiles: [{ profileId: "data.postgres/v1" }],
				realization: { allowNative: false, allowPack: false, allowBridge: false },
			}),
		).toThrow(/at least one realization kind/u);
	});
});
