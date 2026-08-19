/**
 * Kubernetes resolver tests, driven entirely through an injected fake
 * `HttpTransport`.
 *
 * The fake is the whole apiserver: that is what lets a test assert "reconcile
 * twice made exactly one create call" at all, which is the property the
 * resolvers exist to have. Nothing here touches a network, a credential, or a
 * cluster — see the HONEST SCOPE section of `src/resolvers.ts`.
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
	guardedKubernetesTransport,
	KUBERNETES_CRONJOB_PRODUCT_ID,
	KUBERNETES_DEFAULT_BINDINGS,
	KUBERNETES_DEPLOYMENT_PRODUCT_ID,
	KUBERNETES_JOB_PRODUCT_ID,
	KUBERNETES_PVC_PRODUCT_ID,
	KUBERNETES_RESOLVED_PRODUCT_IDS,
	KUBERNETES_SERVICE_PRODUCT_ID,
	KUBERNETES_UNRESOLVED_PRODUCT_IDS,
	type KubernetesResolverOptions,
	kubernetesResolverRegistry,
	kubernetesResolvers,
	RESOLVER_ALLOWED_PATH_PREFIXES,
} from "../src/index.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pact = JSON.parse(
	readFileSync(
		join(packageRoot, "../contracts/provider-kubernetes-boundary.pact.json"),
		"utf8",
	),
);

const API_SERVER = "https://cluster.example:6443";
const CREDENTIAL_REF = "secret://camp/cluster-token";
/** A compact JWS, as a projected ServiceAccount token looks. */
const TOKEN =
	"eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6c2hvcDpob2JvIn0.c2lnbmF0dXJlLXZhbHVl";

type Rec = Record<string, unknown>;

interface RecordedCall {
	readonly method: string;
	readonly host: string;
	readonly path: string;
	readonly body: string | undefined;
	readonly headers: Readonly<Record<string, string>>;
}

interface Fake {
	readonly transport: HttpTransport;
	readonly calls: readonly RecordedCall[];
	countOf(method: string): number;
}

function record(request: TransportRequest): RecordedCall {
	const url = new URL(request.url);
	return {
		method: request.method,
		host: url.host,
		path: url.pathname,
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
		countOf(method) {
			return calls.filter((call) => call.method === method).length;
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

function status(
	code: number,
	reason: string,
	message: string,
): TransportResponse {
	return json(code, {
		kind: "Status",
		apiVersion: "v1",
		status: "Failure",
		reason,
		message,
		code,
	});
}

function notFound(): TransportResponse {
	return status(
		404,
		"NotFound",
		"the server could not find the requested resource",
	);
}

function bodyOf(call: RecordedCall): Rec {
	return call.body === undefined ? {} : (JSON.parse(call.body) as Rec);
}

function options(
	overrides: Partial<KubernetesResolverOptions> = {},
): KubernetesResolverOptions {
	return {
		apiServerUrl: API_SERVER,
		resolveCredential: async () => TOKEN,
		...overrides,
	};
}

function resolverFor(
	productId: string,
	overrides: Partial<KubernetesResolverOptions> = {},
): ResourceResolver {
	const resolver = kubernetesResolverRegistry(options(overrides)).get(
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
// A fake apiserver holding one namespaced collection
// ---------------------------------------------------------------------------

/**
 * Models one kind's collection under one namespace: GET/POST/PATCH/DELETE at
 * the paths the resolvers compose, and 404 for anything not stored.
 */
function collection(
	collectionPath: string,
	initial?: Rec,
): (call: RecordedCall) => TransportResponse {
	let object = initial;
	const itemPath = `${collectionPath}/api`;
	return (call) => {
		if (call.method === "GET" && call.path === itemPath) {
			return object === undefined ? notFound() : json(200, object);
		}
		if (call.method === "POST" && call.path === collectionPath) {
			const sent = bodyOf(call);
			object = {
				...sent,
				metadata: {
					...((sent.metadata as Rec) ?? {}),
					uid: "11111111-2222-3333-4444-555555555555",
				},
			};
			return json(201, object);
		}
		if (call.method === "PATCH" && call.path === itemPath) {
			const sent = bodyOf(call);
			object = { ...(object as Rec), spec: sent.spec };
			return json(200, object);
		}
		if (call.method === "DELETE" && call.path === itemPath) {
			if (object === undefined) return notFound();
			object = undefined;
			return json(200, { kind: "Status", status: "Success" });
		}
		return status(
			500,
			"InternalError",
			`unexpected ${call.method} ${call.path}`,
		);
	};
}

const DEPLOYMENTS = "/apis/apps/v1/namespaces/shop/deployments";
const SERVICES = "/api/v1/namespaces/shop/services";
const JOBS = "/apis/batch/v1/namespaces/shop/jobs";
const CRONJOBS = "/apis/batch/v1/namespaces/shop/cronjobs";
const PVCS = "/api/v1/namespaces/shop/persistentvolumeclaims";

const DEPLOYMENT_REQUEST = {
	slot: "web",
	productId: KUBERNETES_DEPLOYMENT_PRODUCT_ID,
	logicalId: "api",
	desired: { namespace: "shop", spec: { replicas: 2 } },
} as const;

// ---------------------------------------------------------------------------

describe("the registry covers the built-in objects and only those", () => {
	it("registers a resolver for every resolved product id", () => {
		const registry = kubernetesResolverRegistry(options());
		for (const productId of KUBERNETES_RESOLVED_PRODUCT_IDS) {
			expect(registry.get(productId)?.productId).toBe(productId);
		}
	});

	/**
	 * Creating a Secret means putting its contents in `desired`, and `desired`
	 * is recorded in the event log. The catalog row stays — it is a locator.
	 */
	it("registers nothing for the Secret locator row", () => {
		const registry = kubernetesResolverRegistry(options());
		expect(KUBERNETES_UNRESOLVED_PRODUCT_IDS).toEqual(["kubernetes.secret/v1"]);
		expect(registry.get("kubernetes.secret/v1")).toBeUndefined();
	});

	it("accounts for every catalogued product exactly once", () => {
		const catalogued = new Set(
			Object.values(KUBERNETES_DEFAULT_BINDINGS)
				.flatMap((entries) => [...(entries ?? [])])
				.map((entry) => entry.productId)
				.filter((id): id is string => typeof id === "string"),
		);
		const accounted = [
			...KUBERNETES_RESOLVED_PRODUCT_IDS,
			...KUBERNETES_UNRESOLVED_PRODUCT_IDS,
		].sort();
		expect(accounted).toEqual([...catalogued].sort());
		expect(new Set(accounted).size).toBe(accounted.length);
	});

	it("lists resolvers in id order and stamps the provider target", () => {
		const resolvers = kubernetesResolvers(options());
		expect(resolvers.map((entry) => entry.productId)).toEqual(
			[...resolvers.map((entry) => entry.productId)].sort(),
		);
		for (const resolver of resolvers) {
			expect(resolver.providerId).toBe("kubernetes");
		}
	});
});

describe("built-in objects converge", () => {
	it("creates an object that is absent, then makes no second create", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const resolver = resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID);
		const first = checked(
			await resolver.reconcile(request(DEPLOYMENT_REQUEST), fake.transport),
		);
		const second = checked(
			await resolver.reconcile(request(DEPLOYMENT_REQUEST), fake.transport),
		);
		expect(first.action).toBe("create");
		expect(second.action).toBe("adopt");
		expect(second.physicalId).toBe(first.physicalId);
		expect(fake.countOf("POST")).toBe(1);
	});

	it("matches the reconcile-twice interaction the pact records", async () => {
		const interaction = pact.interactions.find(
			(entry: { description: string }) =>
				entry.description ===
				"reconcile a Deployment twice: one create call, one stable physicalId",
		);
		const fake = fakeTransport(collection(DEPLOYMENTS));
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
		expect(first.physicalId).toBe(interaction.response.body.physicalId);
		expect(fake.countOf("POST")).toBe(interaction.response.body.createCalls);
		expect(second.action).toBe(interaction.response.body.reconcileTwiceAction);
	});

	it("sends the object the request authored, with name and namespace it owns", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		await resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
			request({
				...DEPLOYMENT_REQUEST,
				desired: {
					namespace: "shop",
					spec: { replicas: 2 },
					labels: { "app.kubernetes.io/name": "api" },
				},
			}),
			fake.transport,
		);
		const create = fake.calls.find((call) => call.method === "POST");
		const sent = bodyOf(create as RecordedCall);
		expect(sent.apiVersion).toBe("apps/v1");
		expect(sent.kind).toBe("Deployment");
		expect(sent.metadata).toEqual({
			name: "api",
			namespace: "shop",
			labels: { "app.kubernetes.io/name": "api" },
		});
		expect(sent.spec).toEqual({ replicas: 2 });
	});

	it("patches a mutable spec with a merge patch, not a strategic one", async () => {
		const fake = fakeTransport(
			collection(DEPLOYMENTS, {
				apiVersion: "apps/v1",
				kind: "Deployment",
				metadata: { name: "api", namespace: "shop", uid: "abc" },
				spec: { replicas: 1 },
			}),
		);
		const outcome = checked(
			await resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				request(DEPLOYMENT_REQUEST),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("update");
		const patch = fake.calls.find((call) => call.method === "PATCH");
		expect(patch?.headers["content-type"]).toBe("application/merge-patch+json");
		expect(bodyOf(patch as RecordedCall)).toEqual({ spec: { replicas: 2 } });
	});

	it("publishes the in-cluster DNS name for a Service and no external URL", async () => {
		const fake = fakeTransport(collection(SERVICES));
		const outcome = checked(
			await resolverFor(KUBERNETES_SERVICE_PRODUCT_ID).reconcile(
				request({
					slot: "api",
					productId: KUBERNETES_SERVICE_PRODUCT_ID,
					logicalId: "api",
					desired: { namespace: "shop", spec: { ports: [{ port: 80 }] } },
				}),
				fake.transport,
			),
		);
		expect(outcome.outputs.clusterDns).toBe("api.shop.svc.cluster.local");
		expect(JSON.stringify(outcome.outputs)).not.toContain("http");
	});

	it("routes each kind to its own API root", async () => {
		for (const [productId, slot, path] of [
			[KUBERNETES_JOB_PRODUCT_ID, "service", JOBS],
			[KUBERNETES_CRONJOB_PRODUCT_ID, "service", CRONJOBS],
			[KUBERNETES_PVC_PRODUCT_ID, "bucket", PVCS],
		] as const) {
			const fake = fakeTransport(collection(path));
			await resolverFor(productId).reconcile(
				request({
					slot,
					productId,
					logicalId: "api",
					desired: { namespace: "shop", spec: {} },
				}),
				fake.transport,
			);
			expect(fake.calls.every((call) => call.path.startsWith(path))).toBe(true);
		}
	});

	it("deletes what exists and treats already-gone as success", async () => {
		const fake = fakeTransport(
			collection(DEPLOYMENTS, {
				apiVersion: "apps/v1",
				kind: "Deployment",
				metadata: { name: "api", namespace: "shop" },
				spec: { replicas: 2 },
			}),
		);
		const resolver = resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID);
		await resolver.delete(request(DEPLOYMENT_REQUEST), fake.transport);
		await expect(
			resolver.delete(request(DEPLOYMENT_REQUEST), fake.transport),
		).resolves.toBeUndefined();
	});

	it("read answers undefined for an object that is not there", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		await expect(
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).read(
				request(DEPLOYMENT_REQUEST),
				fake.transport,
			),
		).resolves.toBeUndefined();
	});
});

describe("immutable specs are reported, never converged", () => {
	/**
	 * A Job's pod template is immutable and a PVC's storage class is fixed at
	 * creation; "converging" either means deleting the object, which for a PVC
	 * destroys data and for a Job discards a completed run.
	 */
	it.each([
		[KUBERNETES_JOB_PRODUCT_ID, "service", JOBS],
		[KUBERNETES_PVC_PRODUCT_ID, "bucket", PVCS],
	] as const)("reports drift on %s rather than patching it", async (productId, slot, path) => {
		const fake = fakeTransport(
			collection(path, {
				metadata: { name: "api", namespace: "shop" },
				spec: { parallelism: 1 },
			}),
		);
		const outcome = checked(
			await resolverFor(productId).reconcile(
				request({
					slot,
					productId,
					logicalId: "api",
					desired: { namespace: "shop", spec: { parallelism: 4 } },
				}),
				fake.transport,
			),
		);
		expect(outcome.action).toBe("adopt");
		expect(fake.countOf("PATCH")).toBe(0);
		expect(outcome.diagnostics.join(" ")).toContain("fixed at creation");
	});
});

describe("the namespace is never defaulted", () => {
	it("refuses a request that names no namespace", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const message = await messageOf(() =>
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				request({
					...DEPLOYMENT_REQUEST,
					desired: { spec: { replicas: 2 } },
				}),
				fake.transport,
			),
		);
		expect(message).toContain('never falls back to "default"');
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses a name the apiserver would reject anyway", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const code = await codeOf(() =>
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				request({
					...DEPLOYMENT_REQUEST,
					desired: {
						name: "Not_A_Valid_Name",
						namespace: "shop",
						spec: {},
					},
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_PRODUCT_UNSUPPORTED");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses to invent a spec", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const message = await messageOf(() =>
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				request({ ...DEPLOYMENT_REQUEST, desired: { namespace: "shop" } }),
				fake.transport,
			),
		);
		expect(message).toContain("desired.spec");
	});
});

describe("credentials are locators and never leak", () => {
	it("sends the token in exactly one place: the authorization header", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const outcome = checked(
			await resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				request(DEPLOYMENT_REQUEST),
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

	it("refuses a credentialRef that is the ServiceAccount token itself", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const code = await codeOf(() =>
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				parseResolveRequest({
					ref: {
						slot: "web",
						productId: KUBERNETES_DEPLOYMENT_PRODUCT_ID,
						logicalId: "api",
					},
					desired: { namespace: "shop", spec: {} },
					credentialRef: TOKEN,
				}),
				fake.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_NOT_A_REF");
		expect(fake.calls).toHaveLength(0);
	});

	it("refuses when the host resolves the locator to nothing", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		const code = await codeOf(() =>
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID, {
				resolveCredential: async () => "",
			}).reconcile(request(DEPLOYMENT_REQUEST), fake.transport),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
	});

	/**
	 * An apiserver `Status` routinely quotes the object that caused it, and
	 * those objects carry ServiceAccount tokens and imagePullSecrets.
	 */
	it("redacts a token the apiserver echoed back in a Status message", async () => {
		const fake = fakeTransport(() =>
			status(403, "Forbidden", `rejected object with token ${TOKEN}`),
		);
		const message = await messageOf(() =>
			resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
				request(DEPLOYMENT_REQUEST),
				fake.transport,
			),
		);
		expect(message).not.toContain(TOKEN);
		expect(message).toContain("[redacted]");
		expect(message).toContain("Forbidden");
	});
});

describe("the transport guard bounds where a token can be sent", () => {
	it("refuses a host that is not the configured apiserver", async () => {
		const guarded = guardedKubernetesTransport(
			async () => json(200, {}),
			API_SERVER,
		);
		await expect(
			guarded({
				method: "GET",
				url: "https://other.example:6443/api/v1/namespaces/shop/services",
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 1024,
			}),
		).rejects.toThrow();
	});

	it("refuses an API root outside the allowlist on the right host", async () => {
		const guarded = guardedKubernetesTransport(
			async () => json(200, {}),
			API_SERVER,
		);
		await expect(
			guarded({
				method: "GET",
				url: `${API_SERVER}/apis/rbac.authorization.k8s.io/v1/clusterroles`,
				headers: {},
				timeoutMs: 1000,
				maxResponseBytes: 1024,
			}),
		).rejects.toThrow();
	});

	/**
	 * The documented capability difference between this path and the driver's:
	 * `kubectl proxy` serves cleartext on loopback, the driver supports it
	 * behind an explicit opt-in, and the resolver path does not — because core's
	 * guard is HTTPS-only and a projected token is in every header here.
	 */
	it("refuses a kubectl-proxy apiserver at construction time, with the reason", () => {
		expect(() =>
			kubernetesResolvers(options({ apiServerUrl: "http://127.0.0.1:8001" })),
		).toThrow(/kubectl proxy/);
	});

	it("refuses an apiserver url that does not parse", () => {
		expect(() =>
			kubernetesResolvers(options({ apiServerUrl: "not a url" })),
		).toThrow();
	});

	it("keeps every real call on the apiserver and inside the allowlist", async () => {
		const fake = fakeTransport(collection(DEPLOYMENTS));
		await resolverFor(KUBERNETES_DEPLOYMENT_PRODUCT_ID).reconcile(
			request(DEPLOYMENT_REQUEST),
			fake.transport,
		);
		for (const call of fake.calls) {
			expect(call.host).toBe("cluster.example:6443");
			expect(
				RESOLVER_ALLOWED_PATH_PREFIXES.some((prefix) =>
					call.path.startsWith(prefix),
				),
			).toBe(true);
		}
	});
});
