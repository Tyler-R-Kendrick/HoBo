import { describe, expect, it } from "vitest";

import { loadExamplesCatalog } from "./catalog.js";
import { parseExamplesCatalog } from "./catalog-contract.js";

describe("Examples catalog", () => {
	it("loads the four try-site examples from their repository folders", async () => {
		const catalog = await loadExamplesCatalog();

		expect(catalog.map((example) => example.id)).toEqual([
			"hello-counter",
			"kv-notes",
			"queue-echo",
			"todo-api",
		]);
		expect(catalog[0]).toMatchObject({
			entry: "app.ts",
			sourcePath: "examples/try-site/apps/hello-counter/app.ts",
			ui: "counter",
		});
		expect(catalog[0]?.source).toContain("bindle(");
		expect(catalog[0]?.source).toContain('"hello-counter"');
		expect(catalog[0]?.source).toContain('action: "increment"');
		expect(catalog[0]?.runtime).toMatchObject({
			schemaVersion: "hobo.try-runtime/v1",
			resources: { count: { kind: "kv", initial: { count: 0 } } },
		});
		expect(catalog[0]?.runtime.routes[1]).toMatchObject({
			action: "read",
			resource: "count",
			key: "count",
		});
	});

	it("fails closed when the browser catalog has a malformed nested contract", async () => {
		const catalog = structuredClone(await loadExamplesCatalog()) as unknown[];
		expect(parseExamplesCatalog(catalog)).toHaveLength(4);
		const first = catalog[0] as { runtime: { routes: { action: string }[] } };
		first.runtime.routes[0]!.action = "execute-arbitrary-code";

		expect(() => parseExamplesCatalog(catalog)).toThrow(/action is invalid/);
	});

	it("keeps policy layers sparse and provider selection on individual Yards", async () => {
		const catalog = await loadExamplesCatalog();
		const counter = catalog.find(({ id }) => id === "hello-counter");
		const notes = catalog.find(({ id }) => id === "kv-notes");
		const queue = catalog.find(({ id }) => id === "queue-echo");

		expect(counter?.appPolicy).toEqual({});
		expect(counter?.topology.allowedYardIds).toBeNull();
		expect(counter?.deploymentPolicy).toEqual({});
		expect(notes?.appPolicy).toEqual({ redundancy: "active-passive" });
		expect(notes?.deploymentPolicy).toEqual({ maxReplicas: 2 });
		expect(queue?.appPolicy).toEqual({ redundancy: "mirror" });
		expect(queue?.deploymentPolicy).toEqual({ maxReplicas: 3 });
		expect(queue?.topology.allowedYardIds).toEqual([
			"yard:browser-wasm",
			"yard:webernetes",
			"yard:lakebed",
		]);
		expect(
			new Set(counter?.topology.yards.map(({ providerId }) => providerId)).size,
		).toBe(counter?.topology.yards.length);
	});
});
