/**
 * In-process OTLP sink for the local dashboard.
 * Tests inject records; HTTP ingest maps OTLP JSON onto the same store.
 */

export interface OtelLogRecord {
	readonly resourceName: string;
	readonly body: string;
	readonly severity: string;
	readonly time: string;
}

export interface OtelSpanRecord {
	readonly resourceName: string;
	readonly name: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly startTime: string;
	readonly endTime?: string;
}

export interface OtelMetricRecord {
	readonly resourceName: string;
	readonly name: string;
	readonly value: number;
	readonly time: string;
}

export interface ResourceTelemetry {
	readonly resourceName: string;
	readonly logs: readonly OtelLogRecord[];
	readonly traces: readonly OtelSpanRecord[];
	readonly metrics: readonly OtelMetricRecord[];
}

export interface OtelSink {
	ingestLog(record: OtelLogRecord): void;
	ingestSpan(record: OtelSpanRecord): void;
	ingestMetric(record: OtelMetricRecord): void;
	ingestOtlpJson(kind: "logs" | "traces" | "metrics", body: unknown): number;
	forResource(resourceName: string): ResourceTelemetry;
	list(): readonly ResourceTelemetry[];
}

function resourceFromOtlp(resource: unknown): string {
	if (!resource || typeof resource !== "object") return "unknown";
	const attrs = (resource as { attributes?: readonly unknown[] }).attributes;
	if (!Array.isArray(attrs)) return "unknown";
	for (const attr of attrs) {
		if (!attr || typeof attr !== "object") continue;
		const key = (attr as { key?: string }).key;
		const value = (attr as { value?: { stringValue?: string } }).value;
		if (
			(key === "service.name" || key === "resource.name") &&
			typeof value?.stringValue === "string"
		) {
			return value.stringValue;
		}
	}
	return "unknown";
}

export function createOtelSink(): OtelSink {
	const logs: OtelLogRecord[] = [];
	const traces: OtelSpanRecord[] = [];
	const metrics: OtelMetricRecord[] = [];

	return {
		ingestLog(record) {
			logs.push(record);
		},
		ingestSpan(record) {
			traces.push(record);
		},
		ingestMetric(record) {
			metrics.push(record);
		},
		ingestOtlpJson(kind, body) {
			if (!body || typeof body !== "object") return 0;
			const resourceLogs = (body as { resourceLogs?: readonly unknown[] })
				.resourceLogs;
			const resourceSpans = (body as { resourceSpans?: readonly unknown[] })
				.resourceSpans;
			const resourceMetrics = (body as { resourceMetrics?: readonly unknown[] })
				.resourceMetrics;
			let count = 0;
			if (kind === "logs" && Array.isArray(resourceLogs)) {
				for (const group of resourceLogs) {
					if (!group || typeof group !== "object") continue;
					const resourceName = resourceFromOtlp(
						(group as { resource?: unknown }).resource,
					);
					const scopeLogs = (group as { scopeLogs?: readonly unknown[] })
						.scopeLogs;
					if (!Array.isArray(scopeLogs)) continue;
					for (const scope of scopeLogs) {
						const records = (scope as { logRecords?: readonly unknown[] })
							.logRecords;
						if (!Array.isArray(records)) continue;
						for (const record of records) {
							const rec = record as {
								body?: { stringValue?: string };
								severityText?: string;
								timeUnixNano?: string;
							};
							logs.push({
								resourceName,
								body: rec.body?.stringValue ?? "",
								severity: rec.severityText ?? "INFO",
								time: rec.timeUnixNano ?? new Date().toISOString(),
							});
							count += 1;
						}
					}
				}
			}
			if (kind === "traces" && Array.isArray(resourceSpans)) {
				for (const group of resourceSpans) {
					if (!group || typeof group !== "object") continue;
					const resourceName = resourceFromOtlp(
						(group as { resource?: unknown }).resource,
					);
					const scopeSpans = (group as { scopeSpans?: readonly unknown[] })
						.scopeSpans;
					if (!Array.isArray(scopeSpans)) continue;
					for (const scope of scopeSpans) {
						const spans = (scope as { spans?: readonly unknown[] }).spans;
						if (!Array.isArray(spans)) continue;
						for (const span of spans) {
							const rec = span as {
								name?: string;
								traceId?: string;
								spanId?: string;
								startTimeUnixNano?: string;
								endTimeUnixNano?: string;
							};
							traces.push({
								resourceName,
								name: rec.name ?? "span",
								traceId: rec.traceId ?? "",
								spanId: rec.spanId ?? "",
								startTime: rec.startTimeUnixNano ?? new Date().toISOString(),
								...(rec.endTimeUnixNano
									? { endTime: rec.endTimeUnixNano }
									: {}),
							});
							count += 1;
						}
					}
				}
			}
			if (kind === "metrics" && Array.isArray(resourceMetrics)) {
				for (const group of resourceMetrics) {
					if (!group || typeof group !== "object") continue;
					const resourceName = resourceFromOtlp(
						(group as { resource?: unknown }).resource,
					);
					const scopeMetrics = (group as { scopeMetrics?: readonly unknown[] })
						.scopeMetrics;
					if (!Array.isArray(scopeMetrics)) continue;
					for (const scope of scopeMetrics) {
						const metricRows = (scope as { metrics?: readonly unknown[] })
							.metrics;
						if (!Array.isArray(metricRows)) continue;
						for (const metric of metricRows) {
							const rec = metric as {
								name?: string;
								gauge?: {
									dataPoints?: readonly { asDouble?: number }[];
								};
							};
							const value = rec.gauge?.dataPoints?.[0]?.asDouble ?? 0;
							metrics.push({
								resourceName,
								name: rec.name ?? "metric",
								value,
								time: new Date().toISOString(),
							});
							count += 1;
						}
					}
				}
			}
			return count;
		},
		forResource(resourceName) {
			return {
				resourceName,
				logs: logs.filter((row) => row.resourceName === resourceName),
				traces: traces.filter((row) => row.resourceName === resourceName),
				metrics: metrics.filter((row) => row.resourceName === resourceName),
			};
		},
		list() {
			const names = new Set([
				...logs.map((row) => row.resourceName),
				...traces.map((row) => row.resourceName),
				...metrics.map((row) => row.resourceName),
			]);
			return [...names].sort().map((name) => this.forResource(name));
		},
	};
}

export type OtelExportStatus = "exporting" | "silent";

export interface OccupancyOtelSubject {
	readonly id: string;
	readonly kind: string;
}

export interface OccupancyOtelResource {
	readonly resourceName: string;
	readonly kind: string;
	readonly export: OtelExportStatus;
	readonly logs: number;
	readonly traces: number;
	readonly metrics: number;
	readonly lastSignalAt?: string;
	readonly note: string;
}

export interface OccupancyOtelView {
	readonly collector: {
		readonly httpUrl: string;
		readonly grpcPort: number;
		readonly status: "listening";
	};
	readonly resources: readonly OccupancyOtelResource[];
}

/** One OTel row per known service/Bindle. Empty sink is silent, not hidden. */
export function projectOccupancyTelemetry(input: {
	readonly resources: readonly OccupancyOtelSubject[];
	readonly sink: Pick<OtelSink, "forResource">;
	readonly collector: { readonly httpUrl: string; readonly grpcPort: number };
}): OccupancyOtelView {
	const seen = new Set<string>();
	const resources: OccupancyOtelResource[] = [];
	for (const subject of input.resources) {
		if (seen.has(subject.id)) continue;
		seen.add(subject.id);
		const tel = input.sink.forResource(subject.id);
		const logs = tel.logs.length;
		const traces = tel.traces.length;
		const metrics = tel.metrics.length;
		const last = [
			...tel.logs.map((row) => row.time),
			...tel.traces.map((row) => row.startTime),
			...tel.metrics.map((row) => row.time),
		]
			.filter((value) => value.length > 0)
			.sort()
			.at(-1);
		const exporting = logs + traces + metrics > 0;
		resources.push({
			resourceName: subject.id,
			kind: subject.kind,
			export: exporting ? "exporting" : "silent",
			logs,
			traces,
			metrics,
			...(last ? { lastSignalAt: last } : {}),
			note: exporting
				? "signals received at the local collector"
				: "collector is listening; no logs/spans/metrics received",
		});
	}
	return {
		collector: {
			httpUrl: input.collector.httpUrl,
			grpcPort: input.collector.grpcPort,
			status: "listening",
		},
		resources,
	};
}

export function fleetView(options: { readonly campConnected?: boolean } = {}): {
	readonly scope: "local" | "camp-deferred";
	readonly reason?: string;
	readonly projects: readonly unknown[];
} {
	if (options.campConnected === true) {
		return { scope: "local", projects: [] };
	}
	return {
		scope: "camp-deferred",
		reason: "Requires Camp connection",
		projects: [],
	};
}
