import { describe, expect, it } from "vitest";

import {
	isStationOccupancyEndpoint,
	loopbackFetchUrl,
	occupancyNamedOrigin,
	occupancySidecarEndpoints,
	preferNamedEndpoint,
} from "../src/occupancy-endpoints.js";

describe("occupancy named endpoints", () => {
	it("names Evidence and dashboard on .hobo.localhost, not loopback", () => {
		expect(occupancyNamedOrigin("evidence", 8788)).toBe(
			"http://evidence.code.local.hobo.localhost:8788",
		);
		expect(occupancyNamedOrigin("dashboard", 8787)).toBe(
			"http://dashboard.code.local.hobo.localhost:8787",
		);
		expect(occupancyNamedOrigin("otlp", 4318)).toBe(
			"http://otlp.code.local.hobo.localhost:4318",
		);
		expect(occupancyNamedOrigin("evals", 8789)).toBe(
			"http://evals.code.local.hobo.localhost:8789",
		);
		expect(occupancyNamedOrigin("rollout", 8790)).toBe(
			"http://rollout.code.local.hobo.localhost:8790",
		);
		expect(occupancyNamedOrigin("experiment", 8791)).toBe(
			"http://experiment.code.local.hobo.localhost:8791",
		);
		expect(occupancyNamedOrigin("kms", 8792)).toBe(
			"http://kms.code.local.hobo.localhost:8792",
		);
		expect(occupancyNamedOrigin("history", 8793)).toBe(
			"http://history.code.local.hobo.localhost:8793",
		);
	});

	it("rewrites loopback Evidence paths onto the named origin", () => {
		const named = preferNamedEndpoint(
			"http://127.0.0.1:48212/__hobo/evidence?token=opaque",
			"evidence",
		);
		expect(named).toBe(
			"http://evidence.code.local.hobo.localhost:48212/__hobo/evidence?token=opaque",
		);
		expect(named).not.toMatch(/127\.0\.0\.1/);
		expect(loopbackFetchUrl(named)).toBe(
			"http://127.0.0.1:48212/__hobo/evidence?token=opaque",
		);
	});

	it("keeps a multi-tenant label and drops the local-dev alias", () => {
		expect(
			occupancyNamedOrigin("evidence", 8788, {
				tenant: "camp-west",
				environment: "local-dev",
			}),
		).toBe("http://evidence.code.local.camp-west.hobo.localhost:8788");
	});

	it("projects listening occupancy sidecars as named endpoint records", () => {
		const rows = occupancySidecarEndpoints({
			dashboardUrl: "http://127.0.0.1:8787/",
			evidenceReportUrl: "http://127.0.0.1:8788/__hobo/evidence",
			evidenceControlsUrl: "http://127.0.0.1:8788/__hobo/evidence/controls/cap",
			otlpHttpUrl: "http://127.0.0.1:4318/v1/logs",
			evalsUrl: "http://127.0.0.1:8789/",
			rolloutUrl: "http://127.0.0.1:8790/",
			experimentUrl: "http://127.0.0.1:8791/",
			kmsUrl: "http://127.0.0.1:8792/",
			historyUrl: "http://127.0.0.1:8793/",
		});
		expect(rows.map((row) => row.resourceName)).toEqual([
			"dashboard",
			"evidence",
			"controls",
			"otlp",
			"evals",
			"rollout",
			"experiment",
			"kms",
			"secret",
			"crypto",
			"history",
		]);
		expect(rows.every((row) => row.fidelity === "real")).toBe(true);
		expect(isStationOccupancyEndpoint("dashboard")).toBe(true);
		expect(isStationOccupancyEndpoint("kms")).toBe(true);
		expect(isStationOccupancyEndpoint("web")).toBe(false);
		expect(
			rows.every((row) => row.preferredUrl.includes(".hobo.localhost")),
		).toBe(true);
		expect(rows.every((row) => row.backendUrl.includes("127.0.0.1"))).toBe(
			true,
		);
	});

	it("names bindle web listen URLs instead of leaving the loopback IP", () => {
		expect(
			preferNamedEndpoint("http://127.0.0.1:48211/", "web", { app: "hello" }),
		).toBe("http://web.hello.local.hobo.localhost:48211/");
		expect(
			preferNamedEndpoint("http://127.0.0.1:50100/?__hobo_debug=1", "web"),
		).toBe("http://web.code.local.hobo.localhost:50100/?__hobo_debug=1");
	});
});
