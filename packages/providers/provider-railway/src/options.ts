// public-contract: provider target accepted by authoring options.
export const PROVIDER_TARGET = "railway";

export interface TypedOptionBlock {
	providerId: string;
	port: string;
	optionName: string;
	negotiation: "prefer" | "require";
	options: Record<string, unknown>;
}

export const railway = {
	with: {
		service(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock("compute", "service", {"runtime":"container"}, options);
		},
		redis(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock("kv", "redis", {}, options);
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
		providerId: PROVIDER_TARGET,
		port,
		optionName,
		negotiation: "prefer",
		options: { ...defaults, ...options },
	};
}
