import { describe, expect, it } from "vitest";

import { loadExamplesCatalog } from "./catalog.js";

describe("Examples catalog", () => {
	it("loads the four try-site examples from their repository folders", async () => {
		const catalog = await loadExamplesCatalog(process.cwd());

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

	it("keeps policy layers sparse and provider selection on individual Yards", async () => {
		const catalog = await loadExamplesCatalog(process.cwd());
		const counter = catalog.find(({ id }) => id === "hello-counter");
		const notes = catalog.find(({ id }) => id === "kv-notes");
		const queue = catalog.find(({ id }) => id === "queue-echo");

		expect(counter?.appPolicy).toEqual({});
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
