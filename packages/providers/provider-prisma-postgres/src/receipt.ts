/**
 * Receipts and facts — the serialized outputs that leave this package.
 *
 * Built by projection rather than by spreading the record, then re-scanned.
 * The scanner is the same idea as the Neon one plus `prisma+postgres://`,
 * which is Prisma's own credential-bearing URI scheme.
 */

import type {
	PrismaClaimSummary as PrismaClaimSummaryWire,
	PrismaNonSecretEndpoint as PrismaNonSecretEndpointWire,
	PrismaProvisionReceipt as PrismaProvisionReceiptWire,
} from "./_generated/provider_prisma_postgres_pb.js";
import type {
	PrismaAssociatedResourceRef,
	PrismaClaimableDatabase,
	PrismaClaimState,
} from "./driver.js";
import { PrismaProviderError } from "./errors.js";
import { type JsonValue, parseJsonValue } from "./json.js";
import type { DomainView, WireFields } from "./wire.js";

export const PRISMA_BINDING_PROFILE_REFS = ["binding.postgresql/v1"] as const;
export const PRISMA_MIGRATION_PROFILE_REFS = [
	"migration.postgres.pg-dump/v1",
] as const;

/** One non-secret address on a receipt, exactly as the wire form declares it. */
export type PrismaReceiptEndpoint = Readonly<
	WireFields<PrismaNonSecretEndpointWire>
>;

// domain-view: `state` uses the CUE vocabulary rather than the numeric proto
// enum, and the outstanding-action ids are read-only because a receipt is a
// serialized output, not a working record.
export type PrismaReceiptClaimSummary = DomainView<
	PrismaClaimSummaryWire,
	{
		state: PrismaClaimState;
		boundary: "resource";
		atomicity: "single-resource";
		blockingActionIds: readonly string[];
	}
>;

// domain-view: the credential locator is optional under
// exactOptionalPropertyTypes, so an absent secret cannot be spelled as the
// empty string a proto3 scalar allows; the endpoint, claim summary, and
// associated-resource reference are required because a receipt without them is
// not a receipt.
export type PrismaProvisionReceipt = DomainView<
	PrismaProvisionReceiptWire,
	{
		schemaVersion: "hobo.provider-prisma-postgres.receipt/v1";
		endpoint: PrismaReceiptEndpoint;
		credentialRef?: string;
		/** Epoch milliseconds as a JSON-safe number; the wire form is int64. */
		expiresAtMs: number;
		expirySource: "cli-local-clock";
		observedAtMs: number;
		outputMode: PrismaClaimableDatabase["outputMode"];
		claim: PrismaReceiptClaimSummary;
		associatedResource: PrismaAssociatedResourceRef;
		bindingProfiles: readonly string[];
		migrationProfiles: readonly string[];
	}
>;

export type PrismaProviderFact = {
	readonly kind:
		| "provider.prisma.database.provisioned"
		| "provider.prisma.database.adopted"
		| "provider.prisma.claim.pending-rotation"
		| "provider.prisma.claim.completed"
		| "provider.prisma.lease.expired";
	readonly occurredAtMs: number;
	readonly resourceRef: string;
	readonly projectId: string;
	readonly detail: Readonly<Record<string, string | number | boolean>>;
};

const FORBIDDEN: readonly {
	readonly name: string;
	readonly pattern: RegExp;
}[] = [
	{ name: "postgres-uri", pattern: /postgres(?:ql)?:\/\//iu },
	{ name: "prisma-postgres-uri", pattern: /prisma\+postgres:\/\//iu },
	{ name: "bearer-token", pattern: /Bearer\s+\S+/iu },
	{
		name: "password-assignment",
		pattern: /\b(?:password|pgpassword|pwd)\s*[=:]\s*[^\s"',}]+/iu,
	},
	{ name: "api-key-parameter", pattern: /\bapi_key=[^\s"'&,}]+/iu },
	{ name: "userinfo-pair", pattern: /\/\/[^/\s:@]+:[^/\s:@]+@/u },
	{ name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
];

export type CredentialScanHit = {
	readonly rule: string;
	readonly excerpt: string;
};

function jsonView(
	value: JsonValue | PrismaProvisionReceipt | readonly PrismaProviderFact[],
): JsonValue {
	return parseJsonValue(JSON.stringify(value));
}

export function scanForCredentialMaterial(
	value: JsonValue,
): readonly CredentialScanHit[] {
	const serialized = JSON.stringify(value) ?? "";
	const hits: CredentialScanHit[] = [];
	for (const rule of FORBIDDEN) {
		const match = rule.pattern.exec(serialized);
		if (match === null) continue;
		const start = Math.max(0, match.index - 12);
		hits.push({
			rule: rule.name,
			excerpt: `…${serialized.slice(start, match.index + 8).replace(/[^\x20-\x7e]/gu, " ")}…`,
		});
	}
	return hits;
}

export function assertNoCredentialMaterial(
	value: JsonValue,
	what: string,
): void {
	const hits = scanForCredentialMaterial(value);
	if (hits.length === 0) return;
	throw new PrismaProviderError(
		"SECRET_CUSTODY_UNAVAILABLE",
		`${what} contains credential-shaped material (${hits.map((hit) => hit.rule).join(", ")}) and was not emitted`,
	);
}

export function toProvisionReceipt(
	record: PrismaClaimableDatabase,
): PrismaProvisionReceipt {
	const receipt: PrismaProvisionReceipt = {
		schemaVersion: "hobo.provider-prisma-postgres.receipt/v1",
		definitionId: record.definitionId,
		providerId: record.providerId,
		resourceRef: record.resourceRef,
		projectId: record.projectId,
		databaseName: record.databaseName,
		region: record.region,
		endpoint: {
			host: record.endpoint.host,
			...(record.endpoint.port !== undefined
				? { port: record.endpoint.port }
				: undefined),
			tls: record.endpoint.tls,
		},
		...(record.credentialRef !== undefined
			? { credentialRef: record.credentialRef }
			: undefined),
		expiresAtIso: record.expiresAtIso,
		expiresAtMs: record.expiresAtMs,
		expirySource: record.expirySource,
		documentedTtlHours: record.documentedTtlHours,
		observedAtMs: record.observedAtMs,
		adopted: record.adopted,
		outputMode: record.outputMode,
		claim: {
			state: record.claim.state,
			boundary: record.claim.boundary,
			atomicity: record.claim.atomicity,
			claimUrl: record.claim.claimUrl,
			blockingActionIds: record.claim.actions
				.filter((action) => action.blocking && !action.completed)
				.map((action) => action.id),
		},
		associatedResource: record.claim.associatedResource,
		bindingProfiles: PRISMA_BINDING_PROFILE_REFS,
		migrationProfiles: PRISMA_MIGRATION_PROFILE_REFS,
	};
	assertNoCredentialMaterial(
		jsonView(receipt),
		"the Prisma Postgres provision receipt",
	);
	return receipt;
}

export function toProviderFacts(
	record: PrismaClaimableDatabase,
): readonly PrismaProviderFact[] {
	const base = {
		occurredAtMs: record.observedAtMs,
		resourceRef: record.resourceRef,
		projectId: record.projectId,
	};
	const facts: PrismaProviderFact[] = [
		{
			...base,
			kind: record.adopted
				? "provider.prisma.database.adopted"
				: "provider.prisma.database.provisioned",
			detail: {
				region: record.region,
				host: record.endpoint.host,
				expiresAtIso: record.expiresAtIso,
				expirySource: record.expirySource,
				documentedTtlHours: record.documentedTtlHours,
				outputMode: record.outputMode,
				credentialRef: record.credentialRef ?? "",
			},
		},
	];
	if (record.claim.state === "claimed-pending-rotation") {
		facts.push({
			...base,
			kind: "provider.prisma.claim.pending-rotation",
			detail: {
				reason:
					"the workspace transfer is attested but Prisma does not document the pre-claim credential being invalidated, so rotation is still outstanding",
			},
		});
	}
	if (record.claim.state === "complete") {
		facts.push({
			...base,
			kind: "provider.prisma.claim.completed",
			detail: {},
		});
	}
	if (record.claim.state === "expired") {
		facts.push({
			...base,
			kind: "provider.prisma.lease.expired",
			detail: {
				expiresAtIso: record.expiresAtIso,
				expirySource: record.expirySource,
			},
		});
	}
	assertNoCredentialMaterial(
		jsonView(facts),
		"the Prisma Postgres provider facts",
	);
	return facts;
}
