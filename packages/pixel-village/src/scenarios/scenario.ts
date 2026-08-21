/**
 * Deterministic scenario scripts: pure data + functions, no node imports.
 * A scenario replays a scripted YardProjectionSnapshot timeline so evidence
 * runs and headless tests see the exact same yard on every run.
 */

import type { YardProjectionSnapshot } from "@hobo/management";

import { YARD_LAYOUT, type ZoneId } from "../layout.js";
import type { YardTestState } from "../test-seam.js";

export type BeatRegion = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export type ExpectedBeat = Readonly<{
	atTick: number;
	label: string;
	region: BeatRegion;
	/** True when pixels inside region must differ from the previous beat. */
	mustChange: boolean;
	seamPredicate: (state: YardTestState) => boolean;
}>;

export type YardScenario = Readonly<{
	id: string;
	seed: number;
	description: string;
	ticksPerSecond: number;
	totalTicks: number;
	/** Pure: same tick → deep-equal snapshot. seq is monotonic over ticks. */
	snapshotAt(tick: number): YardProjectionSnapshot;
	expectedBeats: readonly ExpectedBeat[];
}>;

type Snapshot = YardProjectionSnapshot;
type Occupancy = Snapshot["occupancy"];
type RailView = Snapshot["rails"][number];
type ConnectionView = Snapshot["connections"][number];
type ActivityView = Snapshot["activity"][number];
type MeteringView = Snapshot["metering"];
type DoctorView = Snapshot["doctor"];

export const SCENARIO_STATION_ID = "station:scenario";
const TENANT = "local";
const T0 = "2026-01-01T00:00:00.000Z";

const SUBJECT: ConnectionView["subject"] = Object.freeze({
	kind: "user",
	id: "user:demo",
});

/** Freeze an ExpectedBeat while keeping predicate contextual typing. */
export function beat(b: ExpectedBeat): ExpectedBeat {
	return Object.freeze({ ...b, region: Object.freeze({ ...b.region }) });
}

/** Beat region from a layout zone rect — never hand-typed coordinates. */
export function zoneRegion(id: ZoneId): BeatRegion {
	const z = YARD_LAYOUT.zones[id];
	return Object.freeze({ x: z.x, y: z.y, w: z.width, h: z.height });
}

/** Beat region for the cost meter HUD rect. */
export function costMeterRegion(): BeatRegion {
	const m = YARD_LAYOUT.costMeter;
	return Object.freeze({ x: m.x, y: m.y, w: m.width, h: m.height });
}

export function makeRail(patch: Partial<RailView> = {}): RailView {
	return Object.freeze({
		id: "rail-1",
		name: "default",
		contentHash:
			"sha256:1111111111111111111111111111111111111111111111111111111111111111",
		activationStatus: "active",
		isBootstrap: false,
		quotaUsed: 0,
		quotaLimit: 1000,
		spendCapUsd: 100,
		budgetUsd: 0,
		...patch,
	});
}

export function makeConnection(
	patch: Partial<ConnectionView> = {},
): ConnectionView {
	return Object.freeze({
		id: "conn-1",
		alias: "work",
		provider: "github",
		flow: "api-key",
		status: "active",
		subject: SUBJECT,
		// SAFETY: `grantedScopes: Object.freeze(["repo"]) as readonly string[],` is required at this I/O or test boundary.
		grantedScopes: Object.freeze(["repo"]) as readonly string[],
		// SAFETY: `requestedScopes: Object.freeze(["repo"]) as readonly string[],` is required at this I/O or test boundary.
		requestedScopes: Object.freeze(["repo"]) as readonly string[],
		stationId: SCENARIO_STATION_ID,
		tenant: TENANT,
		createdAt: T0,
		updatedAt: T0,
		metadata: Object.freeze({}),
		...patch,
	});
}

export function makeActivity(patch: Partial<ActivityView> = {}): ActivityView {
	return Object.freeze({
		connectorKind: "swe-claude",
		status: "working",
		connectionId: "conn-1",
		...patch,
	});
}

export function makeOccupancy(patch: Partial<Occupancy> = {}): Occupancy {
	return Object.freeze({
		stationId: SCENARIO_STATION_ID,
		dataDir: "scenario://in-memory",
		status: "open",
		isolation: Object.freeze({
			tenant: TENANT,
			residency: "local",
			airgap: false,
			trustDomain: "yard.local",
		}),
		bootstrapActive: false,
		connectionCount: 0,
		createdAt: T0,
		updatedAt: T0,
		seq: 1,
		...patch,
	});
}

export type SnapshotPatch = Partial<{
	occupancy: Partial<Occupancy>;
	rails: readonly RailView[];
	connections: readonly ConnectionView[];
	metering: Partial<MeteringView>;
	activity: readonly ActivityView[];
	doctor: Partial<DoctorView>;
	seq: number;
	occupyMode: Snapshot["occupyMode"];
}>;

/** Valid YardProjectionSnapshot factory — mutate per tick via the patch. */
export function baseSnapshot(patch: SnapshotPatch = {}): Snapshot {
	return Object.freeze({
		occupancy: makeOccupancy(patch.occupancy),
		rails: Object.freeze([...(patch.rails ?? [])]),
		connections: Object.freeze([...(patch.connections ?? [])]),
		metering: Object.freeze({
			quotaUsed: 0,
			quotaLimit: 1000,
			spendCapUsd: 100,
			budgetUsd: 0,
			trafficRate: 0,
			...patch.metering,
		}),
		activity: Object.freeze([...(patch.activity ?? [])]),
		doctor: Object.freeze({
			bootstrapActive: false,
			// SAFETY: `hazards: Object.freeze([]) as readonly string[],` is required at this I/O or test boundary.
			hazards: Object.freeze([]) as readonly string[],
			...patch.doctor,
		}),
		seq: patch.seq ?? 1,
		occupyMode: patch.occupyMode ?? "idle",
	});
}
