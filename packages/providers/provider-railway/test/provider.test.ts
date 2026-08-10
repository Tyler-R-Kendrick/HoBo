import { describe, expect, it } from "vitest";
import { createRailwayProvider, railwayNativePorts, supportsAnonymousTemporaryDeploy } from "../src/index.js";
import { provisionTemporaryEnvironmentStation } from "../src/temporary-station.js";

describe("@hobo/provider-railway", () => {
	it("exposes Matching-honest native ports", () => {
		const provider = createRailwayProvider();
		expect(railwayNativePorts().length).toBeGreaterThan(0);
		expect(provider.capabilities.length).toBe(railwayNativePorts().length);
		const compute = provider.capabilities.find((c) => c.port === "compute");
		expect(compute?.satisfies({ port: "compute" }).kind).toBe("full");
	});

	it("temporary deploy support flag is honest", () => {
		expect(supportsAnonymousTemporaryDeploy).toBe(false);
	});

	it("temporary provision path", async () => {
		await expect(provisionTemporaryEnvironmentStation({ stationId: "st-1" })).rejects.toThrow(/fail closed|no password-free|Temporary/i);
	});
});
