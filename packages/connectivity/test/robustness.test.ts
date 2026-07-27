import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMeteringBus, parseTenantId } from "@hobo/core";

import {
	createDpopJtiCache,
	generateDpopKeyPair,
	mintDpopProof,
	verifyDpopProof,
} from "../src/crypto/dpop.js";
import {
	mintJwtSvid,
	resolveSvidHmacSecret,
	spiffeIdForAgent,
	verifyJwtSvid,
} from "../src/crypto/jwt-svid.js";
import { signAwsRequest } from "../src/dns/aws-sigv4.js";
import {
	createRoute53DnsProvider,
	parseListResourceRecordSets,
} from "../src/dns/route53-provider.js";
import {
	createBillingAggregator,
} from "../src/metering/billing-aggregator.js";
import {
	createFileInvoiceLedger,
	createLedgerBillingProvider,
	createStripeBillingProvider,
	exportInvoiceStripeLines,
} from "../src/metering/billing-provider.js";
import { createNetbirdApiClient } from "../src/overlay/netbird-api.js";
import { createNetbirdOverlay } from "../src/overlay/netbird.js";
import { createTailscaleApiClient } from "../src/overlay/tailscale-api.js";
import { createTailscaleOverlay } from "../src/overlay/tailscale.js";
import { createOpaPolicyEngine } from "../src/policy/opa-engine.js";
import {
	evaluateRegoLite,
	HOBO_DEFAULT_POLICY_DOCUMENT,
	parseRegoLiteDocument,
} from "../src/policy/rego-lite.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length) await cleanups.pop()?.();
});

describe("AWS SigV4", () => {
	it("produces stable Authorization header structure", () => {
		const signed = signAwsRequest({
			method: "POST",
			url: "https://route53.amazonaws.com/2013-04-01/hostedzone/Z1/rrset/",
			headers: {
				"Content-Type": "text/xml",
				Host: "route53.amazonaws.com",
			},
			body: "<xml/>",
			region: "us-east-1",
			service: "route53",
			credentials: {
				accessKeyId: "AKIAEXAMPLE",
				secretAccessKey: "secretsecretsecretsecretsecret12",
			},
			now: new Date("2026-07-27T15:00:00.000Z"),
		});
		expect(signed.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
		expect(signed.headers["x-amz-date"]).toBe("20260727T150000Z");
		expect(signed.headers.Authorization).toContain("Signature=");
		expect(signed.credentialScope).toContain("route53/aws4_request");
	});

	it("route53 provider signs by default and lists via XML", async () => {
		const calls: { method: string; auth?: string }[] = [];
		const provider = createRoute53DnsProvider({
			accessKeyId: "AKIA",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			hostedZoneId: "Z123",
			fetchImpl: async (input, init) => {
				const method = init?.method ?? "GET";
				const headers = init?.headers as Record<string, string>;
				calls.push({
					method,
					auth: headers?.Authorization ?? headers?.authorization,
				});
				if (method === "GET") {
					return new Response(
						`<?xml version="1.0"?>
<ListResourceRecordSetsResponse>
  <ResourceRecordSets>
    <ResourceRecordSet>
      <Name>web.example.com.</Name>
      <Type>CNAME</Type>
      <TTL>300</TTL>
      <ResourceRecords><ResourceRecord><Value>funnel.ts.net.</Value></ResourceRecord></ResourceRecords>
    </ResourceRecordSet>
  </ResourceRecordSets>
</ListResourceRecordSetsResponse>`,
						{ status: 200 },
					);
				}
				return new Response("<ChangeResourceRecordSetsResponse/>", {
					status: 200,
				});
			},
		});
		await provider.upsert(parseTenantId("acme"), "example.com", {
			name: "api",
			type: "CNAME",
			content: "proxy.ts.net",
			gatewayTarget: true,
		});
		expect(calls[0]?.auth).toMatch(/AWS4-HMAC-SHA256/);
		const listed = await provider.list(parseTenantId("acme"), "example.com");
		expect(listed.some((r) => r.name.includes("web"))).toBe(true);
		expect(parseListResourceRecordSets("<ResourceRecordSet><Name>a.</Name><Type>A</Type><Value>1.2.3.4</Value></ResourceRecordSet>")).toHaveLength(1);

		const failing = createRoute53DnsProvider({
			accessKeyId: "AKIA",
			secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			hostedZoneId: "Z123",
			fetchImpl: async () =>
				new Response("forbidden", { status: 403 }),
		});
		await expect(
			failing.list(parseTenantId("acme"), "example.com"),
		).rejects.toThrow(/403/);
		await expect(
			failing.remove(parseTenantId("acme"), "example.com", "missing", "CNAME"),
		).rejects.toThrow(/unknown record|403/);
	});
});

describe("DPoP ES256 + JWT-SVID", () => {
	it("mints and verifies DPoP proofs and rejects mismatches / replay", () => {
		const kp = generateDpopKeyPair();
		const token = "access-token-value";
		const htu = "https://broker.example.com/v1/place";
		const proof = mintDpopProof({
			keyPair: kp,
			htm: "POST",
			htu,
			accessToken: token,
		});
		const cache = createDpopJtiCache();
		const verified = verifyDpopProof({
			proof,
			htm: "POST",
			htu,
			accessToken: token,
			jtiCache: cache,
		});
		expect(verified.kid).toBe(kp.kid);
		expect(() =>
			verifyDpopProof({
				proof,
				htm: "GET",
				htu,
				accessToken: token,
			}),
		).toThrow(/htm/);
		expect(() =>
			verifyDpopProof({
				proof,
				htm: "POST",
				htu: "https://other.example.com/v1/place",
				accessToken: token,
			}),
		).toThrow(/htu/);
		expect(() =>
			verifyDpopProof({
				proof,
				htm: "POST",
				htu,
				accessToken: "different-token",
			}),
		).toThrow(/ath/);
		expect(() =>
			verifyDpopProof({
				proof,
				htm: "POST",
				htu,
				accessToken: token,
				jtiCache: cache,
			}),
		).toThrow(/replay/);
	});

	it("mints and verifies audience-bound JWT-SVID; guards production secrets", () => {
		const spiffeId = spiffeIdForAgent("worker-1");
		const minted = mintJwtSvid({
			spiffeId,
			audience: "https://broker.example.com",
			hmacSecret: "test-secret",
		});
		const claims = verifyJwtSvid({
			token: minted.token,
			audience: "https://broker.example.com",
			hmacSecret: "test-secret",
		});
		expect(claims.sub).toBe(spiffeId);
		expect(claims.jti).toMatch(/^[a-f0-9]{32}$/);
		expect(() =>
			verifyJwtSvid({
				token: minted.token,
				audience: "https://other.example.com",
				hmacSecret: "test-secret",
			}),
		).toThrow(/audience/);
		expect(() =>
			verifyJwtSvid({
				token: minted.token,
				audience: "https://broker.example.com",
				hmacSecret: "wrong-secret",
			}),
		).toThrow(/signature/);
		expect(() =>
			resolveSvidHmacSecret({
				env: { NODE_ENV: "production" },
			}),
		).toThrow(/required outside development/);
		expect(
			resolveSvidHmacSecret({
				env: { NODE_ENV: "development" },
				allowDefaultSecret: true,
			}),
		).toMatch(/hobo-local/);
	});
});

describe("Tailscale API MagicDNS", () => {
	it("pushes split DNS via control-plane API", async () => {
		const calls: string[] = [];
		const api = createTailscaleApiClient({
			apiKey: "tskey-api-test",
			tailnet: "example.com",
			fetchImpl: async (input, init) => {
				const url = String(input);
				calls.push(`${init?.method ?? "GET"} ${url}`);
				if (url.includes("/dns/preferences")) {
					return new Response(JSON.stringify({ magicDNS: true }), {
						status: 200,
					});
				}
				if (url.includes("/dns/split-dns")) {
					return new Response(
						JSON.stringify({ "hobo.test": ["100.100.100.100"] }),
						{ status: 200 },
					);
				}
				return new Response("{}", { status: 200 });
			},
		});
		const map = await api.putSplitDns(["hobo.test"], ["100.100.100.100"]);
		expect(map["hobo.test"]).toContain("100.100.100.100");
		expect(calls.some((c) => c.includes("split-dns"))).toBe(true);

		const overlay = createTailscaleOverlay({
			apiKey: "tskey",
			fetchImpl: async (input, init) => {
				const url = String(input);
				if (url.includes("preferences")) {
					return new Response(JSON.stringify({ magicDNS: true }), {
						status: 200,
					});
				}
				return new Response(
					JSON.stringify({ "hobo.test": ["100.100.100.100"] }),
					{ status: 200 },
				);
			},
			run: (args) => {
				if (args[0] === "set") return { ok: true, stdout: "", stderr: "" };
				return { ok: false, stdout: "", stderr: "no" };
			},
		});
		const magic = await overlay.configureMagicDns!({
			tenantId: parseTenantId("acme"),
			domains: ["hobo.test"],
			nameservers: ["100.100.100.100"],
		});
		expect(magic.applied).toBe(true);
		expect(magic.notes.join(" ")).toMatch(/controlPlaneApplied=true|localAccepted/);

		const noKey = createTailscaleOverlay({
			run: (args) => {
				if (args[0] === "set") return { ok: true, stdout: "", stderr: "" };
				return { ok: false, stdout: "", stderr: "no" };
			},
		});
		const localOnly = await noKey.configureMagicDns!({
			tenantId: parseTenantId("acme"),
			domains: ["hobo.test"],
			nameservers: ["100.100.100.100"],
		});
		expect(localOnly.notes.join(" ")).toMatch(/controlPlaneApplied=false/);
		expect(localOnly.notes.join(" ")).toMatch(/TS_API_KEY/);
	});
});

describe("Netbird management API", () => {
	it("enrolls peer and upserts DNS group", async () => {
		const api = createNetbirdApiClient({
			managementUrl: "https://nb.example.com",
			accessToken: "token",
			setupKey: "setup-key",
			fetchImpl: async (input, init) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (url.includes("/setup-keys/validate") && method === "POST") {
					return new Response(
						JSON.stringify({
							id: "peer-1",
							name: "j1",
							ip: "100.64.0.5",
							connected: true,
						}),
						{ status: 200 },
					);
				}
				if (url.includes("/api/peers") && method === "GET") {
					return new Response(
						JSON.stringify([
							{
								id: "peer-1",
								name: "j1",
								ip: "100.64.0.5",
								connected: true,
								dns_label: "j1.nb.local",
							},
						]),
						{ status: 200 },
					);
				}
				if (url.includes("/dns/nameservers") && method === "POST") {
					return new Response(
						JSON.stringify({
							id: "dns-1",
							name: "hobo-acme",
							nameservers: [{ ip: "100.100.100.100" }],
							domains: ["hobo.test"],
							enabled: true,
						}),
						{ status: 200 },
					);
				}
				return new Response("{}", { status: 404 });
			},
		});
		const enrolled = await api.enrollPeer({ name: "j1" });
		expect(enrolled.enrolled).toBe(true);
		expect(enrolled.peer?.ip).toBe("100.64.0.5");
		const group = await api.upsertDnsNameserverGroup({
			name: "hobo-acme",
			nameservers: [{ ip: "100.100.100.100" }],
			domains: ["hobo.test"],
			enabled: true,
		});
		expect(group.domains).toContain("hobo.test");

		const overlay = createNetbirdOverlay({
			api,
		});
		const join = await overlay.join({
			tenantId: parseTenantId("acme"),
			hostname: "j1",
			tags: ["tenant:acme", "role:junction"],
		});
		expect(join.ready).toBe(true);
		const magic = await overlay.configureMagicDns!({
			tenantId: parseTenantId("acme"),
			domains: ["hobo.test"],
			nameservers: ["100.100.100.100"],
		});
		expect(magic.applied).toBe(true);
	});
});

describe("billing provider + durable ledger", () => {
	it("records invoices on ledger and supports stripe-shaped charge", async () => {
		const dir = await mkdtemp(join(tmpdir(), "hobo-bill-"));
		cleanups.push(() => rm(dir, { recursive: true, force: true }));
		const ledger = createFileInvoiceLedger(dir);
		const provider = createLedgerBillingProvider({ ledger });
		const bus = createMeteringBus();
		const billing = createBillingAggregator({
			billingProvider: provider,
		});
		bus.addSink(billing);
		await bus.emit({
			tenantId: parseTenantId("acme"),
			eventType: "tunnel.heartbeat",
			resource: "j1",
			quantity: 10,
			unit: "tick",
			timestamp: new Date().toISOString(),
		});
		const { invoice, charge } = await billing.closeAndCharge({
			tenantId: parseTenantId("acme"),
			periodStart: "2026-07-01",
			periodEnd: "2026-07-31",
		});
		expect(invoice.total).toBe(10);
		expect(charge?.status).toBe("recorded");
		expect(ledger.list("acme")).toHaveLength(1);
		expect(exportInvoiceStripeLines(invoice).lines[0]?.amount).toBe(10);

		const stripeCalls: string[] = [];
		const stripe = createStripeBillingProvider({
			secretKey: "sk_test_x",
			fetchImpl: async (input, init) => {
				stripeCalls.push(`${init?.method} ${String(input)}`);
				return new Response(
					JSON.stringify({ id: "pi_123", status: "requires_payment_method" }),
					{ status: 200 },
				);
			},
		});
		const charged = await stripe.charge(invoice);
		expect(charged.status).toBe("pending");
		expect(charged.externalId).toBe("pi_123");
		expect(stripeCalls.some((c) => c.includes("payment_intents"))).toBe(true);

		const failStripe = createStripeBillingProvider({
			secretKey: "sk_test_x",
			fetchImpl: async (input) => {
				const url = String(input);
				if (url.includes("/customers")) {
					return new Response(JSON.stringify({ id: "cus_fail" }), {
						status: 200,
					});
				}
				return new Response(
					JSON.stringify({ error: { message: "card_declined" } }),
					{ status: 402 },
				);
			},
		});
		const failed = await failStripe.charge(invoice);
		expect(failed.status).toBe("failed");

		// Period filter: old event excluded from close window.
		const billing2 = createBillingAggregator();
		await billing2.emit({
			tenantId: parseTenantId("acme"),
			eventType: "tunnel.heartbeat",
			resource: "j1",
			quantity: 5,
			unit: "tick",
			timestamp: "2020-01-01T00:00:00.000Z",
		});
		const empty = billing2.closePeriod({
			tenantId: parseTenantId("acme"),
			periodStart: "2026-07-01",
			periodEnd: "2026-07-31",
		});
		expect(empty.total).toBe(0);
	});
});

describe("rego-lite policy documents", () => {
	it("evaluates structured allow/deny rules", async () => {
		const doc = parseRegoLiteDocument({
			default: "deny",
			rules: [
				{
					effect: "allow",
					when: { sameTenant: true, subjectTagsAny: ["role:junction"] },
					reason: "junction same tenant",
				},
			],
		});
		const allow = evaluateRegoLite(doc, {
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

		const engine = createOpaPolicyEngine({
			policyDocument: HOBO_DEFAULT_POLICY_DOCUMENT,
		});
		const deny = await engine.evaluate({
			subject: {
				identity: "x",
				tenantId: parseTenantId("a"),
				tags: [],
			},
			action: "read",
			resource: {
				kind: "x",
				id: "1",
				tenantId: parseTenantId("b"),
			},
		});
		expect(deny.effect).toBe("deny");

		// OPA HTTP down → rego-lite default deny for cross-tenant.
		const fallbackEngine = createOpaPolicyEngine({
			opaUrl: "http://127.0.0.1:9/v1/data/hobo",
			fetchImpl: async () => {
				throw new Error("connection refused");
			},
			policyDocument: HOBO_DEFAULT_POLICY_DOCUMENT,
		});
		const fb = await fallbackEngine.evaluate({
			subject: {
				identity: "x",
				tenantId: parseTenantId("a"),
				tags: [],
			},
			action: "read",
			resource: {
				kind: "x",
				id: "1",
				tenantId: parseTenantId("b"),
			},
		});
		expect(fb.effect).toBe("deny");
	});
});
