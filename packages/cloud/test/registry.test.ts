import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCloudflareProvider } from "@hobo/provider-cloudflare";
import {
	createManualClock,
	createRuntimeLocalEventStore,
	type RuntimeLocalEventStore,
} from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	createRegistryFromProviders,
	definitionsFor,
	registerProviderFact,
	registryCatalogProjection,
} from "../src/index.js";

let stores: RuntimeLocalEventStore[] = [];
function freshStore(): RuntimeLocalEventStore {
	const dir = mkdtempSync(join(tmpdir(), "hobo-cloud-reg-"));
	const s = createRuntimeLocalEventStore({
		dataDir: dir,
		clock: createManualClock(),
	});
	stores.push(s);
	return s;
}
afterEach(() => {
	for (const s of stores) s.close();
	stores = [];
});

const actor = { kind: "user", id: "operator-1" } as const;

describe("Registry: catalog from a provider capabilityManifest()", () => {
	it("indexes each advertised capability as a default Resource Definition", () => {
		const provider = createCloudflareProvider();
		const defs = definitionsFor(provider);
		expect(defs.map((d) => d.port).sort()).toEqual([
			"compute",
			"kv",
			"objectStore",
		]);
		const compute = defs.find((d) => d.port === "compute");
		expect(compute?.providerId).toBe("@hobo/provider-cloudflare");
		expect(compute?.features).toContain("http");
		// Live negotiation is delegated to the provider Capability.satisfies.
		expect(
			compute?.satisfies({ port: "compute", features: ["http"] }).kind,
		).toBe("full");
		expect(
			compute?.satisfies({ port: "compute", features: ["gpu"] }).kind,
		).toBe("partial");
	});

	it("produces a stable catalog hash for a fixed provider set", () => {
		const a = createRegistryFromProviders([createCloudflareProvider()]);
		const b = createRegistryFromProviders([createCloudflareProvider()]);
		expect(a.catalogHash).toBe(b.catalogHash);
		expect(a.definitions()).toHaveLength(3);
	});
});

describe("Registry: catalog projection over provider.Registered", () => {
	it("materializes a provider's Capability Manifest snapshot, rebuildable from zero", async () => {
		const store = freshStore();
		const provider = createCloudflareProvider();
		const streamId = "registry:catalog";

		await store.append(streamId, [registerProviderFact(provider)], {
			expectedSeq: 0,
			actor,
			tenant: "yard",
		});

		const view = await registryCatalogProjection.rebuildFromZero(
			store,
			streamId,
		);
		const row = registryCatalogProjection.get(
			view,
			"@hobo/provider-cloudflare",
		);
		expect(row?.ports).toEqual(["compute", "kv", "objectStore"]);
		expect(row?.definitionCount).toBe(3);
		expect(row?.manifestIndexDigest).toMatch(/^sha256:/);
	});

	it("declares its read-set as a projection.Declared fact", () => {
		const declared = registryCatalogProjection.declared();
		expect(declared.type).toBe("projection.Declared");
		expect(declared.data).toMatchObject({
			projection: "registry-catalog",
			readSet: ["provider.Registered"],
		});
	});
});
