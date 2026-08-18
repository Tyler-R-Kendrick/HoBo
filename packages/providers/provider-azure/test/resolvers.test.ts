/**
 * Azure ARM resolver tests, driven entirely through an injected fake transport
 * that models one subscription. Nothing here touches a network, and that is the
 * point: the fake *is* the provider, which is what makes "exactly one create
 * call" and "the same physicalId twice" assertable at all.
 *
 * HONEST SCOPE: passing this file proves the request/response shapes this
 * package composes and accepts. It proves nothing about a live Azure deploy —
 * that additionally needs real credentials, real egress, a real subscription,
 * and api-versions verified against the running service.
 */

import type {
	CapabilitySlot,
	HttpTransport,
	ResolverError,
	TransportRequest,
	TransportResponse,
} from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	AZURE_BLOB_STORAGE_PRODUCT_ID,
	AZURE_CONTAINER_APPS_API_VERSION,
	AZURE_CONTAINER_APPS_PRODUCT_ID,
	AZURE_COSMOS_API_VERSION,
	AZURE_COSMOS_DB_PRODUCT_ID,
	AZURE_KEY_VAULT_API_VERSION,
	AZURE_KEY_VAULT_PRODUCT_ID,
	AZURE_RESOLVED_PRODUCT_IDS,
	AZURE_SERVICE_BUS_API_VERSION,
	AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
	AZURE_SERVICE_BUS_TOPIC_PRODUCT_ID,
	AZURE_STORAGE_API_VERSION,
	AZURE_STORAGE_QUEUE_PRODUCT_ID,
	AZURE_UNRESOLVED_PRODUCT_IDS,
	azureResolverRegistry,
	azureResolvers,
	azureYardSpec,
	guardedAzureTransport,
	redactAzureText,
} from "../src/index.js";

const SUBSCRIPTION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const RESOURCE_GROUP = "hobo-rg";
const CREDENTIAL_REF = "env://AZURE_ARM_ACCESS_TOKEN";
/** The resolved material. It must appear in exactly one place: a header. */
const TOKEN = "hobo.arm.bearer.token.0123456789abcdefghij";
/** A 40-character token-shaped string, as ARM echoes request context. */
const LEAKED_SECRET = "abcdefghij0123456789ABCDEFGHIJ0123456789";

const STORAGE_ACCOUNT = "hobostorage";
const SERVICE_BUS_NAMESPACE = "hobo-bus";

const GROUP_PREFIX = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}`;
const STORAGE_ACCOUNT_PATH = `${GROUP_PREFIX}/providers/Microsoft.Storage/storageAccounts/${STORAGE_ACCOUNT}`;
const SERVICE_BUS_NAMESPACE_PATH = `${GROUP_PREFIX}/providers/Microsoft.ServiceBus/namespaces/${SERVICE_BUS_NAMESPACE}`;

/** Where the fake parks its long-running operations. Subscription-scoped, so
 *  the guard's `/subscriptions/` prefix admits it exactly as ARM's own are. */
const OPERATION_PATH = `/subscriptions/${SUBSCRIPTION_ID}/providers/Microsoft.Test/locations/eastus/asyncOperations/op-1`;
const OPERATION_URL = `https://management.azure.com${OPERATION_PATH}?api-version=2023-05-01`;

// ---------------------------------------------------------------------------
// The fake subscription
// ---------------------------------------------------------------------------

interface RecordedCall {
	readonly method: string;
	readonly path: string;
	readonly apiVersion: string | null;
	readonly body: string | undefined;
	readonly headers: Readonly<Record<string, string>>;
}

type WriteMode =
	| "sync"
	| "async-operation"
	| "location"
	| "provisioning"
	| "bare-202"
	| "foreign-operation";

interface ArmOptions {
	/** Resources that already exist, keyed by ARM resource id (the URL path). */
	readonly seed?: Readonly<Record<string, Record<string, unknown>>>;
	readonly writeMode?: WriteMode;
	/** How many operation polls answer `InProgress` before `Succeeded`. */
	readonly inProgressPolls?: number;
	/** When set, the operation settles into this terminal state instead. */
	readonly operationFailure?: string;
	/** Force a response for any call, bypassing the store. */
	readonly override?: (call: RecordedCall) => TransportResponse | undefined;
}

interface Arm {
	readonly transport: HttpTransport;
	readonly calls: readonly RecordedCall[];
	countOf(method: string, path: string): number;
	has(path: string): boolean;
}

function json(status: number, payload: unknown): TransportResponse {
	return {
		status,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	};
}

function notFound(): TransportResponse {
	return json(404, {
		error: { code: "ResourceNotFound", message: "resource was not found" },
	});
}

function lastSegment(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1] ?? "";
}

/**
 * A fake ARM. `PUT` stores the resource under the id it was addressed by, which
 * is what makes idempotent-PUT-plus-deterministic-name observable: a second
 * reconcile GETs the same id and finds it.
 */
function createArm(options: ArmOptions = {}): Arm {
	const store = new Map<string, Record<string, unknown>>(
		Object.entries(options.seed ?? {}),
	);
	const calls: RecordedCall[] = [];
	const writeMode: WriteMode = options.writeMode ?? "sync";
	let inProgressPolls = options.inProgressPolls ?? 0;

	function applyWrite(
		call: RecordedCall,
		merge: boolean,
	): Record<string, unknown> {
		const payload =
			call.body === undefined
				? {}
				: (JSON.parse(call.body) as Record<string, unknown>);
		const previous = store.get(call.path) ?? {};
		const previousProperties =
			merge && typeof previous.properties === "object" && previous.properties
				? (previous.properties as Record<string, unknown>)
				: {};
		const payloadProperties =
			typeof payload.properties === "object" && payload.properties
				? (payload.properties as Record<string, unknown>)
				: {};
		const body: Record<string, unknown> = {
			id: call.path,
			name: lastSegment(call.path),
			...(typeof payload.location === "string"
				? { location: payload.location }
				: typeof previous.location === "string"
					? { location: previous.location }
					: {}),
			properties: {
				...previousProperties,
				...payloadProperties,
				provisioningState: "Succeeded",
			},
		};
		store.set(call.path, body);
		return body;
	}

	function writeResponse(body: Record<string, unknown>): TransportResponse {
		switch (writeMode) {
			case "async-operation":
				return {
					status: 202,
					headers: { "azure-asyncoperation": OPERATION_URL },
					body: "",
				};
			case "location":
				return {
					status: 202,
					headers: {
						location: `https://management.azure.com${String(body.id)}?api-version=${AZURE_COSMOS_API_VERSION}`,
					},
					body: "",
				};
			case "provisioning": {
				const properties = body.properties as Record<string, unknown>;
				return json(200, {
					...body,
					properties: { ...properties, provisioningState: "Creating" },
				});
			}
			case "bare-202":
				return { status: 202, headers: {}, body: "" };
			case "foreign-operation":
				return {
					status: 202,
					headers: {
						"azure-asyncoperation":
							"https://attacker.example.com/subscriptions/steal",
					},
					body: "",
				};
			default:
				return json(201, body);
		}
	}

	function handle(call: RecordedCall): TransportResponse {
		const forced = options.override?.(call);
		if (forced !== undefined) return forced;

		if (call.path === OPERATION_PATH) {
			if (inProgressPolls > 0) {
				inProgressPolls -= 1;
				return json(200, { status: "InProgress" });
			}
			if (options.operationFailure !== undefined) {
				return json(200, {
					status: options.operationFailure,
					error: {
						code: "DeploymentFailed",
						message: `quota exceeded for ${LEAKED_SECRET}`,
					},
				});
			}
			return json(200, { status: "Succeeded" });
		}

		switch (call.method) {
			case "GET": {
				const found = store.get(call.path);
				return found === undefined ? notFound() : json(200, found);
			}
			case "PUT":
				return writeResponse(applyWrite(call, false));
			case "PATCH":
				return writeResponse(applyWrite(call, true));
			case "DELETE": {
				if (!store.has(call.path)) return notFound();
				store.delete(call.path);
				return { status: 200, headers: {}, body: "" };
			}
			default:
				return notFound();
		}
	}

	const transport: HttpTransport = async (request: TransportRequest) => {
		const url = new URL(request.url);
		const call: RecordedCall = {
			method: request.method,
			path: url.pathname,
			apiVersion: url.searchParams.get("api-version"),
			body: request.body,
			headers: request.headers,
		};
		calls.push(call);
		return handle(call);
	};

	return {
		transport: guardedAzureTransport(transport),
		calls,
		countOf(method, path) {
			return calls.filter(
				(call) => call.method === method && call.path === path,
			).length;
		},
		has(path) {
			return store.has(path);
		},
	};
}

// ---------------------------------------------------------------------------
// Resolver construction
// ---------------------------------------------------------------------------

function registry(overrides?: {
	readonly resolveCredential?: (ref: string) => Promise<string>;
	readonly pollBudget?: number;
	readonly waitBetweenPolls?: (attempt: number) => Promise<void>;
}) {
	return azureResolverRegistry({
		subscriptionId: SUBSCRIPTION_ID,
		resourceGroup: RESOURCE_GROUP,
		resolveCredential:
			overrides?.resolveCredential ??
			((): Promise<string> => Promise.resolve(TOKEN)),
		...(overrides?.pollBudget !== undefined
			? { pollBudget: overrides.pollBudget }
			: {}),
		...(overrides?.waitBetweenPolls !== undefined
			? { waitBetweenPolls: overrides.waitBetweenPolls }
			: {}),
	});
}

function resolverFor(
	productId: string,
	overrides?: Parameters<typeof registry>[0],
) {
	const resolver = registry(overrides).get(productId);
	if (resolver === undefined) {
		throw new Error(`no resolver registered for ${productId}`);
	}
	return resolver;
}

interface ProductCase {
	readonly label: string;
	readonly productId: string;
	readonly slot: CapabilitySlot;
	readonly logicalId: string;
	readonly desired: Readonly<Record<string, unknown>>;
	readonly resourcePath: string;
	readonly apiVersion: string;
	readonly seed: Readonly<Record<string, Record<string, unknown>>>;
}

const STORAGE_SEED: Readonly<Record<string, Record<string, unknown>>> =
	Object.freeze({
		[STORAGE_ACCOUNT_PATH]: {
			id: STORAGE_ACCOUNT_PATH,
			name: STORAGE_ACCOUNT,
			location: "eastus",
			properties: { provisioningState: "Succeeded" },
		},
	});

const SERVICE_BUS_SEED: Readonly<Record<string, Record<string, unknown>>> =
	Object.freeze({
		[SERVICE_BUS_NAMESPACE_PATH]: {
			id: SERVICE_BUS_NAMESPACE_PATH,
			name: SERVICE_BUS_NAMESPACE,
			location: "eastus",
			properties: { provisioningState: "Succeeded" },
		},
	});

const CASES: readonly ProductCase[] = Object.freeze([
	{
		label: "blob container",
		productId: AZURE_BLOB_STORAGE_PRODUCT_ID,
		slot: "bucket",
		logicalId: "assets",
		desired: { publicAccessBlocked: true, storageAccount: STORAGE_ACCOUNT },
		resourcePath: `${STORAGE_ACCOUNT_PATH}/blobServices/default/containers/assets`,
		apiVersion: AZURE_STORAGE_API_VERSION,
		seed: STORAGE_SEED,
	},
	{
		label: "storage queue",
		productId: AZURE_STORAGE_QUEUE_PRODUCT_ID,
		slot: "queue",
		logicalId: "jobs",
		desired: { storageAccount: STORAGE_ACCOUNT },
		resourcePath: `${STORAGE_ACCOUNT_PATH}/queueServices/default/queues/jobs`,
		apiVersion: AZURE_STORAGE_API_VERSION,
		seed: STORAGE_SEED,
	},
	{
		label: "service bus queue",
		productId: AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
		slot: "queue",
		logicalId: "orders",
		desired: {
			lockDurationSeconds: 60,
			maxDeliveryCount: 5,
			namespace: SERVICE_BUS_NAMESPACE,
		},
		resourcePath: `${SERVICE_BUS_NAMESPACE_PATH}/queues/orders`,
		apiVersion: AZURE_SERVICE_BUS_API_VERSION,
		seed: SERVICE_BUS_SEED,
	},
	{
		label: "service bus topic",
		productId: AZURE_SERVICE_BUS_TOPIC_PRODUCT_ID,
		slot: "topic",
		logicalId: "events",
		desired: { maxSizeMb: 1024, namespace: SERVICE_BUS_NAMESPACE },
		resourcePath: `${SERVICE_BUS_NAMESPACE_PATH}/topics/events`,
		apiVersion: AZURE_SERVICE_BUS_API_VERSION,
		seed: SERVICE_BUS_SEED,
	},
	{
		label: "key vault",
		productId: AZURE_KEY_VAULT_PRODUCT_ID,
		slot: "secretRef",
		logicalId: "hobo-vault",
		desired: {
			location: "eastus",
			rbacAuthorization: true,
			tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
		},
		resourcePath: `${GROUP_PREFIX}/providers/Microsoft.KeyVault/vaults/hobo-vault`,
		apiVersion: AZURE_KEY_VAULT_API_VERSION,
		seed: {},
	},
	{
		label: "cosmos account",
		productId: AZURE_COSMOS_DB_PRODUCT_ID,
		slot: "data",
		logicalId: "hobo-cosmos",
		desired: { consistencyLevel: "session", location: "eastus" },
		resourcePath: `${GROUP_PREFIX}/providers/Microsoft.DocumentDB/databaseAccounts/hobo-cosmos`,
		apiVersion: AZURE_COSMOS_API_VERSION,
		seed: {},
	},
	{
		label: "container app",
		productId: AZURE_CONTAINER_APPS_PRODUCT_ID,
		slot: "web",
		logicalId: "hobo-web",
		desired: {
			image: "ghcr.io/hobo/web:1",
			ingress: "external",
			location: "eastus",
			managedEnvironmentId: `${GROUP_PREFIX}/providers/Microsoft.App/managedEnvironments/hobo-env`,
			maxReplicas: 3,
			minReplicas: 1,
			targetPort: 8080,
		},
		resourcePath: `${GROUP_PREFIX}/providers/Microsoft.App/containerApps/hobo-web`,
		apiVersion: AZURE_CONTAINER_APPS_API_VERSION,
		seed: {},
	},
]);

function requestFor(
	product: ProductCase,
	overrides?: {
		readonly credentialRef?: string;
		readonly physicalId?: string;
		readonly desired?: Readonly<Record<string, unknown>>;
	},
) {
	return {
		ref: {
			slot: product.slot,
			productId: product.productId,
			logicalId: product.logicalId,
			...(overrides?.physicalId !== undefined
				? { physicalId: overrides.physicalId }
				: {}),
		},
		desired: overrides?.desired ?? product.desired,
		credentialRef: overrides?.credentialRef ?? CREDENTIAL_REF,
	};
}

async function codeOf(call: () => Promise<unknown>): Promise<string> {
	try {
		await call();
	} catch (error) {
		return (error as ResolverError).code;
	}
	throw new Error("expected the call to be refused, but it resolved");
}

async function messageOf(call: () => Promise<unknown>): Promise<string> {
	try {
		await call();
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("expected the call to be refused, but it resolved");
}

// ---------------------------------------------------------------------------
// Registry surface
// ---------------------------------------------------------------------------

describe("azure resolver registry", () => {
	it("registers exactly the declared resolved product ids", () => {
		const listed = registry()
			.list()
			.map((resolver) => resolver.productId);
		expect(listed).toEqual([...AZURE_RESOLVED_PRODUCT_IDS]);
	});

	it("stamps every resolver with the azure provider target", () => {
		for (const resolver of azureResolvers({
			subscriptionId: SUBSCRIPTION_ID,
			resourceGroup: RESOURCE_GROUP,
			resolveCredential: () => Promise.resolve(TOKEN),
		})) {
			expect(resolver.providerId).toBe("azure");
		}
	});

	it("leaves exactly the declared unresolved set uncovered", () => {
		const index = registry();
		const catalogued = new Set(
			azureYardSpec()
				.bindings.map((row) => row.productId)
				.filter((id): id is string => typeof id === "string"),
		);
		const uncovered = [...catalogued]
			.filter((productId) => index.get(productId) === undefined)
			.sort();
		expect(uncovered).toEqual([...AZURE_UNRESOLVED_PRODUCT_IDS]);
	});

	it("declares nothing unresolved that actually has a resolver", () => {
		const index = registry();
		for (const productId of AZURE_UNRESOLVED_PRODUCT_IDS) {
			expect(index.get(productId)).toBeUndefined();
		}
	});

	it("refuses a malformed subscription id rather than pasting it into a path", async () => {
		const code = await codeOf(async () =>
			azureResolverRegistry({
				subscriptionId: "not-a-guid",
				resourceGroup: RESOURCE_GROUP,
				resolveCredential: () => Promise.resolve(TOKEN),
			}),
		);
		expect(code).toBe("RESOLVER_PRODUCT_UNSUPPORTED");
	});

	it("refuses an unbounded poll budget", async () => {
		const code = await codeOf(async () =>
			azureResolverRegistry({
				subscriptionId: SUBSCRIPTION_ID,
				resourceGroup: RESOURCE_GROUP,
				resolveCredential: () => Promise.resolve(TOKEN),
				pollBudget: 100_000,
			}),
		);
		expect(code).toBe("RESOLVER_PRODUCT_UNSUPPORTED");
	});
});

// ---------------------------------------------------------------------------
// Per-product convergence
// ---------------------------------------------------------------------------

describe.each(CASES)("$label", (product) => {
	it("creates the resource at its deterministic ARM id", async () => {
		const arm = createArm({ seed: product.seed });
		const outcome = await resolverFor(product.productId).reconcile(
			requestFor(product),
			arm.transport,
		);
		expect(outcome.action).toBe("create");
		expect(outcome.physicalId).toBe(product.resourcePath);
		expect(arm.countOf("PUT", product.resourcePath)).toBe(1);
		expect(arm.has(product.resourcePath)).toBe(true);
	});

	it("reconciles twice into one resource with one create call", async () => {
		const arm = createArm({ seed: product.seed });
		const resolver = resolverFor(product.productId);
		const first = await resolver.reconcile(requestFor(product), arm.transport);
		const second = await resolver.reconcile(
			requestFor(product, { physicalId: first.physicalId }),
			arm.transport,
		);

		expect(second.physicalId).toBe(first.physicalId);
		expect(second.action).toBe("noop");
		expect(arm.countOf("PUT", product.resourcePath)).toBe(1);
		expect(arm.countOf("PATCH", product.resourcePath)).toBe(0);
	});

	it("adopts a pre-existing resource the request did not know about", async () => {
		const arm = createArm({ seed: product.seed });
		const resolver = resolverFor(product.productId);
		await resolver.reconcile(requestFor(product), arm.transport);
		const adopted = await resolver.reconcile(
			requestFor(product),
			arm.transport,
		);
		expect(adopted.action).toBe("adopt");
	});

	it("reads back the resource it created", async () => {
		const arm = createArm({ seed: product.seed });
		const resolver = resolverFor(product.productId);
		expect(await resolver.read?.(requestFor(product), arm.transport)).toBe(
			undefined,
		);
		await resolver.reconcile(requestFor(product), arm.transport);
		const view = await resolver.read?.(requestFor(product), arm.transport);
		expect(view?.physicalId).toBe(product.resourcePath);
	});

	it("deletes the resource", async () => {
		const arm = createArm({ seed: product.seed });
		const resolver = resolverFor(product.productId);
		await resolver.reconcile(requestFor(product), arm.transport);
		await resolver.delete(requestFor(product), arm.transport);
		expect(arm.has(product.resourcePath)).toBe(false);
	});

	it("treats deleting an absent resource as success", async () => {
		const arm = createArm({ seed: product.seed });
		await expect(
			resolverFor(product.productId).delete(requestFor(product), arm.transport),
		).resolves.toBeUndefined();
	});

	it("carries the pinned api-version on every call", async () => {
		const arm = createArm({ seed: product.seed });
		const resolver = resolverFor(product.productId);
		await resolver.reconcile(requestFor(product), arm.transport);
		await resolver.reconcile(requestFor(product), arm.transport);
		await resolver.delete(requestFor(product), arm.transport);

		expect(arm.calls.length).toBeGreaterThan(0);
		for (const call of arm.calls) {
			expect(call.apiVersion).toBe(product.apiVersion);
		}
	});

	it("puts the token in the authorization header and nowhere else", async () => {
		const arm = createArm({ seed: product.seed });
		const outcome = await resolverFor(product.productId).reconcile(
			requestFor(product),
			arm.transport,
		);

		for (const call of arm.calls) {
			expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
			expect(call.path).not.toContain(TOKEN);
			expect(call.body ?? "").not.toContain(TOKEN);
		}
		expect(JSON.stringify(outcome)).not.toContain(TOKEN);
	});

	it("refuses a credentialRef that is not a locator", async () => {
		const arm = createArm({ seed: product.seed });
		const code = await codeOf(() =>
			resolverFor(product.productId).reconcile(
				requestFor(product, { credentialRef: "AZURE_ARM_ACCESS_TOKEN_VALUE" }),
				arm.transport,
			),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_NOT_A_REF");
		expect(arm.calls).toHaveLength(0);
	});

	it("refuses when the host cannot resolve the credential", async () => {
		const arm = createArm({ seed: product.seed });
		const code = await codeOf(() =>
			resolverFor(product.productId, {
				resolveCredential: () => Promise.resolve(""),
			}).reconcile(requestFor(product), arm.transport),
		);
		expect(code).toBe("RESOLVER_CREDENTIAL_MISSING");
		expect(arm.calls).toHaveLength(0);
	});

	it("turns an ARM error body into a redacted provider rejection", async () => {
		const arm = createArm({
			seed: product.seed,
			override: (call) =>
				call.path === product.resourcePath
					? json(500, {
							error: {
								code: "InternalServerError",
								message: `request ${LEAKED_SECRET} failed`,
							},
						})
					: undefined,
		});
		const message = await messageOf(() =>
			resolverFor(product.productId).reconcile(
				requestFor(product),
				arm.transport,
			),
		);
		expect(message).toContain("status 500");
		expect(message).not.toContain(LEAKED_SECRET);
		expect(message).toContain("[redacted]");
	});

	it("reports a non-JSON response as unparseable rather than assuming it worked", async () => {
		const arm = createArm({
			seed: product.seed,
			override: (call) =>
				call.path === product.resourcePath
					? { status: 200, headers: {}, body: "<html>gateway</html>" }
					: undefined,
		});
		const code = await codeOf(() =>
			resolverFor(product.productId).reconcile(
				requestFor(product),
				arm.transport,
			),
		);
		expect(code).toBe("RESOLVER_OUTPUT_UNPARSEABLE");
	});

	it("never emits replace", async () => {
		const arm = createArm({ seed: product.seed });
		const resolver = resolverFor(product.productId);
		const first = await resolver.reconcile(requestFor(product), arm.transport);
		const second = await resolver.reconcile(requestFor(product), arm.transport);
		expect(first.action).not.toBe("replace");
		expect(second.action).not.toBe("replace");
	});
});

// ---------------------------------------------------------------------------
// Long-running operations
// ---------------------------------------------------------------------------

const COSMOS = CASES.find(
	(entry) => entry.productId === AZURE_COSMOS_DB_PRODUCT_ID,
) as ProductCase;

describe("long-running operations", () => {
	it("follows an Azure-AsyncOperation to terminal success before reporting a create", async () => {
		const polls: number[] = [];
		const arm = createArm({
			seed: COSMOS.seed,
			writeMode: "async-operation",
			inProgressPolls: 2,
		});
		const outcome = await resolverFor(COSMOS.productId, {
			pollBudget: 5,
			waitBetweenPolls: (attempt) => {
				polls.push(attempt);
				return Promise.resolve();
			},
		}).reconcile(requestFor(COSMOS), arm.transport);

		expect(outcome.action).toBe("create");
		// Two InProgress answers, then Succeeded: the operation was actually
		// followed rather than assumed from the 202.
		expect(arm.countOf("GET", OPERATION_PATH)).toBe(3);
		expect(polls).toEqual([1, 2, 3]);
		expect(outcome.diagnostics.join(" ")).not.toContain("NOT confirmed");
		expect(outcome.outputs.provisioningState).toBe("Succeeded");
	});

	it("follows a Location header to the settled resource", async () => {
		const arm = createArm({ seed: COSMOS.seed, writeMode: "location" });
		const outcome = await resolverFor(COSMOS.productId).reconcile(
			requestFor(COSMOS),
			arm.transport,
		);
		expect(outcome.action).toBe("create");
		expect(outcome.diagnostics.join(" ")).not.toContain("NOT confirmed");
	});

	it("polls a non-terminal provisioningState instead of trusting the 200", async () => {
		const arm = createArm({ seed: COSMOS.seed, writeMode: "provisioning" });
		const outcome = await resolverFor(COSMOS.productId).reconcile(
			requestFor(COSMOS),
			arm.transport,
		);
		expect(outcome.action).toBe("create");
		// One GET before the PUT, one poll after it.
		expect(arm.countOf("GET", COSMOS.resourcePath)).toBe(2);
		expect(outcome.diagnostics.join(" ")).not.toContain("NOT confirmed");
	});

	it("reports accepted-but-not-confirmed when the poll budget runs out", async () => {
		const arm = createArm({
			seed: COSMOS.seed,
			writeMode: "async-operation",
			inProgressPolls: 999,
		});
		const outcome = await resolverFor(COSMOS.productId, {
			pollBudget: 3,
		}).reconcile(requestFor(COSMOS), arm.transport);

		expect(arm.countOf("GET", OPERATION_PATH)).toBe(3);
		expect(outcome.diagnostics.join(" ")).toContain("NOT confirmed complete");
		expect(outcome.diagnostics.join(" ")).toContain("3-poll budget");
		// The honest report is a diagnostic, not a silent success.
		expect(outcome.diagnostics).not.toHaveLength(0);
	});

	it("reports a bare 202 with no operation header as unconfirmed", async () => {
		const arm = createArm({ seed: COSMOS.seed, writeMode: "bare-202" });
		const outcome = await resolverFor(COSMOS.productId).reconcile(
			requestFor(COSMOS),
			arm.transport,
		);
		expect(outcome.diagnostics.join(" ")).toContain("NOT confirmed complete");
		expect(outcome.diagnostics.join(" ")).toContain(
			"neither an Azure-AsyncOperation nor a Location header",
		);
	});

	it("refuses to follow an operation URL off the allowlisted ARM origin", async () => {
		const arm = createArm({
			seed: COSMOS.seed,
			writeMode: "foreign-operation",
		});
		const outcome = await resolverFor(COSMOS.productId).reconcile(
			requestFor(COSMOS),
			arm.transport,
		);
		expect(outcome.diagnostics.join(" ")).toContain("NOT confirmed complete");
		expect(outcome.diagnostics.join(" ")).toContain("outside the allowlisted");
		for (const call of arm.calls) {
			expect(call.path).not.toContain("steal");
		}
	});

	it("turns a failed operation into a redacted provider rejection", async () => {
		const arm = createArm({
			seed: COSMOS.seed,
			writeMode: "async-operation",
			operationFailure: "Failed",
		});
		const message = await messageOf(() =>
			resolverFor(COSMOS.productId).reconcile(
				requestFor(COSMOS),
				arm.transport,
			),
		);
		expect(message).toContain("failed");
		expect(message).not.toContain(LEAKED_SECRET);
	});

	it("reports an unconfirmed delete rather than letting it read as done", async () => {
		const arm = createArm({
			seed: {
				...COSMOS.seed,
				[COSMOS.resourcePath]: {
					id: COSMOS.resourcePath,
					name: "hobo-cosmos",
					location: "eastus",
					properties: { provisioningState: "Succeeded" },
				},
			},
			writeMode: "async-operation",
			inProgressPolls: 999,
			override: (call) =>
				call.method === "DELETE"
					? {
							status: 202,
							headers: { "azure-asyncoperation": OPERATION_URL },
							body: "",
						}
					: undefined,
		});
		const message = await messageOf(() =>
			resolverFor(COSMOS.productId, { pollBudget: 2 }).delete(
				requestFor(COSMOS),
				arm.transport,
			),
		);
		expect(message).toContain("NOT confirmed complete");
		expect(message).toContain("re-run delete");
	});
});

// ---------------------------------------------------------------------------
// Deltas, drift, and preconditions
// ---------------------------------------------------------------------------

describe("deltas and drift", () => {
	it("applies a mutable service bus delta as an update, then settles", async () => {
		const queuePath = `${SERVICE_BUS_NAMESPACE_PATH}/queues/orders`;
		const arm = createArm({
			seed: {
				...SERVICE_BUS_SEED,
				[queuePath]: {
					id: queuePath,
					name: "orders",
					properties: {
						createdAt: "2024-01-01T00:00:00Z",
						lockDuration: "PT30S",
						maxDeliveryCount: 10,
						messageCount: 4,
						requiresSession: false,
					},
				},
			},
		});
		const outcome = await resolverFor(
			AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
		).reconcile(
			requestFor(
				CASES.find(
					(entry) => entry.productId === AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
				) as ProductCase,
			),
			arm.transport,
		);

		expect(outcome.action).toBe("update");
		expect(outcome.outputs.lockDuration).toBe("PT60S");
		const write = arm.calls.find(
			(call) => call.method === "PUT" && call.path === queuePath,
		);
		const body = JSON.parse(write?.body ?? "{}") as {
			properties: Record<string, unknown>;
		};
		// Read-only fields are stripped; everything else the provider reported is
		// carried forward so the delta does not reset it.
		expect(body.properties.createdAt).toBeUndefined();
		expect(body.properties.messageCount).toBeUndefined();
		expect(body.properties.requiresSession).toBe(false);
		expect(body.properties.lockDuration).toBe("PT60S");
	});

	it("treats an equivalent ISO-8601 duration as settled rather than permanent drift", async () => {
		const queuePath = `${SERVICE_BUS_NAMESPACE_PATH}/queues/orders`;
		const arm = createArm({
			seed: {
				...SERVICE_BUS_SEED,
				[queuePath]: {
					id: queuePath,
					name: "orders",
					// ARM answers PT1M to a PT60S request.
					properties: { lockDuration: "PT1M", maxDeliveryCount: 5 },
				},
			},
		});
		const outcome = await resolverFor(
			AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
		).reconcile(
			requestFor(
				CASES.find(
					(entry) => entry.productId === AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
				) as ProductCase,
			),
			arm.transport,
		);
		expect(outcome.action).toBe("adopt");
		expect(arm.countOf("PUT", queuePath)).toBe(0);
	});

	it("reports immutable session drift as a diagnostic and never replaces", async () => {
		const queuePath = `${SERVICE_BUS_NAMESPACE_PATH}/queues/orders`;
		const arm = createArm({
			seed: {
				...SERVICE_BUS_SEED,
				[queuePath]: {
					id: queuePath,
					name: "orders",
					properties: {
						lockDuration: "PT60S",
						maxDeliveryCount: 5,
						requiresSession: false,
					},
				},
			},
		});
		const base = CASES.find(
			(entry) => entry.productId === AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
		) as ProductCase;
		const outcome = await resolverFor(
			AZURE_SERVICE_BUS_QUEUE_PRODUCT_ID,
		).reconcile(
			requestFor(base, {
				desired: { ...base.desired, sessionsEnabled: true },
			}),
			arm.transport,
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.diagnostics.join(" ")).toContain("requiresSession");
		expect(arm.countOf("DELETE", queuePath)).toBe(0);
	});

	it("reports account-level blob options it cannot apply to a container", async () => {
		const arm = createArm({ seed: STORAGE_SEED });
		const base = CASES.find(
			(entry) => entry.productId === AZURE_BLOB_STORAGE_PRODUCT_ID,
		) as ProductCase;
		const outcome = await resolverFor(AZURE_BLOB_STORAGE_PRODUCT_ID).reconcile(
			requestFor(base, {
				desired: {
					...base.desired,
					accessTier: "cool",
					redundancy: "zrs",
					versioning: true,
				},
			}),
			arm.transport,
		);
		const text = outcome.diagnostics.join(" ");
		expect(text).toContain("accessTier is declared but not applied");
		expect(text).toContain("redundancy is declared but not applied");
		expect(text).toContain("versioning is declared but not applied");
	});

	it("refuses a blob container when the named storage account is absent", async () => {
		const arm = createArm();
		const base = CASES.find(
			(entry) => entry.productId === AZURE_BLOB_STORAGE_PRODUCT_ID,
		) as ProductCase;
		const message = await messageOf(() =>
			resolverFor(AZURE_BLOB_STORAGE_PRODUCT_ID).reconcile(
				requestFor(base),
				arm.transport,
			),
		);
		expect(message).toContain("storage account");
		expect(message).toContain("does not exist");
		expect(arm.countOf("PUT", base.resourcePath)).toBe(0);
	});

	it("refuses a blob container when no storage account is named at all", async () => {
		const arm = createArm();
		const base = CASES.find(
			(entry) => entry.productId === AZURE_BLOB_STORAGE_PRODUCT_ID,
		) as ProductCase;
		const message = await messageOf(() =>
			resolverFor(AZURE_BLOB_STORAGE_PRODUCT_ID).reconcile(
				requestFor(base, { desired: {} }),
				arm.transport,
			),
		);
		expect(message).toContain("desired.storageAccount is required");
	});

	it("refuses container-app ingress without a target port", async () => {
		const arm = createArm();
		const base = CASES.find(
			(entry) => entry.productId === AZURE_CONTAINER_APPS_PRODUCT_ID,
		) as ProductCase;
		const { targetPort: _dropped, ...withoutPort } = base.desired as Record<
			string,
			unknown
		>;
		const message = await messageOf(() =>
			resolverFor(AZURE_CONTAINER_APPS_PRODUCT_ID).reconcile(
				requestFor(base, { desired: withoutPort }),
				arm.transport,
			),
		);
		expect(message).toContain("desired.targetPort is required");
	});

	it("refuses cosmos bounded staleness without its bounds", async () => {
		const arm = createArm();
		const base = CASES.find(
			(entry) => entry.productId === AZURE_COSMOS_DB_PRODUCT_ID,
		) as ProductCase;
		const message = await messageOf(() =>
			resolverFor(AZURE_COSMOS_DB_PRODUCT_ID).reconcile(
				requestFor(base, {
					desired: { ...base.desired, consistencyLevel: "bounded-staleness" },
				}),
				arm.transport,
			),
		);
		expect(message).toContain("maxStalenessPrefix");
	});

	it("says out loud when it had to choose the Key Vault base tier", async () => {
		const arm = createArm();
		const base = CASES.find(
			(entry) => entry.productId === AZURE_KEY_VAULT_PRODUCT_ID,
		) as ProductCase;
		const outcome = await resolverFor(AZURE_KEY_VAULT_PRODUCT_ID).reconcile(
			requestFor(base),
			arm.transport,
		);
		expect(outcome.diagnostics.join(" ")).toContain("skuName was not declared");
		expect(outcome.diagnostics.join(" ")).toContain("soft-delete");
	});

	it("refuses to turn Key Vault purge protection back off", async () => {
		const vaultPath = `${GROUP_PREFIX}/providers/Microsoft.KeyVault/vaults/hobo-vault`;
		const arm = createArm({
			seed: {
				[vaultPath]: {
					id: vaultPath,
					name: "hobo-vault",
					location: "eastus",
					properties: {
						enablePurgeProtection: true,
						enableRbacAuthorization: true,
						tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
					},
				},
			},
		});
		const base = CASES.find(
			(entry) => entry.productId === AZURE_KEY_VAULT_PRODUCT_ID,
		) as ProductCase;
		const outcome = await resolverFor(AZURE_KEY_VAULT_PRODUCT_ID).reconcile(
			requestFor(base, {
				desired: { ...base.desired, purgeProtection: false },
			}),
			arm.transport,
		);
		expect(outcome.action).toBe("adopt");
		expect(outcome.diagnostics.join(" ")).toContain("permanent");
		expect(arm.countOf("PATCH", vaultPath)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Transport guard
// ---------------------------------------------------------------------------

describe("azure transport guard", () => {
	it("refuses a host that is not management.azure.com", async () => {
		const guarded = guardedAzureTransport(() =>
			Promise.resolve({ status: 200, headers: {}, body: "{}" }),
		);
		await expect(
			guarded({
				method: "GET",
				url: "https://attacker.example.com/subscriptions/x",
				headers: {},
				timeoutMs: 1_000,
				maxResponseBytes: 1_000,
			}),
		).rejects.toThrow(/not exactly one of the allowlisted/u);
	});

	it("refuses a path outside the subscription scope", async () => {
		const guarded = guardedAzureTransport(() =>
			Promise.resolve({ status: 200, headers: {}, body: "{}" }),
		);
		await expect(
			guarded({
				method: "GET",
				url: "https://management.azure.com/tenants",
				headers: {},
				timeoutMs: 1_000,
				maxResponseBytes: 1_000,
			}),
		).rejects.toThrow(/outside the allowlisted prefixes/u);
	});
});

describe("redactAzureText", () => {
	it("scrubs token-shaped runs and bounds the length", () => {
		expect(redactAzureText(`token ${LEAKED_SECRET} used`)).toBe(
			"token [redacted] used",
		);
		expect(redactAzureText("x".repeat(600), 40).length).toBeLessThanOrEqual(41);
	});
});
