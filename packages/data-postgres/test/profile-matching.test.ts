/**
 * The gate that matters: a relational database is not a PostgreSQL database.
 *
 * Candidates here are shaped like real products but constructed locally — this
 * package must never import a provider, and a test that did would make the
 * provider-neutrality claim untestable.
 */
import {
	createCapabilityProfileRegistry,
	type SelectionCandidate,
	STANDARD_CAPABILITY_PROFILES,
	selectCapabilityImplementation,
	type TrustPolicy,
} from "@hobo/capability-profiles";
import { describe, expect, it } from "vitest";

import {
	type database,
	POSTGRES_REQUIRED_GUARANTEE_KEYS,
	postgres,
	postgresConformanceRef,
} from "../src/index.js";

const registry = createCapabilityProfileRegistry(STANDARD_CAPABILITY_PROFILES);
const NOW = Date.UTC(2026, 7, 8);

const policy: TrustPolicy = {
	minimumProviderClass: "experimental",
	creatorAuthorityAfterClaim: "may-be-retained",
	maximumClaimActions: 4,
	maximumEvidenceAgeMs: 90 * 24 * 60 * 60 * 1000,
	requireExportProfile: false,
	allowSponsor: true,
	allowPack: true,
	allowBridge: true,
	sponsorBudgetMinorUnits: 0,
};

/** The guarantees every conformant Postgres product asserts. */
const GUARANTEED = Object.fromEntries(
	POSTGRES_REQUIRED_GUARANTEE_KEYS.map((key) => [key, true]),
);

function candidate(
	overrides: Partial<SelectionCandidate> & {
		definitionId: string;
		providerId: string;
	},
): SelectionCandidate {
	return {
		implementsProfiles: [
			{
				profileId: "data.postgres/v1",
				versionRange: ">=1",
				realization: "native",
				conformanceRef: postgresConformanceRef(
					overrides.definitionId.split("/")[0] ?? "x",
					"2026-08-08",
				),
				conformance: "pass",
			},
		],
		runtimeModels: ["paas", "serverless_faas", "oci"],
		structuredCapabilities: {
			...GUARANTEED,
			serverVersion: ">=17",
			serverVersionMajor: 17,
			jsonDocuments: true,
			jsonb: true,
			preparedStatements: true,
			pooling: true,
			isolationLevels: ["read-committed", "repeatable-read", "serializable"],
			migrationToolCompatibility: [
				"pg-dump",
				"pg-restore",
				"psql",
				"prisma-migrate",
			],
			connectivityTransports: ["tcp", "tls-tcp"],
			exportSupported: true,
			importSupported: true,
			credentialRotation: "provider-console",
		},
		producesBindingProfiles: ["binding.postgresql/v1"],
		migrationProfiles: ["migration.postgres.pg-dump/v1"],
		providerClass: "verified-emerging",
		evidenceExpiresAtMs: NOW + 30 * 24 * 60 * 60 * 1000,
		evidenceSignatureValid: true,
		creatorAuthorityAfterClaim: "rotatable",
		claimAtomicity: "single-resource",
		claimActionCount: 1,
		continuity: {
			endpoint: "preserved",
			data: "preserved",
			credentials: "retained",
		},
		supportsExport: true,
		supportsRotation: true,
		supportsRevocation: true,
		sponsorExposureMinorUnits: 0,
		hasRegisteredDriver: true,
		secretCustodyAvailable: true,
		...overrides,
	};
}

/** Shaped like Neon Claimable Postgres: real Postgres, pooled, exportable. */
const neonShaped = candidate({
	definitionId: "neon.claimable-postgres/v1",
	providerId: "neon",
	structuredCapabilities: {
		...candidate({ definitionId: "x/v1", providerId: "x" })
			.structuredCapabilities,
		extensions: ["vector", "pg_trgm"],
		logicalReplication: true,
		maxStorageBytes: 100 * 1024 * 1024,
	},
	migrationProfiles: [
		"migration.postgres.pg-dump/v1",
		"migration.postgres.logical-copy/v1",
	],
});

/** Shaped like Prisma's create-db temporary Postgres. */
const prismaShaped = candidate({
	definitionId: "prisma.claimable-postgres/v1",
	providerId: "prisma",
	claimActionCount: 1,
	claimAtomicity: "single-resource",
});

/**
 * Shaped like a D1 / SQLite-class product: relational, transactional, and not
 * PostgreSQL. This is the candidate the profile graph exists to reject.
 */
const sqliteShaped = candidate({
	definitionId: "cloudflare.temporary-d1/v1",
	providerId: "cloudflare",
	implementsProfiles: [
		{
			profileId: "data.sqlite/v1",
			versionRange: ">=1",
			realization: "native",
			conformanceRef: "hobo.conformance/data.sqlite/v1#d1@2026-08-08",
			conformance: "pass",
		},
	],
	structuredCapabilities: {
		transactions: true,
		constraints: true,
		jsonDocuments: true,
		sqliteDialect: true,
		exportSupported: true,
	},
	producesBindingProfiles: ["binding.http/v1"],
	migrationProfiles: [],
});

function select(
	requirement: ReturnType<typeof database>,
	candidates: readonly SelectionCandidate[],
) {
	return selectCapabilityImplementation({
		requirement,
		registry,
		candidates,
		policy,
		nowMs: NOW,
	});
}

describe("postgres.database() requirements", () => {
	it("never lets a SQLite/D1-shaped candidate satisfy data.postgres/v1", () => {
		const outcome = select(postgres.database(), [sqliteShaped]);
		expect(outcome.winner).toBeUndefined();
		expect(outcome.rejections.map((rejection) => rejection.code)).toContain(
			"PROFILE_INCOMPATIBLE",
		);
	});

	it("admits Neon-shaped and Prisma-shaped candidates", () => {
		const outcome = select(postgres.database({ version: ">=16" }), [
			sqliteShaped,
			prismaShaped,
			neonShaped,
		]);
		expect(outcome.ranked.map((entry) => entry.definitionId).sort()).toEqual([
			"neon.claimable-postgres/v1",
			"prisma.claimable-postgres/v1",
		]);
	});

	it("gates on the server major version rather than on a version string", () => {
		const tooOld = candidate({
			definitionId: "legacy.postgres/v1",
			providerId: "legacy",
			structuredCapabilities: {
				...neonShaped.structuredCapabilities,
				serverVersion: ">=13",
				serverVersionMajor: 13,
			},
		});
		const outcome = select(postgres.database({ version: ">=16" }), [
			tooOld,
			neonShaped,
		]);
		expect(outcome.winner?.definitionId).toBe("neon.claimable-postgres/v1");
		expect(
			outcome.rejections.filter(
				(rejection) => rejection.code === "FEATURE_UNSATISFIED",
			),
		).toHaveLength(1);
	});

	it("treats an unadvertised extension as a failure, not as a maybe", () => {
		// prismaShaped never declares `extensions`; absent must not pass.
		const outcome = select(postgres.database({ extensions: ["vector"] }), [
			prismaShaped,
			neonShaped,
		]);
		expect(outcome.winner?.definitionId).toBe("neon.claimable-postgres/v1");
		expect(outcome.rejections).toContainEqual(
			expect.objectContaining({
				definitionId: "prisma.claimable-postgres/v1",
				code: "FEATURE_UNSATISFIED",
			}),
		);
	});

	it("gates on a migration profile the product does not implement", () => {
		const outcome = select(
			postgres.database({
				migration: { profiles: ["migration.postgres.logical-copy/v1"] },
			}),
			[prismaShaped, neonShaped],
		);
		expect(outcome.winner?.definitionId).toBe("neon.claimable-postgres/v1");
		expect(outcome.rejections).toContainEqual(
			expect.objectContaining({ code: "MIGRATION_REQUIRED_BUT_UNAVAILABLE" }),
		);
	});

	it("gates on a migration tool claim rather than inferring it from the protocol", () => {
		const wireOnly = candidate({
			definitionId: "wire.only-postgres/v1",
			providerId: "wireonly",
			structuredCapabilities: {
				...GUARANTEED,
				serverVersionMajor: 17,
				// Speaks Postgres, has never proven a migration tool works.
			},
		});
		const outcome = select(
			postgres.database({ migration: { tools: ["prisma-migrate"] } }),
			[wireOnly],
		);
		expect(outcome.winner).toBeUndefined();
		expect(outcome.rejections.map((rejection) => rejection.code)).toContain(
			"FEATURE_UNSATISFIED",
		);
	});

	it("requires every Postgres guarantee, so a product missing DDL loses", () => {
		const noDdl = candidate({
			definitionId: "readonly.postgres/v1",
			providerId: "readonly",
			structuredCapabilities: {
				...neonShaped.structuredCapabilities,
				ddl: false,
			},
		});
		const outcome = select(postgres.database(), [noDdl]);
		expect(outcome.winner).toBeUndefined();
		expect(outcome.rejections.map((rejection) => rejection.code)).toContain(
			"GUARANTEE_UNSATISFIED",
		);
	});

	it("produces an identical requirement regardless of authoring order", () => {
		const a = postgres.database({
			version: ">=16",
			extensions: ["vector", "pg_trgm"],
			isolation: ["serializable", "read-committed"],
		});
		const b = postgres.database({
			isolation: ["read-committed", "serializable"],
			extensions: ["pg_trgm", "vector"],
			version: ">=16",
		});
		expect(a).toEqual(b);
	});

	it("refuses an option that names placement instead of capability", () => {
		expect(() =>
			// @ts-expect-error deliberately passing a provider-shaped option
			postgres.database({ providerId: "neon" }),
		).toThrow(/provider-neutral|unknown postgres.database option/u);
		expect(() =>
			// @ts-expect-error deliberately passing a region pin
			postgres.database({ region: "us-east-1" }),
		).toThrow(/provider-neutral|unknown postgres.database option/u);
	});

	it("rejects a version range it cannot reduce to a major", () => {
		expect(() => postgres.database({ version: "latest" })).toThrow(
			/must be a major version/u,
		);
	});

	it("rejects an extension name that is not a plain identifier", () => {
		expect(() =>
			postgres.database({ extensions: ["vector; DROP DATABASE x"] }),
		).toThrow(/plain PostgreSQL extension name/u);
	});
});
