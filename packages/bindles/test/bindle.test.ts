import { describe, expect, it } from "vitest";

import { bindle } from "../src/index.js";

describe("@hobo/bindles closure builder", () => {
	it("assembles provider-agnostic manifest objects with dependsOn edges", () => {
		const manifest = bindle("hello-bindle", (b) => {
			const cache = b.cache();
			const api = b.api(() => ({ ok: true })).dependsOn(cache);
			return { cache, api };
		});

		expect(manifest.name).toBe("hello-bindle");
		expect(manifest.resources).toHaveLength(2);
		expect(manifest.resources.map((resource) => resource.kind)).toEqual(["cache", "api"]);
		expect(manifest.relationships).toEqual([
			{ from: "res_api_0001", to: "res_cache_0001", verb: "dependsOn" },
		]);
		expect(manifest.aliases.cache.generatedId).toBe("res_cache_0001");
	});
});
