import { bindle } from "@hobo/bindles";
import { firecrawl as firecrawlConnector } from "@hobo/connector-firecrawl";
import { Firecrawl } from "firecrawl";

/**
 * A tiny HTTP handler factory kept inline so the example focuses on connector
 * wiring rather than an application framework.
 *
 * The connector symbol declares which external service the Bindle needs. The
 * official Firecrawl SDK remains an ordinary application dependency. At serve
 * time the Station supplies a runtime context, resolves the connector against
 * its Connection inventory, and issues the short-lived token used by the SDK.
 */
export default bindle("firecrawl-research", (b) => {
	const firecrawl = b.connector(firecrawlConnector).allow("search");

	const api = b
		.api((ctx) => {
			if (!ctx) {
				throw new Error("firecrawl-research requires a Station runtime context");
			}

			return async (request: Request): Promise<Response> => {
				const url = new URL(request.url);
				if (url.pathname !== "/research") {
					return new Response("Not found", { status: 404 });
				}

				const query = url.searchParams.get("q")?.trim();
				if (!query) {
					return Response.json(
						{ error: "missing query parameter: q" },
						{ status: 400 },
					);
				}

				const connection = ctx.connector(firecrawl);
				const { token } = await connection.token({ action: "search" });
				const client = new Firecrawl({ apiKey: token });
				const result = await client.search(query, { limit: 5 });

				return Response.json(result);
			};
		})
		.dependsOn(firecrawl);

	return { api };
});
