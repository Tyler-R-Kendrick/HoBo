import { describe, expect, it } from "vitest";

import {
	createMeteringBus,
	createUsageEvent,
	getNamedEndpoint,
	parseTenantId,
} from "@hobo/core";

import { parseConnectivityConfig } from "../src/config.js";
import { createDnsControlProvider } from "../src/dns/dnscontrol-provider.js";
import { createMemoryDnsProvider } from "../src/dns/memory-provider.js";
import { createPublicDnsManager } from "../src/dns/public-dns-manager.js";
import { createJunctionAgent } from "../src/junction-agent.js";
import {
	attachNamedEndpoints,
	getNamedEndpointSession,
} from "../src/local/named-endpoints.js";
import { probePortless } from "../src/local/portless.js";
import { createInMemoryMeteringSink } from "../src/metering/sinks.js";
import { createNetbirdOverlay } from "../src/overlay/netbird.js";
import { createTailscaleOverlay } from "../src/overlay/tailscale.js";
import { createTagAclPolicyEngine } from "../src/policy/tag-acl-engine.js";

describe("connectivity foundations", () => {
	it("parses public DNS managedBy modes", () => {
		const cfg = parseConnectivityConfig({
			dns: {
				public: {
					managedBy: "hobo",
					provider: "dnscontrol",
					zone: "example.com",
				},
			},
			overlay: { provider: "tailscale" },
			policy: { engine: "opa", opaUrl: "http://127.0.0.1:8181/v1/data/hobo" },
			tenancy: { defaultIsolationMode: "hard-overlay" },
		});
		expect(cfg.dns.public.managedBy).toBe("hobo");
		expect(cfg.dns.public.provider).toBe("dnscontrol");
		expect(cfg.overlay.provider).toBe("tailscale");
		expect(cfg.policy.engine).toBe("opa");
		expect(cfg.tenancy.defaultIsolationMode).toBe("hard-overlay");
	});

	it("tag ACL policy denies cross-tenant and meters evaluations", async () => {
		const sink = createInMemoryMeteringSink();
		const bus = createMeteringBus([sink]);
		const engine = createTagAclPolicyEngine({ metering: bus });
		const allow = await engine.evaluate({
			subject: {
				identity: "j1",
				tenantId: parseTenantId("acme"),
				tags: ["role:junction"],
			},
			action: "junction.join",
			resource: {
				kind: "junction",
				id: "j1",
				tenantId: parseTenantId("acme"),
			},
		});
		expect(allow.effect).toBe("allow");

		const deny = await engine.evaluate({
			subject: {
				identity: "j1",
				tenantId: parseTenantId("acme"),
				tags: ["role:junction"],
			},
			action: "name.resolve",
			resource: {
				kind: "endpoint",
				id: "web",
				tenantId: parseTenantId("other"),
			},
		});
		expect(deny.effect).toBe("deny");
		expect(sink.events.some((e) => e.eventType === "policy.evaluate")).toBe(
			true,
		);
	});

	it("public DNS refuses raw overlay IPs and applies only when managedBy=hobo", async () => {
		const sink = createInMemoryMeteringSink();
		const bus = createMeteringBus([sink]);
		const memory = createMemoryDnsProvider();
		const hoboManaged = createPublicDnsManager({
			config: {
				managedBy: "hobo",
				provider: "memory",
				zone: "example.com",
			},
			provider: memory,
			metering: bus,
		});

		await expect(
			hoboManaged.reconcileEntrypoint({
				tenantId: parseTenantId("acme"),
				hostname: "web.myapp.hobo.example.com",
				gatewayHostname: "100.64.0.1",
			}),
		).rejects.toThrow(/gateway/);

		const applied = await hoboManaged.reconcileEntrypoint({
			tenantId: parseTenantId("acme"),
			hostname: "web.myapp.hobo.example.com",
			gatewayHostname: "funnel-abc.ts.net",
		});
		expect(applied.applied).toBe(true);
		expect(memory.store.size).toBe(1);

		const cloudManaged = createPublicDnsManager({
			config: { managedBy: "cloud-provider", provider: "route53" },
			metering: bus,
		});
		const suggested = await cloudManaged.reconcileEntrypoint({
			tenantId: parseTenantId("acme"),
			hostname: "web.myapp.hobo.example.com",
			gatewayHostname: "proxy.cfargotunnel.com",
		});
		expect(suggested.applied).toBe(false);
		expect(suggested.suggested?.type).toBe("CNAME");
	});

	it("dnscontrol provider exports a plan without shelling out", async () => {
		const provider = createDnsControlProvider();
		await provider.upsert(parseTenantId("acme"), "example.com", {
			name: "web.myapp.hobo",
			type: "CNAME",
			content: "funnel.ts.net",
			gatewayTarget: true,
		});
		const js = provider.exportDnsConfigJs();
		expect(js).toContain('D("example.com"');
		expect(js).toContain("CNAME");
		expect(provider.plans).toHaveLength(1);
	});

	it("junction agent joins overlay (degraded without tailscale) and emits usage", async () => {
		const sink = createInMemoryMeteringSink();
		const bus = createMeteringBus([sink]);
		const overlay = createTailscaleOverlay({
			metering: bus,
			run: () => ({ ok: false, stdout: "", stderr: "missing" }),
		});
		const policy = createTagAclPolicyEngine({ metering: bus });
		const agent = createJunctionAgent({
			config: {
				tenantId: "acme",
				name: "junction-aws-1",
				role: "junction",
				env: "dev",
				cloud: "aws",
			},
			overlay,
			policy,
			metering: bus,
		});
		const started = await agent.start();
		expect(started.ready).toBe(false);
		expect(started.notes.join(" ")).toMatch(/tailscale/i);
		expect(
			sink.events.some(
				(e) => e.eventType === "junction.join" && e.tenantId === "acme",
			),
		).toBe(true);
		await agent.stop();
	});

	it("netbird overlay is a ready-to-swap stub", async () => {
		const overlay = createNetbirdOverlay();
		const join = await overlay.join({
			tenantId: parseTenantId("acme"),
			hostname: "nb-1",
			tags: overlay.tenantTags({
				tenantId: parseTenantId("acme"),
				role: "junction",
			}),
		});
		expect(join.provider).toBe("netbird");
		expect(join.ready).toBe(false);
	});

	it("attachNamedEndpoints emits hierarchical URLs and registers session", async () => {
		const sink = createInMemoryMeteringSink();
		const bus = createMeteringBus([sink]);
		const named = await attachNamedEndpoints({
			app: "myapp",
			env: "local",
			sessionId: "test-session",
			metering: bus,
			processEnv: {},
			forcePortless: {
				available: false,
				binPath: null,
				version: null,
				mode: "auto",
				enabled: false,
				hint: "named HTTPS URLs require portless",
			},
			endpoints: [
				{
					resourceName: "web",
					kind: "web",
					backendUrl: "http://127.0.0.1:7071",
					external: true,
					serviceDiscoveryKey: "services__web__http__0",
				},
				{
					resourceName: "api",
					kind: "api",
					backendUrl: "http://hobo.internal/api",
					external: false,
					serviceDiscoveryKey: "services__api__http__0",
				},
			],
		});

		expect(named.primaryNamedUrl).toBe(
			"https://web.myapp.local.hobo.localhost",
		);
		expect(named.namedEndpoints[0]?.hostname).toMatch(/\.hobo\.localhost$/);
		expect(named.namedEndpoints[0]?.hostname.endsWith(".hobo")).toBe(false);
		expect(getNamedEndpointSession("test-session")?.primaryNamedUrl).toBe(
			named.primaryNamedUrl,
		);
		expect(
			sink.events.filter((e) => e.eventType === "named_endpoint.register"),
		).toHaveLength(2);
		await named.close();
	});

	it("probePortless is non-fatal when disabled", () => {
		const probe = probePortless({
			env: { HOBO_PORTLESS: "0" },
			runVersion: () => ({ ok: true, stdout: "1.0.0" }),
		});
		expect(probe.mode).toBe("off");
		expect(probe.enabled).toBe(false);
	});

	it("shared naming function matches required examples", () => {
		expect(
			getNamedEndpoint({
				resource: "web",
				app: "myapp",
				env: "prod",
				mode: "overlay",
			}),
		).toBe("https://web.myapp.hobo.test");
		expect(
			getNamedEndpoint({
				resource: "web",
				app: "myapp",
				env: "dev",
				tenant: "acme",
				mode: "overlay",
			}),
		).toBe("https://web.myapp.dev.acme.hobo.test");
	});

	it("usage event helper shapes billing-ready records", () => {
		const event = createUsageEvent({
			tenantId: parseTenantId("acme"),
			eventType: "tunnel.heartbeat",
			resource: "junction-1",
			quantity: 1,
			unit: "tick",
		});
		expect(event.tenantId).toBe("acme");
		expect(event.timestamp).toMatch(/^\d{4}-/);
	});
});
