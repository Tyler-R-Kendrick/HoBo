/**
 * DigitalOcean resolver tests, driven entirely through an injected fake
 * `HttpTransport`.
 *
 * The fake is the whole provider: that is what lets a test assert "reconcile
 * twice made exactly one create call" at all, which is the property the
 * resolvers exist to have. Nothing here touches a network, a credential, or a
 * DigitalOcean account — see the HONEST SCOPE section of `src/resolvers.ts`.
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
	DIGITALOCEAN_API_HOST,
	DIGITALOCEAN_APP_SERVICE_PRODUCT_ID,
	DIGITALOCEAN_DEFAULT_BINDINGS,
	DIGITALOCEAN_DROPLET_PRODUCT_ID,
	DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID,
	DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID,
	DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID,
	DIGITALOCEAN_RESOLVED_PRODUCT_IDS,
	DIGITALOCEAN_SPACES_PRODUCT_ID,
	DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS,
	type DigitalOceanResolverOptions,
	digitaloceanResolverRegistry,
	digitaloceanResolvers,
	guardedDigitalOceanTransport,
	guardedSpacesTransport,
	redactDigitalOceanText,
} from "../src/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pact = JSON.parse(
	readFileSync(
		join(packageRoot, "../contracts/provider-digitalocean-boundary.pact.json"),
		"utf8",
	),
);

const CREDENTIAL_REF = "env://DIGITALOCEAN_TOKEN";
/** A token-shaped PAT. Never expected anywhere but one header. */
const TOKEN = "dop_v1_fakepersonalaccesstoken0123456789abcdef";
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
	countOf(method: string, path: string): number;
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
		countOf(method, path) {
			return calls.filter(
				(call) => call.method === method && call.path === path,
			).length;
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

function noContent(): TransportResponse {
	return { status: 204, headers: {}, body: "" };
}

function unexpected(call: RecordedCall): TransportResponse {
	return json(500, {
		id: "internal",
		message: `the fake received an unexpected ${call.method} ${call.path}${call.search}`,
	});
}

function bodyOf(call: RecordedCall): Rec {
	return call.body === undefined ? {} : (JSON.parse(call.body) as Rec);
}

/** A Spaces key pair. Never the control-plane token — that is the point. */
const SPACES_KEYS = Object.freeze({
	accessKeyId: "DO00FAKEACCESSKEYID12",
	secretAccessKey: "fake-spaces-secret-access-key-0123456789",
});

/** A fixed signing instant, so a SigV4 signature is reproducible in a test. */
const NOW_MS = Date.parse("2026-08-19T12:00:00.000Z");

function options(
	overrides: Partial<DigitalOceanResolverOptions> = {},
): DigitalOceanResolverOptions {
	return {
		resolveCredential: async () => TOKEN,
		resolveSpacesCredential: async () => SPACES_KEYS,
		nowMs: NOW_MS,
		...overrides,
	};
}

function resolverFor(
	productId: string,
	overrides: Partial<DigitalOceanResolverOptions> = {},
): ResourceResolver {
	const resolver = digitaloceanResolverRegistry(options(overrides)).get(
		productId,
	);
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
// Fake DigitalOcean services
// ---------------------------------------------------------------------------

const DATABASES = "/v2/databases";
const DROPLETS = "/v2/droplets";
const LOAD_BALANCERS = "/v2/load_balancers";
const APPS = "/v2/apps";

/** A `/v2/databases` account holding zero or more clusters. */
function databaseApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let clusters = [...initial];
	let nextId = initial.length + 1;
	return (call) => {
		if (call.method === "GET" && call.path === DATABASES) {
			return json(200, {
				databases: clusters,
				meta: { total: clusters.length },
			});
		}
		if (call.method === "POST" && call.path === DATABASES) {
			const sent = bodyOf(call);
			const created = {
				id: `db-${nextId++}`,
				name: sent.name,
				engine: sent.engine,
				version: sent.version ?? "16",
				region: sent.region,
				size: sent.size,
				num_nodes: sent.num_nodes ?? 1,
				status: "creating",
				connection: {
					host: `${String(sent.name)}.db.ondigitalocean.com`,
					port: 25060,
					database: "defaultdb",
					user: "doadmin",
					uri: "postgresql://doadmin:SUPERSECRETPASSWORD@host:25060/defaultdb",
				},
			};
			clusters.push(created);
			return json(201, { database: created });
		}
		if (call.method === "PUT" && call.path.endsWith("/resize")) {
			const id = call.path.split("/")[3] as string;
			clusters = clusters.map((cluster) =>
				cluster.id === id
					? {
							...cluster,
							size: bodyOf(call).size,
							num_nodes: bodyOf(call).num_nodes,
							status: "resizing",
						}
					: cluster,
			);
			return json(202, {});
		}
		if (call.method === "DELETE" && call.path.startsWith(`${DATABASES}/`)) {
			const id = call.path.slice(DATABASES.length + 1);
			clusters = clusters.filter((cluster) => cluster.id !== id);
			return noContent();
		}
		return unexpected(call);
	};
}

function dropletApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let droplets = [...initial];
	let nextId = 100 + initial.length;
	return (call) => {
		if (call.method === "GET" && call.path === DROPLETS) {
			return json(200, { droplets, meta: { total: droplets.length } });
		}
		if (call.method === "POST" && call.path === DROPLETS) {
			const sent = bodyOf(call);
			const created = {
				id: nextId++,
				name: sent.name,
				status: "new",
				size_slug: sent.size,
				region: { slug: sent.region },
				networks: { v4: [] },
			};
			droplets.push(created);
			return json(202, { droplet: created });
		}
		if (call.method === "DELETE" && call.path.startsWith(`${DROPLETS}/`)) {
			const id = Number(call.path.slice(DROPLETS.length + 1));
			droplets = droplets.filter((entry) => entry.id !== id);
			return noContent();
		}
		return unexpected(call);
	};
}

function loadBalancerApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let balancers = [...initial];
	let nextId = initial.length + 1;
	return (call) => {
		if (call.method === "GET" && call.path === LOAD_BALANCERS) {
			return json(200, {
				load_balancers: balancers,
				meta: { total: balancers.length },
			});
		}
		if (call.method === "POST" && call.path === LOAD_BALANCERS) {
			const sent = bodyOf(call);
			const created = {
				id: `lb-${nextId++}`,
				name: sent.name,
				ip: "203.0.113.10",
				status: "new",
				algorithm: sent.algorithm ?? "round_robin",
				redirect_http_to_https: sent.redirect_http_to_https ?? false,
				region: { slug: sent.region },
				forwarding_rules: sent.forwarding_rules,
			};
			balancers.push(created);
			return json(202, { load_balancer: created });
		}
		if (call.method === "PUT" && call.path.startsWith(`${LOAD_BALANCERS}/`)) {
			const id = call.path.slice(LOAD_BALANCERS.length + 1);
			const sent = bodyOf(call);
			balancers = balancers.map((entry) =>
				entry.id === id
					? {
							...entry,
							algorithm: sent.algorithm ?? entry.algorithm,
							redirect_http_to_https:
								sent.redirect_http_to_https ?? entry.redirect_http_to_https,
							status: "active",
						}
					: entry,
			);
			const updated = balancers.find((entry) => entry.id === id);
			return json(200, { load_balancer: updated });
		}
		if (
			call.method === "DELETE" &&
			call.path.startsWith(`${LOAD_BALANCERS}/`)
		) {
			const id = call.path.slice(LOAD_BALANCERS.length + 1);
			balancers = balancers.filter((entry) => entry.id !== id);
			return noContent();
		}
		return unexpected(call);
	};
}

function appApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let apps = [...initial];
	let nextId = initial.length + 1;
	return (call) => {
		if (call.method === "GET" && call.path === APPS) {
			return json(200, { apps, meta: { total: apps.length } });
		}
		if (call.method === "POST" && call.path === APPS) {
			const sent = bodyOf(call);
			const created = {
				id: `app-${nextId++}`,
				spec: sent.spec,
				live_url: undefined,
				active_deployment: { phase: "PENDING_BUILD" },
			};
			apps.push(created);
			return json(201, { app: created });
		}
		if (call.method === "PUT" && call.path.startsWith(`${APPS}/`)) {
			const id = call.path.slice(APPS.length + 1);
			const sent = bodyOf(call);
			apps = apps.map((entry) =>
				entry.id === id ? { ...entry, spec: sent.spec } : entry,
			);
			return json(200, { app: apps.find((entry) => entry.id === id) });
		}
		if (call.method === "DELETE" && call.path.startsWith(`${APPS}/`)) {
			const id = call.path.slice(APPS.length + 1);
			apps = apps.filter((entry) => entry.id !== id);
			return noContent();
		}
		return unexpected(call);
	};
}

const POSTGRES_REQUEST = {
	slot: "data",
	productId: DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID,
	logicalId: "ledger",
	desired: { region: "nyc3", size: "db-s-1vcpu-1gb" },
} as const;

// ---------------------------------------------------------------------------

describe("the registry covers exactly the products that can converge", () => {
	it("registers a resolver for every resolved product id", () => {
		const registry = digitaloceanResolverRegistry(options());
		for (const productId of DIGITALOCEAN_RESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)?.productId).toBe(productId);
		}
	});

	it("registers nothing for a product with no convergent path", () => {
		const registry = digitaloceanResolverRegistry(options());
		for (const productId of DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)).toBeUndefined();
		}
		// The three that remain are the ones DigitalOcean's own API shape makes
		// non-convergent, not ones this package declined to write.
		expect(DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS).toEqual([
			"digitalocean.app-platform-job/v1",
			"digitalocean.app-platform-worker/v1",
			"digitalocean.functions/v1",
		]);
	});

	it("accounts for every catalogued product exactly once", () => {
		const catalogued = new Set(
			Object.values(DIGITALOCEAN_DEFAULT_BINDINGS)
				.flatMap((entries) => [...(entries ?? [])])
				.map((entry) => entry.productId)
				.filter((id): id is string => typeof id === "string"),
		);
		const accounted = [
			...DIGITALOCEAN_RESOLVED_PRODUCT_IDS,
			...DIGITALOCEAN_UNRESOLVED_PRODUCT_IDS,
		].sort();
		expect(accounted).toEqual([...catalogued].sort());
		expect(new Set(accounted).size).toBe(accounted.length);
	});

	it("lists resolvers in id order, not construction order", () => {
		const ids = digitaloceanResolvers(options()).map(
			(resolver) => resolver.productId,
		);
		expect(ids).toEqual([...ids].sort());
	});

	it("stamps the provider target on every resolver", () => {
		for (const resolver of digitaloceanResolvers(options())) {
			expect(resolver.providerId).toBe("digitalocean");
		}
	});
});

describe("managed databases converge", () => {
	it("creates a cluster that is absent, then makes no second create", async () => {
		const fake = fakeTransport(databaseApi());
		const resolver = resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(POSTGRES_REQUEST), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(POSTGRES_REQUEST), fake.transport),
		);

		expect(first.action).toBe("create");
		expect(second.action).toBe("adopt");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("POST", DATABASES)).toBe(1);
	});

	it("matches the reconcile-twice interaction the pact records", async () => {
		const interaction = pact.interactions.find(
			(entry: { description: string }) =>
				entry.description ===
				"reconcile a managed postgres cluster twice: one create call, one stable physicalId",
		);
		const fake = fakeTransport(databaseApi());
		const resolver = resolverFor(interaction.request.body.productId);
		const first = checked(
			await resolver.reconcile(
				request({
					slot: "data",
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
					slot: "data",
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
		expect(fake.countOf("POST", DATABASES)).toBe(
			interaction.response.body.createCalls,
		);
		expect(second.action).toBe(interaction.response.body.reconcileTwiceAction);
	});

	it("reports 'creating' as accepted, not confirmed", async () => {
		const fake = fakeTransport(databaseApi());
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
				request(POSTGRES_REQUEST),
				fake.transport,
			),
		);
		expect(outcome.diagnostics.join(" ")).toContain("accepted, not confirmed");
	});

	it("never puts the connection URI (which carries the password) in outputs", async () => {
		const fake = fakeTransport(databaseApi());
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
				request(POSTGRES_REQUEST),
				fake.transport,
			),
		);
		expect(JSON.stringify(outcome.outputs)).not.toContain("SUPERSECRET");
		expect("uri" in outcome.outputs).toBe(false);
		expect(outcome.outputs.host).toBe("ledger.db.ondigitalocean.com");
	});

	it("resizes an existing cluster rather than replacing it", async () => {
		const fake = fakeTransport(
			databaseApi([
				{
					id: "db-1",
					name: "ledger",
					engine: "pg",
					region: "nyc3",
					size: "db-s-1vcpu-1gb",
					num_nodes: 1,
					status: "online",
					connection: { host: "ledger.db.ondigitalocean.com", port: 25060 },
				},
			]),
		);
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
				request({
					...POSTGRES_REQUEST,
					desired: { region: "nyc3", size: "db-s-2vcpu-4gb" },
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		expect(fake.countOf("POST", DATABASES)).toBe(0);
		expect(
			fake.calls.some(
				(call) => call.method === "PUT" && call.path.endsWith("/resize"),
			),
		).toBe(true);
	});

	it("reports an immutable region drift instead of destroying the data", async () => {
		const fake = fakeTransport(
			databaseApi([
				{
					id: "db-1",
					name: "ledger",
					engine: "pg",
					region: "ams3",
					size: "db-s-1vcpu-1gb",
					num_nodes: 1,
					status: "online",
					connection: {},
				},
			]),
		);
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).read(
				request(POSTGRES_REQUEST),
				fake.transport,
			),
		);
		expect(outcome?.action).not.toBe("replace");
		expect(outcome?.diagnostics.join(" ")).toContain("immutable");
	});

	it("routes valkey through the same collection with its own engine slug", async () => {
		const fake = fakeTransport(databaseApi());
		await resolverFor(DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID).reconcile(
			request({
				slot: "kv",
				productId: DIGITALOCEAN_MANAGED_VALKEY_PRODUCT_ID,
				logicalId: "hot",
				desired: { region: "nyc3", size: "db-s-1vcpu-1gb" },
			}),
			fake.transport,
		);
		const create = fake.calls.find(
			(call) => call.method === "POST" && call.path === DATABASES,
		);
		expect(bodyOf(create as RecordedCall).engine).toBe("valkey");
	});

	it("deletes what exists and treats already-gone as success", async () => {
		const fake = fakeTransport(
			databaseApi([
				{
					id: "db-1",
					name: "ledger",
					engine: "pg",
					region: "nyc3",
					size: "db-s-1vcpu-1gb",
					status: "online",
					connection: {},
				},
			]),
		);
		const resolver = resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID);
		await resolver.delete(request(POSTGRES_REQUEST), fake.transport);
		await expect(
			resolver.delete(request(POSTGRES_REQUEST), fake.transport),
		).resolves.toBeUndefined();
		expect(fake.calls.filter((call) => call.method === "DELETE")).toHaveLength(
			1,
		);
	});

	it("read answers undefined for a cluster that is not there", async () => {
		const fake = fakeTransport(databaseApi());
		await expect(
			resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).read(
				request(POSTGRES_REQUEST),
				fake.transport,
			),
		).resolves.toBeUndefined();
	});
});

describe("a name that matches twice is refused, never guessed", () => {
	it("refuses rather than picking the first record", async () => {
		const twin = {
			id: "db-1",
			name: "ledger",
			engine: "pg",
			region: "nyc3",
			size: "db-s-1vcpu-1gb",
			status: "online",
			connection: {},
		};
		const fake = fakeTransport(databaseApi([twin, { ...twin, id: "db-2" }]));
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
				request(POSTGRES_REQUEST),
				fake.transport,
			),
		);
		expect(message).toContain("more than one record");
		expect(fake.countOf("POST", DATABASES)).toBe(0);
	});
});

describe("droplets", () => {
	const dropletRequest = {
		slot: "web",
		productId: DIGITALOCEAN_DROPLET_PRODUCT_ID,
		logicalId: "edge-1",
		desired: {
			region: "nyc3",
			size: "s-1vcpu-1gb",
			image: "ubuntu-24-04-x64",
		},
	} as const;

	it("creates once and adopts thereafter", async () => {
		const fake = fakeTransport(dropletApi());
		const resolver = resolverFor(DIGITALOCEAN_DROPLET_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(dropletRequest), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(dropletRequest), fake.transport),
		);
		expect(first.action).toBe("create");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("POST", DROPLETS)).toBe(1);
	});

	it("refuses to invent an image, because an unrequested OS is not a default", async () => {
		const fake = fakeTransport(dropletApi());
		const code = await codeOf(() =>
			resolverFor(DIGITALOCEAN_DROPLET_PRODUCT_ID).reconcile(
				request({
					...dropletRequest,
					desired: { region: "nyc3", size: "s-1vcpu-1gb" },
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_PRODUCT_UNSUPPORTED");
		expect(fake.countOf("POST", DROPLETS)).toBe(0);
	});

	it("refuses to invent a region, because placement is a residency decision", async () => {
		const fake = fakeTransport(dropletApi());
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_DROPLET_PRODUCT_ID).reconcile(
				request({
					...dropletRequest,
					desired: { size: "s-1vcpu-1gb", image: "ubuntu-24-04-x64" },
				}),
				fake.transport,
			),
		);
		expect(message).toContain("residency");
	});

	it("reports a size drift rather than powering off a running machine", async () => {
		const fake = fakeTransport(
			dropletApi([
				{
					id: 101,
					name: "edge-1",
					status: "active",
					size_slug: "s-1vcpu-1gb",
					region: { slug: "nyc3" },
					networks: {
						v4: [{ type: "public", ip_address: "203.0.113.7" }],
					},
				},
			]),
		);
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_DROPLET_PRODUCT_ID).reconcile(
				request({
					...dropletRequest,
					desired: {
						region: "nyc3",
						size: "s-2vcpu-4gb",
						image: "ubuntu-24-04-x64",
					},
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.outputs.publicIpv4).toBe("203.0.113.7");
		expect(outcome.diagnostics.join(" ")).toContain("power-off");
	});
});

describe("load balancers", () => {
	const lbRequest = {
		slot: "api",
		productId: DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID,
		logicalId: "public-lb",
		desired: { region: "nyc3" },
	} as const;

	it("creates with a stated default forwarding rule", async () => {
		const fake = fakeTransport(loadBalancerApi());
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID).reconcile(
				request(lbRequest),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("create");
		const create = fake.calls.find(
			(call) => call.method === "POST" && call.path === LOAD_BALANCERS,
		);
		expect(bodyOf(create as RecordedCall).forwarding_rules).toEqual([
			{
				entry_protocol: "http",
				entry_port: 80,
				target_protocol: "http",
				target_port: 80,
			},
		]);
	});

	it("sends the whole body on update, because DigitalOcean's PUT is a replace", async () => {
		const fake = fakeTransport(
			loadBalancerApi([
				{
					id: "lb-1",
					name: "public-lb",
					ip: "203.0.113.10",
					status: "active",
					algorithm: "round_robin",
					redirect_http_to_https: false,
					region: { slug: "nyc3" },
					forwarding_rules: [],
				},
			]),
		);
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_LOAD_BALANCER_PRODUCT_ID).reconcile(
				request({
					...lbRequest,
					desired: { region: "nyc3", algorithm: "least_connections" },
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		const put = fake.calls.find((call) => call.method === "PUT");
		const body = bodyOf(put as RecordedCall);
		expect(body.algorithm).toBe("least_connections");
		expect(body.forwarding_rules).toBeDefined();
		expect(body.region).toBe("nyc3");
	});
});

describe("App Platform apps", () => {
	const appRequest = {
		slot: "web",
		productId: DIGITALOCEAN_APP_SERVICE_PRODUCT_ID,
		logicalId: "storefront",
		desired: {
			spec: {
				region: "nyc",
				services: [{ name: "web", instance_size_slug: "basic-xxs" }],
			},
		},
	} as const;

	it("creates the app and forces the spec name to the resolver's name", async () => {
		const fake = fakeTransport(appApi());
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_APP_SERVICE_PRODUCT_ID).reconcile(
				request(appRequest),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("create");
		const create = fake.calls.find(
			(call) => call.method === "POST" && call.path === APPS,
		);
		expect((bodyOf(create as RecordedCall).spec as Rec).name).toBe(
			"storefront",
		);
	});

	it("makes no update call when the spec already matches, key order aside", async () => {
		const fake = fakeTransport(
			appApi([
				{
					id: "app-1",
					spec: {
						services: [{ instance_size_slug: "basic-xxs", name: "web" }],
						name: "storefront",
						region: "nyc",
					},
					live_url: "https://storefront.ondigitalocean.app",
					active_deployment: { phase: "ACTIVE" },
				},
			]),
		);
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_APP_SERVICE_PRODUCT_ID).reconcile(
				request(appRequest),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.outputs.url).toBe("https://storefront.ondigitalocean.app");
		expect(outcome.diagnostics).toEqual([]);
		expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
	});

	it("refuses to invent a spec", async () => {
		const fake = fakeTransport(appApi());
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_APP_SERVICE_PRODUCT_ID).reconcile(
				request({ ...appRequest, desired: {} }),
				fake.transport,
			),
		);
		expect(message).toContain("desired.spec");
	});
});

describe("credentials are locators and never leak", () => {
	it("sends the token in exactly one place: the authorization header", async () => {
		const fake = fakeTransport(databaseApi());
		const outcome = checked(
			await resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
				request(POSTGRES_REQUEST),
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
		const fake = fakeTransport(databaseApi());
		const resolver = resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID);
		const code = await codeOf(() =>
			resolver.reconcile(
				parseResolveRequest({
					ref: {
						slot: "data",
						productId: DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID,
						logicalId: "ledger",
					},
					desired: { region: "nyc3", size: "db-s-1vcpu-1gb" },
					credentialRef: `dop_v1_${"a".repeat(40)}`,
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_NOT_A_REF");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses when the host resolves the locator to nothing", async () => {
		const fake = fakeTransport(databaseApi());
		const code = await codeOf(() =>
			resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID, {
				resolveCredential: async () => "",
			}).reconcile(request(POSTGRES_REQUEST), fake.transport),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
	});

	it("redacts token-shaped text out of provider error messages", async () => {
		const fake = fakeTransport(() =>
			json(422, {
				id: "unprocessable_entity",
				message: `request ${LEAKED_TOKEN} was rejected`,
			}),
		);
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
				request(POSTGRES_REQUEST),
				fake.transport,
			),
		);
		expect(message).not.toContain(LEAKED_TOKEN);
		expect(message).toContain("[redacted]");
	});

	it("redactDigitalOceanText truncates as well as scrubs", () => {
		expect(redactDigitalOceanText(LEAKED_TOKEN)).toBe("[redacted]");
		// Not token-shaped (no run of 20+ token characters), so this exercises
		// the truncation half rather than the scrubbing half.
		const chatty = "x ".repeat(25);
		expect(redactDigitalOceanText(chatty, 10)).toBe(`${chatty.slice(0, 10)}…`);
	});
});

describe("the transport guard bounds where a token can be sent", () => {
	it("refuses a host that is not api.digitalocean.com", async () => {
		const guarded = guardedDigitalOceanTransport(async () =>
			json(200, { ok: true }),
		);
		await expect(
			guarded({
				method: "GET",
				url: "https://api.digitalocean.example/v2/databases",
				headers: {},
			}),
		).rejects.toThrow();
	});

	it("keeps every real call on the allowlisted host", async () => {
		const fake = fakeTransport(databaseApi());
		await resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID).reconcile(
			request(POSTGRES_REQUEST),
			fake.transport,
		);
		for (const call of fake.calls) {
			expect(call.host).toBe(DIGITALOCEAN_API_HOST);
			expect(call.path.startsWith("/v2/")).toBe(true);
		}
	});
});

describe("a bounded listing refuses rather than concluding 'absent'", () => {
	it("refuses when the page budget runs out before the collection ends", async () => {
		// Every page comes back full, so the lookup never sees the end of the
		// collection and never finds the name.
		const page = Array.from({ length: 200 }, (_, index) => ({
			id: `db-${index}`,
			name: `other-${index}`,
			engine: "pg",
			region: "nyc3",
			size: "db-s-1vcpu-1gb",
			status: "online",
			connection: {},
		}));
		const fake = fakeTransport((call) =>
			call.method === "GET" && call.path === DATABASES
				? json(200, { databases: page })
				: unexpected(call),
		);
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID, {
				maxListPages: 2,
			}).reconcile(request(POSTGRES_REQUEST), fake.transport),
		);
		expect(message).toContain("refuses rather than concluding");
		expect(fake.countOf("POST", DATABASES)).toBe(0);
		expect(fake.countOf("GET", DATABASES)).toBe(2);
	});

	it("refuses an unbounded page budget at construction time", () => {
		expect(() => digitaloceanResolvers(options({ maxListPages: 0 }))).toThrow();
	});
});

describe("Spaces is S3, on its own host with its own credential", () => {
	const SPACES_BUCKET = "/hobo-assets";

	/** A fake Spaces origin: HEAD answers presence, PUT creates, DELETE removes. */
	function spacesApi(
		exists = false,
	): (call: RecordedCall) => TransportResponse {
		let present = exists;
		return (call) => {
			if (call.path !== SPACES_BUCKET) return unexpected(call);
			if (call.method === "HEAD") {
				return present
					? { status: 200, headers: {}, body: "" }
					: { status: 404, headers: {}, body: "" };
			}
			if (call.method === "PUT") {
				present = true;
				return { status: 200, headers: {}, body: "" };
			}
			if (call.method === "DELETE") {
				if (!present) return { status: 404, headers: {}, body: "" };
				present = false;
				return { status: 204, headers: {}, body: "" };
			}
			return unexpected(call);
		};
	}

	const spacesRequest = {
		slot: "bucket",
		productId: DIGITALOCEAN_SPACES_PRODUCT_ID,
		logicalId: "hobo-assets",
		desired: { region: "nyc3" },
	} as const;

	it("creates a bucket that is absent, then makes no second create", async () => {
		const fake = fakeTransport(spacesApi());
		const resolver = resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(spacesRequest), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(spacesRequest), fake.transport),
		);
		expect(first.action).toBe("create");
		expect(second.action).toBe("adopt");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("PUT", SPACES_BUCKET)).toBe(1);
	});

	/**
	 * The load-bearing separation: Spaces gets a SigV4 signature computed from
	 * its own key pair, and the control-plane personal access token appears
	 * nowhere on this path.
	 */
	it("signs with SigV4 and never sends the control-plane token", async () => {
		const fake = fakeTransport(spacesApi());
		await resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID).reconcile(
			request(spacesRequest),
			fake.transport,
		);
		expect(fake.calls.length).toBeGreaterThan(0);
		for (const call of fake.calls) {
			expect(call.host).toBe("nyc3.digitaloceanspaces.com");
			const auth = call.headers.authorization ?? "";
			expect(auth).toContain("AWS4-HMAC-SHA256");
			expect(auth).toContain(SPACES_KEYS.accessKeyId);
			expect(auth).not.toContain(TOKEN);
			expect(auth).not.toContain(SPACES_KEYS.secretAccessKey);
			expect(call.headers["x-amz-content-sha256"]).toBeDefined();
		}
	});

	it("is byte-stable, because the signing clock is injected", async () => {
		const run = async () => {
			const fake = fakeTransport(spacesApi());
			await resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID).reconcile(
				request(spacesRequest),
				fake.transport,
			);
			return fake.calls.map((call) => call.headers.authorization);
		};
		expect(await run()).toEqual(await run());
	});

	/**
	 * The prerequisites are demanded on use, not on build: a registry is a
	 * catalog, and constructing one to reconcile a Postgres cluster must not
	 * fail for want of an object-storage key pair that will never be sent.
	 */
	it("builds the registry even without Spaces prerequisites", () => {
		const registry = digitaloceanResolverRegistry({
			resolveCredential: async () => TOKEN,
		});
		expect(
			registry.get(DIGITALOCEAN_MANAGED_POSTGRES_PRODUCT_ID),
		).toBeDefined();
		expect(registry.get(DIGITALOCEAN_SPACES_PRODUCT_ID)).toBeDefined();
	});

	it("refuses on first use without an injected clock", async () => {
		const fake = fakeTransport(spacesApi());
		const message = await messageOf(() =>
			(
				digitaloceanResolverRegistry({
					resolveCredential: async () => TOKEN,
					resolveSpacesCredential: async () => SPACES_KEYS,
				}).get(DIGITALOCEAN_SPACES_PRODUCT_ID) as ResourceResolver
			).reconcile(request(spacesRequest), fake.transport),
		);
		expect(message).toContain("nowMs");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses on first use without a Spaces credential resolver", async () => {
		const fake = fakeTransport(spacesApi());
		const message = await messageOf(() =>
			(
				digitaloceanResolverRegistry({
					resolveCredential: async () => TOKEN,
					nowMs: NOW_MS,
				}).get(DIGITALOCEAN_SPACES_PRODUCT_ID) as ResourceResolver
			).reconcile(request(spacesRequest), fake.transport),
		);
		expect(message).toContain("resolveSpacesCredential");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses an incomplete key pair rather than half-signing", async () => {
		const fake = fakeTransport(spacesApi());
		const code = await codeOf(() =>
			resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID, {
				resolveSpacesCredential: async () => ({
					accessKeyId: "only-half",
					secretAccessKey: "",
				}),
			}).reconcile(request(spacesRequest), fake.transport),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
		expect(fake.calls).toHaveLength(0);
	});

	/**
	 * Bucket names are global per region, so a 409 is somebody else's bucket.
	 * Adopting it would be worse than failing.
	 */
	it("reports a taken bucket name rather than adopting it", async () => {
		const fake = fakeTransport((call) =>
			call.method === "HEAD"
				? { status: 404, headers: {}, body: "" }
				: { status: 409, headers: {}, body: "" },
		);
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID).reconcile(
				request(spacesRequest),
				fake.transport,
			),
		);
		expect(message).toContain("already taken");
	});

	it("refuses to empty a bucket to make a delete succeed", async () => {
		const fake = fakeTransport((call) =>
			call.method === "DELETE"
				? { status: 409, headers: {}, body: "" }
				: { status: 200, headers: {}, body: "" },
		);
		const message = await messageOf(() =>
			resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID).delete(
				request(spacesRequest),
				fake.transport,
			),
		);
		expect(message).toContain("unbounded data loss");
	});

	it("treats an already-gone bucket as a successful delete", async () => {
		const fake = fakeTransport(spacesApi(false));
		await expect(
			resolverFor(DIGITALOCEAN_SPACES_PRODUCT_ID).delete(
				request(spacesRequest),
				fake.transport,
			),
		).resolves.toBeUndefined();
	});

	it("refuses a Spaces host the guard does not name", async () => {
		const guarded = guardedSpacesTransport(
			async () => ({ status: 200, headers: {}, body: "" }),
			"nyc3",
		);
		await expect(
			guarded({
				method: "HEAD",
				url: "https://ams3.digitaloceanspaces.com/hobo-assets",
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 1024,
			}),
		).rejects.toThrow();
	});
});
