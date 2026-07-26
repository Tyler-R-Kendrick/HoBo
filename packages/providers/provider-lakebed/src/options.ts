// public-contract: the provider target id `.with(...)` option blocks carry.
export const LAKEBED_PROVIDER_TARGET = "lakebed";

export interface TypedOptionBlock {
	providerId: string;
	port: string;
	optionName: string;
	negotiation: "prefer" | "require";
	options: Record<string, unknown>;
}

// The provider-specific options pattern (sdk-api.md "the core promise"): typed,
// additive annotations that are inert for non-resolved providers — one Bindle
// targets many clouds unedited, including the competitor's.
export const lakebed = {
	with: {
		capsule(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"compute",
				"capsule",
				{ syncRpc: true, coldStart: "instant" },
				options,
			);
		},
		reactiveDb(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"database",
				"reactiveDb",
				{ consistency: "reactive", schema: "document" },
				options,
			);
		},
		files(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"objectStore",
				"files",
				{ publicAccess: false },
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
		providerId: LAKEBED_PROVIDER_TARGET,
		port,
		optionName,
		negotiation: "prefer",
		options: { ...defaults, ...options },
	};
}
