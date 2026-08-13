import { describe, expect, it } from "vitest";

import {
	loopbackFetchUrl,
	occupancyNamedOrigin,
	preferNamedEndpoint,
} from "../src/occupancy-endpoints.js";

describe("occupancy named endpoints", () => {
	it("names Evidence and dashboard on .hobo.localhost, not loopback", () => {
		expect(occupancyNamedOrigin("evidence", 8788)).toBe(
			"http://evidence.code.local.hobo.localhost:8788",
		);
		expect(occupancyNamedOrigin("dashboard", 8787)).toBe(
			"http://dashboard.code.local.hobo.localhost:8787",
		);
		expect(occupancyNamedOrigin("otlp", 4318)).toBe(
			"http://otlp.code.local.hobo.localhost:4318",
		);
	});

	it("rewrites loopback Evidence paths onto the named origin", () => {
		const named = preferNamedEndpoint(
			"http://127.0.0.1:48212/__hobo/evidence?token=opaque",
			"evidence",
		);
		expect(named).toBe(
			"http://evidence.code.local.hobo.localhost:48212/__hobo/evidence?token=opaque",
		);
		expect(named).not.toMatch(/127\.0\.0\.1/);
		expect(loopbackFetchUrl(named)).toBe(
			"http://127.0.0.1:48212/__hobo/evidence?token=opaque",
		);
	});

	it("keeps a multi-tenant label and drops the local-dev alias", () => {
		expect(
			occupancyNamedOrigin("evidence", 8788, {
				tenant: "camp-west",
				environment: "local-dev",
			}),
		).toBe("http://evidence.code.local.camp-west.hobo.localhost:8788");
	});
});
