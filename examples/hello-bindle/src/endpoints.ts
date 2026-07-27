/**
 * Aspire/HoBo service-discovery endpoint resolution.
 *
 * When a bindle edge is `web.dependsOn(api)`, the camp injects the API's
 * HTTP endpoint into the consumer with the Aspire-compatible key:
 *
 *   services__<resourceName>__<endpointName>__<index>
 *
 * e.g. `services__api__http__0` → `http://127.0.0.1:4001`
 *
 * The resource name is the bindle object key (`api` in `return { api, web }`),
 * not a hardcoded host. App code never bakes in a provider URL — it only
 * names the dependency; the host resolves the value at runtime (local,
 * Cloudflare, Vercel, …).
 *
 * @see docs/design/authoring-resources-wiring.md (Aspire `services__*` convention)
 */

export type EndpointEnv = Readonly<Record<string, string | undefined>>;

/** Aspire-compatible env key for a named service endpoint. */
export function serviceEndpointKey(
	resourceName: string,
	endpointName = "http",
	index = 0,
): string {
	if (!resourceName) {
		throw new TypeError("resourceName must be a non-empty string");
	}
	return `services__${resourceName}__${endpointName}__${index}`;
}

/**
 * Resolve a named service endpoint the bindle wired via `dependsOn`.
 * Fails closed when the host has not injected the value — never invents a URL.
 */
export function resolveServiceEndpoint(
	resourceName: string,
	options: {
		readonly endpointName?: string;
		readonly index?: number;
		readonly env?: EndpointEnv;
	} = {},
): string {
	const key = serviceEndpointKey(
		resourceName,
		options.endpointName ?? "http",
		options.index ?? 0,
	);
	const env = options.env ?? process.env;
	const raw = env[key];
	if (typeof raw !== "string" || raw.trim().length === 0) {
		throw new Error(
			`unresolved service endpoint ${key}: the camp must inject the ` +
				`Aspire/HoBo services__* value for bindle dependency "${resourceName}"`,
		);
	}
	return raw.replace(/\/+$/, "");
}
