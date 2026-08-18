import { offering, type TrafficRoutingProviderProfile } from "@hobo/core";

/** Declared TrafficRouting offerings for Matching / custom-provider surface. */
export const LAKEBED_TRAFFIC_ROUTING_PROFILE: TrafficRoutingProviderProfile = {
	provider: "lakebed",
	offerings: [
		offering("inprocess.weighted", {
			features: ["capsule-endpoints", "static-weights"],
		}),
		offering("driver.route-bind", {
			features: ["lakebed:traffic-route", "hobo.driver-program/v1"],
		}),
	],
	fallbacks: [],
};

export const LAKEBED_TRAFFIC_ROUTING_OFFERING_IDS = Object.freeze(
	LAKEBED_TRAFFIC_ROUTING_PROFILE.offerings.map((entry) => entry.id),
);
