import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loopbackFetchUrl } from "../src/occupancy-endpoints.js";
import {
	STATION_SIDECARS_SCHEMA,
	stationSidecarsPath,
} from "../src/station-sidecars.js";
import {
	evaluateStationStatus,
	startStatusSidecar,
} from "../src/status-sidecar-server.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

const STATION = "station:local";
const NOW = () => new Date("2026-08-17T00:00:00.000Z");

function seedSnapshot(hoboHome: string): void {
	const path = stationSidecarsPath(hoboHome, STATION);
	mkdirSync(join(hoboHome, "stations", "station_local"), { recursive: true });
	writeFileSync(
		path,
		JSON.stringify({
			schema: STATION_SIDECARS_SCHEMA,
			stationId: STATION,
			environment: "local-dev",
			dashboardUrl: "http://127.0.0.1:18787/",
			evidenceUrl: "http://127.0.0.1:18788/",
			evidenceReportUrl: "http://127.0.0.1:18788/report",
			evidenceControlsUrl: "http://127.0.0.1:18788/controls",
			otlpHttpUrl: "http://127.0.0.1:14318/",
			historyUrl: "http://127.0.0.1:18790/",
			startedAt: "2026-08-17T00:00:00.000Z",
		}),
	);
}

describe("station status sidecar", () => {
	it("evaluates live sibling probes into a station status model", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-status-"));
		homes.push(hoboHome);
		seedSnapshot(hoboHome);
		const model = await evaluateStationStatus({
			hoboHome,
			stationId: STATION,
			now: NOW,
			probe: async (url) => !url.includes("18790"),
		});
		expect(model.scope.kind).toBe("station");
		const byId = new Map(model.components.map((c) => [c.spec.id, c.status]));
		expect(byId.get("sidecar-dashboard")).toBe("operational");
		expect(byId.get("sidecar-evidence")).toBe("operational");
		// The dead history sidecar reads as an outage, so the page banner does.
		expect(byId.get("sidecar-history")).toBe("major_outage");
		expect(model.overall.indicator).toBe("critical");
	});

	it("renders an honest unknown page when no fleet snapshot exists", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-status-"));
		homes.push(hoboHome);
		const model = await evaluateStationStatus({
			hoboHome,
			stationId: STATION,
			now: NOW,
			probe: async () => true,
		});
		expect(model.components).toHaveLength(0);
		expect(model.overall.indicator).toBe("unknown");
	});

	it("serves html, health, and statuspage-v2 json", async () => {
		const hoboHome = mkdtempSync(join(tmpdir(), "hobo-status-"));
		homes.push(hoboHome);
		seedSnapshot(hoboHome);
		const server = await startStatusSidecar({
			hoboHome,
			stationId: STATION,
			environment: "local-dev",
			port: 0,
			now: NOW,
			probe: async () => true,
		});
		try {
			expect(server.url).toMatch(/status\.code\..*\.hobo\.localhost/);
			const origin = loopbackFetchUrl(server.url);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const health = (await (
				await fetch(new URL("/health", origin))
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as {
				name: string;
				hosting: string;
				live: boolean;
			};
			expect(health).toMatchObject({
				name: "status",
				hosting: "station",
				live: true,
			});
			const htmlResponse = await fetch(origin);
			expect(htmlResponse.headers.get("content-type")).toContain("text/html");
			const html = await htmlResponse.text();
			expect(html).toContain("All systems operational");
			expect(html).toContain("dashboard (sidecar)");
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const summary = (await (
				await fetch(new URL("/api/v2/summary.json", origin))
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as {
				status: { indicator: string };
				components: readonly { id: string; status: string }[];
			};
			expect(summary.status.indicator).toBe("none");
			expect(summary.components.length).toBeGreaterThan(0);
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			const status = (await (
				await fetch(new URL("/api/v2/status.json", origin))
			)
				// SAFETY: parsed or fixture value is the named domain type after this assertion.
				.json()) as { page: { id: string } };
			expect(status.page.id).toBe("station-station-local");
			const missing = await fetch(new URL("/nope", origin));
			expect(missing.status).toBe(404);
		} finally {
			await server.close();
		}
	});
});
