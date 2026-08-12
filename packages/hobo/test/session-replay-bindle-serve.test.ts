import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindle } from "@hobo/bindles";
import { describe, expect, it } from "vitest";

import {
	listServableEntrypoints,
	listServableEntrypointsWithReplay,
} from "../src/servable-entrypoints.js";

describe("session replay deep bindle serve integration", () => {
	it("discovers the running hobo-code evidence capability", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-evidence-discovery-"));
		try {
			mkdirSync(join(hoboHome, "runtime", "code"), { recursive: true });
			writeFileSync(
				join(hoboHome, "runtime", "code", "evidence-controls-url"),
				"http://127.0.0.1:4319/__hobo/evidence/controls/capability\n",
			);
			const definition = bindle("discovered-app", (b) => ({
				web: b.web(
					() => async () =>
						new Response("<html><body>discovered</body></html>", {
							headers: { "content-type": "text/html" },
						}),
				),
			}));
			const [web] = listServableEntrypoints(definition, {
				env: { HOBO_HOME: hoboHome, HOBO_REPLAY: "0" },
			});
			const html = await (
				await web!.handler(new Request("http://127.0.0.1:4000/"))
			).text();
			expect(html).toContain(
				"controls/capability?parentOrigin=http%3A%2F%2F127.0.0.1%3A4000",
			);
		} finally {
			rmSync(hoboHome, { recursive: true, force: true });
		}
	});
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
		const bo = await entries
			.find((entry) => entry.name === "web")!
			.handler(
				new Request("http://127.0.0.1:4000/__hobo/evidence/bo-idle.png"),
			);
		expect(bo.headers.get("content-type")).toBe("image/png");
		expect(new Uint8Array(await bo.arrayBuffer()).slice(0, 8)).toEqual(
			Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		);

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
						"content-security-policy":
							"default-src 'self'; script-src 'unsafe-inline'; style-src 'none'; img-src 'none'",
						etag: '"locked-v1"',
						digest: "sha-256=:stale:",
						integrity: "stale",
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
		expect(wrapped.headers.has("etag")).toBe(false);
		expect(wrapped.headers.has("digest")).toBe(false);
		expect(wrapped.headers.has("integrity")).toBe(false);

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
						headers: {
							"content-type": "text/html",
							"content-length": "30",
							etag: '"safe-v1"',
						},
					}),
			),
		}));
		const [web] = listServableEntrypoints(definition, {
			env: { HOBO_REPLAY: "0" },
			evidenceControlsUrl: "http://127.0.0.1:4000/controls",
		});
		const response = await web!.handler(new Request("http://127.0.0.1:4000/"));
		expect(await response.text()).not.toContain(
			"data-hobo-evidence-overlay-bridge",
		);
		expect(response.headers.get("x-hobo-evidence-overlay")).toBe(
			"refused-same-origin",
		);
		expect(response.headers.get("content-length")).toBe("30");
		expect(response.headers.get("etag")).toBe('"safe-v1"');
	});

	it("leaves encoded HTML untouched instead of injecting invalid bytes", async () => {
		const encoded = new Uint8Array([31, 139, 8, 0, 1, 2, 3, 4]);
		const definition = bindle("encoded-app", (b) => ({
			web: b.web(
				() => async () =>
					new Response(encoded, {
						headers: {
							"content-type": "text/html",
							"content-encoding": "gzip",
							"content-length": String(encoded.byteLength),
							etag: '"encoded-v1"',
						},
					}),
			),
		}));
		const [web] = listServableEntrypoints(definition, {
			env: { HOBO_REPLAY: "0" },
			evidenceControlsUrl: "http://127.0.0.1:4319/controls",
		});

		const response = await web!.handler(new Request("http://127.0.0.1:4000/"));
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(encoded);
		expect(response.headers.get("content-encoding")).toBe("gzip");
		expect(response.headers.get("content-length")).toBe("8");
		expect(response.headers.get("etag")).toBe('"encoded-v1"');
		expect(response.headers.get("x-hobo-evidence-overlay")).toBeNull();
	});

	it("drops stale body validators after injecting the bridge", async () => {
		const staleHeaders = [
			"content-length",
			"etag",
			"integrity",
			"content-integrity",
			"content-md5",
			"digest",
			"content-digest",
			"repr-digest",
		] as const;
		const definition = bindle("validator-app", (b) => ({
			web: b.web(
				() => async () =>
					new Response("<html><body>fresh</body></html>", {
						headers: {
							"content-type": "text/html",
							...Object.fromEntries(
								staleHeaders.map((name) => [name, "stale"]),
							),
						},
					}),
			),
		}));
		const [web] = listServableEntrypoints(definition, {
			env: { HOBO_REPLAY: "0" },
			evidenceControlsUrl: "http://127.0.0.1:4319/controls",
		});

		const response = await web!.handler(new Request("http://127.0.0.1:4000/"));
		expect(await response.text()).toContain(
			"data-hobo-evidence-overlay-bridge",
		);
		for (const name of staleHeaders)
			expect(response.headers.has(name)).toBe(false);
	});
});
