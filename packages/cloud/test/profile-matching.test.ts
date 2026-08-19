import {
	createCapabilityProfileRegistry,
	parseCapabilityRequirement,
	STANDARD_CAPABILITY_PROFILES,
	type TrustPolicy,
} from "@hobo/capability-profiles";
import { describeConcern } from "@hobo/contract-harness";
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

const POSTGRES_CLAIM = [
	{
		profileId: "data.postgres/v1",
		versionRange: ">=1",
		realization: "native" as const,
		conformanceRef: "conformance.postgres/v1",
		conformance: "pass" as const,
	},
];

const NAMED = { neon, d1 } as const;

interface DefinitionSpec {
	readonly id: string;
	readonly providerId: string;
	/** Merged into the semantics; `implementsProfiles` defaults to Postgres. */
	readonly semantics?: Record<string, unknown>;
}

const resolve = (spec: keyof typeof NAMED | DefinitionSpec) =>
	typeof spec === "string"
		? NAMED[spec]
		: definition(
				spec.id,
				spec.providerId,
				semantics({
					productId: spec.id.split("/")[0] ?? spec.id,
					implementsProfiles: POSTGRES_CLAIM,
					...spec.semantics,
				} as never),
			);

interface Ask {
	readonly requirement?: Record<string, unknown>;
	/** Built from Bindle-declared requirements instead of a parsed one. */
	readonly fromBindle?: Record<string, unknown>;
	readonly definitions: readonly (keyof typeof NAMED | DefinitionSpec)[];
}

function match(ask: Ask) {
	const requirement = ask.fromBindle
		? capabilityRequirementFromBindleRequirements(ask.fromBindle as never)
		: parseCapabilityRequirement(
				(ask.requirement ?? {
					requiredProfiles: [
						{ profileId: "data.postgres/v1", versionRange: ">=1" },
					],
				}) as never,
			);
	if (requirement === undefined) throw new Error("no capability requirement");
	return matchCapabilityRequirement({
		resourceName: "db",
		requirement,
		profiles,
		definitions: ask.definitions.map(resolve),
		policy,
		nowMs: NOW,
	});
}

describeConcern("profile-aware matching", {
	cases: `${import.meta.dirname}/profile-matching.cases.jsonl`,
	subject: () => ({
		match: (ask: Ask) => {
			const outcome = match(ask);
			return outcome.ok
				? {
						ok: true,
						definitionId: outcome.definition.id,
						ranking: outcome.ranking,
						rejections: [],
						remediationCode: null,
					}
				: {
						ok: false,
						definitionId: null,
						ranking: [],
						rejections: outcome.rejections.map((r) => r.code).sort(),
						remediationCode: outcome.remediation.code,
					};
		},
		/** Registration order must decide nothing — neither ranking nor hash. */
		isOrderIndependent: (ask: Ask) => {
			const forward = match(ask);
			const reverse = match({
				...ask,
				definitions: [...ask.definitions].reverse(),
			});
			if (!forward.ok || !reverse.ok) return false;
			return (
				JSON.stringify(forward.ranking) === JSON.stringify(reverse.ranking) &&
				forward.catalogHash === reverse.catalogHash
			);
		},
		/** A conformance result is part of the catalog's identity. */
		catalogHashesDiffer: (
			a: readonly (keyof typeof NAMED | DefinitionSpec)[],
			b: readonly (keyof typeof NAMED | DefinitionSpec)[],
		) =>
			profileCatalogHash(a.map(resolve), profiles) !==
			profileCatalogHash(b.map(resolve), profiles),
		/** A bare port name belongs to the legacy matcher, not to a guess. */
		bindleRequirement: (input: Record<string, unknown>) =>
			capabilityRequirementFromBindleRequirements(input as never) ?? null,
		/** Semantics without an executor is a refusal, not a warning. */
		parseDefinition: (spec: DefinitionSpec) => resolve(spec).id,
	}),
});
