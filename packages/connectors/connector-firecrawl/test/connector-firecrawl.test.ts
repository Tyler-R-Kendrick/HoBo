import { connectorDefinition } from "@hobo/bindles/connector";
import { describe, expect, it } from "vitest";

import { firecrawl } from "../src/index.js";

describe("@hobo/connector-firecrawl", () => {
	it("exports an opaque connector symbol with Auth.md discovery metadata", () => {
		expect(typeof firecrawl).toBe("symbol");
		expect(connectorDefinition(firecrawl)).toEqual({
			kind: "connector-definition",
			id: "firecrawl",
			origin: "https://api.firecrawl.dev",
			auth: {
				protocol: "auth.md",
				discovery: "https://www.firecrawl.dev/auth.md",
			},
			capabilities: ["search", "scrape", "map", "extract"],
		});
	});
});
