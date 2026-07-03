import { bindle } from "@hobo/bindles";

import { app as helloApi } from "./api.js";
import { app as helloWeb } from "./webapp.js";

/**
 * The bindle config does the wiring:
 *  - `b.api(...)` accepts and binds the Hono API handler,
 *  - `b.web(...)` defines the web app and `.dependsOn(api)` binds it to the API.
 *
 * Resource names come from the returned object keys ("api", "web"); the bindle
 * is a provider-agnostic manifest, so the handlers ride along as app-host
 * entrypoints (reachable via `definition.entrypoint(name)`) and never leak into
 * the serialized graph.
 */
export default bindle("hello-bindle", (b) => {
	const api = b.api(() => helloApi.fetch);
	const web = b.web(() => helloWeb.fetch).dependsOn(api);
	return { api, web };
});
