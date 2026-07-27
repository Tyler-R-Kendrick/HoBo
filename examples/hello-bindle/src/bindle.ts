import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

import { app as api } from "./api.js";
import { app as web } from "./webapp.js";

/** Minimal hello-world: private api + public web (defaults; no .with). */
export default bindle("hello-bindle", (b) => {
	const a = b.api(honoEntrypoint(api));
	const w = b.web(honoEntrypoint(web)).dependsOn(a);
	return { api: a, web: w };
});
