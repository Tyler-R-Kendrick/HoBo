import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	CODE_FEATURE_FLAGS,
	composeCodePlatform,
	createMemoryFeaturePort,
	SWE_PROVIDER_CATALOG,
	selectSweProvider,
	startCodeSession,
} from "../src/index.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function temp(prefix: string): string {
	const d = mkdtempSync(join(tmpdir(), prefix));
	temps.push(d);
	return d;
}

describe("@hobo/code platform integration", () => {
	it("auto-inits station and evaluates OpenFeature progressive flags", () => {
		const home = temp("hobo-code-plat-");
		const features = createMemoryFeaturePort();
		const snap = composeCodePlatform({
			hoboHome: home,
			autoInitStation: true,
			features,
		});
		expect(snap.station.present).toBe(true);
		expect(snap.station.stationId).toContain("station:");
		expect(snap.features.harnessEnabled).toBe(true);
		expect(snap.features.monetizationSurface).toBe(true);
		expect(snap.features.riftPreferred).toBe(true);
		expect(snap.features.distributed).toBe(true);
		expect(snap.features.defaultsOn).toBe(true);
		expect(snap.provider.id).toBeTruthy();
		expect(snap.trails.length).toBeGreaterThan(0);
		expect(snap.cq.localMcpMandatory).toBe(true);
	});

	it("selects cheapest capable SWE provider by default", () => {
		const p = selectSweProvider("cheapest-capable");
		const min = Math.min(
			...SWE_PROVIDER_CATALOG.filter((x) => x.capable).map(
				(x) => x.costUsdPerMTok,
			),
		);
		expect(p.costUsdPerMTok).toBe(min);
	});

	it("session pins station and records platform in durable handback path", async () => {
		const home = temp("hobo-code-sess-plat-");
		const project = temp("hobo-code-sess-proj-");
		const session = await startCodeSession({
			projectRoot: project,
			hoboHome: home,
			autoInitStation: true,
			sidecars: false,
		});
		expect(session.platform.station.present).toBe(true);
		expect(session.isolation.stationId).toBe(
			session.platform.station.stationId,
		);
		const handback = await session.complete(true, ["platform:ok"]);
		expect(handback.ok).toBe(true);
	});

	it("refuses session when harness flag is off", async () => {
		const home = temp("hobo-code-disabled-");
		const project = temp("hobo-code-disabled-proj-");
		const features = createMemoryFeaturePort({
			...Object.fromEntries(
				Object.values(CODE_FEATURE_FLAGS).map((k) => [k, true]),
			),
			[CODE_FEATURE_FLAGS.harnessEnabled]: false,
		});
		await expect(
			startCodeSession({
				projectRoot: project,
				hoboHome: home,
				features,
				autoInitStation: true,
			}),
		).rejects.toThrow(/code\.harness\.enabled/);
	});
});
