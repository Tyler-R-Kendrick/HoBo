import { createHash } from "node:crypto";

import {
	BUILD_MACHINE_CATEGORY,
	CATEGORY_PORTS,
	CATEGORY_SKUS,
	type ExecutionHostCategory,
	type ExecutionHostManifest,
	RUNNER_CATEGORY,
} from "./types.js";

// public-contract: the execution-host capability-manifest document schema id.
export const EXECUTION_HOST_MANIFEST_SCHEMA =
	"hobo.execution-host-capability-manifest/v1";
// public-contract: capability-manifest bundle schema id (registry parity).
export const MANIFEST_SCHEMA = "hobo.capability-manifest/v1";
// public-contract: capabilities document schema id.
export const CAPABILITIES_SCHEMA = "hobo.capabilities/v1";
// public-contract: auth document schema id.
export const AUTH_SCHEMA = "hobo.provider-auth/v1";
// public-contract: cost document schema id.
export const COST_SCHEMA = "hobo.cost/v1";

// public-contract: the provider id every published document carries.
export const GITHUB_RUNNER_PROVIDER_ID = "@hobo/runner-github";

export const DEFAULT_REGIONS = ["global"];

// Declared cost facts — GitHub Actions public list prices TRANSCRIBED BY HOBO
// from the vendor's published pricing page (Linux 2-core hosted runner
// $0.006/min; 2,000 included free minutes/month on the Free plan), so the
// Dispatcher's CreditLedgerView ranks by honest effective marginal cost
// instead of uniform zeros.
//
// These are ranking input, never billing input, and they are NOT attested by
// the provider — `declared-provider` distinguishes a declared fact from an
// `observed-executor` measured one, nothing more. Every fact carries the
// source URL it was transcribed from and the date a human last checked it;
// see COST_SOURCE below and ADR-0129 §5.
/**
 * Provenance for a transcribed cost fact (ADR-0129 §5). `sourceUrl` is the
 * vendor page the numbers came from and `transcribedOn` is the date a human
 * last reconciled them against it — deliberately NOT `signedAt`, which would
 * imply a provider attestation that does not exist.
 */
export interface CostProvenance {
	readonly sourceUrl: string;
	readonly transcribedOn: string;
}

// public-contract: where GitHub's published rates were read from, and when.
export const COST_SOURCE: CostProvenance = {
	sourceUrl:
		"https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions",
	transcribedOn: "2026-07-27",
};

/**
 * The vendor terms this adapter operates under (ADR-0129 §5). Registering a
 * provider means the operator's own agreement with that vendor governs the
 * usage HoBo will drive; GitHub's Actions terms in particular restrict
 * commercial resale of Actions and per-VM sharing.
 */
export interface ProviderTerms {
	readonly url: string;
	readonly reviewedOn: string;
}

// public-contract: GitHub's additional product terms covering Actions.
export const PROVIDER_TERMS: ProviderTerms = {
	url: "https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features",
	reviewedOn: "2026-07-27",
};

export const COST_FACTS: Record<
	ExecutionHostCategory,
	{ sku: string; unit: string; marginalPrice: string; included: number }
> = {
	[RUNNER_CATEGORY]: {
		sku: CATEGORY_SKUS[RUNNER_CATEGORY],
		unit: "minute",
		marginalPrice: "0.0060",
		included: 2000,
	},
	[BUILD_MACHINE_CATEGORY]: {
		sku: CATEGORY_SKUS[BUILD_MACHINE_CATEGORY],
		unit: "minute",
		marginalPrice: "0.0060",
		included: 2000,
	},
};

// The per-category execution-host manifest the Dispatcher validates and ranks
// with (draft-proof schema promoted verbatim: exactly ONE execution-host port
// per manifest, cost facts pinned to the category SKU).
export function executionHostManifest(
	category: ExecutionHostCategory,
	options: { providerId?: string } = {},
): ExecutionHostManifest {
	const providerId = options.providerId ?? GITHUB_RUNNER_PROVIDER_ID;
	const port = CATEGORY_PORTS[category];
	const fact = COST_FACTS[category];
	return sortKeys({
		schema: EXECUTION_HOST_MANIFEST_SCHEMA,
		provider: {
			id: providerId,
			category,
			kind: "execution-host-provider",
			adapter: "github-actions",
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
						? ["ci-job", "workflow-dispatch"]
						: ["container-build", "ghcr-publish"],
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

export interface ExecutionHostManifestParseResult {
	ok: boolean;
	errors: string[];
	manifest: ExecutionHostManifest | undefined;
}

/**
 * Parse-don't-validate boundary for execution-host manifests: an untrusted
 * manifest document becomes a frozen derived manifest or structured errors —
 * the Dispatcher never re-checks raw fields downstream.
 */
export function parseExecutionHostManifest(
	raw: unknown,
	options: { category?: ExecutionHostCategory } = {},
): ExecutionHostManifestParseResult {
	const errors: string[] = [];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return {
			ok: false,
			errors: ["manifest must be an object"],
			manifest: undefined,
		};
	}
	const manifest = raw as ExecutionHostManifest;
	if (manifest.schema !== EXECUTION_HOST_MANIFEST_SCHEMA) {
		errors.push(`schema must be ${EXECUTION_HOST_MANIFEST_SCHEMA}`);
	}
	const category = manifest.provider?.category;
	if (category !== RUNNER_CATEGORY && category !== BUILD_MACHINE_CATEGORY) {
		errors.push("provider.category must be runner or build-machine");
	} else {
		if (options.category && category !== options.category) {
			errors.push(`provider.category must be ${options.category}`);
		}
		if (
			!Array.isArray(manifest.capabilities) ||
			manifest.capabilities.length !== 1
		) {
			errors.push("capabilities must contain exactly one execution-host port");
		} else if (manifest.capabilities[0]?.port !== CATEGORY_PORTS[category]) {
			errors.push(`capabilities.0.port must be ${CATEGORY_PORTS[category]}`);
		}
		const fact = manifest.cost?.facts?.[0];
		if (manifest.cost?.schema !== COST_SCHEMA) {
			errors.push(`cost.schema must be ${COST_SCHEMA}`);
		}
		if (!fact) {
			errors.push("cost.facts must be non-empty");
		} else {
			if (fact.sku !== CATEGORY_SKUS[category]) {
				errors.push(`cost.facts.0.sku must be ${CATEGORY_SKUS[category]}`);
			}
			if (fact.source?.type !== "declared-provider") {
				errors.push("cost.facts.0.source.type must be declared-provider");
			}
			if (
				typeof fact.source?.digest !== "string" ||
				fact.source.digest.length === 0
			) {
				errors.push("cost.facts.0.source.digest must be a non-empty string");
			}
		}
	}
	if (typeof manifest.provider?.id !== "string" || !manifest.provider.id) {
		errors.push("provider.id must be a non-empty string");
	}
	return errors.length === 0
		? { ok: true, errors, manifest: Object.freeze(manifest) }
		: { ok: false, errors, manifest: undefined };
}

export interface PublishedManifestDocuments {
	"/.well-known/capability-manifest/index.json": string;
	"/.well-known/capability-manifest/capabilities.json": string;
	"/.well-known/capability-manifest/auth.json": string;
	"/.well-known/capability-manifest/cost.json": string;
}

export interface GithubRunnerManifestInput {
	providerId?: string;
	regions?: string[];
}

// The registry-facing well-known bundle (HOBO-87 authoring contract): both
// execution-host ports as capabilities, the brokered-token auth posture and
// the declared cost facts — what `hobo add runner-github` snapshots into the
// provider.Registered fact.
export function publishCapabilityManifest(
	input: GithubRunnerManifestInput = {},
): PublishedManifestDocuments {
	const providerId = input.providerId ?? GITHUB_RUNNER_PROVIDER_ID;
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
			};
		}),
	};
	// Secretless posture (HOBO-110): the Yard broker holds the GitHub App
	// relationship and mints SHORT-LIVED installation tokens per operation —
	// no PAT, no static secret is ever stored in a Bindle, Camp or this
	// package.
	const authDocument = {
		schema: AUTH_SCHEMA,
		providerId,
		mode: "github-app-installation",
		tokenAudience: "api.github.com",
		exchange: "hobo:brokered-installation-token",
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
				source: {
					type: "declared-provider",
					documentRef: digestRef({ providerId, sku: fact.sku }),
					...COST_SOURCE,
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
		errors.push(
			"auth.staticSecrets must be false (brokered installation tokens only)",
		);
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
