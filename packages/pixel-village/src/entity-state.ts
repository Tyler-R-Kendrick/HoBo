/**
 * Entity state machines driven only by projection snapshots.
 * UI never invents occupancy/rail/connection state.
 */

import type { YardProjectionSnapshot } from "@hobo/management";

import type { PixelPoint, ZoneId } from "./layout.js";

/**
 * The Operator's semantic state, in priority order. This module maps the
 * projection to MEANING only: since ADR-0148 the presenter picks the tile, so
 * no clip id (`bo.*`) is ever produced here — there is no Bo sprite any more.
 */
export type BoAnimState =
	| "asleep"
	| "error"
	| "bootstrapping"
	| "attention"
	| "celebrating"
	| "walking"
	| "occupying"
	| "resolving"
	| "idle";

export type RailVisualState =
	| "dark"
	| "draft"
	| "approved"
	| "active"
	| "retired";

export type ConnectionVisualState =
	| "closed"
	| "pending"
	| "authorized"
	| "revoked";

export type GuestVisualState = "offline" | "idle" | "working" | "error";

export type YardVisualState = Readonly<{
	/** The Operator: which zone holds attention and why. */
	bo: {
		state: BoAnimState;
		zone: ZoneId;
		facing: "east" | "west";
	};
	/** Station occupancy facts the lantern reads back verbatim. */
	station: {
		id: string;
		status: string;
		activeRailHash: string | null;
	};
	rails: readonly {
		id: string;
		contentHash: string;
		visual: RailVisualState;
	}[];
	connections: readonly {
		id: string;
		alias?: string;
		provider: string;
		visual: ConnectionVisualState;
		/** Raw lifecycle status (needs-reauth/expired keep their own identity). */
		status: string;
	}[];
	guests: readonly {
		connectorKind: string;
		connectionId?: string;
		visual: GuestVisualState;
		/** Provenance of `visual` (ConnectorActivityView.statusSource). */
		statusSource: "derived-static" | "otlp";
	}[];
	traffic: {
		rate: number;
		active: boolean;
		/** Provenance of `rate` (MeteringView.trafficRateSource). */
		source: "synthetic" | "otlp";
	};
	costMeter: {
		fill: number;
		heat: number;
		quotaUsed: number;
		quotaLimit: number;
		spendCapUsd: number;
		budgetUsd: number;
	};
	errorBunker: {
		active: boolean;
		hazards: readonly string[];
		hint: string | null;
	};
	bootstrapDesk: {
		active: boolean;
	};
	seq: number;
	occupyMode: "idle" | "occupying";
}>;

export function deriveYardVisualState(
	snap: YardProjectionSnapshot,
	opts?: { selectedZone?: ZoneId; recentSuccess?: boolean },
): YardVisualState {
	const selected = opts?.selectedZone;
	const boZone = pickBoZone(snap, selected);
	const boState = pickBoState(snap, boZone, opts);
	const facing: "east" | "west" =
		boZone === "connectionBay" || boZone === "costBooth" ? "east" : "west";

	const rails = snap.rails.map((r) =>
		Object.freeze({
			id: r.id,
			contentHash: r.contentHash,
			// SAFETY: `visual: r.activationStatus as RailVisualState,` is required at this I/O or test boundary.
			visual: r.activationStatus as RailVisualState,
		}),
	);

	const connections = snap.connections.map((c) =>
		Object.freeze({
			id: c.id,
			...(c.alias !== undefined ? { alias: c.alias } : undefined),
			provider: c.provider,
			visual: mapConnectionVisual(String(c.status)),
			status: String(c.status),
		}),
	);

	const guests = snap.activity.map((a) =>
		Object.freeze({
			connectorKind: a.connectorKind,
			...(a.connectionId !== undefined ? { connectionId: a.connectionId } : undefined),
			visual: a.status,
			// Optional in the projection contract; absent means not yet measured.
			statusSource: a.statusSource ?? "derived-static",
		}),
	);

	const quotaLimit = snap.metering.quotaLimit || 1;
	const fill = Math.min(1, Math.max(0, snap.metering.quotaUsed / quotaLimit));
	const heat =
		snap.metering.spendCapUsd > 0
			? Math.min(
					1,
					Math.max(0, snap.metering.budgetUsd / snap.metering.spendCapUsd),
				)
			: fill;

	return Object.freeze({
		bo: Object.freeze({
			state: boState,
			zone: boZone,
			facing,
		}),
		station: Object.freeze({
			id: snap.occupancy.stationId,
			status: String(snap.occupancy.status),
			activeRailHash: snap.occupancy.activeRailHash ?? null,
		}),
		rails: Object.freeze(rails),
		connections: Object.freeze(connections),
		guests: Object.freeze(guests),
		traffic: Object.freeze({
			rate: snap.metering.trafficRate,
			active:
				snap.metering.trafficRate > 0 &&
				Boolean(snap.occupancy.activeRailHash) &&
				snap.occupyMode === "occupying",
			// Optional in the projection contract; absent defaults to synthetic so
			// an unbadged rate can never masquerade as measured traffic.
			source: snap.metering.trafficRateSource ?? "synthetic",
		}),
		costMeter: Object.freeze({
			fill,
			heat,
			quotaUsed: snap.metering.quotaUsed,
			quotaLimit: snap.metering.quotaLimit,
			spendCapUsd: snap.metering.spendCapUsd,
			budgetUsd: snap.metering.budgetUsd,
		}),
		errorBunker: Object.freeze({
			active: snap.doctor.hazards.length > 0,
			hazards: snap.doctor.hazards,
			hint: snap.doctor.hint ?? null,
		}),
		bootstrapDesk: Object.freeze({
			active: snap.occupancy.bootstrapActive,
		}),
		seq: snap.seq,
		occupyMode: snap.occupyMode,
	});
}

function pickBoZone(snap: YardProjectionSnapshot, selected?: ZoneId): ZoneId {
	if (selected) return selected;
	if (snap.doctor.hazards.length > 2) return "errorBunker";
	if (snap.occupancy.bootstrapActive) return "bootstrapDesk";
	if (snap.occupyMode === "occupying" && snap.occupancy.activeRailHash) {
		return "activeRailTrack";
	}
	if (snap.connections.some((c) => c.status === "pending")) {
		return "connectionBay";
	}
	return "platformRest";
}

/**
 * Autonomous-foreman state mapping (M1 phase A, priority order). The order is
 * the point: a closed Station outranks a hazard, a hazard outranks bootstrap,
 * and none of them are ever overridden by a lower-priority steady state.
 */
function pickBoState(
	snap: YardProjectionSnapshot,
	zone: ZoneId,
	opts?: { recentSuccess?: boolean },
): BoAnimState {
	if (snap.occupancy.status !== "open") return "asleep";
	if (snap.doctor.hazards.length > 0) return "error";
	if (snap.occupancy.bootstrapActive) return "bootstrapping";
	if (attentionNeeded(snap)) return "attention";
	if (opts?.recentSuccess) return "celebrating";
	if (zone === "activeRailTrack" && snap.occupyMode === "occupying") {
		return "walking";
	}
	if (snap.occupyMode === "occupying") return "occupying";
	if (zone === "connectionBay") return "resolving";
	return "idle";
}

/**
 * Pending connection or a rail published but not yet active → Bo waves.
 * Bootstrap rails are excluded: activating a real rail demotes the bootstrap
 * rail to "approved" as its steady state, which needs no operator action.
 */
function attentionNeeded(snap: YardProjectionSnapshot): boolean {
	return (
		snap.connections.some((c) => String(c.status) === "pending") ||
		snap.rails.some(
			(r) =>
				!r.isBootstrap &&
				(r.activationStatus === "draft" || r.activationStatus === "approved"),
		)
	);
}

/**
 * Pure snapshot comparator: true when seq advanced AND a rail just became
 * active or a connection just became authorized. The previous snapshot is
 * tracked by the host (main.ts) — this module stays stateless.
 */
export function detectRecentSuccess(
	prev: YardProjectionSnapshot | null,
	next: YardProjectionSnapshot,
): boolean {
	if (!prev || next.seq <= prev.seq) return false;
	const prevActiveRails = new Set(
		prev.rails.filter((r) => r.activationStatus === "active").map((r) => r.id),
	);
	const railActivated = next.rails.some(
		(r) => r.activationStatus === "active" && !prevActiveRails.has(r.id),
	);
	const prevAuthorized = new Set(
		prev.connections
			.filter((c) => String(c.status) === "active")
			.map((c) => c.id),
	);
	const connAuthorized = next.connections.some(
		(c) => String(c.status) === "active" && !prevAuthorized.has(c.id),
	);
	return railActivated || connAuthorized;
}

function mapConnectionVisual(status: string): ConnectionVisualState {
	switch (status) {
		case "pending":
		case "needs-reauth":
			return "pending";
		case "active":
			return "authorized";
		case "revoked":
		case "expired":
			return "revoked";
		default:
			return "closed";
	}
}

/** Frame-rate independent walk step toward zone anchor. */
export interface StepResult extends PixelPoint {
	readonly arrived: boolean;
}

export function stepToward(
	from: PixelPoint,
	to: PixelPoint,
	speedPxPerSec: number,
	dtSec: number,
): StepResult {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const dist = Math.hypot(dx, dy);
	const step = speedPxPerSec * dtSec;
	if (dist <= step || dist === 0) {
		return { x: to.x, y: to.y, arrived: true };
	}
	const t = step / dist;
	return {
		x: from.x + dx * t,
		y: from.y + dy * t,
		arrived: false,
	};
}
