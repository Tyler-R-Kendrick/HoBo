/**
 * Receipts and facts — the serialized outputs that leave this package.
 *
 * These are the artifacts that end up in a plan, an event log, and a support
 * bundle, so they are built by projection from the record rather than by
 * spreading it: a spread quietly republishes whatever a future field holds.
 * {@link assertNoCredentialMaterial} then re-checks the result, because the
 * cost of being wrong here is a bearer token in an append-only log.
 */

import type {
	UpstashClaimSummary as UpstashClaimSummaryWire,
	UpstashNonSecretEndpoint as UpstashNonSecretEndpointWire,
	UpstashProviderFact as UpstashProviderFactWire,
	UpstashProvisionReceipt as UpstashProvisionReceiptWire,
} from "./_generated/temporary_redis_pb.js";
import { UPSTASH_BINDING_PROFILE_REFS } from "./definition.js";
import type { UpstashClaimState, UpstashTemporaryRedis } from "./driver.js";
import { UpstashProviderError } from "./errors.js";
import { type JsonValue, parseJsonValue } from "./json.js";
import type { DomainView } from "./wire.js";

// domain-view: this surface has exactly one transport, so it is a literal here
// rather than the free string a proto3 scalar allows.
export type UpstashReceiptEndpoint = DomainView<
	UpstashNonSecretEndpointWire,
	{ transport: "https-rest" }
>;

// domain-view: `state` uses the CUE vocabulary rather than the numeric proto
// enum, and the outstanding-action ids are read-only because a receipt is a
// serialized output, not a working record.
export type UpstashReceiptClaimSummary = DomainView<
	UpstashClaimSummaryWire,
	{
		state: UpstashClaimState;
		boundary: "resource";
		atomicity: "single-resource";
		blockingActionIds: readonly string[];
	}
>;

// domain-view: the locators are optional under exactOptionalPropertyTypes, so
// an absent secret cannot be spelled as the empty string a proto3 scalar
// allows; the endpoint, claim summary, and limits are required here because a
// receipt without them is not a receipt.
export type UpstashProvisionReceipt = DomainView<
	UpstashProvisionReceiptWire,
	{
		schemaVersion: "hobo.provider-upstash.receipt/v1";
		endpoint: UpstashReceiptEndpoint;
		credentialRef?: string;
		restUrlRef?: string;
		expiresAtMs: number;
		expirySource: "provider-reported";
		observedAtMs: number;
		claim: UpstashReceiptClaimSummary;
		limits: UpstashTemporaryRedis["limits"];
		bindingProfiles: readonly string[];
		/** Empty by design; this surface publishes no export path. */
		migrationProfiles: readonly string[];
		teardown: "expiry-only";
	}
>;

// domain-view: `kind` is the exact five-member union of fact names, which the
// wire form can only approximate with an open enum, and `detail` keeps the
// scalar types a projection reads before the wire form flattens them all to
// strings.
export type UpstashProviderFact = DomainView<
	UpstashProviderFactWire,
	{
		kind:
			| "provider.upstash.database.provisioned"
			| "provider.upstash.database.adopted"
			| "provider.upstash.claim.pending-rotation"
			| "provider.upstash.claim.completed"
			| "provider.upstash.lease.expired";
		occurredAtMs: number;
		detail: Readonly<Record<string, string | number | boolean>>;
	}
>;

/**
 * Shapes that must never appear in a serialized output.
 *
 * The last rule is the one that matters for this provider: an Upstash REST
 * token has no prefix to match on, so it is caught structurally as a long
 * unbroken run of token characters. A UUID is 36 and survives; a hostname has
 * dots and survives; a `hobo-secret://…` locator has slashes and survives.
 */
const FORBIDDEN: readonly {
	readonly name: string;
	readonly pattern: RegExp;
}[] = [
	{ name: "redis-uri", pattern: /rediss?:\/\//iu },
	{ name: "bearer-token", pattern: /Bearer\s+\S+/iu },
	{
		name: "token-assignment",
		pattern: /\b(?:token|password|pwd)\s*[=:]\s*"?[^\s"',}]{8,}/iu,
	},
	{
		name: "upstash-rest-token-env",
		pattern: /UPSTASH_REDIS_REST_TOKEN\s*[=:]/iu,
	},
	{ name: "userinfo-pair", pattern: /\/\/[^/\s:@]+:[^/\s:@]+@/u },
	{ name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
	{ name: "opaque-blob", pattern: /[A-Za-z0-9_-]{40,}/u },
];

export type CredentialScanHit = {
	readonly rule: string;
	readonly excerpt: string;
};

function jsonView(
	value: JsonValue | UpstashProvisionReceipt | readonly UpstashProviderFact[],
): JsonValue {
	return parseJsonValue(JSON.stringify(value));
}

/** Scan any JSON-serializable value for credential material. */
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
			// Eight characters is enough to locate the field and not enough to
			// be a usable credential.
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
	throw new UpstashProviderError(
		"SECRET_REFERENCE_INVALID",
		`${what} contains credential-shaped material (${hits.map((hit) => hit.rule).join(", ")}) and was not emitted`,
	);
}

export function toProvisionReceipt(
	record: UpstashTemporaryRedis,
): UpstashProvisionReceipt {
	const receipt: UpstashProvisionReceipt = {
		schemaVersion: "hobo.provider-upstash.receipt/v1",
		definitionId: record.definitionId,
		providerId: record.providerId,
		resourceRef: record.resourceRef,
		databaseId: record.databaseId,
		endpoint: {
			host: record.restEndpointHost,
			port: 443,
			tls: true,
			transport: "https-rest",
		},
		...(record.credentialRef !== undefined
			? { credentialRef: record.credentialRef }
			: undefined),
		...(record.restUrlRef !== undefined
			? { restUrlRef: record.restUrlRef }
			: undefined),
		expiresAtIso: record.expiresAtIso,
		expiresAtMs: record.expiresAtMs,
		statedTtlDays: record.statedTtlDays,
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
		bindingProfiles: [...UPSTASH_BINDING_PROFILE_REFS],
		migrationProfiles: [],
		teardown: "expiry-only",
	};
	assertNoCredentialMaterial(
		jsonView(receipt),
		"the Upstash provision receipt",
	);
	return receipt;
}

export function toProviderFacts(
	record: UpstashTemporaryRedis,
): readonly UpstashProviderFact[] {
	const base = {
		occurredAtMs: record.observedAtMs,
		resourceRef: record.resourceRef,
		databaseId: record.databaseId,
	};
	const facts: UpstashProviderFact[] = [
		{
			...base,
			kind: record.adopted
				? "provider.upstash.database.adopted"
				: "provider.upstash.database.provisioned",
			detail: {
				restEndpointHost: record.restEndpointHost,
				expirySource: record.expirySource,
				expiresAtIso: record.expiresAtIso,
				credentialRef: record.credentialRef ?? "",
			},
		},
	];
	if (record.claim.state === "claimed-pending-rotation") {
		facts.push({
			...base,
			kind: "provider.upstash.claim.pending-rotation",
			detail: {
				reason:
					"the claim ceremony is attested, but the pre-claim REST token keeps working until an owner resets it in the console",
			},
		});
	}
	if (record.claim.state === "complete") {
		facts.push({
			...base,
			kind: "provider.upstash.claim.completed",
			detail: {},
		});
	}
	if (record.claim.state === "expired") {
		facts.push({
			...base,
			kind: "provider.upstash.lease.expired",
			detail: { expiresAtIso: record.expiresAtIso },
		});
	}
	assertNoCredentialMaterial(jsonView(facts), "the Upstash provider facts");
	return facts;
}
