/**
 * Yard deploy surface: Cloudflare Environment Station (operator).
 * Anonymous-remote station bootstrap — no Bindle / app packaging here.
 * Operator deploys the station first via @hobo/provider-cloudflare Temporary
 * Accounts: same-origin `/api/cf-temp` under `astro dev`, or a Temporary
 * Accounts CORS relay (`bootstrapCorsRelayViaTemporaryAccounts` /
 * `wrangler --temporary`) for static hosts. Ship later places apps after match.
 */
export const yard = {
	targetId: "cloudflare",
	providerId: "cloudflare",
	resourceClass: "anonymous-remote",
	runtime: "cloudflare-workers",
	capabilities: ["http", "kv", "queue", "container"],
	stationBootstrap:
		"@hobo/provider-cloudflare Temporary Accounts — same-origin /api/cf-temp (astro dev) or CORS relay (bootstrapCorsRelayViaTemporaryAccounts / wrangler --temporary)",
} as const;
