/**
 * Wasm component adapter for the private `api` resource (isolated-wasm host).
 *
 * This is **not** Hono. The local Camp host uses `src/api.ts` (Hono fetch handler).
 * The isolated-wasm host componentizes this wasi:http/proxy guest instead.
 *
 * Framework adapters live with the app:
 *   - Hono  → src/api.ts / src/webapp.ts  (local component host)
 *   - Wasm  → src/adapters/wasm/*-guest.mjs (isolated-wasm component host)
 *
 * Camp config arrives only via HoBo mesh headers (x-hobo-env-*, x-hobo-bindle-env).
 */

const ENV_PREFIX = "x-hobo-env-";
const BINDLE_ENV_HEADER = "x-hobo-bindle-env";

function envGet(request, key, fallback) {
	const headerKey = ENV_PREFIX + String(key).toLowerCase();
	const direct = request.headers.get(headerKey);
	if (direct !== null && direct !== undefined && String(direct).length > 0) {
		return String(direct);
	}
	const raw = request.headers.get(BINDLE_ENV_HEADER);
	if (raw) {
		try {
			const map = JSON.parse(raw);
			if (
				map &&
				typeof map === "object" &&
				Object.prototype.hasOwnProperty.call(map, key)
			) {
				return String(map[key]);
			}
		} catch {
			// ignore malformed mesh header
		}
	}
	return fallback;
}

addEventListener("fetch", (event) => {
	event.respondWith(
		(async () => {
			try {
				const request = event.request;
				const url = new URL(request.url);
				const path = url.pathname || "/";
				// Same HTTP contract as src/api.ts (Hono adapter) — GREETING_PREFIX from mesh.
				if (path === "/hello" || path.endsWith("/hello")) {
					const prefix = envGet(request, "GREETING_PREFIX", "hello");
					const name =
						(url.searchParams.get("name") || "world").trim() || "world";
					const body = JSON.stringify({
						message: `${prefix}, ${name}`,
						greetingPrefix: prefix,
						via: "wasm-sandbox",
					});
					return new Response(body, {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (path === "/" || path === "") {
					return new Response(
						JSON.stringify({
							ok: true,
							component: "api",
							via: "wasm-sandbox",
							configVia: "hobo-mesh",
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					);
				}
				return new Response(
					JSON.stringify({ error: "not_found", path, component: "api" }),
					{
						status: 404,
						headers: { "content-type": "application/json" },
					},
				);
			} catch (error) {
				return new Response(String(error), { status: 500 });
			}
		})(),
	);
});
