import { describe, expect, it } from "vitest";

import {
	createOtelSink,
	fleetView,
	projectOccupancyTelemetry,
} from "../src/session-otel.js";

describe("local OTLP sink", () => {
	it("returns injected logs, traces, and metrics per resource", () => {
		const sink = createOtelSink();
		sink.ingestLog({
			resourceName: "web",
			body: "listening",
			severity: "INFO",
			time: "2026-08-13T00:00:00.000Z",
		});
		sink.ingestSpan({
			resourceName: "web",
			name: "GET /",
			traceId: "abc",
			spanId: "def",
			startTime: "2026-08-13T00:00:00.000Z",
		});
		sink.ingestMetric({
			resourceName: "web",
			name: "http.server.duration",
			value: 12,
			time: "2026-08-13T00:00:00.000Z",
		});
		const telemetry = sink.forResource("web");
		expect(telemetry.logs.map((row) => row.body)).toEqual(["listening"]);
		expect(telemetry.traces.map((row) => row.name)).toEqual(["GET /"]);
		expect(telemetry.metrics.map((row) => row.name)).toEqual([
			"http.server.duration",
		]);
		expect(sink.forResource("db").logs).toEqual([]);
	});

	it("parses OTLP JSON ingest into the same store", () => {
		const sink = createOtelSink();
		const count = sink.ingestOtlpJson("logs", {
			resourceLogs: [
				{
					resource: {
						attributes: [
							{ key: "service.name", value: { stringValue: "web" } },
						],
					},
					scopeLogs: [
						{
							logRecords: [
								{
									body: { stringValue: "otlp-log" },
									severityText: "INFO",
									timeUnixNano: "1",
								},
							],
						},
					],
				},
			],
		});
		expect(count).toBe(1);
		expect(sink.forResource("web").logs[0]?.body).toBe("otlp-log");
	});

	it("lists every service even when the sink is silent", () => {
		const sink = createOtelSink();
		sink.ingestLog({
			resourceName: "dashboard",
			body: "dashboard listening",
			severity: "INFO",
			time: "2026-08-14T12:00:00.000Z",
		});
		const view = projectOccupancyTelemetry({
			resources: [
				{ id: "dashboard", kind: "http" },
				{ id: "otlp", kind: "otlp" },
				{ id: "bindle:hello-world", kind: "bindle" },
			],
			sink,
			collector: {
				httpUrl: "http://otlp.code.local.hobo.localhost:4318/v1/logs",
				grpcPort: 4317,
			},
		});
		expect(view.collector.status).toBe("listening");
		expect(view.resources.map((row) => row.resourceName)).toEqual([
			"dashboard",
			"otlp",
			"bindle:hello-world",
		]);
		expect(view.resources[0]?.export).toBe("exporting");
		expect(view.resources[1]?.export).toBe("silent");
		expect(view.resources[2]?.note).toMatch(/no logs\/spans\/metrics/i);
	});

	it("labels fleet view camp-deferred without a Camp", () => {
		const deferred = fleetView();
		expect(deferred.scope).toBe("camp-deferred");
		expect(deferred.reason).toMatch(/Camp/i);
		expect(deferred.projects).toEqual([]);
	});
});
