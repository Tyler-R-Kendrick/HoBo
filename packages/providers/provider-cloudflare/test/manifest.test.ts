import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
	INITIAL_CAPABILITY_PORTS,
	createCloudflareProvider,
	equivalenceForPort,
	parsePublishedManifest,
	publishCapabilityManifest,
} from "../src/index.js";

describe("Capability Manifest publication (FR-031)", () => {
	it("publishes capabilities, auth, and cost.json under /.well-known/capability-manifest/", () => {
		const documents = publishCapabilityManifest();
		const parsed = parsePublishedManifest(documents);

		assert.equal(parsed.ok, true);
		assert.equal((parsed.auth as { schema: string }).schema, "hobo.provider-auth/v1");
		assert.equal((parsed.cost as { schema: string }).schema, "hobo.cost/v1");
		const caps = parsed.capabilities as { capabilities: Array<{ port: string }> };
		assert.equal(caps.capabilities.length, 3);
		assert.deepEqual(
			caps.capabilities.map((c) => c.port).sort(),
			["compute", "kv", "objectStore"],
		);
	});

	it("rejects manifests that publish static secrets", () => {
		const documents = publishCapabilityManifest();
		const auth = JSON.parse(documents["/.well-known/capability-manifest/auth.json"]);
		auth.staticKey = "secret";
		documents["/.well-known/capability-manifest/auth.json"] = `${JSON.stringify(auth, null, 2)}\n`;
		const parsed = parsePublishedManifest(documents);

		assert.equal(parsed.ok, false);
		assert.ok(parsed.errors.includes("auth must not publish static secrets"));
	});
});

describe("CloudProvider.capabilityManifest() shape", () => {
	it("returns the published bundle plus parsed capabilities/auth/cost", () => {
		const provider = createCloudflareProvider();
		const manifest = provider.capabilityManifest();

		assert.equal(manifest.providerId, "@hobo/provider-cloudflare");
		assert.deepEqual(Object.keys(manifest.published).sort(), [
			"/.well-known/capability-manifest/auth.json",
			"/.well-known/capability-manifest/capabilities.json",
			"/.well-known/capability-manifest/cost.json",
			"/.well-known/capability-manifest/index.json",
		]);
		const caps = manifest.capabilities as { capabilities: Array<{ port: string }> };
		assert.deepEqual(caps.capabilities.map((c) => c.port).sort(), ["compute", "kv", "objectStore"]);
		assert.equal((manifest.auth as { staticSecrets: boolean }).staticSecrets, false);
	});

	it("advertises the configured colo regions", () => {
		const provider = createCloudflareProvider({ colos: ["WNAM", "APAC"] });
		assert.deepEqual(provider.regions, ["WNAM", "APAC"]);
	});
});

describe("Equivalence-class mappings (all three initial ports)", () => {
	it("maps web/service, kv, and objectStore to Cloudflare resource classes", () => {
		assert.equal(equivalenceForPort("web/service").resourceClass, "cloudflare:workers-script");
		assert.equal(equivalenceForPort("kv").resourceClass, "cloudflare:kv-namespace");
		assert.equal(equivalenceForPort("objectStore").resourceClass, "cloudflare:r2-bucket");
		assert.deepEqual(INITIAL_CAPABILITY_PORTS, ["web/service", "kv", "objectStore"]);
	});

	it("maps each class to Workers/KV/R2 provider services", () => {
		assert.equal(equivalenceForPort("web/service").providerService, "Workers");
		assert.equal(equivalenceForPort("kv").providerService, "KV");
		assert.equal(equivalenceForPort("objectStore").providerService, "R2");
	});
});
