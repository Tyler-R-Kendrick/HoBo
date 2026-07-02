import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as bindles from "../src/index.js";
import { CATALOG } from "../src/catalog.js";

const SNAPSHOT_VERSION = "hobo.bindles.public-api/v1";
const FORBIDDEN_PUBLIC_SYMBOL = /aws|azure|gcp|cloudflare|rds|fargate|cosmos|internal|cloud/i;

const snapshotPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"contracts",
	"bindles-public-api.snapshot.json",
);

function allowUnion(verbs: readonly string[]): string {
	if (verbs.length === 0) return "never";
	return [...verbs]
		.sort((left, right) => left.localeCompare(right))
		.map((verb) => `"${verb}"`)
		.join(" | ");
}

function createBindlesPublicApiSnapshot(
	module: typeof bindles = bindles,
): Record<string, unknown> {
	const factoryNames = CATALOG.map((entry) => entry.factory);
	const knownExports = new Set([
		"CATALOG",
		"catalogFactoryNames",
		"secretRef",
		"bindle",
		"HOBO_BINDLES_PACKAGE",
		"MANIFEST_SCHEMA",
		"ManifestParseError",
		"aspireFallbackEnv",
		"canonicalManifestHash",
		"parseManifest",
		"parseManifestReference",
		"parseOutputPlaceholder",
		"serializeManifest",
		...factoryNames,
	]);

	const factoryExports = CATALOG.map((entry) => ({
		name: entry.factory,
		kind: "resource-factory",
		signature: `${entry.factory}(name: string): ResourceHandle<"${entry.factory}", ${allowUnion(entry.allowVerbs)}>`,
		portRef: [...entry.portRef],
		allowVerbs: [...entry.allowVerbs],
	}));

	const extraExports = Object.keys(module)
		.filter((name) => !knownExports.has(name))
		.sort((left, right) => left.localeCompare(right))
		.map((name) => ({
			name,
			kind: "unclassified-public-export",
			signature: `${name}: unknown`,
		}));

	return {
		package: "@hobo/bindles",
		version: SNAPSHOT_VERSION,
		resourceHandleSignature: {
			allow: "allow(...verbs: AllowVerb[]): ResourceHandle<Kind, NarrowedAllow>",
			descriptor: "toDescriptor(): ResourceDescriptor<Kind>",
			identity: "readonly identity: { kind: Kind; name: string; stableId: string }",
		},
		exports: [
			{
				name: "CATALOG",
				kind: "readonly-catalog",
				signature: "readonly ResourceCatalogEntry[]",
			},
			...factoryExports,
			{
				name: "catalogFactoryNames",
				kind: "catalog-helper",
				signature: "catalogFactoryNames(): ResourceKind[]",
			},
			{
				name: "secretRef",
				kind: "helper",
				signature: "secretRef(ref: string): SecretRef",
			},
			{
				name: "bindle",
				kind: "topology-builder",
				signature:
					"bindle(name: string, build: (b: BindleBuilder) => Record<string, BindleResource>): BindleDefinition",
			},
			{
				name: "HOBO_BINDLES_PACKAGE",
				kind: "package-constant",
				signature: "const HOBO_BINDLES_PACKAGE: \"@hobo/bindles\"",
			},
			{
				name: "MANIFEST_SCHEMA",
				kind: "manifest-constant",
				signature: "const MANIFEST_SCHEMA: \"hobo.manifest/v1\"",
			},
			{
				name: "ManifestParseError",
				kind: "manifest-error",
				signature: "class ManifestParseError extends Error",
			},
			{
				name: "parseManifest",
				kind: "manifest-parser",
				signature: "parseManifest(input: unknown): ManifestV1",
			},
			{
				name: "serializeManifest",
				kind: "manifest-serializer",
				signature: "serializeManifest(manifest: ManifestV1): string",
			},
			{
				name: "canonicalManifestHash",
				kind: "manifest-hasher",
				signature: "canonicalManifestHash(manifest: ManifestV1): ManifestHash",
			},
			{
				name: "parseManifestReference",
				kind: "manifest-parser",
				signature: "parseManifestReference(value: string): ManifestReference",
			},
			{
				name: "parseOutputPlaceholder",
				kind: "manifest-parser",
				signature: "parseOutputPlaceholder(value: string): OutputPlaceholder",
			},
			{
				name: "aspireFallbackEnv",
				kind: "manifest-helper",
				signature: "aspireFallbackEnv(manifest: ManifestV1): Record<string, string[]>",
			},
			...extraExports,
		],
	};
}

function assertNoInternalCloudSymbols(snapshot: Record<string, unknown>): void {
	const leaks: Array<{ path: string; value: string }> = [];
	const visit = (value: unknown, path: string) => {
		if (typeof value === "string") {
			if (FORBIDDEN_PUBLIC_SYMBOL.test(value)) leaks.push({ path, value });
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
			return;
		}
		if (value && typeof value === "object") {
			for (const [key, child] of Object.entries(value)) {
				visit(child, `${path}.${key}`);
			}
		}
	};
	visit(snapshot, "$");
	if (leaks.length > 0) {
		throw new Error(`BINDLES_API_INTERNAL_SYMBOL_LEAK: ${JSON.stringify(leaks)}`);
	}
}

describe("public API snapshot", () => {
	it("matches the frozen bindles-public-api.snapshot.json contract", () => {
		const expected = JSON.parse(readFileSync(snapshotPath, "utf8"));
		const actual = createBindlesPublicApiSnapshot();

		expect(actual).toEqual(expected);
		assertNoInternalCloudSymbols(actual);
	});

	it("does not export topology, runtime, or search symbols", () => {
		const exportNames = new Set(Object.keys(bindles));
		for (const forbidden of ["search", "camp", "yard", "junction", "workflow", "step"]) {
			expect(exportNames.has(forbidden)).toBe(false);
		}
	});

	it("fails when an internal provider symbol leaks into exports", () => {
		const polluted = createBindlesPublicApiSnapshot({
			...bindles,
			AwsRdsInternalOptions: Object.freeze({}),
		} as typeof bindles);

		expect(() => assertNoInternalCloudSymbols(polluted)).toThrow(
			/BINDLES_API_INTERNAL_SYMBOL_LEAK/,
		);
		expect(polluted.exports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "AwsRdsInternalOptions" }),
			]),
		);
	});
});
