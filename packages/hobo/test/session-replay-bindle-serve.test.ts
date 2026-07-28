import { describe, expect, it } from "vitest";

import { bindle } from "@hobo/bindles";

import {
	listServableEntrypoints,
	listServableEntrypointsWithReplay,
} from "../src/servable-entrypoints.js";

describe("session replay deep bindle serve integration", () => {
	it("wraps every web entrypoint so HTML gets bootstrap and ingest works", async () => {
		const definition = bindle("demo-app", (b) => {
			const api = b.api(() => async () =>
				new Response(JSON.stringify({ ok: true }), {
					headers: { "content-type": "application/json" },
				}),
			);
			const web = b.web(() => async () =>
				new Response("<html><body><h1>storefront</h1></body></html>", {
					headers: { "content-type": "text/html" },
				}),
			).dependsOn(api);
			return { api, web };
		});

		// Auto-annotation present on web.
		expect(
			definition.resources.web.annotations.some(
				(a) => a.option === "session-replay",
			),
		).toBe(true);

		const { entrypoints, sessionReplay } = listServableEntrypointsWithReplay(
			definition,
			{ env: {}, stationId: "station:local" },
		);
		expect(sessionReplay.enabled).toBe(true);
		expect(sessionReplay.resourceNames).toContain("web");
		expect(sessionReplay.resourceNames).not.toContain("api");

		const webEntry = entrypoints.find((e) => e.name === "web");
		expect(webEntry).toBeDefined();
		const page = await webEntry!.handler(
			new Request("http://127.0.0.1:4000/"),
		);
		const html = await page.text();
		expect(html).toContain('data-hobo-replay="1"');
		expect(page.headers.get("x-hobo-session-replay")).toBe("1");

		const ingest = await webEntry!.handler(
			new Request("http://127.0.0.1:4000/__hobo/replay/ingest", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					sessionId: "sess-demo-1",
					seq: 0,
					events: [{ type: 2, timestamp: 1, data: { tagName: "div" } }],
				}),
			}),
		);
		expect(ingest.status).toBe(202);

		// listServableEntrypoints convenience still returns wrapped handlers
		const plain = listServableEntrypoints(definition, { env: {} });
		const plainWeb = plain.find((e) => e.name === "web");
		const page2 = await plainWeb!.handler(new Request("http://x/"));
		expect(await page2.text()).toContain("data-hobo-replay");
	});

	it("HOBO_REPLAY=0 disables HTML injection", async () => {
		const definition = bindle("off-app", (b) => ({
			web: b.web(() => async () =>
				new Response("<html><body>x</body></html>", {
					headers: { "content-type": "text/html" },
				}),
			),
		}));
		const { entrypoints, sessionReplay } = listServableEntrypointsWithReplay(
			definition,
			{ env: { HOBO_REPLAY: "0" } },
		);
		expect(sessionReplay.enabled).toBe(false);
		const html = await entrypoints[0]!.handler(new Request("http://x/")).then(
			(r) => r.text(),
		);
		expect(html).not.toContain("data-hobo-replay");
	});
});
