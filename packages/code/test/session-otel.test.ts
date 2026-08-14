import { describe, expect, it } from "vitest";

import { createOtelSink, fleetView } from "../src/session-otel.js";

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

	it("labels fleet view camp-deferred without a Camp", () => {
		const deferred = fleetView();
		expect(deferred.scope).toBe("camp-deferred");
		expect(deferred.reason).toMatch(/Camp/i);
		expect(deferred.projects).toEqual([]);
	});
});
