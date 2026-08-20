/**
 * The in-process OTLP sink and the occupancy telemetry projection.
 *
 * This is what the local dashboard shows an operator, so its failure mode is
 * not a crash — it is a screen that quietly says the wrong thing.
 *
 * **A malformed OTLP payload contributes nothing and drops nothing else.**
 * Every level of the OTLP envelope is optional at runtime because it arrives
 * from an exporter this process does not control. A batch with one bad group
 * must still ingest the good ones, and the returned count is what the ingest
 * endpoint reports back — so a count that included records it did not store
 * would tell an exporter its data landed when it did not.
 *
 * **An unattributable signal becomes `unknown`, never dropped.** A record with
 * no `service.name` still happened. Filing it under a placeholder keeps it
 * visible; discarding it makes a misconfigured exporter look like a silent
 * service.
 *
 * **Silent is a state, not an absence.** `projectOccupancyTelemetry` emits a
 * row for every known resource whether or not it has sent anything, because a
 * service missing from the list reads as "not deployed" rather than "deployed
 * and not instrumented" — the exact confusion the view exists to resolve.
 *
 * `fleetView` defaults to `camp-deferred` with a stated reason: a fleet view
 * that showed an empty project list without saying why would read as "you have
 * no projects".
 */
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../src/json.js";

import {
	createOtelSink,
	fleetView,
	projectOccupancyTelemetry,
} from "../src/session-otel.js";

const log = (overrides: JsonObject = {}) => ({
	resourceName: "api",
	body: "hello",
	severity: "INFO",
	time: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const span = (overrides: JsonObject = {}) => ({
	resourceName: "api",
	name: "GET /",
	traceId: "t1",
	spanId: "s1",
	startTime: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const metric = (overrides: JsonObject = {}) => ({
	resourceName: "api",
	name: "requests",
	value: 1,
	time: "2026-01-01T00:00:00.000Z",
	...overrides,
});

/** An OTLP resource carrying one service.name attribute. */
const resource = (name: string, key = "service.name") => ({
	attributes: [{ key, value: { stringValue: name } }],
});

describe("direct ingestion", () => {
	it("keeps an ingested log", () => {
		const sink = createOtelSink();
		sink.ingestLog(log());
		expect(sink.forResource("api").logs).toHaveLength(1);
	});

	it("keeps an ingested span and metric", () => {
		const sink = createOtelSink();
		sink.ingestSpan(span());
		sink.ingestMetric(metric());
		expect(sink.forResource("api").traces).toHaveLength(1);
		expect(sink.forResource("api").metrics).toHaveLength(1);
	});

	it("keeps records in arrival order", () => {
		// The dashboard reads them as a timeline; reordering would show a reply
		// before its request.
		const sink = createOtelSink();
		sink.ingestLog(log({ body: "first" }));
		sink.ingestLog(log({ body: "second" }));
		expect(sink.forResource("api").logs.map((r) => r.body)).toEqual([
			"first",
			"second",
		]);
	});

	it("keeps each resource's signals separate", () => {
		const sink = createOtelSink();
		sink.ingestLog(log({ resourceName: "api" }));
		sink.ingestLog(log({ resourceName: "worker" }));
		expect(sink.forResource("api").logs).toHaveLength(1);
	});

	it("reports an empty telemetry set for an unknown resource", () => {
		// A resource nobody has heard from is silent, not an error.
		const view = createOtelSink().forResource("nobody");
		expect(view).toMatchObject({
			resourceName: "nobody",
			logs: [],
			traces: [],
			metrics: [],
		});
	});
});

describe("listing resources", () => {
	it("lists nothing for an empty sink", () => {
		expect(createOtelSink().list()).toEqual([]);
	});

	it("lists a resource known from any signal kind", () => {
		const sink = createOtelSink();
		sink.ingestSpan(span({ resourceName: "tracer-only" }));
		expect(sink.list().map((r) => r.resourceName)).toEqual(["tracer-only"]);
	});

	it("lists each resource once, however many signals it sent", () => {
		const sink = createOtelSink();
		sink.ingestLog(log());
		sink.ingestSpan(span());
		sink.ingestMetric(metric());
		expect(sink.list()).toHaveLength(1);
	});

	it("sorts by name, so the dashboard does not reshuffle between polls", () => {
		const sink = createOtelSink();
		sink.ingestLog(log({ resourceName: "worker" }));
		sink.ingestLog(log({ resourceName: "api" }));
		expect(sink.list().map((r) => r.resourceName)).toEqual(["api", "worker"]);
	});
});

describe("OTLP/JSON ingestion", () => {
	const sink = () => createOtelSink();

	it.each([
		null,
		undefined,
		7,
		"body",
	])("ingests nothing from the non-object payload %s", (body) => {
		expect(sink().ingestOtlpJson("logs", body)).toBe(0);
	});

	it("ingests nothing from an empty envelope", () => {
		expect(sink().ingestOtlpJson("logs", {})).toBe(0);
	});

	it("ingests a log batch and reports how many landed", () => {
		// The count is what the ingest endpoint reports back; overstating it
		// would tell an exporter its data landed when it did not.
		const s = sink();
		const count = s.ingestOtlpJson("logs", {
			resourceLogs: [
				{
					resource: resource("api"),
					scopeLogs: [
						{
							logRecords: [
								{ body: { stringValue: "one" }, severityText: "WARN" },
								{ body: { stringValue: "two" } },
							],
						},
					],
				},
			],
		});
		expect(count).toBe(2);
		expect(s.forResource("api").logs).toHaveLength(2);
	});

	it("defaults a log with no severity to INFO", () => {
		// An empty severity column sorts and filters as its own value; INFO is
		// the honest reading of "the exporter said nothing".
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{ resource: resource("api"), scopeLogs: [{ logRecords: [{}] }] },
			],
		});
		expect(s.forResource("api").logs[0]?.severity).toBe("INFO");
	});

	it("keeps a log with no body rather than dropping it", () => {
		// A body-less log still records that something happened at that time.
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{ resource: resource("api"), scopeLogs: [{ logRecords: [{}] }] },
			],
		});
		expect(s.forResource("api").logs[0]?.body).toBe("");
	});

	it("ingests a span batch", () => {
		const s = sink();
		const count = s.ingestOtlpJson("traces", {
			resourceSpans: [
				{
					resource: resource("api"),
					scopeSpans: [
						{
							spans: [
								{
									name: "GET /",
									traceId: "t1",
									spanId: "s1",
									startTimeUnixNano: "1",
									endTimeUnixNano: "2",
								},
							],
						},
					],
				},
			],
		});
		expect(count).toBe(1);
		expect(s.forResource("api").traces[0]).toMatchObject({
			name: "GET /",
			endTime: "2",
		});
	});

	it("omits the end time for a span that has not finished", () => {
		// An in-flight span with an invented end time reads as a completed one of
		// zero duration.
		const s = sink();
		s.ingestOtlpJson("traces", {
			resourceSpans: [
				{ resource: resource("api"), scopeSpans: [{ spans: [{ name: "x" }] }] },
			],
		});
		expect(s.forResource("api").traces[0]).not.toHaveProperty("endTime");
	});

	it("names an unnamed span rather than showing a blank row", () => {
		const s = sink();
		s.ingestOtlpJson("traces", {
			resourceSpans: [
				{ resource: resource("api"), scopeSpans: [{ spans: [{}] }] },
			],
		});
		expect(s.forResource("api").traces[0]?.name).toBe("span");
	});

	it("ingests a gauge metric's first data point", () => {
		const s = sink();
		const count = s.ingestOtlpJson("metrics", {
			resourceMetrics: [
				{
					resource: resource("api"),
					scopeMetrics: [
						{
							metrics: [
								{ name: "cpu", gauge: { dataPoints: [{ asDouble: 0.5 }] } },
							],
						},
					],
				},
			],
		});
		expect(count).toBe(1);
		expect(s.forResource("api").metrics[0]).toMatchObject({
			name: "cpu",
			value: 0.5,
		});
	});

	it("records zero for a metric with no data points", () => {
		// The metric was reported; its value is what is missing, and zero is the
		// value this sink states rather than leaving undefined to render.
		const s = sink();
		s.ingestOtlpJson("metrics", {
			resourceMetrics: [
				{
					resource: resource("api"),
					scopeMetrics: [{ metrics: [{ name: "cpu" }] }],
				},
			],
		});
		expect(s.forResource("api").metrics[0]?.value).toBe(0);
	});

	it("ignores a payload whose kind does not match the envelope", () => {
		// Posting spans to the logs endpoint is a client bug; silently filing
		// them as logs would hide it.
		const s = sink();
		expect(
			s.ingestOtlpJson("logs", {
				resourceSpans: [
					{ resource: resource("api"), scopeSpans: [{ spans: [{}] }] },
				],
			}),
		).toBe(0);
	});

	it("files an unattributable record under unknown rather than dropping it", () => {
		// A record with no service.name still happened; discarding it makes a
		// misconfigured exporter look like a silent service.
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [{ scopeLogs: [{ logRecords: [{}] }] }],
		});
		expect(s.forResource("unknown").logs).toHaveLength(1);
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("accepts resource.name as well as service.name", () => {
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{
					resource: resource("api", "resource.name"),
					scopeLogs: [{ logRecords: [{}] }],
				},
			],
		});
		expect(s.forResource("api").logs).toHaveLength(1);
	});

	it("ignores an attribute whose value is not a string", () => {
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{
					resource: {
						attributes: [{ key: "service.name", value: { intValue: 7 } }],
					},
					scopeLogs: [{ logRecords: [{}] }],
				},
			],
		});
		expect(s.forResource("unknown").logs).toHaveLength(1);
	});

	it("skips past an attribute list entry that is not an object", () => {
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{
					resource: {
						attributes: [
							null,
							{ key: "service.name", value: { stringValue: "api" } },
						],
					},
					scopeLogs: [{ logRecords: [{}] }],
				},
			],
		});
		expect(s.forResource("api").logs).toHaveLength(1);
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("treats a non-array attribute list as no attributes", () => {
		const s = sink();
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{ resource: { attributes: "api" }, scopeLogs: [{ logRecords: [{}] }] },
			],
		});
		expect(s.forResource("unknown").logs).toHaveLength(1);
	});

	it("keeps the good groups when one group is malformed", () => {
		// A batch is many services' data at once; one bad group must not cost the
		// others.
		const s = sink();
		const count = s.ingestOtlpJson("logs", {
			resourceLogs: [
				null,
				{ resource: resource("api"), scopeLogs: [{ logRecords: [{}] }] },
			],
		});
		expect(count).toBe(1);
	});

	it("skips a group whose scope list is not an array", () => {
		const s = sink();
		expect(
			s.ingestOtlpJson("logs", {
				resourceLogs: [{ resource: resource("api"), scopeLogs: "nope" }],
			}),
		).toBe(0);
	});

	it("skips a scope whose record list is not an array", () => {
		const s = sink();
		expect(
			s.ingestOtlpJson("logs", {
				resourceLogs: [
					{ resource: resource("api"), scopeLogs: [{ logRecords: "nope" }] },
				],
			}),
		).toBe(0);
	});

	it("accumulates across several scopes and groups", () => {
		const s = sink();
		const count = s.ingestOtlpJson("logs", {
			resourceLogs: [
				{
					resource: resource("api"),
					scopeLogs: [{ logRecords: [{}] }, { logRecords: [{}, {}] }],
				},
				{ resource: resource("worker"), scopeLogs: [{ logRecords: [{}] }] },
			],
		});
		expect(count).toBe(4);
		expect(s.list()).toHaveLength(2);
	});

	it("adds to what direct ingestion already stored", () => {
		const s = sink();
		s.ingestLog(log());
		s.ingestOtlpJson("logs", {
			resourceLogs: [
				{ resource: resource("api"), scopeLogs: [{ logRecords: [{}] }] },
			],
		});
		expect(s.forResource("api").logs).toHaveLength(2);
	});
});

describe("projectOccupancyTelemetry", () => {
	const collector = { httpUrl: "http://127.0.0.1:4318", grpcPort: 4317 };

	const project = (
		resources: { id: string; kind: string }[],
		sink = createOtelSink(),
	) => projectOccupancyTelemetry({ resources, sink, collector });

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("reports the collector as listening", () => {
		// The collector is up whether or not anything is exporting; conflating
		// the two is exactly the confusion this view resolves.
		expect(project([]).collector).toMatchObject({
			httpUrl: "http://127.0.0.1:4318",
			grpcPort: 4317,
			status: "listening",
		});
	});

	it("emits a row for a resource that has sent nothing", () => {
		// A service missing from the list reads as "not deployed" rather than
		// "deployed and not instrumented".
		const view = project([{ id: "api", kind: "service" }]);
		expect(view.resources).toHaveLength(1);
		expect(view.resources[0]?.export).toBe("silent");
	});

	it("says the collector is listening in a silent row's note", () => {
		// Otherwise "silent" reads as "the collector is broken".
		expect(
			project([{ id: "api", kind: "service" }]).resources[0]?.note,
		).toContain("listening");
	});

	it("omits the last-signal time for a silent resource", () => {
		// A timestamp on a resource that never reported is a fiction.
		expect(
			project([{ id: "api", kind: "service" }]).resources[0],
		).not.toHaveProperty("lastSignalAt");
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("reports a resource with any signal as exporting", () => {
		const sink = createOtelSink();
		sink.ingestMetric(metric());
		expect(
			project([{ id: "api", kind: "service" }], sink).resources[0]?.export,
		).toBe("exporting");
	});

	it("counts each signal kind separately", () => {
		const sink = createOtelSink();
		sink.ingestLog(log());
		sink.ingestSpan(span());
		sink.ingestSpan(span({ spanId: "s2" }));
		expect(
			project([{ id: "api", kind: "service" }], sink).resources[0],
		).toMatchObject({ logs: 1, traces: 2, metrics: 0 });
	});

	it("reports the most recent signal across all three kinds", () => {
		// An operator asks "when did I last hear from this?" — not "when did I
		// last hear a log from this?".
		const sink = createOtelSink();
		sink.ingestLog(log({ time: "2026-01-01T00:00:00.000Z" }));
		sink.ingestSpan(span({ startTime: "2026-06-01T00:00:00.000Z" }));
		expect(
			project([{ id: "api", kind: "service" }], sink).resources[0]
				?.lastSignalAt,
		).toBe("2026-06-01T00:00:00.000Z");
	});

	it("ignores an empty timestamp when picking the most recent", () => {
		// An empty string sorts first, but it is an absence, not an early time.
		const sink = createOtelSink();
		sink.ingestLog(log({ time: "" }));
		sink.ingestSpan(span({ startTime: "2026-06-01T00:00:00.000Z" }));
		expect(
			project([{ id: "api", kind: "service" }], sink).resources[0]
				?.lastSignalAt,
		).toBe("2026-06-01T00:00:00.000Z");
	});

	it("carries each subject's kind through", () => {
		expect(project([{ id: "api", kind: "bindle" }]).resources[0]?.kind).toBe(
			"bindle",
		);
	});

	it("emits one row per subject, in the order given", () => {
		// The caller decides the ordering; re-sorting here would fight whatever
		// grouping the dashboard applied.
		const view = project([
			{ id: "worker", kind: "service" },
			{ id: "api", kind: "service" },
		]);
		expect(view.resources.map((r) => r.resourceName)).toEqual([
			"worker",
			"api",
		]);
	});

	it("de-duplicates a subject listed twice", () => {
		// Two identical rows read as two deployments of the same service.
		expect(
			project([
				{ id: "api", kind: "service" },
				{ id: "api", kind: "service" },
			]).resources,
		).toHaveLength(1);
	});

	it("reports no rows when there are no known resources", () => {
		expect(project([]).resources).toEqual([]);
	});
});

describe("fleetView", () => {
	it("defers to a Camp by default", () => {
		expect(fleetView().scope).toBe("camp-deferred");
	});

	it("says why it deferred", () => {
		// An empty project list without a reason reads as "you have no projects".
		expect(fleetView().reason).toContain("Camp");
	});

	it("goes local once a Camp is connected", () => {
		expect(fleetView({ campConnected: true }).scope).toBe("local");
	});

	it("states no reason when it did not defer", () => {
		expect(fleetView({ campConnected: true }).reason).toBeUndefined();
	});

	// SAFETY: parsed or fixture value is the named domain type after this assertion.
	it("defers on an explicit false rather than treating it as unknown", () => {
		expect(fleetView({ campConnected: false }).scope).toBe("camp-deferred");
	});

	it("reports an empty project list either way, rather than omitting it", () => {
		// A caller iterating `projects` must not have to check for undefined.
		expect(fleetView().projects).toEqual([]);
		expect(fleetView({ campConnected: true }).projects).toEqual([]);
	});
});
