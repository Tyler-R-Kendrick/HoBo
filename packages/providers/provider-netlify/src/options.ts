// public-contract: provider target accepted by authoring options.
export const PROVIDER_TARGET = "netlify";

export interface TypedOptionBlock {
	providerId: string;
	port: string;
	optionName: string;
	negotiation: "prefer" | "require";
	options: Record<string, unknown>;
}

export const netlify = {
	with: {
		site(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock("compute", "site", { framework: "static" }, options);
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
