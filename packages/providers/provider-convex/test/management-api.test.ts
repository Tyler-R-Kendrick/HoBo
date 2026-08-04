import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
	ConvexCredentialsError,
	createConvexManagementClient,
	describeConvexTarget,
} from "../src/index.js";

describe("management API — credential-gated, fail-closed", () => {
	it("fails closed without a deploy key (never a silent no-op)", async () => {
		const client = createConvexManagementClient({});
		assert.equal(client.live, false);
		await assert.rejects(
			() => client.listDeployments(),
			ConvexCredentialsError,
		);
	});

	it("forms authenticated requests against the injected fetch", async () => {
		const calls: { url: string; auth: string | undefined }[] = [];
		const client = createConvexManagementClient({
			deployKey: "test-key",
			fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
				calls.push({
					url: String(url),
					auth: (init?.headers as Record<string, string>)?.authorization,
				});
				return new Response(
					JSON.stringify([
						{
							name: "orders-us",
							url: "https://x.convex.cloud",
							state: "active",
						},
					]),
					{ status: 200 },
				);
			}) as typeof fetch,
		});
		const deployments = await client.listDeployments();
		assert.equal(deployments[0]?.name, "orders-us");
		assert.equal(calls[0]?.url, "https://api.convex.dev/v1/deployments");
		assert.equal(calls[0]?.auth, "Bearer test-key");
	});

	it("parse-don't-validate rejects malformed deployment payloads", async () => {
		const client = createConvexManagementClient({
			deployKey: "test-key",
			fetchImpl: (async () =>
				new Response(JSON.stringify([{ name: "x" }]), {
					status: 200,
				})) as typeof fetch,
		});
		await assert.rejects(() => client.listDeployments(), /missing url/u);
	});

	it("preflight inspects env presence only", () => {
		assert.deepEqual(describeConvexTarget({}), {
			live: false,
			missing: ["CONVEX_DEPLOY_KEY"],
		});
		assert.deepEqual(describeConvexTarget({ CONVEX_DEPLOY_KEY: "present" }), {
			live: true,
			missing: [],
		});
	});
});
