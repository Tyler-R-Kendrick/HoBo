import { parseWorkloadPlacement, type WorkloadPlacement } from "./placement.js";

// public-contract: provider target accepted by authoring options.
export const PROVIDER_TARGET = "kubernetes";

export interface TypedOptionBlock {
	providerId: string;
	port: string;
	optionName: string;
	negotiation: "prefer" | "require";
	options: Record<string, unknown>;
}

export const kubernetes = {
	with: {
		deployment(options: Record<string, unknown> = {}): TypedOptionBlock {
			return optionBlock(
				"compute",
				"deployment",
				{ simulation: true },
				options,
			);
		},
		/**
		 * A placement bound for a real cluster. Unlike `deployment`, the option
		 * bag crosses `parseWorkloadPlacement` here, so the block either holds a
		 * placement the apiserver can accept or it does not exist.
		 */
		workload(options: Record<string, unknown>): TypedOptionBlock & {
			readonly placement: WorkloadPlacement;
		} {
			const placement = parseWorkloadPlacement(options);
			return {
				...optionBlock("compute", "workload", {}, options),
				negotiation: "require",
				placement,
			};
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
