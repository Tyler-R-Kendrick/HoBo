import type { InitialCapabilityPort } from "./equivalence.js";
import { EQUIVALENCE_CLASSES } from "./equivalence.js";

// public-contract: capability-manifest document schema ids (Plan 6 signs).
export const MANIFEST_SCHEMA = "hobo.capability-manifest/v1";
// public-contract: capabilities document schema id.
export const CAPABILITIES_SCHEMA = "hobo.capabilities/v1";
// public-contract: auth document schema id.
export const AUTH_SCHEMA = "hobo.provider-auth/v1";
// public-contract: cost document schema id.
export const COST_SCHEMA = "hobo.cost/v1";

// public-contract: the provider id every published document carries.
export const AWS_PROVIDER_ID = "@hobo/provider-aws";

export const DEFAULT_REGIONS = ["us-east-1", "us-west-2", "eu-west-1"];

// A `type` alias (not an interface) so it keeps an implicit index signature
// and stays assignable to @hobo/core's `PublishedManifestDocuments`
// (Record<string, string>) on CapabilityManifest.published (ADR-0155).
export type PublishedManifestDocuments = {
	"/.well-known/capability-manifest/index.json": string;
	"/.well-known/capability-manifest/capabilities.json": string;
	"/.well-known/capability-manifest/auth.json": string;
	"/.well-known/capability-manifest/cost.json": string;
};

// Declared marginal-cost facts per equivalence class — REAL public list-price
// magnitudes (representative SKUs, declared-provider source), so min-cost
// ranking has honest inputs rather than uniform zeros.
export const COST_FACTS: Record<
	InitialCapabilityPort,
	{ sku: string; unit: string; marginalPrice: string; included: number }
> = {
	"web/service": {
		sku: "aws.fargate.vcpu-hour",
		unit: "vCPU-hour",
		marginalPrice: "0.0405",
		included: 0,
	},
	kv: {
		sku: "aws.dynamodb.write-request",
		unit: "write-request",
		marginalPrice: "0.00000125",
		included: 25_000_000,
	},
	objectStore: {
		sku: "aws.s3.storage.gb-month",
		unit: "GB-month",
		marginalPrice: "0.0230",
		included: 5,
	},
	"database/postgres": {
		sku: "aws.rds.postgres.instance-hour",
		unit: "instance-hour",
		marginalPrice: "0.0160",
		included: 750,
	},
	queue: {
		sku: "aws.sqs.request",
		unit: "request",
		marginalPrice: "0.0000004",
		included: 1_000_000,
	},
	cache: {
		sku: "aws.elasticache.node-hour",
		unit: "node-hour",
		marginalPrice: "0.0160",
		included: 750,
	},
};

export interface AwsManifestInput {
	providerId?: string;
	regions?: string[];
	ports?: InitialCapabilityPort[];
}

export function publishCapabilityManifest(
	input: AwsManifestInput = {},
): PublishedManifestDocuments {
	const providerId = input.providerId ?? AWS_PROVIDER_ID;
	const regions = input.regions ?? DEFAULT_REGIONS;
	const ports =
		input.ports ??
		(Object.keys(EQUIVALENCE_CLASSES) as InitialCapabilityPort[]);
	const capabilitiesDocument = {
		schema: CAPABILITIES_SCHEMA,
		providerId,
		equivalenceClasses: ports.map((port) => ({
			class: port,
			...EQUIVALENCE_CLASSES[port],
		})),
		capabilities: ports.map((port) => {
			const mapping = EQUIVALENCE_CLASSES[port];
			return {
				port: mapping.port,
				interface: `hobo:${mapping.port}/${mapping.resourceClass}`,
				version: "0.1.0",
				stability: "preview",
				features: [...mapping.features],
				regions: [...regions],
				resourceClass: mapping.resourceClass,
				providerService: mapping.providerService,
			};
		}),
	};
	// The HOBO-110 keyless flow: the Yard broker mints an OIDC token
	// (aud=sts.amazonaws.com) for the SVID + scope and exchanges it via
	// AssumeRoleWithWebIdentity — no static secret is ever stored or published.
	const authDocument = {
		schema: AUTH_SCHEMA,
		providerId,
		mode: "svid-federation",
		tokenAudience: "sts.amazonaws.com",
		exchange: "sts:AssumeRoleWithWebIdentity",
		broker: {
			issuer: "https://identity.hobo.local",
			tokenExchange: "urn:ietf:params:oauth:grant-type:token-exchange",
		},
		requiredClaims: ["sub", "aud", "exp", "scope"],
		staticSecrets: false,
	};
	const costDocument = {
		schema: COST_SCHEMA,
		providerId,
		currency: "USD",
		facts: ports.map((port) => {
			const mapping = EQUIVALENCE_CLASSES[port];
			const fact = COST_FACTS[port];
			return {
				port: mapping.port,
				sku: fact.sku,
				unit: fact.unit,
				marginalPrice: fact.marginalPrice,
				freeTier: {
					unit: fact.unit,
					included: fact.included,
					reset: "monthly",
				},
				source: {
					type: "declared-provider",
					documentRef: digestRef(`cost:${providerId}:${fact.sku}`),
					// Transcribed from the vendor's public pricing page, not
					// attested by the provider (ADR-0129 §5).
					transcribedOn: "2026-07-27",
				},
			};
		}),
	};
	const documents = [
		{
			path: "/.well-known/capability-manifest/capabilities.json",
			schema: CAPABILITIES_SCHEMA,
			digest: stableDigest(capabilitiesDocument),
		},
		{
			path: "/.well-known/capability-manifest/auth.json",
			schema: AUTH_SCHEMA,
			digest: stableDigest(authDocument),
		},
		{
			path: "/.well-known/capability-manifest/cost.json",
			schema: COST_SCHEMA,
			digest: stableDigest(costDocument),
		},
	];
	const indexDocument = {
		schema: "hobo.capability-manifest-index/v1",
		providerId,
		manifestSchema: MANIFEST_SCHEMA,
		documents,
	};

	return {
		"/.well-known/capability-manifest/index.json": canonicalJson(indexDocument),
		"/.well-known/capability-manifest/capabilities.json":
			canonicalJson(capabilitiesDocument),
		"/.well-known/capability-manifest/auth.json": canonicalJson(authDocument),
		"/.well-known/capability-manifest/cost.json": canonicalJson(costDocument),
	};
}

export interface PublishedManifestParseResult {
	ok: boolean;
	errors: string[];
	index: Record<string, unknown>;
	capabilities: Record<string, unknown>;
	auth: Record<string, unknown>;
	cost: Record<string, unknown>;
}

/**
 * Parse-don't-validate boundary: untrusted well-known manifest documents become
 * a parsed derived type or structured errors — no broad DTO checks downstream.
 */
export function parsePublishedManifest(
	documents: PublishedManifestDocuments,
): PublishedManifestParseResult {
	const index = JSON.parse(
		documents["/.well-known/capability-manifest/index.json"],
	);
	const capabilities = JSON.parse(
		documents["/.well-known/capability-manifest/capabilities.json"],
	);
	const auth = JSON.parse(
		documents["/.well-known/capability-manifest/auth.json"],
	);
	const cost = JSON.parse(
		documents["/.well-known/capability-manifest/cost.json"],
	);
	const errors: string[] = [];

	if (index.manifestSchema !== MANIFEST_SCHEMA) {
		errors.push(`index.manifestSchema must be ${MANIFEST_SCHEMA}`);
	}
	if (auth.schema !== AUTH_SCHEMA) {
		errors.push(`auth.schema must be ${AUTH_SCHEMA}`);
	}
	if (cost.schema !== COST_SCHEMA) {
		errors.push(`cost.schema must be ${COST_SCHEMA}`);
	}
	if ("staticKey" in auth || "clientSecret" in auth) {
		errors.push("auth must not publish static secrets");
	}
	if (auth.staticSecrets !== false) {
		errors.push("auth.staticSecrets must be false (keyless federation only)");
	}
	if (
		!Array.isArray(capabilities.capabilities) ||
		capabilities.capabilities.length === 0
	) {
		errors.push("capabilities.capabilities must be non-empty");
	}

	return {
		ok: errors.length === 0,
		errors,
		index,
		capabilities,
		auth,
		cost,
	};
}

function canonicalJson(value: unknown): string {
	return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sortKeys(item));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, sortKeys(child)]),
		);
	}
	return value;
}

function stableDigest(value: unknown): string {
	// Deterministic non-cryptographic digest for document integrity references
	// inside the published bundle (the Registry hashes the index separately).
	const text = JSON.stringify(sortKeys(value));
	let hash = 0;
	for (let index = 0; index < text.length; index += 1) {
		hash = (hash * 31 + text.charCodeAt(index)) | 0;
	}
	return `fnv:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function digestRef(seed: string): string {
	return stableDigest({ seed });
}
