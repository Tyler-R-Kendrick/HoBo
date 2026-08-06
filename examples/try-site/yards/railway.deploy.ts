/**
 * Yard deploy surface: Railway Environment Station (operator).
 * Anonymous-remote station bootstrap — no Bindle / app packaging here.
 * Operator deploys the station first; Ship later places apps after match.
 */
export const yard = {
	targetId: "railway",
	providerId: "railway",
	resourceClass: "anonymous-remote",
	runtime: "railway-paas",
	capabilities: ["http", "kv", "queue", "container"],
	stationBootstrap: "examples/try-site/stations/railway",
} as const;
