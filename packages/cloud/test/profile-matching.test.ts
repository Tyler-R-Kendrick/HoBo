import {
	createCapabilityProfileRegistry,
	parseCapabilityRequirement,
	STANDARD_CAPABILITY_PROFILES,
	type TrustPolicy,
} from "@hobo/capability-profiles";
import { describe, expect, it } from "vitest";

import {
	capabilityRequirementFromBindleRequirements,
	matchCapabilityRequirement,
	parseResourceDefinitionVNext,
	profileCatalogHash,
	RESOURCE_DEFINITION_VNEXT_SCHEMA,
	type ResourceDefinitionSemantics,
	type ResourceDefinitionVNext,
} from "../src/index.js";

const profiles = createCapabilityProfileRegistry(STANDARD_CAPABILITY_PROFILES);

const policy: TrustPolicy = {
	minimumProviderClass: "experimental",
	maximumClaimActions: 4,
	creatorAuthorityAfterClaim: "may-be-retained",
	allowPack: true,
	allowBridge: true,
	allowSponsor: true,
	requireExportProfile: false,
	requireSecretCustody: true,
	maximumEvidenceAgeMs: 30 * 24 * 60 * 60 * 1000,
	maximumSponsorExposureMinorUnits: 10_000,
};

const NOW = Date.UTC(2026, 7, 8);

function semantics(
	overrides: Partial<ResourceDefinitionSemantics> & {
		productId: string;
		implementsProfiles: ResourceDefinitionSemantics["implementsProfiles"];
	},
): ResourceDefinitionSemantics {
	return {
		schemaVersion: RESOURCE_DEFINITION_VNEXT_SCHEMA,
		displayName: overrides.productId,
		runtimeModels: ["paas"],
		structuredCapabilities: {},
		placementConstraints: [],
		producesBindingProfiles: ["binding.postgresql/v1"],
		migrationProfiles: ["migration.postgres.pg-dump/v1"],
		bootstrapStrategyRef: "bootstrap.anonymous-claimable/v1",
		claimStrategyRef: "claim.resource/v1",
		compilerRef: "compile.test/v1",
		executorRef: "execute.test/v1",
		permissionProfileRef: "permissions.test/v1",
		trustEvidenceRef: "evidence.test/v1",
		sourceEvidenceRefs: [],
		remediation: [],
		providerClass: "established",
		evidenceExpiresAtMs: NOW + 86_400_000,
		evidenceSignatureValid: true,
		creatorAuthorityAfterClaim: "rotatable",
		claimAtomicity: "single-resource",
		claimActionCount: 1,
		continuity: {
			endpoint: "preserved",
			data: "preserved",
			credentials: "rotated",
		},
		supportsExport: true,
		supportsRotation: true,
		supportsRevocation: true,
		sponsorExposureMinorUnits: 0,
		secretCustodyAvailable: true,
		...overrides,
	};
}

function definition(
	id: string,
	providerId: string,
	sem: ResourceDefinitionSemantics,
): ResourceDefinitionVNext {
	return parseResourceDefinitionVNext({
		id,
		providerId,
		port: "data",
		features: [],
		regions: [],
		specificity: 1,
		priority: 1,
		cost: { sku: id, unit: "hour", marginalPrice: "0" },
		satisfies: () => ({ ok: true, missing: [] }) as never,
		semantics: sem,
	});
}

const neon = definition(
	"neon.claimable-postgres/v1",
	"neon",
	semantics({
		productId: "neon.claimable-postgres",
		implementsProfiles: [
			{
				profileId: "data.postgres/v1",
				versionRange: ">=1",
				realization: "native",
				conformanceRef: "conformance.postgres/v1",
				conformance: "pass",
			},
		],
	}),
);

const d1 = definition(
	"cloudflare.temporary-d1/v1",
	"cloudflare",
	semantics({
		productId: "cloudflare.temporary-d1",
		implementsProfiles: [
			{
				profileId: "data.sqlite/v1",
				versionRange: ">=1",
				realization: "native",
				conformanceRef: "conformance.sqlite/v1",
				conformance: "pass",
			},
		],
		producesBindingProfiles: ["binding.http/v1"],
		migrationProfiles: [],
	}),
);

const postgresRequirement = parseCapabilityRequirement({
	requiredProfiles: [{ profileId: "data.postgres/v1", versionRange: ">=1" }],
});

describe("profile-aware matching", () => {
	it("resolves a Postgres requirement to a conformant Postgres product", () => {
		const outcome = matchCapabilityRequirement({
			resourceName: "db",
			requirement: postgresRequirement,
			profiles,
			definitions: [d1, neon],
			policy,
			nowMs: NOW,
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.definition.id).toBe("neon.claimable-postgres/v1");
	});

	it("never lets D1 satisfy a PostgreSQL requirement", () => {
		const outcome = matchCapabilityRequirement({
			resourceName: "db",
			requirement: postgresRequirement,
			profiles,
			definitions: [d1],
			policy,
			nowMs: NOW,
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.rejections.map((r) => r.code)).toContain(
			"PROFILE_INCOMPATIBLE",
		);
		expect(outcome.remediation.code).toBe("capability.profile-unsatisfiable");
	});

	it("satisfies a relational requirement through the refinement graph", () => {
		const relational = parseCapabilityRequirement({
			requiredProfiles: [
				{ profileId: "data.relational/v1", versionRange: ">=1" },
			],
		});
		const outcome = matchCapabilityRequirement({
			resourceName: "db",
			requirement: relational,
			profiles,
			definitions: [d1],
			policy,
			nowMs: NOW,
		});
		expect(outcome.ok).toBe(true);
	});

	it("fails closed on stale evidence rather than ranking it lower", () => {
		const stale = definition(
			"neon.stale/v1",
			"neon",
			semantics({
				productId: "neon.stale",
				implementsProfiles: neon.semantics?.implementsProfiles ?? [],
				evidenceExpiresAtMs: NOW - 1,
			}),
		);
		const outcome = matchCapabilityRequirement({
			resourceName: "db",
			requirement: postgresRequirement,
			profiles,
			definitions: [stale],
			policy,
			nowMs: NOW,
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.rejections.map((r) => r.code)).toContain("EVIDENCE_STALE");
	});

	it("prefers the candidate with fewer human claim actions, not the cheaper one", () => {
		const twoActions = definition(
			"prisma.claimable-postgres/v1",
			"prisma",
			semantics({
				productId: "prisma.claimable-postgres",
				implementsProfiles: neon.semantics?.implementsProfiles ?? [],
				claimActionCount: 2,
				claimAtomicity: "best-effort-saga",
			}),
		);
		const outcome = matchCapabilityRequirement({
			resourceName: "db",
			requirement: postgresRequirement,
			profiles,
			definitions: [twoActions, neon],
			policy,
			nowMs: NOW,
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.ranking[0]).toBe("neon.claimable-postgres/v1");
	});

	it("ranks identically regardless of catalog registration order", () => {
		const forward = matchCapabilityRequirement({
			resourceName: "db",
			requirement: postgresRequirement,
			profiles,
			definitions: [neon, d1],
			policy,
			nowMs: NOW,
		});
		const reverse = matchCapabilityRequirement({
			resourceName: "db",
			requirement: postgresRequirement,
			profiles,
			definitions: [d1, neon],
			policy,
			nowMs: NOW,
		});
		expect(forward.ok && reverse.ok).toBe(true);
		if (!forward.ok || !reverse.ok) return;
		expect(forward.ranking).toEqual(reverse.ranking);
		expect(forward.catalogHash).toEqual(reverse.catalogHash);
	});

	it("changes the catalog hash when a conformance result changes", () => {
		const before = profileCatalogHash([neon], profiles);
		const failed = definition(
			"neon.claimable-postgres/v1",
			"neon",
			semantics({
				productId: "neon.claimable-postgres",
				implementsProfiles: [
					{
						profileId: "data.postgres/v1",
						versionRange: ">=1",
						realization: "native",
						conformanceRef: "conformance.postgres/v1",
						conformance: "fail",
					},
				],
			}),
		);
		expect(profileCatalogHash([failed], profiles)).not.toEqual(before);
	});

	it("bridges Bindle-declared requirements into a capability requirement", () => {
		const requirement = capabilityRequirementFromBindleRequirements({
			require: ["data.postgres/v1"],
			prefer: ["data.vector.pgvector/v1"],
			runtimes: ["paas"],
			labels: {},
		});
		expect(requirement).toBeDefined();
		if (requirement === undefined) return;
		const outcome = matchCapabilityRequirement({
			resourceName: "db",
			requirement,
			profiles,
			definitions: [d1, neon],
			policy,
			nowMs: NOW,
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.definition.id).toBe("neon.claimable-postgres/v1");
	});

	it("leaves a bare port name to the legacy matcher instead of guessing a profile", () => {
		expect(
			capabilityRequirementFromBindleRequirements({
				require: ["data"],
				prefer: [],
				runtimes: [],
				labels: {},
			}),
		).toBeUndefined();
	});

	it("refuses a definition that declares semantics but names no executor", () => {
		expect(() =>
			definition(
				"broken/v1",
				"nobody",
				semantics({
					productId: "broken",
					implementsProfiles: neon.semantics?.implementsProfiles ?? [],
					executorRef: "",
				}),
			),
		).toThrow(/names no executor/u);
	});
});
