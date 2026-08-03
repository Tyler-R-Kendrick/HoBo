import assert from "node:assert/strict";
import { test } from "vitest";

import {
	matchTrafficRoutingOfferings,
	offering,
	parseTrafficRoutingProviderProfile,
	resolveTrafficRouting,
	type TrafficRoutingProviderProfile,
} from "../src/ports/traffic-routing-offerings.js";

function cloudflareProfile(): TrafficRoutingProviderProfile {
	return parseTrafficRoutingProviderProfile({
		provider: "cloudflare",
		offerings: [
			{ id: "lb.lifecycle", stability: "stable", fidelity: "real", features: [] },
			{ id: "lb.weighted", stability: "stable", fidelity: "real", features: [] },
		],
		fallbacks: ["inprocess.weighted"],
	});
}

test("match prefer falls back when native offering missing", () => {
	const match = matchTrafficRoutingOfferings(cloudflareProfile(), {
		features: ["lb.weighted", "inprocess.weighted"],
		negotiation: "prefer",
	});
	assert.equal(match.kind, "partial");
	if (match.kind !== "partial") return;
	assert.deepEqual(match.offerings, ["lb.weighted", "inprocess.weighted"]);
	assert.deepEqual(match.fallbacks, ["inprocess.weighted"]);
});

test("match require fails closed on missing offering", () => {
	const match = matchTrafficRoutingOfferings(cloudflareProfile(), {
		features: ["mesh.optional"],
		negotiation: "require",
	});
	assert.equal(match.kind, "none");
});

test("resolve picks first non-none profile", () => {
	const simple: TrafficRoutingProviderProfile = {
		provider: "simple",
		offerings: [offering("inprocess.weighted")],
		fallbacks: [],
	};
	const resolved = resolveTrafficRouting(
		[cloudflareProfile(), simple],
		{ features: ["inprocess.weighted"], negotiation: "prefer" },
	);
	assert.equal(resolved.kind, "resolved");
	if (resolved.kind !== "resolved") return;
	assert.equal(resolved.provider, "cloudflare");
	assert.ok(resolved.strategy.includes("inprocess.weighted"));
});
