import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPactDirectory, verifyPact } from "@hobo/contract-harness";
import { describe, expect, it } from "vitest";

import { createFakeRunner } from "../../test/support/fake-runner.js";
import {
	createProxiedRunProvider,
	PROVIDER_NAME,
} from "../../test/support/proxied-run-provider.js";

const contractsDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

describe("the proxied-run boundary (provider verification against the stand-in binary)", () => {
	it("verifies every interaction of the pact", async () => {
		const pacts = await loadPactDirectory(path.join(contractsDir, "pacts"));
		const pact = pacts.find(
			(candidate) => candidate.provider.name === PROVIDER_NAME,
		);
		if (pact === undefined) throw new Error("the proxied-run pact is missing");
		const report = await verifyPact(
			pact,
			createProxiedRunProvider(createFakeRunner()),
		);
		expect(report.failures).toEqual([]);
		expect(report.ok).toBe(true);
		expect(pact.interactions).toHaveLength(8);
	}, 60_000);

	it("fails when the provider drifts: a run that delivers a placeholder is not a delivered surrogate", async () => {
		const pacts = await loadPactDirectory(path.join(contractsDir, "pacts"));
		const pact = pacts.find(
			(candidate) => candidate.provider.name === PROVIDER_NAME,
		);
		if (pact === undefined) throw new Error("the proxied-run pact is missing");
		const drifted = createFakeRunner();
		const report = await verifyPact(
			pact,
			createProxiedRunProvider({
				run: (scenario, bindings) =>
					drifted.run(
						scenario === "surrogate-delivered" ? "plugin-absent" : scenario,
						bindings,
					),
			}),
		);
		expect(report.ok).toBe(false);
		expect(report.failures.map((failure) => failure.description)).toContain(
			pact.interactions[0]?.description,
		);
	}, 60_000);
});
