/**
 * Hostinger resolver tests, driven entirely through an injected fake
 * `HttpTransport`.
 *
 * The fake is the whole provider: that is what lets a test assert "reconcile
 * twice made no mutating call at all" — the property that matters on a provider
 * where allocation is a purchase rather than an API call. Nothing here touches
 * a network, a credential, or a Hostinger account — see the HONEST SCOPE
 * section of `src/resolvers.ts`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type HttpTransport,
	parseResolveOutcome,
	parseResolveRequest,
	type ResolveOutcome,
	type ResolveRequest,
	type ResolverError,
	type ResourceResolver,
	type TransportRequest,
	type TransportResponse,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	guardedHostingerTransport,
	HOSTINGER_ALLOWED_PATH_PREFIXES,
	HOSTINGER_API_HOST,
	HOSTINGER_DEFAULT_BINDINGS,
	HOSTINGER_DNS_ZONE_PRODUCT_ID,
	HOSTINGER_EXCLUDED_PATH_PREFIXES,
	HOSTINGER_RESOLVED_PRODUCT_IDS,
	HOSTINGER_UNRESOLVED_PRODUCT_IDS,
	HOSTINGER_VPS_PRODUCT_ID,
	type HostingerResolverOptions,
	hostingerApiUrl,
	hostingerResolverRegistry,
	hostingerResolvers,
	redactHostingerText,
} from "../src/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pact = JSON.parse(
	readFileSync(
		join(packageRoot, "../contracts/provider-hostinger-boundary.pact.json"),
		"utf8",
	),
);

const CREDENTIAL_REF = "env://HOSTINGER_API_TOKEN";
/** A token-shaped account token. Never expected anywhere but one header. */
const TOKEN = "fakehostingeraccounttoken0123456789abcd";
/** A 40-character token-shaped string, as providers echo them in error text. */
const LEAKED_TOKEN = "abcdefghij0123456789ABCDEFGHIJ0123456789";

type Rec = Record<string, unknown>;

interface RecordedCall {
	readonly method: string;
	readonly host: string;
	readonly path: string;
	readonly search: string;
	readonly body: string | undefined;
	readonly headers: Readonly<Record<string, string>>;
}

interface Fake {
	readonly transport: HttpTransport;
	readonly calls: readonly RecordedCall[];
	/** Every call that could change something in the account. */
	mutating(): readonly RecordedCall[];
}

function record(request: TransportRequest): RecordedCall {
	const url = new URL(request.url);
	return {
		method: request.method,
		host: url.hostname,
		path: url.pathname,
		search: url.search,
		body: request.body,
		headers: request.headers,
	};
}

function fakeTransport(
	handler: (call: RecordedCall) => TransportResponse,
): Fake {
	const calls: RecordedCall[] = [];
	return {
		transport: async (request) => {
			const call = record(request);
			calls.push(call);
			return handler(call);
		},
		calls,
		mutating() {
			return calls.filter((call) => call.method !== "GET");
		},
	};
}

function json(status: number, payload: unknown): TransportResponse {
	return {
		status,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	};
}

function notFound(): TransportResponse {
	return json(404, { message: "Not found" });
}

function unexpected(call: RecordedCall): TransportResponse {
	return json(500, {
		message: `the fake received an unexpected ${call.method} ${call.path}${call.search}`,
	});
}

function bodyOf(call: RecordedCall): Rec {
	return call.body === undefined ? {} : (JSON.parse(call.body) as Rec);
}

function options(
	overrides: Partial<HostingerResolverOptions> = {},
): HostingerResolverOptions {
	return { resolveCredential: async () => TOKEN, ...overrides };
}

function resolverFor(
	productId: string,
	overrides: Partial<HostingerResolverOptions> = {},
): ResourceResolver {
	const resolver = hostingerResolverRegistry(options(overrides)).get(productId);
	if (resolver === undefined) {
		throw new Error(`no resolver registered for ${productId}`);
	}
	return resolver;
}

function request(input: {
	readonly slot: string;
	readonly productId: string;
	readonly logicalId: string;
	readonly physicalId?: string;
	readonly desired?: Rec;
}): ResolveRequest {
	return parseResolveRequest({
		ref: {
			slot: input.slot,
			productId: input.productId,
			logicalId: input.logicalId,
			...(input.physicalId !== undefined
				? { physicalId: input.physicalId }
				: {}),
		},
		desired: input.desired ?? {},
		credentialRef: CREDENTIAL_REF,
	});
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as ResolverError).code ?? "NO_CODE";
	}
	return "NO_ERROR_THROWN";
}

async function messageOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as Error).message;
	}
	return "NO_ERROR_THROWN";
}

/** Every outcome must survive core's outcome parse boundary. */
function checked(outcome: ResolveOutcome): ResolveOutcome {
	return parseResolveOutcome(outcome);
}

// ---------------------------------------------------------------------------
// Fake Hostinger API
// ---------------------------------------------------------------------------

const MACHINES = "/api/vps/v1/virtual-machines";
const ZONE = "/api/dns/v1/zones/example.com";

function runningMachine(overrides: Rec = {}): Rec {
	return {
		id: 12345,
		hostname: "api-1",
		state: "running",
		template: { name: "ubuntu-24-04" },
		data_center: { name: "Phoenix" },
		ipv4: [{ address: "203.0.113.9" }],
		...overrides,
	};
}

function vpsApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let machines = [...initial];
	return (call) => {
		if (call.method === "GET" && call.path === MACHINES) {
			return json(200, { data: machines });
		}
		if (call.method === "GET" && call.path.startsWith(`${MACHINES}/`)) {
			const id = Number(call.path.slice(MACHINES.length + 1));
			const found = machines.find((entry) => entry.id === id);
			return found === undefined ? notFound() : json(200, { data: found });
		}
		if (call.method === "POST" && call.path.endsWith("/setup")) {
			const id = Number(call.path.split("/")[5]);
			const sent = bodyOf(call);
			machines = machines.map((entry) =>
				entry.id === id
					? {
							...entry,
							hostname: sent.hostname,
							state: "installing",
							template: { name: "ubuntu-24-04" },
						}
					: entry,
			);
			return json(202, { message: "setup queued" });
		}
		if (call.method === "PUT" && call.path.endsWith("/hostname")) {
			const id = Number(call.path.split("/")[5]);
			const sent = bodyOf(call);
			machines = machines.map((entry) =>
				entry.id === id ? { ...entry, hostname: sent.hostname } : entry,
			);
			return json(200, { message: "hostname updated" });
		}
		return unexpected(call);
	};
}

function dnsApi(initial?: Rec[]): (call: RecordedCall) => TransportResponse {
	let zone = initial;
	return (call) => {
		if (call.method === "GET" && call.path === ZONE) {
			return zone === undefined ? notFound() : json(200, zone);
		}
		if (call.method === "PUT" && call.path === ZONE) {
			zone = bodyOf(call).zone as Rec[];
			return json(200, { message: "zone updated" });
		}
		if (call.method === "DELETE" && call.path === ZONE) {
			if (zone === undefined) return notFound();
			zone = [];
			return json(200, { message: "zone reset" });
		}
		return unexpected(call);
	};
}

const VPS_REQUEST = {
	slot: "web",
	productId: HOSTINGER_VPS_PRODUCT_ID,
	logicalId: "api-1",
	desired: { template: "ubuntu-24-04" },
} as const;

const ZONE_RECORDS = [
	{ name: "@", type: "A", ttl: 300, records: [{ content: "203.0.113.9" }] },
];

const ZONE_REQUEST = {
	slot: "api",
	productId: HOSTINGER_DNS_ZONE_PRODUCT_ID,
	logicalId: "example.com",
	desired: { records: ZONE_RECORDS },
} as const;

// ---------------------------------------------------------------------------

describe("the registry covers exactly the products with a convergent API", () => {
	it("registers a resolver for every resolved product id", () => {
		const registry = hostingerResolverRegistry(options());
		for (const productId of HOSTINGER_RESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)?.productId).toBe(productId);
		}
	});

	it("registers nothing for a product with no addressable REST resource", () => {
		const registry = hostingerResolverRegistry(options());
		for (const productId of HOSTINGER_UNRESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)).toBeUndefined();
		}
		expect(HOSTINGER_UNRESOLVED_PRODUCT_IDS).toEqual([
			"hostinger.mysql/v1",
			"hostinger.static-site/v1",
			"hostinger.web-hosting/v1",
		]);
	});

	it("accounts for every catalogued product exactly once", () => {
		const catalogued = new Set(
			Object.values(HOSTINGER_DEFAULT_BINDINGS)
				.flatMap((entries) => [...(entries ?? [])])
				.map((entry) => entry.productId)
				.filter((id): id is string => typeof id === "string"),
		);
		const accounted = [
			...HOSTINGER_RESOLVED_PRODUCT_IDS,
			...HOSTINGER_UNRESOLVED_PRODUCT_IDS,
		].sort();
		expect(accounted).toEqual([...catalogued].sort());
		expect(new Set(accounted).size).toBe(accounted.length);
	});

	it("lists resolvers in id order and stamps the provider target", () => {
		const resolvers = hostingerResolvers(options());
		expect(resolvers.map((entry) => entry.productId)).toEqual(
			[...resolvers.map((entry) => entry.productId)].sort(),
		);
		for (const resolver of resolvers) {
			expect(resolver.providerId).toBe("hostinger");
		}
	});
});

describe("allocation is a purchase, and this package will not make it", () => {
	it("refuses when nothing in the account can be adopted", async () => {
		const fake = fakeTransport(vpsApi());
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request(VPS_REQUEST),
				fake.transport,
			),
		);
		expect(message).toContain("billing order");
		expect(message).toContain("will not spend the account's money");
		expect(fake.mutating()).toHaveLength(0);
	});

	/**
	 * The refusal above is a code path; this is the property underneath it. The
	 * transport guard does not allowlist the order-placing namespace, so a later
	 * edit cannot start spending money without widening a policy a reviewer sees.
	 */
	it("cannot address the billing namespace at all", () => {
		expect(HOSTINGER_ALLOWED_PATH_PREFIXES).not.toContain(
			HOSTINGER_EXCLUDED_PATH_PREFIXES.billing.prefix,
		);
		expect(() => hostingerApiUrl("/api/billing/v1/orders")).toThrow(/billing/);
	});

	it("refuses to remove a VPS, because that cancels a paid plan", async () => {
		const fake = fakeTransport(vpsApi([runningMachine()]));
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).delete(
				request(VPS_REQUEST),
				fake.transport,
			),
		);
		expect(message).toContain("cancelling a paid plan");
		expect(fake.mutating()).toHaveLength(0);
	});

	it("treats an already-absent VPS as nothing to do", async () => {
		const fake = fakeTransport(vpsApi());
		await expect(
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).delete(
				request(VPS_REQUEST),
				fake.transport,
			),
		).resolves.toBeUndefined();
	});
});

describe("VPS adopt-and-converge", () => {
	it("adopts a machine you already own without mutating it", async () => {
		const fake = fakeTransport(vpsApi([runningMachine()]));
		const outcome = checked(
			await resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request(VPS_REQUEST),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.physicalId).toBe("12345");
		expect(outcome.outputs.ipv4).toBe("203.0.113.9");
		expect(fake.mutating()).toHaveLength(0);
	});

	it("matches the adopt-twice interaction the pact records", async () => {
		const interaction = pact.interactions.find(
			(entry: { description: string }) =>
				entry.description ===
				"adopt an already-purchased VPS by hostname, twice, without mutating it",
		);
		const fake = fakeTransport(vpsApi([runningMachine()]));
		const resolver = resolverFor(interaction.request.body.productId);
		const first = checked(
			await resolver.reconcile(
				request({
					slot: "web",
					productId: interaction.request.body.productId,
					logicalId: interaction.request.body.logicalId,
					desired: interaction.request.body.desired,
				}),
				fake.transport,
			),
		);
		const second = checked(
			await resolver.reconcile(
				request({
					slot: "web",
					productId: interaction.request.body.productId,
					logicalId: interaction.request.body.logicalId,
					physicalId: first.physicalId,
					desired: interaction.request.body.desired,
				}),
				fake.transport,
			),
		);
		expect(first.contract).toBe(interaction.response.body.contract);
		expect(first.action).toBe(interaction.response.body.action);
		expect(fake.mutating()).toHaveLength(
			interaction.response.body.mutatingCalls,
		);
		expect(second.action).toBe(interaction.response.body.reconcileTwiceAction);
		expect(second.physicalId).toBe(first.physicalId);
	});

	it("sets up a machine that was bought but never provisioned", async () => {
		const fake = fakeTransport(
			vpsApi([{ id: 999, hostname: null, state: "initial", ipv4: [] }]),
		);
		const outcome = checked(
			await resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request({
					...VPS_REQUEST,
					desired: {
						template: "ubuntu-24-04",
						virtualMachineId: "999",
						publicKeyId: 7,
						templateId: 1002,
						dataCenterId: 4,
					},
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("create");
		expect(outcome.physicalId).toBe("999");
		const setup = fake.calls.find((call) => call.path.endsWith("/setup"));
		expect(bodyOf(setup as RecordedCall).hostname).toBe("api-1");
		expect(bodyOf(setup as RecordedCall).public_key).toEqual({ id: 7 });
		expect(outcome.diagnostics.join(" ")).toContain("accepted, not confirmed");
	});

	/**
	 * The whole reason setup takes a public-key id: a ResolveRequest is recorded
	 * in the event log, so a password in it is a password in the log.
	 */
	it("refuses a root password in desired, before any call is made", async () => {
		const fake = fakeTransport(vpsApi());
		const code = await codeOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request({
					...VPS_REQUEST,
					desired: { virtualMachineId: "999", password: "hunter2" },
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_NOT_A_REF");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses setup without a public-key id rather than inventing access", async () => {
		const fake = fakeTransport(
			vpsApi([{ id: 999, hostname: null, state: "initial", ipv4: [] }]),
		);
		const code = await codeOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request({
					...VPS_REQUEST,
					desired: { virtualMachineId: "999" },
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
		expect(fake.mutating()).toHaveLength(0);
	});

	it("renames a provisioned machine adopted by id, and leaves its OS alone", async () => {
		const fake = fakeTransport(
			vpsApi([runningMachine({ id: 999, hostname: "old-name" })]),
		);
		const outcome = checked(
			await resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request({
					...VPS_REQUEST,
					desired: { template: "ubuntu-24-04", virtualMachineId: "999" },
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		expect(outcome.outputs.hostname).toBe("api-1");
		expect(fake.calls.some((call) => call.path.endsWith("/setup"))).toBe(false);
		expect(outcome.diagnostics.join(" ")).toContain("wipes the disk");
	});

	it("reports a template drift rather than recreating the machine", async () => {
		const fake = fakeTransport(vpsApi([runningMachine()]));
		const outcome = checked(
			await resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request({ ...VPS_REQUEST, desired: { template: "debian-12" } }),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.diagnostics.join(" ")).toContain("wipes the disk");
		expect(fake.mutating()).toHaveLength(0);
	});

	it("refuses when a hostname matches more than one machine", async () => {
		const fake = fakeTransport(
			vpsApi([runningMachine(), runningMachine({ id: 12346 })]),
		);
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request(VPS_REQUEST),
				fake.transport,
			),
		);
		expect(message).toContain("more than one machine");
	});

	it("refuses a virtualMachineId that is not in the account", async () => {
		const fake = fakeTransport(vpsApi());
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request({
					...VPS_REQUEST,
					desired: { virtualMachineId: "404", publicKeyId: 7 },
				}),
				fake.transport,
			),
		);
		expect(message).toContain("is not a machine in this account");
		expect(fake.mutating()).toHaveLength(0);
	});

	it("read answers undefined for a machine that is not there", async () => {
		const fake = fakeTransport(vpsApi());
		await expect(
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).read(
				request(VPS_REQUEST),
				fake.transport,
			),
		).resolves.toBeUndefined();
	});
});

describe("DNS zones converge", () => {
	it("makes no write when the zone already matches, key order aside", async () => {
		const fake = fakeTransport(
			dnsApi([
				{
					ttl: 300,
					records: [{ content: "203.0.113.9" }],
					type: "A",
					name: "@",
				},
			]),
		);
		const outcome = checked(
			await resolverFor(HOSTINGER_DNS_ZONE_PRODUCT_ID).reconcile(
				request(ZONE_REQUEST),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.outputs.recordTypes).toEqual(["A"]);
		expect(fake.mutating()).toHaveLength(0);
	});

	/**
	 * Hostinger's zone PUT drops any record the body omits, so the whole
	 * authored set is sent — a partial body would silently delete records.
	 */
	it("replaces the zone in full rather than patching it", async () => {
		const fake = fakeTransport(
			dnsApi([
				{
					name: "@",
					type: "A",
					ttl: 300,
					records: [{ content: "198.51.100.1" }],
				},
			]),
		);
		const outcome = checked(
			await resolverFor(HOSTINGER_DNS_ZONE_PRODUCT_ID).reconcile(
				request(ZONE_REQUEST),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		const put = fake.calls.find((call) => call.method === "PUT");
		expect(bodyOf(put as RecordedCall).overwrite).toBe(true);
		expect(bodyOf(put as RecordedCall).zone).toEqual(ZONE_RECORDS);
		expect(outcome.diagnostics.join(" ")).toContain("drops any record");
	});

	it("refuses to invent records", async () => {
		const fake = fakeTransport(dnsApi([]));
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_DNS_ZONE_PRODUCT_ID).reconcile(
				request({ ...ZONE_REQUEST, desired: {} }),
				fake.transport,
			),
		);
		expect(message).toContain("desired.records");
	});

	it("refuses a domain the account does not hold", async () => {
		const fake = fakeTransport(dnsApi(undefined));
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_DNS_ZONE_PRODUCT_ID).reconcile(
				request(ZONE_REQUEST),
				fake.transport,
			),
		);
		expect(message).toContain("not a domain in this Hostinger account");
		expect(fake.mutating()).toHaveLength(0);
	});

	it("resets the zone on remove and treats an absent domain as success", async () => {
		const fake = fakeTransport(dnsApi([]));
		await expect(
			resolverFor(HOSTINGER_DNS_ZONE_PRODUCT_ID).delete(
				request(ZONE_REQUEST),
				fake.transport,
			),
		).resolves.toBeUndefined();
		const absent = fakeTransport(dnsApi(undefined));
		await expect(
			resolverFor(HOSTINGER_DNS_ZONE_PRODUCT_ID).delete(
				request(ZONE_REQUEST),
				absent.transport,
			),
		).resolves.toBeUndefined();
	});
});

describe("credentials are locators and never leak", () => {
	it("sends the token in exactly one place: the authorization header", async () => {
		const fake = fakeTransport(vpsApi([runningMachine()]));
		const outcome = checked(
			await resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request(VPS_REQUEST),
				fake.transport,
			),
		);
		for (const call of fake.calls) {
			expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
			expect(call.body ?? "").not.toContain(TOKEN);
			expect(call.path).not.toContain(TOKEN);
		}
		expect(JSON.stringify(outcome)).not.toContain(TOKEN);
	});

	it("refuses a credentialRef that is the token itself", async () => {
		const fake = fakeTransport(vpsApi());
		const code = await codeOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				parseResolveRequest({
					ref: {
						slot: "web",
						productId: HOSTINGER_VPS_PRODUCT_ID,
						logicalId: "api-1",
					},
					desired: { template: "ubuntu-24-04" },
					credentialRef: "a".repeat(40),
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_NOT_A_REF");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses when the host resolves the locator to nothing", async () => {
		const fake = fakeTransport(vpsApi());
		const code = await codeOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID, {
				resolveCredential: async () => "",
			}).reconcile(request(VPS_REQUEST), fake.transport),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
	});

	it("redacts token-shaped text out of provider error messages", async () => {
		const fake = fakeTransport(() =>
			json(422, { message: `request ${LEAKED_TOKEN} was rejected` }),
		);
		const message = await messageOf(() =>
			resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
				request(VPS_REQUEST),
				fake.transport,
			),
		);
		expect(message).not.toContain(LEAKED_TOKEN);
		expect(message).toContain("[redacted]");
	});

	it("redactHostingerText truncates as well as scrubs", () => {
		expect(redactHostingerText(LEAKED_TOKEN)).toBe("[redacted]");
		const chatty = "x ".repeat(25);
		expect(redactHostingerText(chatty, 10)).toBe(`${chatty.slice(0, 10)}…`);
	});
});

describe("the transport guard bounds where a token can be sent", () => {
	it("refuses a host that is not developers.hostinger.com", async () => {
		const guarded = guardedHostingerTransport(async () => json(200, {}));
		await expect(
			guarded({
				method: "GET",
				url: "https://developers.hostinger.example/api/vps/v1/virtual-machines",
				headers: {},
			}),
		).rejects.toThrow();
	});

	it("refuses the billing namespace even on the right host", async () => {
		const guarded = guardedHostingerTransport(async () => json(200, {}));
		await expect(
			guarded({
				method: "POST",
				url: `https://${HOSTINGER_API_HOST}/api/billing/v1/orders`,
				headers: {},
			}),
		).rejects.toThrow();
	});

	it("keeps every real call on an allowlisted namespace", async () => {
		const fake = fakeTransport(vpsApi([runningMachine()]));
		await resolverFor(HOSTINGER_VPS_PRODUCT_ID).reconcile(
			request(VPS_REQUEST),
			fake.transport,
		);
		for (const call of fake.calls) {
			expect(call.host).toBe(HOSTINGER_API_HOST);
			expect(
				HOSTINGER_ALLOWED_PATH_PREFIXES.some((prefix) =>
					call.path.startsWith(prefix),
				),
			).toBe(true);
		}
	});
});
