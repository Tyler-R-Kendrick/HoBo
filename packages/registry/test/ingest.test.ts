import { describe, expect, it } from "vitest";

import {
	BUNDLE_MANIFEST_SCHEMA,
	bundleManifestDigest,
	ingestBundleManifest,
	REGISTRY_BUNDLE_IMPORTED,
} from "../src/index.js";

const validManifest = {
	schema: BUNDLE_MANIFEST_SCHEMA,
	name: "kv-cache",
	version: "1.0.0",
	provider: "cloudflare",
	capabilities: [
		{ port: "hobo:kv", features: ["ttl"] },
		{ port: "hobo:runner", features: [] },
	],
	description: "KV cache bundle",
};

describe("ingestBundleManifest", () => {
	it("parses a valid manifest into the typed record and BundleImported fact", () => {
		const result = ingestBundleManifest(validManifest);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected ok");
		expect(result.manifest.name).toBe("kv-cache");
		expect(result.manifest.capabilities).toHaveLength(2);
		expect(result.fact.type).toBe(REGISTRY_BUNDLE_IMPORTED);
		expect(result.fact.type).toBe("registry.BundleImported");
		expect(result.fact.data.ports).toEqual(["hobo:kv", "hobo:runner"]);
		expect(result.fact.data.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it("digests are canonical regardless of capability ordering", () => {
		const reordered = {
			...validManifest,
			capabilities: [...validManifest.capabilities].reverse(),
		};
		const a = ingestBundleManifest(validManifest);
		const b = ingestBundleManifest(reordered);
		if (!a.ok || !b.ok) throw new Error("expected ok");
		expect(bundleManifestDigest(a.manifest)).toBe(
			bundleManifestDigest(b.manifest),
		);
	});

	it("rejects non-object documents", () => {
		for (const raw of [null, 42, "manifest", [validManifest]]) {
			const result = ingestBundleManifest(raw);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected rejection");
			expect(result.errors.map((e) => e.code)).toEqual(["not-an-object"]);
		}
	});

	it("rejects an unsupported schema version", () => {
		const result = ingestBundleManifest({
			...validManifest,
			schema: "hobo.registry.bundle-manifest/v999",
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		expect(result.errors.map((e) => e.code)).toContain("unsupported-schema");
	});

	it("collects typed errors for missing identity fields", () => {
		const result = ingestBundleManifest({
			schema: BUNDLE_MANIFEST_SCHEMA,
			name: "",
			capabilities: [],
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		const codes = result.errors.map((e) => e.code).sort();
		expect(codes).toEqual([
			"missing-name",
			"missing-provider",
			"missing-version",
		]);
	});

	it("rejects malformed capabilities instead of half-importing them", () => {
		const result = ingestBundleManifest({
			...validManifest,
			capabilities: [{ port: "" }, "not-a-capability"],
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected rejection");
		expect(result.errors.every((e) => e.code === "invalid-capabilities")).toBe(
			true,
		);
		expect(result.errors).toHaveLength(2);
		expect(result.errors[0]?.path).toBe("capabilities[0].port");
	});
});
