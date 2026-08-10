import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
	canonicalJson,
	PackError,
	parseImageDigest,
	parsePackId,
	parsePackManifest,
	parsePinnedImageRef,
} from "../src/index.js";
import { FIXTURE_DIGEST_AMD64, fixtureManifest } from "./harness.js";

function expectPackError(fn: () => unknown, code: string): PackError {
	try {
		fn();
	} catch (error) {
		assert.ok(
			error instanceof PackError,
			`expected a PackError, got ${String(error)}`,
		);
		assert.equal(error.code, code);
		return error;
	}
	throw new Error(`expected ${code} but nothing was thrown`);
}

describe("digest pinning", () => {
	it("accepts a fully qualified digest reference", () => {
		const parsed = parsePinnedImageRef(
			`registry.example.test/example/pack@${FIXTURE_DIGEST_AMD64}`,
		);
		assert.equal(parsed.registry, "registry.example.test");
		assert.equal(parsed.repositoryPath, "example/pack");
		assert.equal(parsed.digest, FIXTURE_DIGEST_AMD64);
	});

	it("refuses a moving tag", () => {
		expectPackError(
			() => parsePinnedImageRef("docker.io/library/postgres:17"),
			"PACK_INTEGRITY_UNVERIFIED",
		);
	});

	it("refuses a tag smuggled in alongside a digest", () => {
		expectPackError(
			() =>
				parsePinnedImageRef(
					`docker.io/library/postgres:17@${FIXTURE_DIGEST_AMD64}`,
				),
			"PACK_INTEGRITY_UNVERIFIED",
		);
	});

	it("refuses a short or uppercase digest", () => {
		expectPackError(
			() => parseImageDigest("sha256:abc"),
			"PACK_INTEGRITY_UNVERIFIED",
		);
		expectPackError(
			() => parseImageDigest(FIXTURE_DIGEST_AMD64.toUpperCase()),
			"PACK_INTEGRITY_UNVERIFIED",
		);
	});

	it("requires an explicit registry host so nobody has to guess the default", () => {
		expectPackError(
			() => parsePinnedImageRef(`postgres@${FIXTURE_DIGEST_AMD64}`),
			"PACK_MANIFEST_INVALID",
		);
	});
});

describe("pack ids", () => {
	it("parses family and qualifiers", () => {
		const parsed = parsePackId("pack.postgres.oci/v1");
		assert.equal(parsed.family, "postgres");
		assert.deepEqual(parsed.qualifiers, ["oci"]);
		assert.equal(parsed.major, 1);
	});

	it("rejects an id that is not pack-namespaced", () => {
		expectPackError(
			() => parsePackId("data.postgres/v1"),
			"PACK_MANIFEST_INVALID",
		);
	});
});

describe("parsePackManifest", () => {
	it("parses the fixture and forces pack realization", () => {
		const manifest = parsePackManifest(fixtureManifest());
		assert.equal(manifest.packId, "pack.example.oci/v1");
		assert.deepEqual(
			manifest.implementsProfiles.map((claim) => claim.realization),
			["pack"],
		);
		assert.equal(manifest.images.length, 2);
	});

	it("orders images, ports, and config keys canonically", () => {
		const a = parsePackManifest(fixtureManifest());
		const b = parsePackManifest(
			fixtureManifest((draft) => ({
				...draft,
				images: [...draft.images].reverse(),
				configSchema: [...draft.configSchema].reverse(),
			})),
		);
		assert.equal(
			canonicalJson(a.images.map((image) => image.architecture)),
			canonicalJson(b.images.map((image) => image.architecture)),
		);
		assert.equal(
			canonicalJson(a.configSchema.map((field) => field.key)),
			canonicalJson(b.configSchema.map((field) => field.key)),
		);
	});

	it("rejects an unknown schema version as a contract change", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						schemaVersion: "hobo.pack-manifest/v2",
					})),
				),
			"PROVIDER_CONTRACT_CHANGED",
		);
	});

	it("rejects an unsupported architecture", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						images: [
							{
								architecture: "linux/riscv64",
								reference: `registry.example.test/example/pack@${FIXTURE_DIGEST_AMD64}`,
							},
						],
					})),
				),
			"ARCHITECTURE_UNSUPPORTED",
		);
	});

	it("rejects images pulled from two different repositories", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						images: [
							{
								architecture: "linux/amd64",
								reference: `registry.example.test/example/pack@${FIXTURE_DIGEST_AMD64}`,
							},
							{
								architecture: "linux/arm64",
								reference: `registry.example.test/other/pack@${FIXTURE_DIGEST_AMD64}`,
							},
						],
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects a persistent pack with no declared volume", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						persistence: { requirement: "required", volumes: [] },
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects a persistent pack that exposes no volume configuration key", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						configSchema: draft.configSchema.filter(
							(field) => field.kind !== "volume-name",
						),
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects a default value on a required configuration key", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						configSchema: draft.configSchema.map((field) =>
							field.key === "dataVolume"
								? { ...field, defaultValue: "data" }
								: field,
						),
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects a probe whose timeout exceeds its period", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						probes: {
							readiness: {
								kind: "tcp",
								portName: "main",
								initialDelayMs: 0,
								periodMs: 1000,
								timeoutMs: 5000,
								failureThreshold: 3,
							},
						},
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects a probe that references an undeclared port", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						probes: {
							readiness: {
								kind: "tcp",
								portName: "nope",
								initialDelayMs: 0,
								periodMs: 1000,
								timeoutMs: 500,
								failureThreshold: 3,
							},
						},
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects an ownership strategy that implies a provider claim", () => {
		expectPackError(
			() =>
				parsePackManifest(
					// A pack manifest arriving as JSON can carry any string here;
					// `provider-claim` is exactly the value that must not survive.
					fixtureManifest((draft) => ({
						...draft,
						ownership: "provider-claim" as unknown as typeof draft.ownership,
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects an operation that asks for a shell", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						operations: draft.operations.map((operation) => ({
							...operation,
							shell: true as unknown as false,
						})),
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});

	it("rejects provenance with no cited source", () => {
		expectPackError(
			() =>
				parsePackManifest(
					fixtureManifest((draft) => ({
						...draft,
						provenance: { ...draft.provenance, sourceRefs: [] },
					})),
				),
			"PACK_MANIFEST_INVALID",
		);
	});
});

describe("canonicalJson", () => {
	it("sorts object keys at every depth but preserves array order", () => {
		assert.equal(
			canonicalJson({ b: 1, a: { d: [3, 1, 2], c: true } }),
			'{"a":{"c":true,"d":[3,1,2]},"b":1}',
		);
	});

	it("is stable across authoring order", () => {
		assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
	});
});
