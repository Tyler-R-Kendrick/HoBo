import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPactDirectory } from "@hobo/contract-harness";
import { parseTenantId } from "@hobo/core";
import { must } from "@hobo/core/total-access";
import { describe, expect, it } from "vitest";
import { createRoute53DnsProvider } from "../../src/dns/route53-provider.js";
import { createPactFetch } from "../helpers/pact-fetch.js";

const contractsDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

describe("Route53DnsApi consumer contract", () => {
	it("createRoute53DnsProvider signs and uses pact mock transport", async () => {
		const pacts = await loadPactDirectory(path.join(contractsDir, "pacts"));
		const pact = pacts.find((p) => p.provider.name === "Route53DnsApi");
		expect(pact).toBeDefined();
		const fetchImpl = createPactFetch(must(pact));

		const provider = createRoute53DnsProvider({
			accessKeyId: "AKIAEXAMPLE",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			hostedZoneId: "Z123",
			endpoint: "https://route53.amazonaws.com",
			fetchImpl,
		});

		await provider.upsert(parseTenantId("acme"), "example.com", {
			name: "web",
			type: "CNAME",
			content: "funnel.ts.net",
			gatewayTarget: true,
		});

		const listed = await provider.list(parseTenantId("acme"), "example.com");
		expect(listed.some((r) => r.content.includes("funnel"))).toBe(true);

		const forbidden = createRoute53DnsProvider({
			accessKeyId: "AKIAEXAMPLE",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			hostedZoneId: "ZFORBIDDEN",
			endpoint: "https://route53.amazonaws.com",
			fetchImpl,
		});
		await expect(
			forbidden.list(parseTenantId("acme"), "example.com"),
		).rejects.toThrow(/403/);
	});
});
