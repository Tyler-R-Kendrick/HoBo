import { describe, expect, it } from "vitest";
import {
	browserWasmNativePorts,
	createBrowserWasmProvider,
	supportsAnonymousTemporaryDeploy,
} from "../src/index.js";
import { provisionTemporaryEnvironmentStation } from "../src/temporary-station.js";

describe("@hobo/provider-browser-wasm", () => {
	it("exposes Matching-honest native ports", () => {
		const provider = createBrowserWasmProvider();
		expect(browserWasmNativePorts().length).toBeGreaterThan(0);
		expect(provider.capabilities.length).toBe(browserWasmNativePorts().length);
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
		expect(result.providerId).toBe("browser-wasm");
		expect(result.claimUrl.length).toBeGreaterThan(0);
	});
});
