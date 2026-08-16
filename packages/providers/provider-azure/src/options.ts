// public-contract: the provider target id `.with(...)` option blocks carry.
export const AZURE_PROVIDER_TARGET = "azure";

// A `type` alias (not an interface) so it keeps an implicit index signature
// and stays assignable to @hobo/core's opaque `TypedOptionBlock`
// (Record<string, unknown>) on ResourcePlan.options (ADR-0156).
export type TypedOptionBlock = {
	providerId: string;
	port: string;
	optionName: string;
	negotiation: "prefer" | "require";
	options: Record<string, unknown>;
};

// The provider-specific options pattern (sdk-api.md "the core promise"): typed,
// additive annotations that are inert for non-resolved providers — one Bindle
// targets many clouds unedited.
export const azure = {
	with: {
		containerApps(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"compute",
				"containerApps",
				{ cpu: 0.25, memoryGiB: 0.5, minReplicas: 0, maxReplicas: 10 },
				options,
			);
		},
		postgres(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"database",
				"postgres",
				{ version: "16", sku: "Standard_B1ms", haMode: "Disabled" },
				options,
			);
		},
		blob(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"objectStore",
				"blob",
				{ accessTier: "Hot", versioning: true, publicAccess: false },
				options,
			);
		},
		cosmos(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"kv",
				"cosmos",
				{ capacityMode: "serverless", consistency: "Session" },
				options,
			);
		},
		serviceBus(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"queue",
				"serviceBus",
				{ tier: "Standard", partitioning: false, sessions: false },
				options,
			);
		},
		redis(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"cache",
				"redis",
				{ sku: "Basic_C0", tlsOnly: true },
				options,
			);
		},
	},
};

function optionBlock(
	port: string,
	optionName: string,
	defaults: Record<string, unknown>,
	options: Record<string, unknown>,
): TypedOptionBlock {
	return {
		providerId: AZURE_PROVIDER_TARGET,
		port,
		optionName,
		negotiation: "prefer",
		options: { ...defaults, ...options },
	};
}
