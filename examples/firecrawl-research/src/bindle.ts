import { honoEntrypoint } from "@hobo/adapter-hono";
import { bindle } from "@hobo/bindles";

import { app } from "./api.js";

/**
 * Firecrawl is an external SaaS dependency, not a HoBo-owned resource.
 *
 * The current public SDK models that dependency with `b.external()` and wires
 * it to the API with `dependsOn()`. The endpoint is injected at runtime as
 * `services__firecrawl__http__0`.
 *
 * HOBO-43's `connector()` contract will replace this lower-level external
 * dependency declaration once that public surface is promoted from its proof.
 */
export default bindle("firecrawl-research", (b) => {
	const firecrawl = b.external({
		endpoints: { http: "https://api.firecrawl.dev" },
	});
	const api = b.api(honoEntrypoint(app)).dependsOn(firecrawl);

	return { firecrawl, api };
});
