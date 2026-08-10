/**
 * Receipts and facts — the serialized outputs that leave this package.
 *
 * These are the artifacts that end up in a plan, an event log, and a support
 * bundle, so they are built by projection from the record rather than by
 * spreading it: a spread quietly republishes whatever a future field holds.
 * {@link assertNoCredentialMaterial} then re-checks the result, because the
 * cost of being wrong here is a credential in an append-only log.
 */

import type {
	NeonClaimSummary as NeonClaimSummaryWire,
	NeonNonSecretEndpoint as NeonNonSecretEndpointWire,
	NeonProvisionReceipt as NeonProvisionReceiptWire,
	NeonReceiptEndpoints as NeonReceiptEndpointsWire,
} from "./_generated/provider_neon_pb.js";
import type { NeonClaimableDatabase, NeonClaimState } from "./driver.js";
import { NeonProviderError } from "./errors.js";
import type { DomainView, WireFields } from "./wire.js";

/** One non-secret address on a receipt, exactly as the wire form declares it. */
export type NeonReceiptEndpoint = Readonly<
	WireFields<NeonNonSecretEndpointWire>
>;

// domain-view: both roles are required here — a receipt missing an endpoint is
// not a receipt with an unknown one — where the wire form leaves a submessage
// absent-able.
export type NeonReceiptEndpoints = DomainView<
	NeonReceiptEndpointsWire,
	{
		pooled: NeonReceiptEndpoint;
		direct: NeonReceiptEndpoint;
	}
>;

// domain-view: `state` uses the CUE vocabulary rather than the numeric proto
// enum, and the outstanding-action ids are read-only because a receipt is a
// serialized output, not a working record.
export type NeonReceiptClaimSummary = DomainView<
	NeonClaimSummaryWire,
	{
		state: NeonClaimState;
		boundary: "resource";
		atomicity: "single-resource";
		blockingActionIds: readonly string[];
	}
>;

// domain-view: the locators are optional under exactOptionalPropertyTypes, so
// an absent secret cannot be spelled as the empty string a proto3 scalar
// allows; the endpoints, claim summary, and documented limits are required
// because a receipt without them is not a receipt.
export type NeonProvisionReceipt = DomainView<
	NeonProvisionReceiptWire,
	{
		schemaVersion: "hobo.provider-neon.receipt/v1";
		endpoints: NeonReceiptEndpoints;
		credentialRef?: string;
		directCredentialRef?: string;
		expiresAtMs: number;
		expirySource: "provider-reported";
		observedAtMs: number;
		claim: NeonReceiptClaimSummary;
		limits: NeonClaimableDatabase["limits"];
		bindingProfiles: readonly string[];
		migrationProfiles: readonly string[];
	}
>;

export type NeonProviderFact = {
	readonly kind:
		| "provider.neon.database.provisioned"
		| "provider.neon.database.adopted"
		| "provider.neon.database.observed"
		| "provider.neon.claim.pending-rotation"
		| "provider.neon.claim.completed"
		| "provider.neon.lease.expired";
	readonly occurredAtMs: number;
	readonly resourceRef: string;
	readonly databaseId: string;
	readonly detail: Readonly<Record<string, string | number | boolean>>;
};

export const NEON_BINDING_PROFILE_REFS = [
	"binding.postgresql/v1",
	"binding.neon-serverless/v1",
] as const;

export const NEON_MIGRATION_PROFILE_REFS = [
	"migration.postgres.pg-dump/v1",
	"migration.postgres.logical-copy/v1",
] as const;

/** Shapes that must never appear in a serialized output. */
const FORBIDDEN: readonly {
	readonly name: string;
	readonly pattern: RegExp;
}[] = [
	{ name: "postgres-uri", pattern: /postgres(?:ql)?:\/\//iu },
	{ name: "bearer-token", pattern: /Bearer\s+\S+/iu },
	{
		name: "password-assignment",
		pattern: /\b(?:password|pgpassword|pwd)\s*[=:]\s*[^\s"',}]+/iu,
	},
	{ name: "neon-role-password", pattern: /\bnpg_[A-Za-z0-9_-]{4,}/u },
	{ name: "userinfo-pair", pattern: /\/\/[^/\s:@]+:[^/\s:@]+@/u },
	{ name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
];

export type CredentialScanHit = {
	readonly rule: string;
	readonly excerpt: string;
};

/** Scan any JSON-serializable value for credential material. */
export function scanForCredentialMaterial(
	value: unknown,
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

export function assertNoCredentialMaterial(value: unknown, what: string): void {
	const hits = scanForCredentialMaterial(value);
	if (hits.length === 0) return;
	throw new NeonProviderError(
		"SECRET_CUSTODY_UNAVAILABLE",
		`${what} contains credential-shaped material (${hits.map((hit) => hit.rule).join(", ")}) and was not emitted`,
	);
}

export function toProvisionReceipt(
	record: NeonClaimableDatabase,
): NeonProvisionReceipt {
	const receipt: NeonProvisionReceipt = {
		schemaVersion: "hobo.provider-neon.receipt/v1",
		definitionId: record.definitionId,
		providerId: record.providerId,
		resourceRef: record.resourceRef,
		databaseId: record.databaseId,
		neonProjectId: record.neonProjectId,
		providerStatus: record.providerStatus,
		databaseName: record.databaseName,
		endpoints: {
			pooled: {
				host: record.endpoints.pooled.host,
				...(record.endpoints.pooled.port !== undefined
					? { port: record.endpoints.pooled.port }
					: {}),
				tls: record.endpoints.pooled.tls,
			},
			direct: {
				host: record.endpoints.direct.host,
				...(record.endpoints.direct.port !== undefined
					? { port: record.endpoints.direct.port }
					: {}),
				tls: record.endpoints.direct.tls,
			},
		},
		...(record.credentialRef !== undefined
			? { credentialRef: record.credentialRef }
			: {}),
		...(record.directCredentialRef !== undefined
			? { directCredentialRef: record.directCredentialRef }
			: {}),
		expiresAtIso: record.expiresAtIso,
		expiresAtMs: record.expiresAtMs,
		expirySource: record.expirySource,
		observedAtMs: record.observedAtMs,
		adopted: record.adopted,
		claim: {
			state: record.claim.state,
			boundary: record.claim.boundary,
			atomicity: record.claim.atomicity,
			claimUrl: record.claim.claimUrl,
			blockingActionIds: record.claim.actions
				.filter((action) => action.blocking && !action.completed)
				.map((action) => action.id),
		},
		limits: record.limits,
		bindingProfiles: NEON_BINDING_PROFILE_REFS,
		migrationProfiles: NEON_MIGRATION_PROFILE_REFS,
	};
	assertNoCredentialMaterial(receipt, "the Neon provision receipt");
	return receipt;
}

export function toProviderFacts(
	record: NeonClaimableDatabase,
): readonly NeonProviderFact[] {
	const base = {
		occurredAtMs: record.observedAtMs,
		resourceRef: record.resourceRef,
		databaseId: record.databaseId,
	};
	const facts: NeonProviderFact[] = [
		{
			...base,
			kind: record.adopted
				? "provider.neon.database.adopted"
				: "provider.neon.database.provisioned",
			detail: {
				neonProjectId: record.neonProjectId,
				providerStatus: record.providerStatus,
				expiresAtIso: record.expiresAtIso,
				expirySource: record.expirySource,
				pooledHost: record.endpoints.pooled.host,
				credentialRef: record.credentialRef ?? "",
			},
		},
	];
	if (record.claim.state === "claimed-pending-rotation") {
		facts.push({
			...base,
			kind: "provider.neon.claim.pending-rotation",
			detail: {
				reason:
					"the provider reports CLAIMED but the pre-claim credential still works until the owner rotates it",
			},
		});
	}
	if (record.claim.state === "complete") {
		facts.push({ ...base, kind: "provider.neon.claim.completed", detail: {} });
	}
	if (record.claim.state === "expired") {
		facts.push({
			...base,
			kind: "provider.neon.lease.expired",
			detail: { expiresAtIso: record.expiresAtIso },
		});
	}
	assertNoCredentialMaterial(facts, "the Neon provider facts");
	return facts;
}
