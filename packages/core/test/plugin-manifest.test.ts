import { describe, expect, it } from "vitest";

import {
	isPluginPackageJson,
	PLUGIN_MANIFEST_SCHEMA,
	PluginManifestParseError,
	parsePluginManifest,
	parsePluginPackageJson,
} from "../src/index.js";

const VALID = {
	schema: PLUGIN_MANIFEST_SCHEMA,
	entry: "./dist/plugin.js",
	extensions: [
		{ point: "hobo.cloud-provider/v1", export: "createAcmeProvider" },
	],
};

describe("parsePluginManifest", () => {
	it("parses and freezes a valid manifest", () => {
		const manifest = parsePluginManifest(VALID);
		expect(manifest.schema).toBe("hobo.plugin/v1");
		expect(manifest.entry).toBe("./dist/plugin.js");
		expect(manifest.extensions).toEqual([
			{ point: "hobo.cloud-provider/v1", export: "createAcmeProvider" },
		]);
		expect(Object.isFrozen(manifest)).toBe(true);
		expect(Object.isFrozen(manifest.extensions)).toBe(true);
	});

	it("rejects a wrong or missing schema id", () => {
		expect(() =>
			parsePluginManifest({ ...VALID, schema: "hobo.plugin/v2" }),
		).toThrow(PluginManifestParseError);
		expect(() => parsePluginManifest({ ...VALID, schema: undefined })).toThrow(
			PluginManifestParseError,
		);
	});

	it("rejects a non-relative entry", () => {
		expect(() =>
			parsePluginManifest({ ...VALID, entry: "dist/plugin.js" }),
		).toThrow(/starting with \.\//);
		expect(() =>
			parsePluginManifest({ ...VALID, entry: "@acme/other" }),
		).toThrow(PluginManifestParseError);
	});

	it("rejects empty, malformed, duplicate, and extra-keyed extensions", () => {
		expect(() => parsePluginManifest({ ...VALID, extensions: [] })).toThrow(
			PluginManifestParseError,
		);
		expect(() =>
			parsePluginManifest({
				...VALID,
				extensions: [{ point: "not-an-id", export: "x" }],
			}),
		).toThrow(/hobo\.<name>\/v<major>/);
		expect(() =>
			parsePluginManifest({
				...VALID,
				extensions: [...VALID.extensions, ...VALID.extensions],
			}),
		).toThrow(/unique \(point, export\)/);
		expect(() =>
			parsePluginManifest({
				...VALID,
				extensions: [
					{ point: "hobo.cloud-provider/v1", export: "x", factory: "y" },
				],
			}),
		).toThrow(PluginManifestParseError);
	});

	it("rejects unknown top-level keys", () => {
		expect(() => parsePluginManifest({ ...VALID, autoload: true })).toThrow(
			PluginManifestParseError,
		);
	});
});

describe("parsePluginPackageJson", () => {
	it("parses a plugin package.json", () => {
		const parsed = parsePluginPackageJson({
			name: "@acme/hobo-provider-acme",
			hobo: VALID,
		});
		expect(parsed.packageName).toBe("@acme/hobo-provider-acme");
		expect(parsed.plugin.extensions).toHaveLength(1);
	});

	it("distinguishes not-a-plugin from a malformed plugin", () => {
		expect(isPluginPackageJson({ name: "@acme/plain" })).toBe(false);
		expect(isPluginPackageJson({ name: "@acme/p", hobo: VALID })).toBe(true);
		expect(() => parsePluginPackageJson({ name: "@acme/plain" })).toThrow(
			/not a HoBo plugin package/,
		);
		expect(() =>
			parsePluginPackageJson({ name: "@acme/p", hobo: { schema: "nope" } }),
		).toThrow(PluginManifestParseError);
	});
});
