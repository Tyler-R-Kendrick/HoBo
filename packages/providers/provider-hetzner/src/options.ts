// public-contract: the provider target id `.with(...)` option blocks carry.
export const HETZNER_PROVIDER_TARGET = "hetzner";

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
export const hetzner = {
	with: {
		cloudServer(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"compute",
				"cloudServer",
				{ serverType: "cx22", backups: false },
				options,
			);
		},
		loadBalancer(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"compute",
				"loadBalancer",
				{ loadBalancerType: "lb11", algorithm: "round_robin" },
				options,
			);
		},
		objectStorage(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"objectStore",
				"objectStorage",
				{ acl: "private", versioning: false },
				options,
			);
		},
		volume(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"compute",
				"volume",
				{ sizeGb: 10, format: "ext4" },
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
		providerId: HETZNER_PROVIDER_TARGET,
		port,
		optionName,
		negotiation: "prefer",
		options: { ...defaults, ...options },
	};
}
