import type { EventEnvelope } from "@hobo/core";
import { describe, expect, it } from "vitest";
import {
	createStatusPageProjection,
	defaultScopeKey,
	HISTORY_DAY_LIMIT,
	STATUS_PAGE_EVENTS,
	STATUS_SIGNAL_EVENTS,
	statusEnvelope,
	statusFromAttainment,
} from "../src/index.js";

const STREAM = "status:test";

function slo(
	seq: number,
	ts: string,
	overrides: Partial<{
		componentId: string;
		attainment: number;
		target: number;
		measuredAt: string;
		project: string;
	}> = {},
): EventEnvelope {
	return statusEnvelope(
		STATUS_SIGNAL_EVENTS.SloMeasured,
		{
			componentId: overrides.componentId ?? "kit-web",
			sloName: "availability",
			attainment: overrides.attainment ?? 0.9995,
			target: overrides.target ?? 0.999,
			measuredAt: overrides.measuredAt ?? ts,
		},
		{ streamId: STREAM, seq, ts, project: overrides.project ?? "shop" },
	);
}

describe("status-page projection", () => {
	it("folds slo measurements into scoped component rows", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([slo(1, "2026-08-17T00:00:00.000Z")]);
		const row = snapshot.rows["project:shop"];
		expect(row).toBeDefined();
		expect(row?.components["kit-web"]?.status).toBe("operational");
		expect(row?.components["kit-web"]?.attainment).toBeCloseTo(0.9995);
	});

	it("keys rows by explicit scopeKey, then project, then tenant", () => {
		expect(
			defaultScopeKey(
				statusEnvelope(
					"slo.Measured",
					{ scopeKey: "bindle:shop" },
					{ streamId: STREAM, seq: 1, ts: "2026-08-17T00:00:00.000Z" },
				),
			),
		).toBe("bindle:shop");
		expect(
			defaultScopeKey(
				statusEnvelope(
					"slo.Measured",
					{},
					{
						streamId: STREAM,
						seq: 1,
						ts: "2026-08-17T00:00:00.000Z",
						project: "shop",
					},
				),
			),
		).toBe("project:shop");
		expect(
			defaultScopeKey(
				statusEnvelope(
					"slo.Measured",
					{},
					{ streamId: STREAM, seq: 1, ts: "2026-08-17T00:00:00.000Z" },
				),
			),
		).toBe("tenant:local");
	});

	it("derives graded statuses from attainment vs target", () => {
		expect(statusFromAttainment(0.9995, 0.999)).toBe("operational");
		expect(statusFromAttainment(0.995, 0.999)).toBe("degraded");
		expect(statusFromAttainment(0.95, 0.999)).toBe("partial_outage");
		expect(statusFromAttainment(0.5, 0.999)).toBe("major_outage");
	});

	it("ignores malformed slo payloads without wedging the row", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			slo(1, "2026-08-17T00:00:00.000Z"),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.SloMeasured,
				{ componentId: "", attainment: "high", target: 2 },
				{
					streamId: STREAM,
					seq: 2,
					ts: "2026-08-17T00:01:00.000Z",
					project: "shop",
				},
			),
		]);
		const row = snapshot.rows["project:shop"];
		expect(Object.keys(row?.components ?? {})).toEqual(["kit-web"]);
		expect(row?.lastSeq).toBe(2);
	});

	it("clamps out-of-range attainment", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			slo(1, "2026-08-17T00:00:00.000Z", { attainment: 1.7 }),
		]);
		expect(
			snapshot.rows["project:shop"]?.components["kit-web"]?.attainment,
		).toBe(1);
	});

	it("never lets a late measurement overwrite a newer status", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			slo(1, "2026-08-17T02:00:00.000Z", {
				attainment: 0.9995,
				measuredAt: "2026-08-17T02:00:00.000Z",
			}),
			// Older sample arrives later with a worse value.
			slo(2, "2026-08-17T02:01:00.000Z", {
				attainment: 0.5,
				measuredAt: "2026-08-17T01:00:00.000Z",
			}),
		]);
		const component = snapshot.rows["project:shop"]?.components["kit-web"];
		expect(component?.status).toBe("operational");
		expect(component?.lastSignalAt).toBe("2026-08-17T02:00:00.000Z");
	});

	it("tracks bounded per-day history with worst-of-day aggregation", () => {
		const projection = createStatusPageProjection();
		const events: EventEnvelope[] = [];
		for (let day = 0; day < HISTORY_DAY_LIMIT + 10; day += 1) {
			const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString();
			events.push(slo(day + 1, date, { measuredAt: date }));
		}
		// Two samples on the last day, one bad → day rolls up to the worst.
		const lastDate = new Date(
			Date.UTC(2026, 0, HISTORY_DAY_LIMIT + 10),
		).toISOString();
		events.push(
			slo(events.length + 1, lastDate, {
				attainment: 0.5,
				measuredAt: lastDate,
			}),
		);
		const snapshot = projection.fold(events);
		const history =
			snapshot.rows["project:shop"]?.components["kit-web"]?.history ?? {};
		const dates = Object.keys(history).sort();
		expect(dates.length).toBeLessThanOrEqual(HISTORY_DAY_LIMIT);
		const last = history[dates.at(-1) ?? ""];
		expect(last?.worst).toBe("major_outage");
		expect(last?.samples).toBe(2);
	});

	it("handles the incident lifecycle with public posts", () => {
		const projection = createStatusPageProjection();
		const ts = (minute: number) =>
			`2026-08-17T00:${String(minute).padStart(2, "0")}:00.000Z`;
		const snapshot = projection.fold([
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentOpened,
				{
					incidentId: "INC-1",
					title: "Checkout latency",
					impact: "major",
					affectedComponents: ["kit-web"],
					currentStatus: "investigating",
				},
				{ streamId: STREAM, seq: 1, ts: ts(0), project: "shop" },
			),
			statusEnvelope(
				STATUS_PAGE_EVENTS.IncidentPosted,
				{
					incidentId: "INC-1",
					currentStatus: "identified",
					body: "Cache stampede identified.",
				},
				{ streamId: STREAM, seq: 2, ts: ts(5), project: "shop" },
			),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentResolved,
				{ incidentId: "INC-1", resolutionSummary: "Cache warmed." },
				{ streamId: STREAM, seq: 3, ts: ts(30), project: "shop" },
			),
		]);
		const incident = snapshot.rows["project:shop"]?.incidents["INC-1"];
		expect(incident?.state).toBe("resolved");
		expect(incident?.resolvedAt).toBe(ts(30));
		expect(incident?.updates).toHaveLength(2);
		expect(incident?.updates[0]?.public).toBe(true);
	});

	it("keeps a resolved tombstone when Resolved arrives before Opened", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentResolved,
				{ incidentId: "INC-9", resolutionSummary: "Fixed." },
				{
					streamId: STREAM,
					seq: 1,
					ts: "2026-08-17T01:00:00.000Z",
					project: "shop",
				},
			),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentOpened,
				{
					incidentId: "INC-9",
					title: "Late open",
					impact: "critical",
					affectedComponents: ["kit-api"],
					currentStatus: "investigating",
				},
				{
					streamId: STREAM,
					seq: 2,
					ts: "2026-08-17T00:00:00.000Z",
					project: "shop",
				},
			),
		]);
		const incident = snapshot.rows["project:shop"]?.incidents["INC-9"];
		expect(incident?.state).toBe("resolved");
		expect(incident?.title).toBe("Late open");
		expect(incident?.affectedComponents).toEqual(["kit-api"]);
		// Backfilled open timestamp from the (earlier) late open event.
		expect(incident?.openedAt).toBe("2026-08-17T00:00:00.000Z");
	});

	it("ignores lifecycle regressions and duplicate opens", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentOpened,
				{
					incidentId: "INC-2",
					title: "First",
					impact: "minor",
					affectedComponents: [],
					currentStatus: "monitoring",
				},
				{ streamId: STREAM, seq: 1, ts: "2026-08-17T00:00:00.000Z" },
			),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentUpdated,
				{
					incidentId: "INC-2",
					currentStatus: "investigating",
					body: "Regression attempt",
				},
				{ streamId: STREAM, seq: 2, ts: "2026-08-17T00:05:00.000Z" },
			),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentOpened,
				{
					incidentId: "INC-2",
					title: "Duplicate",
					impact: "critical",
					affectedComponents: [],
					currentStatus: "investigating",
				},
				{ streamId: STREAM, seq: 3, ts: "2026-08-17T00:06:00.000Z" },
			),
		]);
		const incident = snapshot.rows["tenant:local"]?.incidents["INC-2"];
		expect(incident?.state).toBe("monitoring");
		expect(incident?.title).toBe("First");
		expect(incident?.impact).toBe("minor");
	});

	it("upserts maintenance with a forward-only state machine", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.MaintenanceScheduled,
				{
					maintenanceId: "MTN-1",
					title: "DB upgrade",
					windowStart: "2026-08-18T02:00:00.000Z",
					windowEnd: "2026-08-18T03:00:00.000Z",
					affectedComponents: ["dep-db"],
					expectedImpact: "Reads may be briefly delayed.",
				},
				{ streamId: STREAM, seq: 1, ts: "2026-08-17T00:00:00.000Z" },
			),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.MaintenanceUpdated,
				{ maintenanceId: "MTN-1", state: "in-progress" },
				{ streamId: STREAM, seq: 2, ts: "2026-08-18T02:00:00.000Z" },
			),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.MaintenanceUpdated,
				{ maintenanceId: "MTN-1", state: "scheduled" },
				{ streamId: STREAM, seq: 3, ts: "2026-08-18T02:01:00.000Z" },
			),
		]);
		expect(snapshot.rows["tenant:local"]?.maintenances["MTN-1"]?.state).toBe(
			"in-progress",
		);
	});

	it("rejects an inverted maintenance window", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.MaintenanceScheduled,
				{
					maintenanceId: "MTN-2",
					title: "Bad window",
					windowStart: "2026-08-18T03:00:00.000Z",
					windowEnd: "2026-08-18T02:00:00.000Z",
					affectedComponents: [],
					expectedImpact: "n/a",
				},
				{ streamId: STREAM, seq: 1, ts: "2026-08-17T00:00:00.000Z" },
			),
		]);
		expect(
			snapshot.rows["tenant:local"]?.maintenances["MTN-2"],
		).toBeUndefined();
	});

	it("records publish and unpublish audit state", () => {
		const projection = createStatusPageProjection();
		const hash = `sha256:${"a".repeat(64)}` as const;
		const published = projection.fold([
			statusEnvelope(
				STATUS_PAGE_EVENTS.Published,
				{
					scopeKind: "project",
					scopeId: "shop",
					contentHash: hash,
					components: ["kit-web"],
				},
				{
					streamId: STREAM,
					seq: 1,
					ts: "2026-08-17T00:00:00.000Z",
					project: "shop",
				},
			),
		]);
		expect(published.rows["project:shop"]?.published?.contentHash).toBe(hash);
		const unpublished = projection.fold([
			...[
				statusEnvelope(
					STATUS_PAGE_EVENTS.Published,
					{
						scopeKind: "project",
						scopeId: "shop",
						contentHash: hash,
						components: ["kit-web"],
					},
					{
						streamId: STREAM,
						seq: 1,
						ts: "2026-08-17T00:00:00.000Z",
						project: "shop",
					},
				),
				statusEnvelope(
					STATUS_PAGE_EVENTS.Unpublished,
					{ scopeKind: "project", scopeId: "shop", reason: "incident review" },
					{
						streamId: STREAM,
						seq: 2,
						ts: "2026-08-17T01:00:00.000Z",
						project: "shop",
					},
				),
			],
		]);
		expect(unpublished.rows["project:shop"]?.published).toBeUndefined();
		expect(unpublished.rows["project:shop"]?.lastUnpublished?.reason).toBe(
			"incident review",
		);
	});

	it("is deterministic: identical folds produce identical rows", () => {
		const projection = createStatusPageProjection();
		const events = [
			slo(1, "2026-08-17T00:00:00.000Z"),
			slo(2, "2026-08-17T00:05:00.000Z", { attainment: 0.99 }),
			statusEnvelope(
				STATUS_SIGNAL_EVENTS.IncidentOpened,
				{
					incidentId: "INC-3",
					title: "Blip",
					impact: "minor",
					affectedComponents: ["kit-web"],
					currentStatus: "investigating",
				},
				{
					streamId: STREAM,
					seq: 3,
					ts: "2026-08-17T00:06:00.000Z",
					project: "shop",
				},
			),
		];
		const a = projection.fold(events);
		const b = projection.fold(events);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it("skips quarantined events during replay (ADR-0086)", () => {
		const projection = createStatusPageProjection();
		const snapshot = projection.fold([
			slo(1, "2026-08-17T00:00:00.000Z", { attainment: 0.5 }),
			statusEnvelope(
				"status.Quarantined",
				{ offendingSeq: 1 },
				{ streamId: STREAM, seq: 2, ts: "2026-08-17T00:01:00.000Z" },
			),
		]);
		expect(snapshot.rows["project:shop"]).toBeUndefined();
	});

	it("declares its read-set for the data plane", () => {
		const projection = createStatusPageProjection();
		expect([...projection.readSet].sort()).toEqual(
			[
				"incident.Opened",
				"incident.Resolved",
				"incident.Updated",
				"maintenance.Scheduled",
				"maintenance.Updated",
				"slo.Measured",
				"statuspage.IncidentPosted",
				"statuspage.Published",
				"statuspage.Unpublished",
			].sort(),
		);
	});
});
