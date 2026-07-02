import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalManifestHash, resolveLocalBindings } from "@hobo/camps";
import {
	createLocalBindingResolver,
	HELLO_BINDLE_LOCAL_ENDPOINTS,
} from "@hobo/runtime-local";
import { describe, expect, it } from "vitest";

import { buildHelloBindleManifest, buildHelloBindleTopology } from "../topology.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, "../contracts/manifests/hello-bindle.manifest.json");

describe("hello-bindle wiring e2e", () => {
	it("collects golden manifest with links and lazy token", () => {
		const manifest = buildHelloBindleManifest();

		expect(manifest.resources.api?.links).toEqual([{ import: "hobo:data", to: "db" }]);
		expect(manifest.resources.api?.env?.ConnectionStrings__db).toBe("{db.connectionString}");
		expect(manifest.resources.worker?.env?.ConnectionStrings__db).toBe("{db.connectionString}");
		expect(manifest.resources.worker?.env?.LOG_LEVEL).toBe("debug");
		expect(manifest.resources.worker?.endpoints?.http).toBeTruthy();

		const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
		if (process.env.UPDATE_GOLDEN === "1") {
			writeFileSync(goldenPath, serialized);
		}
		const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
		expect(manifest).toEqual(golden);
		expect(canonicalManifestHash(manifest).startsWith("sha256:")).toBe(true);
	});

	it("resolves runtime-local endpoint offline for hello-bindle", async () => {
		const { manifest, devCamp } = buildHelloBindleTopology();
		const resolver = createLocalBindingResolver(HELLO_BINDLE_LOCAL_ENDPOINTS);
		const env = await resolveLocalBindings(manifest, devCamp, resolver);

		expect(env.ConnectionStrings__db).toBe(
			HELLO_BINDLE_LOCAL_ENDPOINTS.db.connectionString,
		);
		expect(env.ConnectionStrings__db).toMatch(/^sqlite:\/\//);
		expect(env.ConnectionStrings__db).not.toMatch(/^\{/);
	});

	it("hello-bindle bindle stays provider-agnostic", () => {
		const { bindle: appBindle, localYard } = buildHelloBindleTopology();
		const serialized = JSON.stringify({ appBindle, localYard });

		expect(/aws|azure|gcp|cloudflare/i.test(serialized)).toBe(false);
		expect(appBindle.providerAgnostic).toBe(true);
		expect(localYard.providerId).toBe("local");
	});
});
