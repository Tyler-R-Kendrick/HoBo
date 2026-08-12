import { bindle } from "@hobo/bindles";
import { describe, expect, it } from "vitest";

import {
	listServableEntrypoints,
	listServableEntrypointsWithReplay,
} from "../src/servable-entrypoints.js";

describe("session replay deep bindle serve integration", () => {
	it("wraps every web entrypoint so HTML gets bootstrap and ingest works", async () => {
		const definition = bindle("demo-app", (b) => {
			const api = b.api(
				() => async () =>
					new Response(JSON.stringify({ ok: true }), {
						headers: { "content-type": "application/json" },
					}),
			);
			const web = b
				.web(
					() => async () =>
						new Response("<html><body><h1>storefront</h1></body></html>", {
							headers: { "content-type": "text/html" },
						}),
				)
				.dependsOn(api);
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
		// Every App Kit (web + api) is replayable by default.
		expect(sessionReplay.resourceNames).toContain("web");
		expect(sessionReplay.resourceNames).toContain("api");
		expect(sessionReplay.reason).toBe("bindle-kit-default-on");

		const webEntry = entrypoints.find((e) => e.name === "web");
		const apiEntry = entrypoints.find((e) => e.name === "api");
		expect(webEntry).toBeDefined();
		expect(apiEntry).toBeDefined();
		const page = await webEntry!.handler(new Request("http://127.0.0.1:4000/"));
		const html = await page.text();
		expect(html).toContain('data-hobo-replay="1"');
		expect(page.headers.get("x-hobo-session-replay")).toBe("1");

		// API Kit also exposes ingest on the wrap (JSON body pass-through).
		const apiJson = await apiEntry!.handler(new Request("http://x/api"));
		expect(await apiJson.json()).toEqual({ ok: true });
		const apiIngest = await apiEntry!.handler(
			new Request("http://127.0.0.1:4000/__hobo/replay/ingest", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					sessionId: "sess-api-1",
					seq: 0,
					events: [{ type: 2, timestamp: 1, data: { tagName: "div" } }],
				}),
			}),
		);
		expect(apiIngest.status).toBe(202);

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
			web: b.web(
				() => async () =>
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
		const html = await entrypoints[0]!
			.handler(new Request("http://x/"))
			.then((r) => r.text());
		expect(html).not.toContain("data-hobo-replay");
	});

	it("composes the separate-origin evidence bridge after replay for HTML only", async () => {
		const definition = bindle("evidence-app", (b) => ({
			web: b.web(
				() => async () =>
					new Response("<html><body>evidence</body></html>", {
						headers: { "content-type": "text/html; charset=utf-8" },
					}),
			),
			api: b.api(
				() => async () =>
					new Response('{"ok":true}', {
						headers: { "content-type": "application/json" },
					}),
			),
		}));
		const entries = listServableEntrypoints(definition, {
			env: {},
			evidenceControlsUrl: "http://127.0.0.1:4319/__hobo/evidence/controls",
		});

		const web = await entries
			.find((entry) => entry.name === "web")!
			.handler(new Request("http://127.0.0.1:4000/"));
		const html = await web.text();
		expect(html).toContain('data-hobo-replay="1"');
		expect(html).toContain('data-hobo-evidence-overlay-bridge="1"');
		expect(html).toContain("http://127.0.0.1:4319/__hobo/evidence/controls");
		expect(html.indexOf('data-hobo-replay="1"')).toBeLessThan(
			html.indexOf('data-hobo-evidence-overlay-bridge="1"'),
		);
		expect(web.headers.get("x-hobo-evidence-overlay")).toBe("bridge");

		const api = await entries
			.find((entry) => entry.name === "api")!
			.handler(new Request("http://127.0.0.1:4000/api"));
		expect(await api.text()).toBe('{"ok":true}');
		expect(api.headers.get("x-hobo-evidence-overlay")).toBeNull();
	});

	it("uses an iframe wrapper when CSP prevents inline bridge injection", async () => {
		let seenUrl = "";
		const definition = bindle("csp-app", (b) => ({
			web: b.web(() => async (request) => {
				seenUrl = request.url;
				return new Response("<html><body>locked</body></html>", {
					headers: {
						"content-type": "text/html",
						"content-security-policy": "default-src 'self'; script-src 'self'",
					},
				});
			}),
		}));
		const [web] = listServableEntrypoints(definition, {
			env: {
				HOBO_CODE_EVIDENCE_CONTROLS_URL:
					"http://127.0.0.1:4319/__hobo/evidence/controls",
			},
		});

		const wrapped = await web!.handler(
			new Request("http://127.0.0.1:4000/products?view=grid"),
		);
		const wrapperHtml = await wrapped.text();
		expect(wrapped.headers.get("x-hobo-evidence-overlay")).toBe("wrapper");
		expect(wrapperHtml).toContain("HoBo evidence workspace");
		expect(wrapperHtml).toContain("__hobo_evidence_raw=1");
		expect(wrapperHtml).toContain(
			"http://127.0.0.1:4319/__hobo/evidence/controls",
		);

		const raw = await web!.handler(
			new Request(
				"http://127.0.0.1:4000/products?view=grid&__hobo_evidence_raw=1",
			),
		);
		const rawHtml = await raw.text();
		expect(seenUrl).toBe("http://127.0.0.1:4000/products?view=grid");
		expect(rawHtml).toContain('data-hobo-replay="1"');
		expect(rawHtml).not.toContain("data-hobo-evidence-overlay-bridge");
	});

	it("refuses same-origin controls without changing the app response", async () => {
		const definition = bindle("unsafe-app", (b) => ({
			web: b.web(
				() => async () =>
					new Response("<html><body>safe</body></html>", {
						headers: { "content-type": "text/html" },
					}),
			),
		}));
		const [web] = listServableEntrypoints(definition, {
			env: {},
			evidenceControlsUrl: "http://127.0.0.1:4000/controls",
		});
		const response = await web!.handler(new Request("http://127.0.0.1:4000/"));
		expect(await response.text()).not.toContain(
			"data-hobo-evidence-overlay-bridge",
		);
		expect(response.headers.get("x-hobo-evidence-overlay")).toBe(
			"refused-same-origin",
		);
	});
});
