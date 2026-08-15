import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStationCapabilityManifest } from "@hobo/stations";
import { afterEach, describe, expect, it } from "vitest";
import { runHoboCodeCli } from "../src/index.js";
import type { MachineDiscoveryProbes } from "../src/machine-discovery.js";
import { machineDiscoveryPath } from "../src/machine-discovery.js";

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

function fakeProbes(
	overrides: Partial<MachineDiscoveryProbes> = {},
): MachineDiscoveryProbes {
	return {
		which: (binary) => (binary === "git" ? "/usr/bin/git" : null),
		exists: () => false,
		env: {},
		platform: "linux",
		arch: "x64",
		nodeVersion: "22.5.0",
		cpuCount: 4,
		memoryBytes: 8 * 1024 ** 3,
		home: "/home/dev",
		probeModelServer: async (host) => ({
			host,
			ok: false,
			models: [],
			reason: "unreachable (test)",
		}),
		...overrides,
	};
}

describe("hobo-code init (machine discovery, ADR-0155)", () => {
	it("dry-run discovers and matches without writing durable state", async () => {
		const home = temp("hobo-code-init-dry-");
		const result = await runHoboCodeCli(["init", "--dry-run"], {
			env: { HOBO_HOME: home },
			hoboHome: home,
			machineProbes: fakeProbes(),
		});
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_INIT_DRY_RUN");
		expect(existsSync(join(home, "stations"))).toBe(false);
		expect(existsSync(machineDiscoveryPath(home))).toBe(false);
		const data = result.data as {
			manifest: { ok: boolean };
			report: { git: string | null };
		};
		expect(data.manifest.ok).toBe(true);
		expect(data.report.git).toBe("/usr/bin/git");
	});

	it("seeds station:local and persists manifest + report when requirements match", async () => {
		const home = temp("hobo-code-init-seed-");
		const result = await runHoboCodeCli(["init"], {
			env: { HOBO_HOME: home },
			hoboHome: home,
			machineProbes: fakeProbes(),
		});
		expect(result.ok).toBe(true);
		expect(result.code).toBe("HOBO_CODE_INIT");
		const data = result.data as {
			station: { stationId: string; created: boolean };
		};
		expect(data.station.stationId).toBe("station:local");
		expect(data.station.created).toBe(true);
		const manifest = loadStationCapabilityManifest(home, "station:local");
		expect(manifest?.ok).toBe(true);
		// Optional model server missing → recorded degraded, not fatal.
		expect(
			manifest?.capabilities.find(
				(row) => row.capability.id === "capability:model-server:ollama",
			)?.status,
		).toBe("missing");
		const report = JSON.parse(
			readFileSync(machineDiscoveryPath(home), "utf8"),
		) as { schema: string };
		expect(report.schema).toBe("hobo.code.machine-discovery/v1");
		// Idempotent second run: already present, still ok.
		const again = await runHoboCodeCli(["init"], {
			env: { HOBO_HOME: home },
			hoboHome: home,
			machineProbes: fakeProbes(),
		});
		expect(again.ok).toBe(true);
		expect(
			(again.data as { station: { created: boolean } }).station.created,
		).toBe(false);
	});

	it("fails closed and writes nothing when a required capability is missing", async () => {
		const home = temp("hobo-code-init-fail-");
		const result = await runHoboCodeCli(["init"], {
			env: { HOBO_HOME: home },
			hoboHome: home,
			machineProbes: fakeProbes({ which: () => null }),
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_INIT_CAPABILITY");
		expect(result.remediation).toContain("install git");
		expect(existsSync(join(home, "stations"))).toBe(false);
	});

	it("rejects unknown scenarios with the closed set named", async () => {
		const home = temp("hobo-code-init-scenario-");
		const result = await runHoboCodeCli(["init", "--scenario", "prod"], {
			env: { HOBO_HOME: home },
			hoboHome: home,
			machineProbes: fakeProbes(),
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_CODE_INIT_SCENARIO");
	});

	it("seeds the declared ephemeral station under --scenario", async () => {
		const home = temp("hobo-code-init-ephemeral-");
		const result = await runHoboCodeCli(["init", "--scenario", "ephemeral"], {
			env: { HOBO_HOME: home },
			hoboHome: home,
			machineProbes: fakeProbes(),
		});
		expect(result.ok).toBe(true);
		expect(
			(result.data as { station: { stationId: string } }).station.stationId,
		).toBe("station:code-ephemeral");
	});
});
