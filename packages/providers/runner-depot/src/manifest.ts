import { createHash } from "node:crypto";

import {
	BUILD_MACHINE_CATEGORY,
	CATEGORY_PORTS,
	CATEGORY_SKUS,
	COST_SCHEMA,
	EXECUTION_HOST_MANIFEST_SCHEMA,
	type ExecutionHostCategory,
	type ExecutionHostManifest,
	RUNNER_CATEGORY,
} from "@hobo/runner-github";

// public-contract: capability-manifest bundle schema id (registry parity).
export const MANIFEST_SCHEMA = "hobo.capability-manifest/v1";
// public-contract: capabilities document schema id.
export const CAPABILITIES_SCHEMA = "hobo.capabilities/v1";
// public-contract: auth document schema id.
export const AUTH_SCHEMA = "hobo.provider-auth/v1";

// public-contract: the provider id every published document carries.
export const DEPOT_PROVIDER_ID = "@hobo/runner-depot";

// public-contract: the Depot runs-on label for Depot-managed Actions runners.
export const DEPOT_RUNS_ON_DEFAULT = "depot-ubuntu-22.04";

export const DEFAULT_REGIONS = ["global"];

// Observed ratios land as facts per build; this is the declared expectation.
// public-contract: the declared expected shared-cache hit rate for warm projects.
export const DEPOT_DECLARED_CACHE_HIT_RATE = "0.80";

// Declared cost facts — REAL Depot public list magnitudes (declared-provider
// source): Depot-managed Actions runners at half GitHub's price
// ($0.004/min), and remote build machines at $0.04/build-minute with 500
// included minutes/month. The shared BuildKit cache is the economic point:
// a warm-cache Depot build does LESS metered work per identical build, so
// its EFFECTIVE cost can outrank a "free" cold GitHub build — CreditLedger
// ranking captures that through per-build observed cache facts.
export const COST_FACTS: Record<
	ExecutionHostCategory,
	{ sku: string; unit: string; marginalPrice: string; included: number }
> = {
	[RUNNER_CATEGORY]: {
		sku: CATEGORY_SKUS[RUNNER_CATEGORY],
		unit: "minute",
		marginalPrice: "0.0040",
		included: 2000,
	},
	[BUILD_MACHINE_CATEGORY]: {
		sku: CATEGORY_SKUS[BUILD_MACHINE_CATEGORY],
		unit: "minute",
		marginalPrice: "0.0400",
		included: 500,
	},
};

// The per-category execution-host manifest (same schema every host parses
// through @hobo/runner-github's boundary): the build-machine side is Depot's
// core product, so its features declare the remote BuildKit + shared-cache
// lanes.
export function executionHostManifest(
	category: ExecutionHostCategory,
	options: { providerId?: string } = {},
): ExecutionHostManifest {
	const providerId = options.providerId ?? DEPOT_PROVIDER_ID;
	const port = CATEGORY_PORTS[category];
	const fact = COST_FACTS[category];
	return sortKeys({
		schema: EXECUTION_HOST_MANIFEST_SCHEMA,
		provider: {
			id: providerId,
			category,
			kind: "execution-host-provider",
			adapter: "depot",
		},
		capabilities: [
			{
				port,
				interface:
					category === RUNNER_CATEGORY
						? "hobo:runner/job"
						: "hobo:build-machine/host",
				version: "0.1.0",
				stability: "preview",
				features:
					category === RUNNER_CATEGORY
						? ["ci-job", "workflow-dispatch", "depot-managed-runner"]
						: ["container-build", "remote-buildkit", "shared-cache"],
			},
		],
		cost: {
			schema: COST_SCHEMA,
			currency: "USD",
			facts: [
				{
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
						digest: digestRef({
							providerId,
							category,
							sku: fact.sku,
							marginalPrice: fact.marginalPrice,
							included: fact.included,
						}),
					},
				},
			],
		},
	}) as ExecutionHostManifest;
}

export interface PublishedManifestDocuments {
	"/.well-known/capability-manifest/index.json": string;
	"/.well-known/capability-manifest/capabilities.json": string;
	"/.well-known/capability-manifest/auth.json": string;
	"/.well-known/capability-manifest/cost.json": string;
}

export interface DepotManifestInput {
	providerId?: string;
	regions?: string[];
}

// The registry-facing well-known bundle (HOBO-87 authoring contract): both
// execution-host ports, the brokered-token posture, the declared cost facts
// AND the declared shared-cache hit rate — what `hobo add runner-depot`
// snapshots into the provider.Registered fact.
export function publishCapabilityManifest(
	input: DepotManifestInput = {},
): PublishedManifestDocuments {
	const providerId = input.providerId ?? DEPOT_PROVIDER_ID;
	const regions = input.regions ?? DEFAULT_REGIONS;
	const categories: ExecutionHostCategory[] = [
		RUNNER_CATEGORY,
		BUILD_MACHINE_CATEGORY,
	];
	const capabilitiesDocument = {
		schema: CAPABILITIES_SCHEMA,
		providerId,
		capabilities: categories.map((category) => {
			const manifest = executionHostManifest(category, { providerId });
			const capability = manifest.capabilities[0];
			return {
				port: capability?.port,
				interface: capability?.interface,
				version: capability?.version,
				stability: capability?.stability,
				features: [...(capability?.features ?? [])],
				regions: [...regions],
				category,
				...(category === RUNNER_CATEGORY
					? { runsOn: DEPOT_RUNS_ON_DEFAULT }
					: {
							sharedCache: { declaredHitRate: DEPOT_DECLARED_CACHE_HIT_RATE },
						}),
			};
		}),
	};
	// Secretless posture (HOBO-110): the Yard broker holds the Depot OIDC
	// trust relationship and mints SHORT-LIVED project tokens per operation —
	// no static Depot token in any Bindle, Camp or this package.
	const authDocument = {
		schema: AUTH_SCHEMA,
		providerId,
		mode: "oidc-trust-exchange",
		tokenAudience: "api.depot.dev",
		exchange: "hobo:brokered-depot-project-token",
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
		facts: categories.map((category) => {
			const fact = COST_FACTS[category];
			return {
				port: CATEGORY_PORTS[category],
				sku: fact.sku,
				unit: fact.unit,
				marginalPrice: fact.marginalPrice,
				freeTier: {
					unit: fact.unit,
					included: fact.included,
					reset: "monthly",
				},
				...(category === BUILD_MACHINE_CATEGORY
					? { sharedCache: { declaredHitRate: DEPOT_DECLARED_CACHE_HIT_RATE } }
					: {}),
				source: {
					type: "declared-provider",
					documentRef: digestRef({ providerId, sku: fact.sku }),
					signedAt: "2026-07-01T00:00:00Z",
				},
			};
		}),
	};
	const documents = [
		{
			path: "/.well-known/capability-manifest/capabilities.json",
			schema: CAPABILITIES_SCHEMA,
			digest: digestRef(capabilitiesDocument),
		},
		{
			path: "/.well-known/capability-manifest/auth.json",
			schema: AUTH_SCHEMA,
			digest: digestRef(authDocument),
		},
		{
			path: "/.well-known/capability-manifest/cost.json",
			schema: COST_SCHEMA,
			digest: digestRef(costDocument),
		},
	];
	const indexDocument = {
		schema: "hobo.capability-manifest-index/v1",
		providerId,
		manifestSchema: MANIFEST_SCHEMA,
		executionHostSchema: EXECUTION_HOST_MANIFEST_SCHEMA,
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
 * Parse-don't-validate boundary for the published well-known bundle: untrusted
 * documents become a parsed result or structured errors (secretless posture is
 * parse-enforced — `staticSecrets` must be `false`).
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
	if ("staticKey" in auth || "clientSecret" in auth || "pat" in auth) {
		errors.push("auth must not publish static secrets");
	}
	if (auth.staticSecrets !== false) {
		errors.push("auth.staticSecrets must be false (brokered tokens only)");
	}
	if (
		!Array.isArray(capabilities.capabilities) ||
		capabilities.capabilities.length !== 2
	) {
		errors.push(
			"capabilities.capabilities must declare exactly the two execution-host ports",
		);
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

function sortKeys<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => sortKeys(item)) as unknown as T;
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, sortKeys(child)]),
		) as unknown as T;
	}
	return value;
}

function digestRef(value: unknown): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(sortKeys(value)))
		.digest("hex")}`;
}
