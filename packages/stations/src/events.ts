import { STATION_SCHEMA_VERSION } from "./types.js";

// public-contract: wire schema / event catalog constant.
export const STATION_EVENT_SCHEMA = "hobo.station-events/v1" as const;

// public-contract: never-compact security-audit retention for station identity / rail activation.
export const STATION_AUDIT_RETENTION = Object.freeze({
	class: "security-audit",
	neverCompact: true,
	streamPolicy: "retain-station-rail-connection-audit",
});

export const STATION_EVENTS = Object.freeze({
	Created: "station.Created",
	Configured: "station.Configured",
	Closed: "station.Closed",
	IdentityRotated: "station.IdentityRotated",
	RailPublished: "rail.Published",
	RailApproved: "rail.Approved",
	RailActivated: "rail.Activated",
	RailDeactivated: "rail.Deactivated",
	RailRetired: "rail.Retired",
} as const);

export type StationEventType =
	(typeof STATION_EVENTS)[keyof typeof STATION_EVENTS];

export type StationEvent = Readonly<{
	id: string;
	type: StationEventType;
	schemaVersion: typeof STATION_EVENT_SCHEMA;
	stationId: string;
	seq: number;
	time: string;
	retention: typeof STATION_AUDIT_RETENTION;
	data: Readonly<Record<string, unknown>>;
}>;

export function stationEvent(
	type: StationEventType,
	stationId: string,
	seq: number,
	data: Readonly<Record<string, unknown>>,
	time?: string,
): StationEvent {
	return Object.freeze({
		id: `evt-${type}-${stationId}-${seq}`,
		type,
		schemaVersion: STATION_EVENT_SCHEMA,
		stationId,
		seq,
		time: time ?? new Date().toISOString(),
		retention: STATION_AUDIT_RETENTION,
		data: Object.freeze({ ...data, stationSchema: STATION_SCHEMA_VERSION }),
	});
}
