import { describe, expect, it } from "vitest";

import { GET } from "../../pages/examples/index.json.js";

describe("Examples catalog endpoint", () => {
	it("prerenders the repository catalog as JSON", async () => {
		const response = await GET({} as never);
		const catalog = (await response.json()) as { id: string; sourcePath: string }[];

		expect(response.headers.get("content-type")).toContain("application/json");
		expect(catalog).toHaveLength(4);
		expect(catalog[0]?.sourcePath).toBe(
			"examples/try-site/apps/hello-world/app.ts",
		);
	});
});
