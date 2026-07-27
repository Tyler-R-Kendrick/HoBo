export {
	STATION_AUDIT_RETENTION,
	STATION_EVENT_SCHEMA,
	STATION_EVENTS,
	stationEvent,
	type StationEvent,
	type StationEventType,
} from "./events.js";
export {
	createBootstrapRail,
	createRail,
	railContentHash,
	railFromBrokerConfig,
} from "./rail.js";
export { station } from "./station.js";
export {
	assertConnectionStationAccess,
	createStationClient,
	initStation,
	listStationIds,
	loadStationEvents,
	persistStationEvents,
	resolveStationContext,
	stationEventsPath,
	stationRoot,
	type InitStationResult,
	type StationClient,
} from "./station-client.js";
export {
	foldStationEvents,
	StationService,
	type StationState,
} from "./station-service.js";
export type {
	Rail,
	RailActivationStatus,
	RailPolicyEngine,
	Station,
	StationConfig,
	StationIsolation,
	StationOccupancy,
	StationStatus,
} from "./types.js";
export {
	RAIL_SCHEMA_VERSION,
	STATION_CONTRACT_VERSION,
	STATION_SCHEMA_VERSION,
} from "./types.js";

// public-contract: the package id consumers assert against.
export const HOBO_STATIONS_PACKAGE = "@hobo/stations";
