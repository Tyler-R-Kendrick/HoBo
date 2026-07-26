import { describe, expect, it } from "vitest";

import { deriveFederationPlan, junction } from "../src/index.js";
import { makeYard } from "./helpers.js";

describe("deriveFederationPlan()", () => {
	const definition = junction("fed", {
		yards: [makeYard("a", "aws"), makeYard("b", "azure"), makeYard("c", "gcp")],
	});

	it("exchanges trust anchors between every ordered member pair", () => {
		const plan = deriveFederationPlan(definition);

		expect(plan.trustExchanges).toHaveLength(6);
		expect(plan.trustExchanges).toContainEqual({
			kind: "trust-anchor-exchange",
			fromYard: "a",
			toYard: "b",
			anchorRef: "trust-anchor://a/fed",
		});
		expect(
			plan.trustExchanges.every((entry) => entry.fromYard !== entry.toYard),
		).toBe(true);
	});

	it("distributes one signed policy pack per member", () => {
		const plan = deriveFederationPlan(definition);

		expect(plan.policyPacks).toEqual(
			["a", "b", "c"].map((toYard) => ({
				kind: "policy-pack-distribution",
				toYard,
				packRef: "policy-pack://fed/default",
				signed: true,
			})),
		);
	});

	it("distributes signed registry bundles between every ordered member pair", () => {
		const plan = deriveFederationPlan(definition);

		expect(plan.registryBundles).toHaveLength(6);
		expect(
			plan.registryBundles.every(
				(entry) => entry.signed === true && entry.fromYard !== entry.toYard,
			),
		).toBe(true);
		expect(plan.registryBundles).toContainEqual({
			kind: "registry-bundle-distribution",
			fromYard: "c",
			toYard: "a",
			bundleRef: "registry-bundle://c/fed",
			signed: true,
		});
	});
});
