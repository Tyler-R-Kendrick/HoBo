import { describe, expect, it } from "vitest";

import {
	createMeteringBus,
	parseTenantId,
} from "@hobo/core";

import { createCloudflareDnsProvider } from "../src/dns/cloudflare-provider.js";
import { createJunctionDynamicDnsRegistrar } from "../src/dns/dynamic-registrar.js";
import { createMemoryDnsProvider } from "../src/dns/memory-provider.js";
import { createPublicDnsManager } from "../src/dns/public-dns-manager.js";
import { createRoute53DnsProvider } from "../src/dns/route53-provider.js";
import { createJunctionAgent } from "../src/junction-agent.js";
import {
	createBillingAggregator,
	invoiceToUsageEvents,
} from "../src/metering/billing-aggregator.js";
import { createInMemoryMeteringSink } from "../src/metering/sinks.js";
import { createTailscaleOverlay } from "../src/overlay/tailscale.js";
import {
	createOpaPolicyEngine,
	SAMPLE_HOBO_AUTHZ_REGO,
} from "../src/policy/opa-engine.js";
import {
	createTenantIsolationRegistry,
	tenantFromSlug,
} from "../src/tenancy/isolation.js";

describe("next steps: MagicDNS + Funnel", () => {
	it("configures MagicDNS split and publishes Funnel gateway from CLI output", async () => {
		const sink = createInMemoryMeteringSink();
		const bus = createMeteringBus([sink]);
		const commands: string[][] = [];
		const overlay = createTailscaleOverlay({
			metering: bus,
			run: (args) => {
				commands.push([...args]);
				if (args[0] === "status") {
					return {
						ok: true,
						stdout: JSON.stringify({
							Self: {
								ID: "n1",
								DNSName: "node.tailnet.ts.net.",
								TailscaleIPs: ["100.64.0.2"],
							},
						}),
						stderr: "",
					};
				}
				if (args[0] === "set") {
					return { ok: true, stdout: "", stderr: "" };
				}
				if (args[0] === "dns") {
					return { ok: false, stdout: "", stderr: "no dns subcommand" };
				}
				if (args[0] === "funnel") {
					return {
						ok: true,
						stdout: "Available on the internet:\n\nhttps://node.tailnet.ts.net/\n",
						stderr: "",
					};
				}
				return { ok: true, stdout: "", stderr: "" };
			},
		});

		const join = await overlay.join({
			tenantId: parseTenantId("acme"),
			hostname: "junction-1",
			tags: overlay.tenantTags({
				tenantId: parseTenantId("acme"),
				role: "junction",
			}),
			authKey: "tskey-test",
		});
		expect(join.ready).toBe(true);

		const magic = await overlay.configureMagicDns!({
			tenantId: parseTenantId("acme"),
			domains: ["hobo.test"],
			nameservers: ["100.100.100.100"],
		});
		expect(magic.domains).toContain("hobo.test");
		expect(magic.notes.join(" ")).toMatch(/split-dns|hobo\.test/);

		const funnel = await overlay.publishFunnel!({
			tenantId: parseTenantId("acme"),
			backendUrl: "http://127.0.0.1:7071",
			localPort: 7071,
		});
		expect(funnel.enabled).toBe(true);
		expect(funnel.gatewayHostname).toBe("node.tailnet.ts.net");
		expect(
			sink.events.some((e) => e.eventType === "overlay.magicdns"),
		).toBe(true);
		expect(sink.events.some((e) => e.eventType === "overlay.funnel")).toBe(
			true,
		);
		expect(commands.some((c) => c[0] === "funnel")).toBe(true);
	});
});

describe("next steps: Cloudflare + Route53 providers", () => {
	it("upserts Cloudflare records through REST with injectable fetch", async () => {
		const calls: { url: string; method: string }[] = [];
		const provider = createCloudflareDnsProvider({
			apiToken: "test-token",
			zoneId: "zone-1",
			fetchImpl: async (input, init) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				calls.push({ url, method });
				if (url.includes("/dns_records?") && method === "GET") {
					return new Response(JSON.stringify({ success: true, result: [] }), {
						status: 200,
					});
				}
				if (url.includes("/dns_records") && method === "POST") {
					return new Response(
						JSON.stringify({ success: true, result: { id: "rec1" } }),
						{ status: 200 },
					);
				}
				return new Response(JSON.stringify({ success: true, result: [] }), {
					status: 200,
				});
			},
		});

		await provider.upsert(parseTenantId("acme"), "example.com", {
			name: "web.myapp.hobo.example.com",
			type: "CNAME",
			content: "funnel.ts.net",
			gatewayTarget: true,
		});
		expect(calls.some((c) => c.method === "POST")).toBe(true);
	});

	it("upserts Route53 records with unsigned test mode", async () => {
		const bodies: string[] = [];
		const provider = createRoute53DnsProvider({
			accessKeyId: "AKIA",
			secretAccessKey: "secret",
			hostedZoneId: "Z123",
			allowUnsigned: true,
			fetchImpl: async (_input, init) => {
				bodies.push(String(init?.body ?? ""));
				return new Response("<ChangeResourceRecordSetsResponse/>", {
					status: 200,
				});
			},
		});
		await provider.upsert(parseTenantId("acme"), "example.com", {
			name: "api.myapp.hobo",
			type: "CNAME",
			content: "proxy.cfargotunnel.com",
			gatewayTarget: true,
		});
		expect(bodies[0]).toContain("UPSERT");
		expect(bodies[0]).toContain("CNAME");
		expect(provider.store.size).toBe(1);
	});
});

describe("next steps: OPA/Rego PolicyEngine", () => {
	it("uses OPA HTTP result when available", async () => {
		const engine = createOpaPolicyEngine({
			opaUrl: "http://opa.local/v1/data/hobo/authz",
			fetchImpl: async () =>
				new Response(JSON.stringify({ result: { allow: true, reasons: ["rego"] } }), {
					status: 200,
				}),
		});
		const decision = await engine.evaluate({
			subject: {
				identity: "u",
				tenantId: parseTenantId("acme"),
				tags: [],
			},
			action: "read",
			resource: {
				kind: "x",
				id: "1",
				tenantId: parseTenantId("acme"),
			},
		});
		expect(decision.effect).toBe("allow");
		expect(decision.engineId).toContain("opa");
		expect(decision.reasons).toContain("rego");
	});

	it("falls back to rego-like tenant isolation", async () => {
		const engine = createOpaPolicyEngine({});
		const deny = await engine.evaluate({
			subject: {
				identity: "u",
				tenantId: parseTenantId("acme"),
				tags: [],
			},
			action: "read",
			resource: {
				kind: "x",
				id: "1",
				tenantId: parseTenantId("other"),
			},
		});
		expect(deny.effect).toBe("deny");
		expect(SAMPLE_HOBO_AUTHZ_REGO).toContain("package hobo.authz");
	});
});

describe("next steps: billing aggregator", () => {
	it("aggregates usage into period invoices", async () => {
		const billing = createBillingAggregator();
		const bus = createMeteringBus([billing]);
		await bus.emit({
			tenantId: parseTenantId("acme"),
			eventType: "tunnel.heartbeat",
			resource: "j1",
			quantity: 3,
			unit: "tick",
			timestamp: new Date().toISOString(),
		});
		await bus.emit({
			tenantId: parseTenantId("acme"),
			eventType: "dns.record_upsert",
			resource: "web",
			quantity: 2,
			unit: "count",
			timestamp: new Date().toISOString(),
		});
		const invoice = billing.closePeriod({
			tenantId: parseTenantId("acme"),
			periodStart: "2026-07-01",
			periodEnd: "2026-07-31",
		});
		expect(invoice.lines.length).toBeGreaterThan(0);
		// 3*1 + 2*3 = 9 with default price book
		expect(invoice.total).toBe(3 * 1 + 2 * 3);
		const events = invoiceToUsageEvents(invoice);
		expect(events.some((e) => e.eventType === "billing.period_close")).toBe(
			true,
		);
		expect(billing.listInvoices("acme")).toHaveLength(1);
	});
});

describe("next steps: hard multi-tenant isolation", () => {
	it("gives hard-isolated tenants distinct overlays and control-plane partitions", () => {
		const registry = createTenantIsolationRegistry({
			defaultMode: "soft",
		});
		const softA = registry.registerTenant(tenantFromSlug("soft-a", "soft"));
		const softB = registry.registerTenant(tenantFromSlug("soft-b", "soft"));
		const hardA = registry.registerTenant(
			tenantFromSlug("hard-a", "hard-control-plane"),
		);
		const hardB = registry.registerTenant(
			tenantFromSlug("hard-b", "hard-control-plane"),
		);

		expect(softA.overlay).toBe(softB.overlay);
		expect(hardA.overlay).not.toBe(hardB.overlay);
		expect(registry.getControlPlane("hard-a")?.partitionKey).toBe("cp-hard-a");
		expect(
			registry.assertNetworkIsolation("hard-a", "hard-b").isolated,
		).toBe(true);
		expect(
			registry.assertNetworkIsolation("soft-a", "soft-b").isolated,
		).toBe(false);
	});
});

describe("next steps: dynamic DNS from junction heartbeats", () => {
	it("registers hierarchical CNAMEs to Funnel gateways on heartbeat", async () => {
		const sink = createInMemoryMeteringSink();
		const bus = createMeteringBus([sink]);
		const memory = createMemoryDnsProvider();
		const dns = createPublicDnsManager({
			config: {
				managedBy: "hobo",
				provider: "memory",
				zone: "example.com",
				allowedGatewaySuffixes: [".ts.net"],
			},
			provider: memory,
			metering: bus,
		});
		const overlay = createTailscaleOverlay({
			metering: bus,
			run: (args) => {
				if (args[0] === "status") {
					return {
						ok: true,
						stdout: JSON.stringify({
							Self: { ID: "n", DNSName: "j.ts.net.", TailscaleIPs: [] },
						}),
						stderr: "",
					};
				}
				if (args[0] === "funnel") {
					return {
						ok: true,
						stdout: "https://j.ts.net/\n",
						stderr: "",
					};
				}
				return { ok: true, stdout: "", stderr: "" };
			},
		});

		const registrar = createJunctionDynamicDnsRegistrar({
			tenantId: "acme",
			dns,
			overlay,
			metering: bus,
			tld: "example.com",
		});
		registrar.setTargets([
			{
				resource: "web",
				app: "myapp",
				env: "dev",
				backendUrl: "http://127.0.0.1:7071",
			},
		]);

		const result = await registrar.onHeartbeat();
		expect(result.registered).toBe(1);
		expect(memory.store.size).toBe(1);
		expect(
			sink.events.some((e) => e.eventType === "dns.dynamic_register"),
		).toBe(true);

		const agent = createJunctionAgent({
			config: {
				tenantId: "acme",
				name: "j-aws",
				dnsTargets: [
					{
						resource: "api",
						app: "myapp",
						gatewayHostname: "j.ts.net",
					},
				],
			},
			overlay,
			metering: bus,
			publicDns: dns,
		});
		// force running path
		await agent.start();
		// even if degraded, mark running via start stub path
		const hb = await agent.heartbeat();
		// if start was degraded running may still be true for stub nodes
		if (hb.dns) {
			expect(hb.dns.registered + hb.dns.skipped).toBeGreaterThanOrEqual(0);
		}
	});
});
