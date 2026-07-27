import { Hono } from "hono";

import {
	type ConfigEnv,
	resolveBindleConfig,
	WEB_APP_TITLE_KEY,
} from "./config.js";
import { resolveServiceEndpoint } from "./endpoints.js";

export interface GreetingPayload {
	readonly message: string;
	readonly greetingPrefix: string;
	readonly via: string;
}

/**
 * Fetch a greeting from the API using the bindle-resolved endpoint.
 *
 * The base URL comes from `services__api__http__0` (Aspire convention) —
 * the same key a camp injects when `web.dependsOn(api)` is collected.
 */
export async function fetchGreetingFromApi(
	options: {
		readonly name?: string;
		readonly env?: ConfigEnv;
		readonly fetchImpl?: typeof fetch;
	} = {},
): Promise<GreetingPayload> {
	const apiBase = resolveServiceEndpoint("api", { env: options.env });
	const url = new URL("/hello", `${apiBase}/`);
	if (options.name !== undefined && options.name.length > 0) {
		url.searchParams.set("name", options.name);
	}
	const fetchImpl = options.fetchImpl ?? fetch;
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(
			`api greeting failed: ${response.status} ${response.statusText} from ${url}`,
		);
	}
	const body = (await response.json()) as Partial<GreetingPayload>;
	if (
		typeof body.message !== "string" ||
		typeof body.greetingPrefix !== "string" ||
		typeof body.via !== "string"
	) {
		throw new Error(
			`api greeting malformed: expected { message, greetingPrefix, via }`,
		);
	}
	return {
		message: body.message,
		greetingPrefix: body.greetingPrefix,
		via: body.via,
	};
}

function renderPage(input: {
	readonly appTitle: string;
	readonly greeting: GreetingPayload;
}): string {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>${escapeHtml(input.appTitle)}</title>
	</head>
	<body>
		<h1 data-testid="app-title">${escapeHtml(input.appTitle)}</h1>
		<p>Web title and API prefix come from bindle env injected by the bare-metal camp.</p>
		<p data-testid="greeting">${escapeHtml(input.greeting.message)}</p>
		<p data-testid="greeting-prefix">${escapeHtml(input.greeting.greetingPrefix)}</p>
		<p data-testid="via">${escapeHtml(input.greeting.via)}</p>
		<p>API endpoint resolved via <code>services__api__http__0</code>.</p>
	</body>
</html>
`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/**
 * The web app: reads APP_TITLE from bindle env, resolves the named `api`
 * endpoint, fetches a greeting (which itself embeds GREETING_PREFIX), and
 * renders both — proving the camp injected bindle config for api and web.
 */
export const app = new Hono().get("/", async (c) => {
	const name = c.req.query("name") ?? undefined;
	const appTitle = resolveBindleConfig(WEB_APP_TITLE_KEY);
	const greeting = await fetchGreetingFromApi({ name });
	return c.html(renderPage({ appTitle, greeting }));
});
