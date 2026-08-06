/**
 * Yard deploy surface: Browser WASM Environment Station (operator).
 * Local station in the browser Home Station — no Bindle / app packaging.
 * Ship later places apps onto this station after capability match.
 */
export const yard = {
	targetId: "browser-wasm",
	providerId: "browser-wasm",
	resourceClass: "local",
	runtime: "hobo.browser-wit",
	capabilities: ["http", "kv", "queue"],
	stationBootstrap: "local-home-station",
} as const;
