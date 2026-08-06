/**
 * Yard deploy surface: Kubernetes (local simulation) Environment Station.
 * Local lowered station — no Bindle / app packaging here.
 */
export const yard = {
	targetId: "kubernetes",
	providerId: "kubernetes",
	resourceClass: "local",
	runtime: "local-webernetes-lowered",
	capabilities: ["http"],
	stationBootstrap: "local-home-station",
} as const;
