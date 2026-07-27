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
	type StationPins,
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
export {
	createBoundaryPamGateway,
	createJumpServerPamGateway,
	createNativePamGateway,
	createPamAuditSink,
	createPrivilegedAccessGateway,
	createTeleportPamGateway,
	PAM_GATEWAY_SCHEMA,
	PAM_RAIL_CAPABILITY,
	type AuditSink,
	type CreatePrivilegedAccessGatewayOptions,
	type PamAuditEvent,
	type PamIsolationClass,
	type PamKind,
	type PrivilegedAccessGateway,
	type PrivilegedAccessGatewayHandle,
	type SessionHandle,
	type SessionRequest,
	type SessionTarget,
	type StationContext,
	railEnablesPam,
} from "./privileged-access-gateway.js";

// public-contract: the package id consumers assert against.
export const HOBO_STATIONS_PACKAGE = "@hobo/stations";
