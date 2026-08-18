/**
 * Status-page read-model projection (ADR-0077 §1-2, ADR-0086).
 *
 * A pure `defineProjection` fold over `slo.*` / `incident.*` / `maintenance.*`
 * / `statuspage.*` events, keyed by scope. Deterministic by construction: no
 * clocks, no randomness, no IO — staleness ("delayed / unknown") is evaluated
 * later in `toStatusPageModel` against an explicit `evaluatedAt`.
 *
 * Out-of-order edge cases handled in the fold:
 * - `incident.Resolved` before `incident.Opened` → resolved tombstone; the
 *   late `Opened` backfills title/impact but never reopens.
 * - duplicate `incident.Opened` → idempotent (first open wins, fields backfill).
 * - lifecycle regressions (`monitoring` → `investigating`) → ignored.
 * - unknown event types / malformed data → row unchanged (poison events are
 *   quarantined upstream by the store; a bad payload must not wedge replay).
 */

import type { EventEnvelope } from "@hobo/core";
import { defineProjection, type Projection } from "@hobo/data";

import {
	type IncidentOpenedData,
	type IncidentResolvedData,
	type IncidentUpdatedData,
	type MaintenanceScheduledData,
	type MaintenanceUpdatedData,
	type SloMeasuredData,
	STATUS_PAGE_EVENTS,
	STATUS_SIGNAL_EVENTS,
	type StatusPageIncidentPostedData,
	type StatusPagePublishedData,
	type StatusPageUnpublishedData,
} from "./events.js";
import {
	advanceIncidentState,
	advanceMaintenanceState,
	type ComponentStatus,
	type IncidentRecord,
	type IncidentState,
	type MaintenanceRecord,
	worstComponentStatus,
} from "./types.js";

// public-contract: projection name registered in the data plane.
export const STATUS_PAGE_PROJECTION = "status-page" as const;

/** Bounded per-component uptime history (githubstatus-style 90-day bars). */
export const HISTORY_DAY_LIMIT = 90;

export interface ComponentRow {
	readonly id: string;
	readonly label: string;
	readonly status: ComponentStatus;
	readonly lastSignalAt?: string;
	readonly attainment?: number;
	readonly target?: number;
	/** UTC date → worst observed status + sample count, bounded to 90 days. */
	readonly history: Readonly<
		Record<
			string,
			{ readonly worst: ComponentStatus; readonly samples: number }
		>
	>;
}

export interface StatusPageRow {
	readonly scopeKey: string;
	readonly components: Readonly<Record<string, ComponentRow>>;
	readonly incidents: Readonly<Record<string, IncidentRecord>>;
	readonly maintenances: Readonly<Record<string, MaintenanceRecord>>;
	readonly published?: {
		readonly at: string;
		readonly contentHash: `sha256:${string}`;
		readonly components: readonly string[];
	};
	readonly lastUnpublished?: {
		readonly at: string;
		readonly reason: string;
	};
	readonly lastEventAt: string;
	readonly lastSeq: number;
}

export interface StatusPageProjectionOptions {
	/**
	 * Row key per event. Default: `data.scopeKey` when the emitter targeted a
	 * page explicitly, else `project:<project>` when the envelope carries the
	 * ADR-0077 rollup dimension, else `tenant:<tenant>`.
	 */
	readonly scopeKey?: (event: EventEnvelope) => string;
}

export function defaultScopeKey(event: EventEnvelope): string {
	const data = event.data as { scopeKey?: unknown } | null | undefined;
	if (data && typeof data.scopeKey === "string" && data.scopeKey.length > 0) {
		return data.scopeKey;
	}
	if (typeof event.project === "string" && event.project.length > 0) {
		return `project:${event.project}`;
	}
	return `tenant:${event.tenant}`;
}

function emptyRow(scopeKey: string, event: EventEnvelope): StatusPageRow {
	return {
		scopeKey,
		components: {},
		incidents: {},
		maintenances: {},
		lastEventAt: event.ts,
		lastSeq: event.seq,
	};
}

function touch(
	row: StatusPageRow,
	event: EventEnvelope,
	patch: Partial<StatusPageRow>,
): StatusPageRow {
	const lastEventAt =
		Date.parse(event.ts) > Date.parse(row.lastEventAt)
			? event.ts
			: row.lastEventAt;
	return {
		...row,
		...patch,
		lastEventAt,
		lastSeq: Math.max(row.lastSeq, event.seq),
	};
}

function utcDate(ts: string): string | undefined {
	const parsed = Date.parse(ts);
	if (Number.isNaN(parsed)) return undefined;
	return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Derive a component status from an SLO measurement. Attainment at or above
 * target is operational; a burn inside one point of target is degraded; below
 * 90% of target is a major outage; between is a partial outage.
 */
export function statusFromAttainment(
	attainment: number,
	target: number,
): ComponentStatus {
	if (attainment >= target) return "operational";
	if (attainment >= target - 0.01) return "degraded";
	if (attainment >= target * 0.9) return "partial_outage";
	return "major_outage";
}

function boundedHistory(
	history: Readonly<
		Record<
			string,
			{ readonly worst: ComponentStatus; readonly samples: number }
		>
	>,
	date: string,
	status: ComponentStatus,
): Readonly<
	Record<string, { readonly worst: ComponentStatus; readonly samples: number }>
> {
	const existing = history[date];
	const next: Record<
		string,
		{ readonly worst: ComponentStatus; readonly samples: number }
	> = {
		...history,
		[date]: {
			worst: existing ? worstComponentStatus([existing.worst, status]) : status,
			samples: (existing?.samples ?? 0) + 1,
		},
	};
	const dates = Object.keys(next).sort();
	while (dates.length > HISTORY_DAY_LIMIT) {
		const oldest = dates.shift();
		if (oldest === undefined) break;
		delete next[oldest];
	}
	return next;
}

function isValidSlo(
	data: Partial<SloMeasuredData> | null | undefined,
): data is SloMeasuredData {
	return (
		typeof data?.componentId === "string" &&
		data.componentId.length > 0 &&
		typeof data.attainment === "number" &&
		Number.isFinite(data.attainment) &&
		typeof data.target === "number" &&
		Number.isFinite(data.target) &&
		data.target > 0 &&
		data.target <= 1 &&
		typeof data.measuredAt === "string" &&
		!Number.isNaN(Date.parse(data.measuredAt))
	);
}

function applySloMeasured(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as Partial<SloMeasuredData> | null | undefined;
	if (!isValidSlo(data)) return touch(base, event, {});
	// Clamp attainment into [0,1] so a buggy emitter cannot render >100%.
	const attainment = Math.min(1, Math.max(0, data.attainment));
	const status = statusFromAttainment(attainment, data.target);
	const existing = base.components[data.componentId];
	// Late measurement: never let an older sample overwrite a newer status.
	const isLate =
		existing?.lastSignalAt !== undefined &&
		Date.parse(data.measuredAt) < Date.parse(existing.lastSignalAt);
	const date = utcDate(data.measuredAt);
	const component: ComponentRow = {
		id: data.componentId,
		label: data.componentLabel ?? existing?.label ?? data.componentId,
		status: isLate ? (existing?.status ?? status) : status,
		lastSignalAt: isLate ? (existing?.lastSignalAt as string) : data.measuredAt,
		attainment: isLate ? (existing?.attainment ?? attainment) : attainment,
		target: isLate ? (existing?.target ?? data.target) : data.target,
		history:
			date === undefined
				? (existing?.history ?? {})
				: boundedHistory(existing?.history ?? {}, date, status),
	};
	return touch(base, event, {
		components: { ...base.components, [data.componentId]: component },
	});
}

function applyIncidentOpened(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as Partial<IncidentOpenedData> | null | undefined;
	if (typeof data?.incidentId !== "string" || data.incidentId.length === 0) {
		return touch(base, event, {});
	}
	const existing = base.incidents[data.incidentId];
	const impact =
		data.impact === "minor" ||
		data.impact === "major" ||
		data.impact === "critical"
			? data.impact
			: "minor";
	const state: IncidentState =
		data.currentStatus === "identified" ||
		data.currentStatus === "monitoring" ||
		data.currentStatus === "resolved"
			? data.currentStatus
			: "investigating";
	const affected = Array.isArray(data.affectedComponents)
		? data.affectedComponents.filter(
				(c): c is string => typeof c === "string" && c.length > 0,
			)
		: [];
	if (existing) {
		// Idempotent duplicate / late open: backfill fields, never reopen.
		const incident: IncidentRecord = {
			...existing,
			title:
				existing.title === existing.id && typeof data.title === "string"
					? data.title
					: existing.title,
			affectedComponents:
				existing.affectedComponents.length > 0
					? existing.affectedComponents
					: Object.freeze(affected),
			openedAt:
				Date.parse(event.ts) < Date.parse(existing.openedAt)
					? event.ts
					: existing.openedAt,
		};
		return touch(base, event, {
			incidents: { ...base.incidents, [incident.id]: incident },
		});
	}
	const incident: IncidentRecord = {
		id: data.incidentId,
		title:
			typeof data.title === "string" && data.title.length > 0
				? data.title
				: data.incidentId,
		state,
		impact,
		affectedComponents: Object.freeze(affected),
		openedAt: event.ts,
		updatedAt: event.ts,
		...(state === "resolved" ? { resolvedAt: event.ts } : {}),
		updates: Object.freeze([]),
	};
	return touch(base, event, {
		incidents: { ...base.incidents, [incident.id]: incident },
	});
}

function applyIncidentProgress(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
	options: { readonly public: boolean },
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as
		| Partial<IncidentUpdatedData & StatusPageIncidentPostedData>
		| null
		| undefined;
	if (typeof data?.incidentId !== "string" || data.incidentId.length === 0) {
		return touch(base, event, {});
	}
	const nextState: IncidentState =
		data.currentStatus === "investigating" ||
		data.currentStatus === "identified" ||
		data.currentStatus === "monitoring" ||
		data.currentStatus === "resolved"
			? data.currentStatus
			: "investigating";
	const existing = base.incidents[data.incidentId] ?? {
		// Update arrived before the open: create a placeholder that a late
		// `incident.Opened` will backfill.
		id: data.incidentId,
		title: data.incidentId,
		state: nextState,
		impact: "minor" as const,
		affectedComponents: Object.freeze([] as string[]),
		openedAt: event.ts,
		updatedAt: event.ts,
		updates: Object.freeze([]),
	};
	const state = advanceIncidentState(existing.state, nextState);
	const body = typeof data.body === "string" ? data.body : "";
	const incident: IncidentRecord = {
		...existing,
		state,
		updatedAt:
			Date.parse(event.ts) > Date.parse(existing.updatedAt)
				? event.ts
				: existing.updatedAt,
		...(state === "resolved" && existing.resolvedAt === undefined
			? { resolvedAt: event.ts }
			: {}),
		updates: Object.freeze([
			...existing.updates,
			...(body.length > 0
				? [
						Object.freeze({
							state: nextState,
							body,
							at: event.ts,
							public: options.public,
						}),
					]
				: []),
		]),
	};
	return touch(base, event, {
		incidents: { ...base.incidents, [incident.id]: incident },
	});
}

function applyIncidentResolved(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as Partial<IncidentResolvedData> | null | undefined;
	if (typeof data?.incidentId !== "string" || data.incidentId.length === 0) {
		return touch(base, event, {});
	}
	const existing = base.incidents[data.incidentId] ?? {
		// Resolved before opened: keep a resolved tombstone so the late open
		// cannot resurrect the incident.
		id: data.incidentId,
		title: data.incidentId,
		state: "resolved" as const,
		impact: "minor" as const,
		affectedComponents: Object.freeze([] as string[]),
		openedAt: event.ts,
		updatedAt: event.ts,
		updates: Object.freeze([]),
	};
	const summary =
		typeof data.resolutionSummary === "string" &&
		data.resolutionSummary.length > 0
			? data.resolutionSummary
			: undefined;
	const incident: IncidentRecord = {
		...existing,
		state: "resolved",
		resolvedAt: existing.resolvedAt ?? event.ts,
		updatedAt:
			Date.parse(event.ts) > Date.parse(existing.updatedAt)
				? event.ts
				: existing.updatedAt,
		updates: Object.freeze([
			...existing.updates,
			...(summary !== undefined
				? [
						Object.freeze({
							state: "resolved" as const,
							body: summary,
							at: event.ts,
							public: true,
						}),
					]
				: []),
		]),
	};
	return touch(base, event, {
		incidents: { ...base.incidents, [incident.id]: incident },
	});
}

function applyMaintenanceScheduled(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as
		| Partial<MaintenanceScheduledData>
		| null
		| undefined;
	if (
		typeof data?.maintenanceId !== "string" ||
		data.maintenanceId.length === 0 ||
		typeof data.windowStart !== "string" ||
		Number.isNaN(Date.parse(data.windowStart)) ||
		typeof data.windowEnd !== "string" ||
		Number.isNaN(Date.parse(data.windowEnd)) ||
		Date.parse(data.windowEnd) < Date.parse(data.windowStart)
	) {
		return touch(base, event, {});
	}
	const existing = base.maintenances[data.maintenanceId];
	const maintenance: MaintenanceRecord = {
		id: data.maintenanceId,
		title:
			typeof data.title === "string" && data.title.length > 0
				? data.title
				: data.maintenanceId,
		state: existing?.state ?? "scheduled",
		windowStart: data.windowStart,
		windowEnd: data.windowEnd,
		affectedComponents: Object.freeze(
			Array.isArray(data.affectedComponents)
				? data.affectedComponents.filter(
						(c): c is string => typeof c === "string" && c.length > 0,
					)
				: [],
		),
		expectedImpact:
			typeof data.expectedImpact === "string" ? data.expectedImpact : "",
	};
	return touch(base, event, {
		maintenances: { ...base.maintenances, [maintenance.id]: maintenance },
	});
}

function applyMaintenanceUpdated(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as Partial<MaintenanceUpdatedData> | null | undefined;
	if (
		typeof data?.maintenanceId !== "string" ||
		data.maintenanceId.length === 0
	) {
		return touch(base, event, {});
	}
	const existing = base.maintenances[data.maintenanceId];
	if (!existing) return touch(base, event, {});
	const next =
		data.state === "scheduled" ||
		data.state === "in-progress" ||
		data.state === "completed" ||
		data.state === "canceled"
			? data.state
			: existing.state;
	const maintenance: MaintenanceRecord = {
		...existing,
		state: advanceMaintenanceState(existing.state, next),
	};
	return touch(base, event, {
		maintenances: { ...base.maintenances, [maintenance.id]: maintenance },
	});
}

function applyPublished(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as
		| Partial<StatusPagePublishedData>
		| null
		| undefined;
	if (
		typeof data?.contentHash !== "string" ||
		!data.contentHash.startsWith("sha256:")
	) {
		return touch(base, event, {});
	}
	return touch(base, event, {
		published: {
			at: event.ts,
			contentHash: data.contentHash as `sha256:${string}`,
			components: Object.freeze(
				Array.isArray(data.components)
					? data.components.filter(
							(c): c is string => typeof c === "string" && c.length > 0,
						)
					: [],
			),
		},
	});
}

function applyUnpublished(
	row: StatusPageRow | undefined,
	event: EventEnvelope,
): StatusPageRow {
	const base = row ?? emptyRow(defaultScopeKey(event), event);
	const data = event.data as
		| Partial<StatusPageUnpublishedData>
		| null
		| undefined;
	const { published: _dropped, ...rest } = base;
	return touch(rest as StatusPageRow, event, {
		lastUnpublished: {
			at: event.ts,
			reason: typeof data?.reason === "string" ? data.reason : "unpublished",
		},
	});
}

export function createStatusPageProjection(
	options: StatusPageProjectionOptions = {},
): Projection<StatusPageRow> {
	const key = options.scopeKey ?? defaultScopeKey;
	return defineProjection<StatusPageRow>({
		name: STATUS_PAGE_PROJECTION,
		key,
		on: {
			[STATUS_SIGNAL_EVENTS.SloMeasured]: applySloMeasured,
			[STATUS_SIGNAL_EVENTS.IncidentOpened]: applyIncidentOpened,
			[STATUS_SIGNAL_EVENTS.IncidentUpdated]: (row, event) =>
				applyIncidentProgress(row, event, { public: false }),
			[STATUS_SIGNAL_EVENTS.IncidentResolved]: applyIncidentResolved,
			[STATUS_SIGNAL_EVENTS.MaintenanceScheduled]: applyMaintenanceScheduled,
			[STATUS_SIGNAL_EVENTS.MaintenanceUpdated]: applyMaintenanceUpdated,
			[STATUS_PAGE_EVENTS.Published]: applyPublished,
			[STATUS_PAGE_EVENTS.Unpublished]: applyUnpublished,
			[STATUS_PAGE_EVENTS.IncidentPosted]: (row, event) =>
				applyIncidentProgress(row, event, { public: true }),
		},
	});
}
