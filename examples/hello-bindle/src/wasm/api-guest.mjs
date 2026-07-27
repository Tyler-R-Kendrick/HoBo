/** Isolated-wasm guest for private api (mirrors GET /hello). */
addEventListener("fetch", (event) => {
	event.respondWith(
		(async () => {
			const url = new URL(event.request.url);
			if (url.pathname !== "/hello" && !url.pathname.endsWith("/hello")) {
				return new Response("not found", { status: 404 });
			}
			const name = (url.searchParams.get("name") || "world").trim() || "world";
			// Optional camp mesh header; default "hello".
			const prefix =
				event.request.headers.get("x-hobo-env-greeting_prefix") || "hello";
			return new Response(
				JSON.stringify({
					message: `${prefix}, ${name}`,
					greetingPrefix: prefix,
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		})(),
	);
});
