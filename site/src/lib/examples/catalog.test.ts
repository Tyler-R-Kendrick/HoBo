import { describe, expect, it } from "vitest";

import { loadExamplesCatalog } from "./catalog.js";
import { parseExamplesCatalog } from "./catalog-contract.js";

describe("Examples catalog", () => {
	it("loads the five try-site examples from their repository folders", async () => {
		const catalog = await loadExamplesCatalog();

		expect(catalog.map((example) => example.id)).toEqual([
			"hello-world",
			"kv-notes",
			"opensaas",
			"queue-echo",
			"todo-api",
		]);
		expect(catalog[0]).toMatchObject({
			entry: "app.ts",
			sourcePath: "examples/try-site/apps/hello-world/app.ts",
			ui: "hello",
		});
		expect(catalog[0]?.source).toContain("bindle(");
		expect(catalog[0]?.source).toContain("b.web(Hello)");
		expect(catalog[0]?.source).toContain("@trainable");
		expect(catalog[0]?.source).not.toContain("handlers.mjs");
		expect(catalog[0]?.source).not.toContain("export const runtime");
		expect(catalog[0]?.handlersSource).toContain("greet");
		expect(catalog[0]?.handlersSource).toContain("Hello World!");
		expect(catalog[0]?.runtime).toMatchObject({
			schemaVersion: "hobo.try-runtime/v1",
			resources: {},
		});
		expect(catalog[0]?.runtime.routes).toEqual([
			{ method: "GET", path: "/health", action: "health" },
			{ method: "POST", path: "/api/greet", action: "greet" },
		]);
		const saas = catalog.find(({ id }) => id === "opensaas");
		expect(saas?.source).toContain("b.container");
		expect(saas?.source).toContain("b.service");
		expect(saas?.deployKind).toBe("local-bridge");
		expect(saas?.handlersSource).toBe("");
		expect(saas?.source).not.toContain("// === Executed:");
	});

	it("fails closed when the browser catalog has a malformed nested contract", async () => {
		const catalog = structuredClone(await loadExamplesCatalog()) as unknown[];
		expect(parseExamplesCatalog(catalog)).toHaveLength(5);
		const first = catalog[0] as { runtime: { routes: { action: string }[] } };
		first.runtime.routes[0]!.action = "execute-arbitrary-code";

		expect(() => parseExamplesCatalog(catalog)).toThrow(/action is invalid/);
	});

	it("keeps policy layers sparse and provider selection on individual Yards", async () => {
		const catalog = await loadExamplesCatalog();
		const hello = catalog.find(({ id }) => id === "hello-world");
		const notes = catalog.find(({ id }) => id === "kv-notes");
		const queue = catalog.find(({ id }) => id === "queue-echo");
		const saas = catalog.find(({ id }) => id === "opensaas");

		expect(hello?.appPolicy).toEqual({});
		expect(hello?.topology.allowedYardIds).toBeNull();
		expect(hello?.deploymentPolicy).toEqual({});
		expect(notes?.appPolicy).toEqual({ redundancy: "active-passive" });
		expect(notes?.deploymentPolicy).toEqual({ maxReplicas: 2 });
		expect(queue?.appPolicy).toEqual({ redundancy: "mirror" });
		expect(queue?.deploymentPolicy).toEqual({ maxReplicas: 3 });
		expect(queue?.topology.allowedYardIds).toEqual([
			"yard:browser-wasm",
			"yard:webernetes",
			"yard:lakebed",
		]);
		expect(saas?.ui).toBe("saas");
		expect(saas?.topology.allowedYardIds).toEqual([
			"yard:webernetes",
			"yard:lakebed",
			"yard:cloudflare",
			"yard:railway",
		]);
		expect(
			new Set(hello?.topology.yards.map(({ providerId }) => providerId)).size,
		).toBe(hello?.topology.yards.length);
	});
});
