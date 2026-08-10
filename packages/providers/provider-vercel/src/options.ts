// public-contract: provider target accepted by authoring options.
export const PROVIDER_TARGET = "vercel";

export interface TypedOptionBlock {
	providerId: string;
	port: string;
	optionName: string;
	negotiation: "prefer" | "require";
	options: Record<string, unknown>;
}

export const vercel = {
	with: {
		web(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock("compute", "web", { framework: "nextjs" }, options);
		},
		blob(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock("objectStore", "blob", { store: "assets" }, options);
		},
		neonPostgres(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"database",
				"neonPostgres",
				{ engine: "postgres" },
				options,
			);
		},
		edgeConfig(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock("kv", "edgeConfig", { store: "edge-config" }, options);
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
