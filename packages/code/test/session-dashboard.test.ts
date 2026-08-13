import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import { startLocalDashboard } from "../src/session-dashboard.js";
import { recordDevDeployment } from "../src/session-resources.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "hobo-code-dashboard-"));
	homes.push(home);
	return home;
}

describe("local Aspire dashboard listener", () => {
	it("serves SPA plus inventory, telemetry, fleet, and lifecycle bodies", async () => {
		const hoboHome = tempHome();
		authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
		recordDevDeployment({
			hoboHome,
			scope: {
				stationId: "station:local",
				tenant: "camp-west",
				environment: "local-dev",
			},
			bindleName: "hello-world",
			appUrl: "http://127.0.0.1:4173/",
			debugUrl: "http://127.0.0.1:4173/?__hobo_debug=1",
			controlsUrl: "http://127.0.0.1:4174/?token=opaque",
			reportUrl: "http://127.0.0.1:4174/__hobo/evidence?token=opaque",
		});
		const dash = await startLocalDashboard({
			hoboHome,
			env: { HOBO_ENV: "local-dev" },
			port: 0,
			otlpHttpPort: 0,
			otlpGrpcPort: 0,
		});
		try {
			dash.sink.ingestLog({
				resourceName: "web",
				body: "listening",
				severity: "INFO",
				time: "2026-08-13T00:00:00.000Z",
			});
			dash.sink.ingestSpan({
				resourceName: "web",
				name: "GET /",
				traceId: "t1",
				spanId: "s1",
				startTime: "2026-08-13T00:00:00.000Z",
			});
			dash.sink.ingestMetric({
				resourceName: "web",
				name: "http.server.duration",
				value: 9,
				time: "2026-08-13T00:00:00.000Z",
			});

			const page = await fetch(dash.url);
			const html = await page.text();
			expect(page.status).toBe(200);
			expect(html).toMatch(/hobo-code · resources/);
			expect(html).toMatch(/\/api\/resources/);

			const resources = await fetch(new URL("/api/resources", dash.url));
			const inventory = (await resources.json()) as {
				ok: boolean;
				scope: { environment: string };
				bindles: { id: string }[];
				endpoints: { backendUrl: string; resolvedAddresses: string[] }[];
			};
			expect(inventory.ok).toBe(true);
			expect(inventory.scope.environment).toBe("local-dev");
			expect(inventory.bindles.some((row) => row.id.includes("hello-world"))).toBe(
				true,
			);
			expect(
				inventory.endpoints.some((row) => row.backendUrl.includes("4173")),
			).toBe(true);
			expect(
				inventory.endpoints.some((row) => row.resolvedAddresses.includes("127.0.0.1")),
			).toBe(true);

			const logs = await fetch(new URL("/api/resources/web/logs", dash.url));
			const logBody = (await logs.json()) as { logs: { body: string }[] };
			expect(logBody.logs.map((row) => row.body)).toEqual(["listening"]);
			const traces = await fetch(new URL("/api/resources/web/traces", dash.url));
			const traceBody = (await traces.json()) as { traces: { name: string }[] };
			expect(traceBody.traces.map((row) => row.name)).toEqual(["GET /"]);
			const metrics = await fetch(
				new URL("/api/resources/web/metrics", dash.url),
			);
			const metricBody = (await metrics.json()) as {
				metrics: { name: string }[];
			};
			expect(metricBody.metrics.map((row) => row.name)).toEqual([
				"http.server.duration",
			]);

			const started = await fetch(new URL("/api/resources/web/start", dash.url), {
				method: "POST",
			});
			const startBody = (await started.json()) as {
				ready: boolean;
				started: boolean;
			};
			expect(startBody.started).toBe(true);

			const fleet = await fetch(new URL("/api/fleet", dash.url));
			const fleetBody = (await fleet.json()) as {
				scope: string;
				reason?: string;
			};
			expect(fleetBody.scope).toBe("camp-deferred");
			expect(fleetBody.reason).toMatch(/Camp/i);
		} finally {
			await dash.close();
		}
	});
});
