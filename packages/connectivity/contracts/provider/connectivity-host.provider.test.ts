import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkPactInventory,
	loadPactDirectory,
	verifyPact,
} from "@hobo/contract-harness";
import { must } from "@hobo/core/total-access";
import { describe, expect, it } from "vitest";
import {
	CONNECTIVITY_HOST_PROVIDER_NAME,
	createConnectivityHostHandler,
} from "../../src/connectivity-host.js";

const contractsDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

describe("ConnectivityHost provider verification", () => {
	it("real host identity matches pact provider name", async () => {
		const pacts = await loadPactDirectory(path.join(contractsDir, "pacts"));
		const pact = pacts.find((p) => p.provider.name === "ConnectivityHost");
		expect(pact).toBeDefined();
		const host = createConnectivityHostHandler();
		expect(host.name).toBe(CONNECTIVITY_HOST_PROVIDER_NAME);
		expect(host.name).toBe(must(pact).provider.name);
	});

	it("real host satisfies connectivity-host pact", async () => {
		const pacts = await loadPactDirectory(path.join(contractsDir, "pacts"));
		const pact = pacts.find((p) => p.provider.name === "ConnectivityHost");
		expect(pact).toBeDefined();

		const host = createConnectivityHostHandler();
		const report = await verifyPact(must(pact), {
			name: host.name,
			handle: (req) => host.handle(req),
		});
		expect(report.ok, JSON.stringify(report.failures)).toBe(true);
		expect(report.failures).toEqual([]);
	});

	it("pact inventory lists every boundary pact file", async () => {
		const inventory = await checkPactInventory(contractsDir);
		expect(inventory.ok, inventory.problems.join("; ")).toBe(true);
	});
});
