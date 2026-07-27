import { bindle } from "@hobo/bindles";

import { app as helloApi } from "./api.js";
import {
	API_GREETING_PREFIX_KEY,
	WEB_APP_TITLE_KEY,
} from "./config.js";
import { app as helloWeb } from "./webapp.js";

/**
 * The bindle config does the wiring *and* declares camp-injected values:
 *  - `b.api(...).with({ option: "env", config })` — GREETING_PREFIX for the API
 *  - `b.web(...).with({ option: "env", config })` — APP_TITLE for the web app
 *  - `.dependsOn(api)` — service discovery key services__api__http__0
 *
 * The bare-metal Yard host reads these annotations and injects them into the
 * process env before serving entrypoints. That is the intermediary: app code
 * only reads env; the bindle is the source of the configured strings.
 *
 * Resource names ("api", "web") are also service-discovery identities.
 */
export default bindle("hello-bindle", (b) => {
	const api = b
		.api(() => helloApi.fetch)
		.with({
			provider: "local",
			option: "env",
			config: {
				// Distinctive string so e2e can prove the host injected bindle config.
				[API_GREETING_PREFIX_KEY]: "from-bindle-api",
			},
		});
	const web = b
		.web(() => helloWeb.fetch)
		.dependsOn(api)
		.with({
			provider: "local",
			option: "env",
			config: {
				[WEB_APP_TITLE_KEY]: "from-bindle-web",
			},
		});
	return { api, web };
});
