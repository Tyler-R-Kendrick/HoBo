import { describe, expect, it } from "vitest";
import {
	createWebernetesProvider,
	supportsAnonymousTemporaryDeploy,
	webernetesNativePorts,
} from "../src/index.js";
import { provisionTemporaryEnvironmentStation } from "../src/temporary-station.js";

describe("@hobo/provider-webernetes", () => {
	it("exposes Matching-honest native ports", () => {
		const provider = createWebernetesProvider();
		expect(webernetesNativePorts().length).toBeGreaterThan(0);
		expect(provider.capabilities.length).toBe(webernetesNativePorts().length);
		const compute = provider.capabilities.find((c) => c.port === "compute");
		expect(compute?.satisfies({ port: "compute" }).kind).toBe("full");
	});

	it("temporary deploy support flag is honest", () => {
		expect(supportsAnonymousTemporaryDeploy).toBe(true);
	});

	it("temporary provision path", async () => {
		const result = await provisionTemporaryEnvironmentStation({
			stationId: "st-1",
		});
		expect(result.anonymous).toBe(true);
		expect(result.temporary).toBe(true);
		expect(result.providerId).toBe("webernetes");
		expect(result.claimUrl.length).toBeGreaterThan(0);
	});
});
