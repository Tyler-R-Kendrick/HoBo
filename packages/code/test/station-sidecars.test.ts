import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { authLogin } from "../src/auth.js";
import {
	formatSidecarStrap,
	readStationSidecars,
	sidecarsEnabled,
	startStationSidecars,
} from "../src/station-sidecars.js";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes) rmSync(home, { recursive: true, force: true });
	homes.length = 0;
});

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "hobo-code-sidecars-"));
	homes.push(home);
	return home;
}

describe("station occupancy sidecars", () => {
	it("refuses to start when logged out", async () => {
		await expect(
			startStationSidecars({
				hoboHome: tempHome(),
				ensureLocalLogin: false,
			}),
		).rejects.toThrow(/not logged in/i);
	});

	it("starts dashboard and evidence as Station sidecars and serves them", async () => {
		const hoboHome = tempHome();
		authLogin({ hoboHome, tenant: "camp-west", autoInitLocal: true });
		const sidecars = await startStationSidecars({
			hoboHome,
			projectRoot: hoboHome,
			env: { HOBO_ENV: "local-dev" },
			dashboardPort: 0,
			evidencePort: 0,
			otlpHttpPort: 0,
			otlpGrpcPort: 0,
		});
		try {
			expect(sidecars.stationId).toBe("station:local");
			expect(sidecars.environment).toBe("local-dev");
			const dash = await fetch(sidecars.dashboardUrl);
			expect(dash.status).toBe(200);
			expect(await dash.text()).toMatch(/hobo-code · resources/);
			const resources = await fetch(
				new URL("/api/resources", sidecars.dashboardUrl),
			);
			const inventory = (await resources.json()) as { ok: boolean };
			expect(inventory.ok).toBe(true);
			const evidence = await fetch(sidecars.evidenceUrl);
			expect(evidence.status).toBe(200);
			expect(sidecars.evidenceReportUrl).toMatch(/__hobo\/evidence/);
			const disk = readStationSidecars(hoboHome, "station:local");
			expect(disk?.dashboardUrl).toBe(sidecars.dashboardUrl);
			expect(disk?.evidenceUrl).toBe(sidecars.evidenceUrl);
			expect(formatSidecarStrap(sidecars).join(" ")).toMatch(/dash:/);
			expect(formatSidecarStrap(sidecars).join(" ")).toMatch(/evidence:/);
		} finally {
			await sidecars.close();
		}
		expect(readStationSidecars(hoboHome, "station:local")).toBeNull();
	});

	it("startCodeSession launches both sidecars by default", async () => {
		const { startCodeSession } = await import("../src/session.js");
		const hoboHome = tempHome();
		const project = mkdtempSync(join(tmpdir(), "hobo-code-sidecar-proj-"));
		homes.push(project);
		const session = await startCodeSession({
			projectRoot: project,
			hoboHome,
			autoInitStation: true,
		});
		try {
			expect(session.sidecars).toBeDefined();
			const dash = await fetch(session.sidecars?.dashboardUrl ?? "");
			expect(dash.status).toBe(200);
			const evidence = await fetch(session.sidecars?.evidenceUrl ?? "");
			expect(evidence.status).toBe(200);
		} finally {
			await session.complete(true, ["sidecars"]);
		}
	});

	it("honours HOBO_CODE_SIDECARS=0", () => {
		expect(sidecarsEnabled({ HOBO_CODE_SIDECARS: "0" })).toBe(false);
		expect(sidecarsEnabled({})).toBe(true);
	});
});
