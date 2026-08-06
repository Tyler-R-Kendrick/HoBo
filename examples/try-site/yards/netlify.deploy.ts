/**
 * Yard deploy surface: Netlify Environment Station (operator).
 * Anonymous-remote station bootstrap — no Bindle / app packaging here.
 * Operator deploys the station first; Ship later places apps after match.
 */
export const yard = {
	targetId: "netlify",
	providerId: "netlify",
	resourceClass: "anonymous-remote",
	runtime: "netlify",
	capabilities: ["http", "container"],
	stationBootstrap: "examples/try-site/stations/netlify",
} as const;
