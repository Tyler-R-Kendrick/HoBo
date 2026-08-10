import { describe, expect, it } from "vitest";
import {
	createKubernetesProvider,
	kubernetesNativePorts,
	supportsAnonymousTemporaryDeploy,
} from "../src/index.js";
import { provisionTemporaryEnvironmentStation } from "../src/temporary-station.js";

describe("@hobo/provider-kubernetes", () => {
	it("exposes Matching-honest native ports", () => {
		const provider = createKubernetesProvider();
		expect(kubernetesNativePorts().length).toBeGreaterThan(0);
		expect(provider.capabilities.length).toBe(kubernetesNativePorts().length);
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
		expect(result.providerId).toBe("kubernetes");
		expect(result.claimUrl.length).toBeGreaterThan(0);
	});
});
