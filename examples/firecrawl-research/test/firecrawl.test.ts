import { collectBindleManifest, readDependencyConfig } from "@hobo/bindles";
import { targetFromBindleDefinition } from "@hobo/cli";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../src/api.js";
import definition from "../src/bindle.js";

const FIRECRAWL = "services__firecrawl__http__0";
afterEach(() => delete process.env[FIRECRAWL]);

describe("firecrawl-research", () => {
	it("wires Firecrawl as an external dependency", () => {
		expect(definition.resources.firecrawl).toMatchObject({ kind: "external", stableId: "external:firecrawl" });
		expect(definition.edges).toContainEqual({ from: "api", to: "firecrawl" });
		expect(readDependencyConfig(definition.resources.firecrawl.annotations)).toEqual({ runtime: "none", kind: "external", endpoints: { http: "https://api.firecrawl.dev" } });
	});

	it("collects provider-agnostic manifest input", () => {
		const result = collectBindleManifest(targetFromBindleDefinition(definition));
		expect(result.bindleId).toBe("firecrawl-research");
		expect(result.resources).toEqual(["api", "firecrawl"]);
	});

	it("uses the injected Firecrawl endpoint without a static credential", async () => {
		process.env[FIRECRAWL] = "https://firecrawl.example/";
		const original = globalThis.fetch;
		globalThis.fetch = async (input, init) => {
			expect(String(input)).toBe("https://firecrawl.example/v2/search");
			expect(new Headers(init?.headers).has("authorization")).toBe(false);
			return Response.json({ success: true, data: { web: [{ title: "HoBo", url: "https://example.com/hobo" }] } });
		};
		try {
			const response = await app.request("/research?q=HoBo");
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ query: "HoBo" });
		} finally {
			globalThis.fetch = original;
		}
	});
});
