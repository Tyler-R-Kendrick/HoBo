import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pact = JSON.parse(
	readFileSync(
		join(
			dirname(fileURLToPath(import.meta.url)),
			"..",
			"contracts",
			"pacts",
			"code-dev-browser-boundary.pact.json",
		),
		"utf8",
	),
) as {
	consumer: { name: string };
	provider: { name: string };
	interactions: Array<{
		description: string;
		request: { method: string; path: string };
		response: { status: number };
	}>;
};

describe("code dev-browser boundary pact", () => {
	it("pins app serving, isolated controls, and evidence persistence", () => {
		expect(pact.consumer.name).toBe("hobo-code-browser-overlay");
		expect(pact.provider.name).toBe("@hobo/code-dev-browser");
		expect(pact.interactions).toMatchObject([
			{
				request: { method: "GET", path: "/?__hobo_debug=1" },
				response: { status: 200 },
			},
			{
				request: {
					method: "GET",
					path: "/__hobo/evidence/controls/{capability}",
				},
				response: { status: 200 },
			},
			{
				request: {
					method: "POST",
					path: "/__hobo/evidence/api/actions/{capability}",
				},
				response: { status: 202 },
			},
			{
				request: {
					method: "POST",
					path: "/__hobo/evidence/api/captures/{capability}",
				},
				response: { status: 201 },
			},
		]);
	});
});
