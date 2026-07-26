import { bindle } from "@hobo/bindles";

import { shopApi } from "./api.js";
import { storefront } from "./webapp.js";

/**
 * The bindle config does the wiring:
 *  - `b.kv()` / `b.queue()` declare the backing resources (product catalog,
 *    order intake) with least-privilege `allow` verbs,
 *  - `b.api(...)` accepts and binds the shop API handler and depends on both
 *    backing resources,
 *  - `b.web(...)` defines the storefront and `.dependsOn(api)` binds it to
 *    the API.
 *
 * The bindle itself is provider-agnostic: the same definition compiles to the
 * same manifest no matter where it lands. Per-provider tuning rides along as
 * `.with(...)` annotations (one for AWS, one for Azure here) without changing
 * the manifest graph — that is what makes one unchanged bindle deployable to
 * two providers.
 */
export default bindle("multi-cloud-shop", (b) => {
	const products = b.kv().allow("get", "set");
	const orders = b.queue().allow("enqueue");
	const api = b
		.api(() => shopApi)
		.dependsOn(products, orders)
		.with(
			{ provider: "aws", option: "lambda", config: { memoryMb: 256 } },
			{ provider: "azure", option: "container-apps", config: { cpu: 0.5 } },
		);
	const web = b.web(() => storefront).dependsOn(api);
	return { products, orders, api, web };
});
