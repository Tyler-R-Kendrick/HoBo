/**
 * Every provider's resolvers face the same chaos suite.
 *
 * `chaos-resolver.test.ts` already drives Cloudflare R2 through injected faults
 * and pins the one property that matters. This widens that from one product to
 * one product per provider, because the resolvers were written against four
 * different API shapes — ARM with long-running operations, Google REST with
 * Operations polling, SigV4 over four request protocols, Cloudflare v4 — and
 * "R2 converges" is evidence about R2.
 *
 * The property under test is convergence after an *ambiguous* failure: the
 * socket died, or the deadline passed, or the body came back truncated, and the
 * caller cannot tell whether the provider applied the write. Retrying must
 * produce one resource, not two. A resolver that lets the provider mint an id
 * cannot satisfy this at all, which is why several products across these
 * catalogs ship no resolver rather than a convergent-looking one.
 *
 * This lives in `@hobo/hobo` rather than in each provider package for the same
 * reason the R2 chaos test does: provider packages are layer 2 and cannot
 * import `@hobo/testing`, so the composition root is where a cross-provider
 * suite can exist at all.
 */
import type { HttpTransport, TransportRequest } from "@hobo/core";
import { parseResolveRequest } from "@hobo/core";
import {
	azureResolverRegistry,
	guardedAzureTransport,
} from "@hobo/provider-azure";
import { gcpResolverRegistry, guardedGcpTransport } from "@hobo/provider-gcp";
import {
	type ChaosSubject,
	chaosViolations,
	runChaosConformance,
} from "@hobo/testing";
import { describe, expect, it } from "vitest";

/**
 * A fake provider world shared by both subjects.
 *
 * Writes land under the path they address, so a create followed by a read of
 * the same path finds the resource — which is the whole question a convergence
 * test asks. A `POST` to a collection addresses the new item by the `name` in
 * its body (Google's shape); a `PUT` addresses it directly (ARM's shape).
 */
function fakeWorld() {
	const resources = new Map<string, unknown>();
	const creates: TransportRequest[] = [];

	const transport: HttpTransport = async (request) => {
		const url = new URL(request.url);
		const key = `${url.host}${url.pathname}`;
		const writing = request.method === "PUT" || request.method === "POST";

		if (writing) {
			creates.push(request);
			const body = request.body ? JSON.parse(request.body) : {};
			const itemKey =
				request.method === "POST" && typeof body.name === "string"
					? `${key}/${body.name}`
					: key;
			const stored = {
				name: body.name ?? itemKey.split("/").pop(),
				...body,
				properties: {
					...(body.properties ?? {}),
					provisioningState: "Succeeded",
				},
			};
			resources.set(itemKey, stored);
			return json(200, stored);
		}

		if (request.method === "DELETE") {
			resources.delete(key);
			return json(200, {});
		}

		const found = resources.get(key);
		return found === undefined
			? json(404, { error: { message: "not found" } })
			: json(200, found);
	};

	return {
		transport,
		countResources: () => resources.size,
		// Only the write that creates counts. A read-back is not a create, and a
		// resolver is expected to issue several of those.
		countCreates: () => creates.length,
	};
}

function json(status: number, body: unknown) {
	return {
		status,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	};
}

const AZURE_SUBSCRIPTION = "00000000-0000-4000-8000-000000000001";

const azureKeyVault: ChaosSubject = {
	label: "azure.key-vault/v1",
	create(wrap) {
		const world = fakeWorld();
		const registry = azureResolverRegistry({
			subscriptionId: AZURE_SUBSCRIPTION,
			resourceGroup: "rg-1",
			resolveCredential: async () => "bearer-token",
		});
		const resolver = registry.get("azure.key-vault/v1");
		if (!resolver) throw new Error("azure.key-vault/v1 resolver missing");
		const transport = guardedAzureTransport(wrap(world.transport));
		const request = parseResolveRequest({
			ref: {
				slot: "secretRef",
				productId: "azure.key-vault/v1",
				logicalId: "vault",
			},
			desired: { location: "westeurope", tenantId: "t-1", sku: "standard" },
			credentialRef: "env://AZURE_TOKEN",
		});
		return {
			reconcile: () => resolver.reconcile(request, transport),
			countResources: world.countResources,
			countCreates: world.countCreates,
		};
	},
};

const gcpBucket: ChaosSubject = {
	label: "gcp.cloud-storage/v1",
	create(wrap) {
		const world = fakeWorld();
		const registry = gcpResolverRegistry({
			projectId: "proj-1",
			resolveCredential: async () => "oauth-token",
		});
		const resolver = registry.get("gcp.cloud-storage/v1");
		if (!resolver) throw new Error("gcp.cloud-storage/v1 resolver missing");
		const transport = guardedGcpTransport(
			wrap(world.transport),
			"cloudStorage",
		);
		const request = parseResolveRequest({
			ref: {
				slot: "bucket",
				productId: "gcp.cloud-storage/v1",
				logicalId: "assets",
			},
			desired: { location: "US" },
			credentialRef: "env://GCP_TOKEN",
		});
		return {
			reconcile: () => resolver.reconcile(request, transport),
			countResources: world.countResources,
			countCreates: world.countCreates,
		};
	},
};

/**
 * A world that answers a write with a long-running Operation instead of the
 * resource, which is what `redis.googleapis.com` (and Cloud SQL, and Cloud Run)
 * actually does.
 *
 * This shape deserves its own chaos subject rather than riding on
 * {@link fakeWorld}: an LRO resolver's create returns a *handle*, not the thing,
 * so the "did my write land?" question the fault raises is answered one
 * indirection further away. A resolver that reported the accepted operation as
 * the resource would look fine against the direct-write world and duplicate
 * here.
 */
function gcpOperationWorld() {
	const resources = new Map<string, unknown>();
	const creates: TransportRequest[] = [];
	const operationName = "projects/proj-1/locations/us-central1/operations/op-1";

	const transport: HttpTransport = async (request) => {
		const url = new URL(request.url);

		if (url.pathname === `/v1/${operationName}`) {
			return json(200, { name: operationName, done: true });
		}

		if (request.method === "POST") {
			creates.push(request);
			// The id is the caller's `instanceId` query parameter, never one the
			// provider mints — that pairing is what makes the retry converge.
			const instanceId = url.searchParams.get("instanceId") ?? "unnamed";
			const body = request.body ? JSON.parse(request.body) : {};
			resources.set(`${url.pathname}/${instanceId}`, {
				name: `projects/proj-1/locations/us-central1/instances/${instanceId}`,
				host: "10.0.0.7",
				port: 6379,
				state: "READY",
				...body,
			});
			return json(200, { name: operationName, done: true });
		}

		if (request.method === "DELETE") {
			resources.delete(url.pathname);
			return json(200, { name: operationName, done: true });
		}

		const found = resources.get(url.pathname);
		return found === undefined
			? json(404, { error: { message: "not found" } })
			: json(200, found);
	};

	return {
		transport,
		countResources: () => resources.size,
		countCreates: () => creates.length,
	};
}

const azureRedisCache: ChaosSubject = {
	label: "azure.cache-for-redis/v1",
	create(wrap) {
		const world = fakeWorld();
		const registry = azureResolverRegistry({
			subscriptionId: AZURE_SUBSCRIPTION,
			resourceGroup: "rg-1",
			resolveCredential: async () => "bearer-token",
		});
		const resolver = registry.get("azure.cache-for-redis/v1");
		if (!resolver) throw new Error("azure.cache-for-redis/v1 resolver missing");
		const transport = guardedAzureTransport(wrap(world.transport));
		const request = parseResolveRequest({
			ref: {
				slot: "kv",
				productId: "azure.cache-for-redis/v1",
				logicalId: "cache",
			},
			desired: { capacity: 1, location: "westeurope", skuName: "Standard" },
			credentialRef: "env://AZURE_TOKEN",
		});
		return {
			reconcile: () => resolver.reconcile(request, transport),
			countResources: world.countResources,
			countCreates: world.countCreates,
		};
	},
};

const gcpMemorystore: ChaosSubject = {
	label: "gcp.memorystore-redis/v1",
	create(wrap) {
		const world = gcpOperationWorld();
		const registry = gcpResolverRegistry({
			projectId: "proj-1",
			resolveCredential: async () => "oauth-token",
		});
		const resolver = registry.get("gcp.memorystore-redis/v1");
		if (!resolver) {
			throw new Error("gcp.memorystore-redis/v1 resolver missing");
		}
		const transport = guardedGcpTransport(wrap(world.transport), "memorystore");
		const request = parseResolveRequest({
			ref: {
				slot: "kv",
				productId: "gcp.memorystore-redis/v1",
				logicalId: "session-cache",
			},
			desired: { location: "us-central1", memoryGb: 1, tier: "basic" },
			credentialRef: "env://GCP_TOKEN",
		});
		return {
			reconcile: () => resolver.reconcile(request, transport),
			countResources: world.countResources,
			countCreates: world.countCreates,
		};
	},
};

describe("resolvers converge after an ambiguous failure", () => {
	for (const subject of [
		azureKeyVault,
		azureRedisCache,
		gcpBucket,
		gcpMemorystore,
	]) {
		it(`${subject.label} survives every ambiguous fault on the write`, async () => {
			// Index 1: these resolvers read before they write, so call 0 is the
			// existence probe and call 1 is the create. Faulting the read would
			// test something else — a failed read is unambiguous, nothing was
			// applied, and there is nothing to converge out of.
			const results = await runChaosConformance(subject, { writeCallIndex: 1 });
			expect(chaosViolations(results)).toEqual([]);
		});

		it(`${subject.label} actually exercised every fault`, async () => {
			// Without this, a subject whose first reconcile never reaches the write
			// would report zero violations and look green while testing nothing.
			const results = await runChaosConformance(subject, { writeCallIndex: 1 });
			expect(results).toHaveLength(5);
			expect(
				results.every((result) => result.resourcesAfterRetry === 1),
				"every scenario must end with exactly one resource",
			).toBe(true);
		});
	}
});

describe("the conformance suite itself discriminates", () => {
	/**
	 * A green suite is only meaningful if a red one is reachable. This subject is
	 * the failure mode the suite exists to catch: it never reads before writing,
	 * and it lets the "provider" mint a fresh id each time — exactly what a
	 * resolver posting to a collection endpoint does. Under a fault that
	 * corrupts the response *after* the write landed, its retry writes a second
	 * resource.
	 */
	const duplicating: ChaosSubject = {
		label: "fake.non-convergent/v1",
		create(wrap) {
			const resources = new Map<string, unknown>();
			let minted = 0;
			const inner: HttpTransport = async (request) => {
				if (request.method === "POST") {
					minted += 1;
					const id = `generated-${minted}`;
					resources.set(id, { id });
					return json(200, { id });
				}
				return json(404, { error: { message: "no list-by-name" } });
			};
			const transport = wrap(inner);
			return {
				// Writes unconditionally: no read, no adoption, new id every time.
				reconcile: async () => {
					const response = await transport({
						method: "POST",
						url: "https://fake.example.com/v1/things",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({}),
					});
					const parsed = JSON.parse(response.body) as { id: string };
					return { physicalId: parsed.id, action: "create" };
				},
				countResources: () => resources.size,
				countCreates: () => minted,
			};
		},
	};

	it("fails a resolver that duplicates on retry", async () => {
		const results = await runChaosConformance(duplicating, {
			writeCallIndex: 0,
		});
		const violations = chaosViolations(results);

		// The two response-corrupting faults let the write land and then hide it,
		// so the retry duplicates. That is the whole point of the suite.
		expect(violations.length).toBeGreaterThan(0);
		expect(violations.join("\n")).toContain("must read first and adopt");
		expect(
			results.filter((result) => result.resourcesAfterRetry > 1).length,
			"at least one fault must expose the duplicate",
		).toBeGreaterThan(0);
	});
});
