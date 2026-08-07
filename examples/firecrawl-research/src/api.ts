import { Hono } from "hono";

const FIRECRAWL = "services__firecrawl__http__0";

interface FirecrawlSearchResult {
	readonly title?: string;
	readonly description?: string;
	readonly url?: string;
}

interface FirecrawlSearchResponse {
	readonly success: boolean;
	readonly data?: {
		readonly web?: readonly FirecrawlSearchResult[];
	};
	readonly warning?: string;
}

/**
 * Searches the live web through Firecrawl's keyless v2 API.
 *
 * HoBo injects the external dependency endpoint through the standard
 * `services__<resource>__http__0` discovery binding. No Firecrawl API key is
 * required for this example; Firecrawl's keyless tier applies its own limits.
 */
export const app = new Hono().get("/research", async (c) => {
	const query = c.req.query("q")?.trim();
	if (!query) {
		return c.json({ error: "missing query parameter: q" }, 400);
	}

	const baseUrl = process.env[FIRECRAWL]?.trim() || "https://api.firecrawl.dev";
	const response = await fetch(new URL("/v2/search", baseUrl), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query, limit: 5, sources: ["web"] }),
	});

	if (!response.ok) {
		return c.json(
			{
				error: "firecrawl request failed",
				status: response.status,
			},
			502,
		);
	}

	const result = (await response.json()) as FirecrawlSearchResponse;
	return c.json({
		query,
		results: (result.data?.web ?? []).map(({ title, description, url }) => ({
			title,
			description,
			url,
		})),
		...(result.warning ? { warning: result.warning } : {}),
	});
});
