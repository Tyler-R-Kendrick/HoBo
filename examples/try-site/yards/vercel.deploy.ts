/**
 * Yard deploy surface: Vercel Environment Station (operator).
 * Anonymous-remote station bootstrap — no Bindle / app packaging here.
 * Operator deploys the station first; Ship later places apps after match.
 */
export const yard = {
	targetId: "vercel",
	providerId: "vercel",
	resourceClass: "anonymous-remote",
	runtime: "vercel",
	capabilities: ["http", "container"],
	stationBootstrap: "examples/try-site/stations/vercel",
} as const;
