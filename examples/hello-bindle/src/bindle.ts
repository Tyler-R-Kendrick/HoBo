import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

import { app as helloApi } from "./api.js";
import {
	API_GREETING_PREFIX_KEY,
	WEB_APP_TITLE_KEY,
} from "./config.js";
import { app as helloWeb } from "./webapp.js";

/**
 * hello-bindle — one public web surface, private api behind the camp mesh.
 *
 *  - `api` is **private** (`endpoint.external: false`): no public TCP port.
 *    Consumers reach it only via camp-injected `services__api__http__0`
 *    (`http://hobo.internal/api/...`), the same posture a wasm-cloud link table
 *    would enforce.
 *  - `web` is **external** (`endpoint.external: true`): the sole exposed HTTP
 *    endpoint. It dependsOn(api) and calls the private mesh URL.
 *  - `.with({ option: "env", config })` declares camp-injected config values.
 *  - Hono is wired through `@hobo/adapter-hono` (L2 adapter), not core.
 *
 * App code never hardcodes hosts or those strings — the bare-metal Yard host
 * injects discovery + env before entrypoints run.
 */
export default bindle("hello-bindle", (b) => {
	const api = b
		.api(honoEntrypoint(helloApi))
		.with(
			{
				provider: "local",
				option: "endpoint",
				config: { external: false },
			},
			{
				provider: "local",
				option: "env",
				config: {
					[API_GREETING_PREFIX_KEY]: "from-bindle-api",
				},
			},
		);
	const web = b
		.web(honoEntrypoint(helloWeb))
		.dependsOn(api)
		.with(
			{
				provider: "local",
				option: "endpoint",
				config: { external: true },
			},
			{
				provider: "local",
				option: "env",
				config: {
					[WEB_APP_TITLE_KEY]: "from-bindle-web",
				},
			},
		);
	return { api, web };
});
