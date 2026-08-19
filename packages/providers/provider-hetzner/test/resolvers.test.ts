/**
 * Hetzner resolver tests, driven entirely through an injected fake
 * `HttpTransport`.
 *
 * The fake is the whole provider: that is what lets a test assert "reconcile
 * twice made exactly one create call" at all, which is the property the
 * resolvers exist to have. Nothing here touches a network, a credential, or a
 * Hetzner project — see the HONEST SCOPE section of `src/resolvers.ts`.
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
	guardedHetznerTransport,
	HETZNER_API_HOST,
	HETZNER_CLOUD_SERVER_PRODUCT_ID,
	HETZNER_DEFAULT_BINDINGS,
	HETZNER_EXCLUDED_SURFACES,
	HETZNER_LOAD_BALANCER_PRODUCT_ID,
	HETZNER_RESOLVED_PRODUCT_IDS,
	HETZNER_UNRESOLVED_PRODUCT_IDS,
	HETZNER_VOLUME_PRODUCT_ID,
	type HetznerResolverOptions,
	hetznerResolverRegistry,
	hetznerResolvers,
	redactHetznerText,
} from "../src/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pact = JSON.parse(
	readFileSync(
		join(packageRoot, "../contracts/provider-hetzner-boundary.pact.json"),
		"utf8",
	),
);

const CREDENTIAL_REF = "env://HCLOUD_TOKEN";
/** A token-shaped project token. Never expected anywhere but one header. */
const TOKEN = "fakehetznerprojecttoken0123456789abcdefgh";
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
		error: {
			code: "internal",
			message: `the fake received an unexpected ${call.method} ${call.path}${call.search}`,
		},
	});
}

function bodyOf(call: RecordedCall): Rec {
	return call.body === undefined ? {} : (JSON.parse(call.body) as Rec);
}

function nameFilter(call: RecordedCall): string | null {
	return new URLSearchParams(call.search).get("name");
}

function options(
	overrides: Partial<HetznerResolverOptions> = {},
): HetznerResolverOptions {
	return { resolveCredential: async () => TOKEN, ...overrides };
}

function resolverFor(
	productId: string,
	overrides: Partial<HetznerResolverOptions> = {},
): ResourceResolver {
	const resolver = hetznerResolverRegistry(options(overrides)).get(productId);
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
// Fake Hetzner Cloud API
// ---------------------------------------------------------------------------

const SERVERS = "/v1/servers";
const LOAD_BALANCERS = "/v1/load_balancers";
const VOLUMES = "/v1/volumes";

function serverApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let servers = [...initial];
	let nextId = 42 + initial.length;
	return (call) => {
		if (call.method === "GET" && call.path === SERVERS) {
			const wanted = nameFilter(call);
			return json(200, {
				servers: servers.filter((entry) => entry.name === wanted),
			});
		}
		if (call.method === "POST" && call.path === SERVERS) {
			const sent = bodyOf(call);
			const created = {
				id: nextId++,
				name: sent.name,
				status: "initializing",
				server_type: { name: sent.server_type },
				datacenter: { location: { name: sent.location } },
				public_net: { ipv4: { ip: "203.0.113.42" } },
			};
			servers.push(created);
			return json(201, {
				server: created,
				action: { id: 900, status: "running", command: "create_server" },
			});
		}
		if (call.method === "DELETE" && call.path.startsWith(`${SERVERS}/`)) {
			const id = Number(call.path.slice(SERVERS.length + 1));
			servers = servers.filter((entry) => entry.id !== id);
			return json(200, { action: { id: 901, status: "running" } });
		}
		return unexpected(call);
	};
}

function loadBalancerApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let balancers = [...initial];
	let nextId = 7 + initial.length;
	return (call) => {
		if (call.method === "GET" && call.path === LOAD_BALANCERS) {
			const wanted = nameFilter(call);
			return json(200, {
				load_balancers: balancers.filter((entry) => entry.name === wanted),
			});
		}
		if (call.method === "POST" && call.path === LOAD_BALANCERS) {
			const sent = bodyOf(call);
			const created = {
				id: nextId++,
				name: sent.name,
				load_balancer_type: { name: sent.load_balancer_type },
				algorithm: sent.algorithm ?? { type: "round_robin" },
				location: { name: sent.location },
				public_net: { ipv4: { ip: "203.0.113.80" } },
			};
			balancers.push(created);
			return json(201, {
				load_balancer: created,
				action: { id: 910, status: "success" },
			});
		}
		if (
			call.method === "POST" &&
			call.path.endsWith("/actions/change_algorithm")
		) {
			const id = Number(call.path.split("/")[3]);
			const sent = bodyOf(call);
			balancers = balancers.map((entry) =>
				entry.id === id ? { ...entry, algorithm: { type: sent.type } } : entry,
			);
			return json(201, { action: { id: 911, status: "success" } });
		}
		if (
			call.method === "DELETE" &&
			call.path.startsWith(`${LOAD_BALANCERS}/`)
		) {
			const id = Number(call.path.slice(LOAD_BALANCERS.length + 1));
			balancers = balancers.filter((entry) => entry.id !== id);
			return noContent();
		}
		return unexpected(call);
	};
}

function volumeApi(
	initial: Rec[] = [],
): (call: RecordedCall) => TransportResponse {
	let volumes = [...initial];
	let nextId = 500 + initial.length;
	return (call) => {
		if (call.method === "GET" && call.path === VOLUMES) {
			const wanted = nameFilter(call);
			return json(200, {
				volumes: volumes.filter((entry) => entry.name === wanted),
			});
		}
		if (call.method === "POST" && call.path === VOLUMES) {
			const sent = bodyOf(call);
			const created = {
				id: nextId++,
				name: sent.name,
				size: sent.size,
				status: "creating",
				location: { name: sent.location },
			};
			volumes.push(created);
			return json(201, {
				volume: created,
				action: { id: 920, status: "running" },
			});
		}
		if (call.method === "POST" && call.path.endsWith("/actions/resize")) {
			const id = Number(call.path.split("/")[3]);
			const sent = bodyOf(call);
			volumes = volumes.map((entry) =>
				entry.id === id ? { ...entry, size: sent.size } : entry,
			);
			return json(201, { action: { id: 921, status: "running" } });
		}
		if (call.method === "DELETE" && call.path.startsWith(`${VOLUMES}/`)) {
			const id = Number(call.path.slice(VOLUMES.length + 1));
			volumes = volumes.filter((entry) => entry.id !== id);
			return noContent();
		}
		return unexpected(call);
	};
}

const SERVER_REQUEST = {
	slot: "web",
	productId: HETZNER_CLOUD_SERVER_PRODUCT_ID,
	logicalId: "api-1",
	desired: { location: "fsn1", serverType: "cx22", image: "ubuntu-24.04" },
} as const;

// ---------------------------------------------------------------------------

describe("the registry covers exactly the products that can converge", () => {
	it("registers a resolver for every resolved product id", () => {
		const registry = hetznerResolverRegistry(options());
		for (const productId of HETZNER_RESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)?.productId).toBe(productId);
		}
	});

	it("registers nothing for a product on a non-allowlisted host", () => {
		const registry = hetznerResolverRegistry(options());
		for (const productId of HETZNER_UNRESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)).toBeUndefined();
		}
		expect(HETZNER_UNRESOLVED_PRODUCT_IDS).toEqual([
			"hetzner.object-storage/v1",
			"hetzner.storage-box/v1",
		]);
	});

	it("names the credential each excluded surface would need", () => {
		expect(HETZNER_EXCLUDED_SURFACES.objectStorage.credential).toContain(
			"SigV4",
		);
		expect(HETZNER_EXCLUDED_SURFACES.robot.credential).toContain("password");
	});

	it("accounts for every catalogued product exactly once", () => {
		const catalogued = new Set(
			Object.values(HETZNER_DEFAULT_BINDINGS)
				.flatMap((entries) => [...(entries ?? [])])
				.map((entry) => entry.productId)
				.filter((id): id is string => typeof id === "string"),
		);
		const accounted = [
			...HETZNER_RESOLVED_PRODUCT_IDS,
			...HETZNER_UNRESOLVED_PRODUCT_IDS,
		].sort();
		expect(accounted).toEqual([...catalogued].sort());
		expect(new Set(accounted).size).toBe(accounted.length);
	});

	it("lists resolvers in id order and stamps the provider target", () => {
		const resolvers = hetznerResolvers(options());
		expect(resolvers.map((entry) => entry.productId)).toEqual(
			[...resolvers.map((entry) => entry.productId)].sort(),
		);
		for (const resolver of resolvers) {
			expect(resolver.providerId).toBe("hetzner");
		}
	});
});

describe("cloud servers converge", () => {
	it("creates a server that is absent, then makes no second create", async () => {
		const fake = fakeTransport(serverApi());
		const resolver = resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(SERVER_REQUEST), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(SERVER_REQUEST), fake.transport),
		);
		expect(first.action).toBe("create");
		expect(second.action).toBe("adopt");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("POST", SERVERS)).toBe(1);
	});

	it("matches the reconcile-twice interaction the pact records", async () => {
		const interaction = pact.interactions.find(
			(entry: { description: string }) =>
				entry.description ===
				"reconcile a cloud server twice: one create call, one stable physicalId",
		);
		const fake = fakeTransport(serverApi());
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
		expect(fake.countOf("POST", SERVERS)).toBe(
			interaction.response.body.createCalls,
		);
		expect(second.action).toBe(interaction.response.body.reconcileTwiceAction);
	});

	it("publishes the action id and says it did not wait on it", async () => {
		const fake = fakeTransport(serverApi());
		const outcome = checked(
			await resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request(SERVER_REQUEST),
				fake.transport,
			),
		);
		expect(outcome.outputs.actionId).toBe(900);
		expect(outcome.diagnostics.join(" ")).toContain("accepted, not confirmed");
		expect(outcome.outputs.ipv4).toBe("203.0.113.42");
	});

	it("refuses to invent a location, because Hetzner's span jurisdictions", async () => {
		const fake = fakeTransport(serverApi());
		const message = await messageOf(() =>
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request({
					...SERVER_REQUEST,
					desired: { serverType: "cx22", image: "ubuntu-24.04" },
				}),
				fake.transport,
			),
		);
		expect(message).toContain("residency");
		expect(fake.countOf("POST", SERVERS)).toBe(0);
	});

	it("refuses to invent a server type", async () => {
		const fake = fakeTransport(serverApi());
		const code = await codeOf(() =>
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request({
					...SERVER_REQUEST,
					desired: { location: "fsn1", image: "ubuntu-24.04" },
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_PRODUCT_UNSUPPORTED");
	});

	it("reports a type drift rather than powering off a running machine", async () => {
		const fake = fakeTransport(
			serverApi([
				{
					id: 42,
					name: "api-1",
					status: "running",
					server_type: { name: "cx22" },
					datacenter: { location: { name: "fsn1" } },
					public_net: { ipv4: { ip: "203.0.113.42" } },
				},
			]),
		);
		const outcome = checked(
			await resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request({
					...SERVER_REQUEST,
					desired: {
						location: "fsn1",
						serverType: "cx32",
						image: "ubuntu-24.04",
					},
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.diagnostics.join(" ")).toContain("power-off");
	});

	it("reports an immutable location drift instead of destroying the machine", async () => {
		const fake = fakeTransport(
			serverApi([
				{
					id: 42,
					name: "api-1",
					status: "running",
					server_type: { name: "cx22" },
					datacenter: { location: { name: "ash" } },
					public_net: { ipv4: { ip: "203.0.113.42" } },
				},
			]),
		);
		const outcome = checked(
			(await resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).read(
				request(SERVER_REQUEST),
				fake.transport,
			)) as ResolveOutcome,
		);
		expect(outcome.action).not.toBe("replace");
		expect(outcome.diagnostics.join(" ")).toContain("cannot be moved");
	});

	it("deletes what exists and treats already-gone as success", async () => {
		const fake = fakeTransport(
			serverApi([
				{
					id: 42,
					name: "api-1",
					status: "running",
					server_type: { name: "cx22" },
					datacenter: { location: { name: "fsn1" } },
					public_net: { ipv4: { ip: "203.0.113.42" } },
				},
			]),
		);
		const resolver = resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID);
		await resolver.delete(request(SERVER_REQUEST), fake.transport);
		await expect(
			resolver.delete(request(SERVER_REQUEST), fake.transport),
		).resolves.toBeUndefined();
		expect(fake.calls.filter((call) => call.method === "DELETE")).toHaveLength(
			1,
		);
	});

	it("read answers undefined for a server that is not there", async () => {
		const fake = fakeTransport(serverApi());
		await expect(
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).read(
				request(SERVER_REQUEST),
				fake.transport,
			),
		).resolves.toBeUndefined();
	});

	it("asks the API for the exact name rather than scanning pages", async () => {
		const fake = fakeTransport(serverApi());
		await resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).read(
			request(SERVER_REQUEST),
			fake.transport,
		);
		expect(fake.calls).toHaveLength(1);
		expect(nameFilter(fake.calls[0] as RecordedCall)).toBe("api-1");
	});

	it("refuses when the exact filter somehow matches twice", async () => {
		const twin = {
			id: 42,
			name: "api-1",
			status: "running",
			server_type: { name: "cx22" },
			datacenter: { location: { name: "fsn1" } },
			public_net: { ipv4: { ip: "203.0.113.42" } },
		};
		const fake = fakeTransport(serverApi([twin, { ...twin, id: 43 }]));
		const message = await messageOf(() =>
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request(SERVER_REQUEST),
				fake.transport,
			),
		);
		expect(message).toContain("matched 2 records");
		expect(fake.countOf("POST", SERVERS)).toBe(0);
	});
});

describe("load balancers", () => {
	const lbRequest = {
		slot: "api",
		productId: HETZNER_LOAD_BALANCER_PRODUCT_ID,
		logicalId: "public-lb",
		desired: { location: "fsn1", loadBalancerType: "lb11" },
	} as const;

	it("creates once and adopts thereafter", async () => {
		const fake = fakeTransport(loadBalancerApi());
		const resolver = resolverFor(HETZNER_LOAD_BALANCER_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(lbRequest), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(lbRequest), fake.transport),
		);
		expect(first.action).toBe("create");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("POST", LOAD_BALANCERS)).toBe(1);
		expect(first.outputs.ipv4).toBe("203.0.113.80");
	});

	/**
	 * The algorithm has its own action endpoint; Hetzner's top-level PUT only
	 * changes name and labels, so sending it there would silently do nothing.
	 */
	it("changes the algorithm through its action endpoint, not the PUT", async () => {
		const fake = fakeTransport(
			loadBalancerApi([
				{
					id: 7,
					name: "public-lb",
					load_balancer_type: { name: "lb11" },
					algorithm: { type: "round_robin" },
					location: { name: "fsn1" },
					public_net: { ipv4: { ip: "203.0.113.80" } },
				},
			]),
		);
		const outcome = checked(
			await resolverFor(HETZNER_LOAD_BALANCER_PRODUCT_ID).reconcile(
				request({
					...lbRequest,
					desired: {
						location: "fsn1",
						loadBalancerType: "lb11",
						algorithm: "least_connections",
					},
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		expect(outcome.outputs.algorithm).toBe("least_connections");
		expect(fake.calls.some((call) => call.method === "PUT")).toBe(false);
		expect(
			fake.calls.some((call) =>
				call.path.endsWith("/actions/change_algorithm"),
			),
		).toBe(true);
	});
});

describe("volumes", () => {
	const volumeRequest = {
		slot: "bucket",
		productId: HETZNER_VOLUME_PRODUCT_ID,
		logicalId: "data-1",
		desired: { location: "fsn1", sizeGb: 10 },
	} as const;

	it("creates once and adopts thereafter", async () => {
		const fake = fakeTransport(volumeApi());
		const resolver = resolverFor(HETZNER_VOLUME_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(volumeRequest), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(volumeRequest), fake.transport),
		);
		expect(first.action).toBe("create");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("POST", VOLUMES)).toBe(1);
	});

	it("refuses to invent a size", async () => {
		const fake = fakeTransport(volumeApi());
		const code = await codeOf(() =>
			resolverFor(HETZNER_VOLUME_PRODUCT_ID).reconcile(
				request({ ...volumeRequest, desired: { location: "fsn1" } }),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_PRODUCT_UNSUPPORTED");
	});

	it("grows a volume and says the filesystem still needs extending", async () => {
		const fake = fakeTransport(
			volumeApi([
				{
					id: 500,
					name: "data-1",
					size: 10,
					status: "available",
					location: { name: "fsn1" },
				},
			]),
		);
		const outcome = checked(
			await resolverFor(HETZNER_VOLUME_PRODUCT_ID).reconcile(
				request({
					...volumeRequest,
					desired: { location: "fsn1", sizeGb: 50 },
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		expect(outcome.outputs.sizeGb).toBe(50);
		expect(outcome.diagnostics.join(" ")).toContain("filesystem extended");
	});

	it("reports a shrink as drift rather than replacing the volume", async () => {
		const fake = fakeTransport(
			volumeApi([
				{
					id: 500,
					name: "data-1",
					size: 50,
					status: "available",
					location: { name: "fsn1" },
				},
			]),
		);
		const outcome = checked(
			await resolverFor(HETZNER_VOLUME_PRODUCT_ID).reconcile(
				request({
					...volumeRequest,
					desired: { location: "fsn1", sizeGb: 10 },
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.diagnostics.join(" ")).toContain("only grow");
		expect(
			fake.calls.some((call) => call.path.endsWith("/actions/resize")),
		).toBe(false);
	});
});

describe("credentials are locators and never leak", () => {
	it("sends the token in exactly one place: the authorization header", async () => {
		const fake = fakeTransport(serverApi());
		const outcome = checked(
			await resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request(SERVER_REQUEST),
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
		const fake = fakeTransport(serverApi());
		const code = await codeOf(() =>
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				parseResolveRequest({
					ref: {
						slot: "web",
						productId: HETZNER_CLOUD_SERVER_PRODUCT_ID,
						logicalId: "api-1",
					},
					desired: SERVER_REQUEST.desired,
					credentialRef: "a".repeat(64),
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_NOT_A_REF");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses when the host resolves the locator to nothing", async () => {
		const fake = fakeTransport(serverApi());
		const code = await codeOf(() =>
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID, {
				resolveCredential: async () => "",
			}).reconcile(request(SERVER_REQUEST), fake.transport),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
	});

	it("redacts token-shaped text out of provider error messages", async () => {
		const fake = fakeTransport(() =>
			json(422, {
				error: {
					code: "invalid_input",
					message: `request ${LEAKED_TOKEN} was rejected`,
				},
			}),
		);
		const message = await messageOf(() =>
			resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
				request(SERVER_REQUEST),
				fake.transport,
			),
		);
		expect(message).not.toContain(LEAKED_TOKEN);
		expect(message).toContain("[redacted]");
	});

	it("redactHetznerText truncates as well as scrubs", () => {
		expect(redactHetznerText(LEAKED_TOKEN)).toBe("[redacted]");
		const chatty = "x ".repeat(25);
		expect(redactHetznerText(chatty, 10)).toBe(`${chatty.slice(0, 10)}…`);
	});
});

describe("the transport guard bounds where a token can be sent", () => {
	it("refuses a host that is not api.hetzner.cloud", async () => {
		const guarded = guardedHetznerTransport(async () => json(200, {}));
		await expect(
			guarded({
				method: "GET",
				url: "https://api.hetzner.example/v1/servers",
				headers: {},
			}),
		).rejects.toThrow();
	});

	it("refuses the Object Storage host the excluded-surface list names", async () => {
		const guarded = guardedHetznerTransport(async () => json(200, {}));
		await expect(
			guarded({
				method: "GET",
				url: "https://fsn1.your-objectstorage.com/v1/bucket",
				headers: {},
			}),
		).rejects.toThrow();
	});

	it("keeps every real call on the allowlisted host", async () => {
		const fake = fakeTransport(serverApi());
		await resolverFor(HETZNER_CLOUD_SERVER_PRODUCT_ID).reconcile(
			request(SERVER_REQUEST),
			fake.transport,
		);
		for (const call of fake.calls) {
			expect(call.host).toBe(HETZNER_API_HOST);
			expect(call.path.startsWith("/v1/")).toBe(true);
		}
	});
});
