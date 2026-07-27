/**
 * station() Bindle-style idiom: control-plane occupancy primitive.
 * Station is NOT app-topology containment (not a parent of Yard).
 */
import {
	STATION_CONTRACT_VERSION,
	STATION_SCHEMA_VERSION,
	type Station,
	type StationConfig,
	type StationIsolation,
} from "./types.js";

function requireName(label: string, value: string): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${label} must be a non-empty string`);
	}
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value as object)) {
		deepFreeze(child);
	}
	return Object.freeze(value);
}

/**
 * Declare a Station Bindle shape. Full dogfood parallel to yard()/junction().
 * Connections and Rails remain Station aggregates (not Bindle graph resources).
 */
export function station(name: string, config: StationConfig = { isolation: {} }): Station {
	requireName("station name", name);
	if (!config || typeof config !== "object") {
		throw new TypeError("station config must be an object");
	}
	const iso = config.isolation ?? {};
	const isolation: StationIsolation = Object.freeze({
		tenant: iso.tenant ?? name,
		residency: iso.residency ?? "local",
		airgap: iso.airgap === true,
		trustDomain: iso.trustDomain ?? `${name}.hobo.local`,
	});
	const railRefs = Object.freeze([...(config.rails ?? [])]);
	const metadata = Object.freeze({ ...(config.metadata ?? {}) });
	return deepFreeze({
		kind: "station" as const,
		contract: STATION_CONTRACT_VERSION,
		schemaVersion: STATION_SCHEMA_VERSION,
		id: `station:${name}`,
		name,
		isolation,
		status: "open" as const,
		railRefs,
		metadata,
	});
}
