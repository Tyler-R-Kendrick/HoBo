/**
 * Yard deploy surface: Lakebed Environment Station (operator).
 * Local station registration — no Bindle / app packaging here.
 * Ship later places apps onto this station after capability match.
 */
export const yard = {
	targetId: "lakebed",
	providerId: "lakebed",
	resourceClass: "local",
	runtime: "local-station",
	capabilities: ["http", "kv", "queue", "container"],
	stationBootstrap: "local-home-station",
} as const;
