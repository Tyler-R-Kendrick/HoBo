import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { KnownAgent } from "../src/agent-registry.js";
import {
	defaultMachineProbes,
	discoverMachine,
	MACHINE_DISCOVERY_SCHEMA,
	type MachineDiscoveryProbes,
	machineDiscoveryPath,
	matchMachineToStation,
	observationsFromMachineReport,
	persistMachineDiscoveryReport,
} from "../src/machine-discovery.js";

const temps: string[] = [];
afterEach(() => {
	for (const d of temps) rmSync(d, { recursive: true, force: true });
	temps.length = 0;
});

function tempDir(): string {
	const d = mkdtempSync(join(tmpdir(), "hobo-code-discovery-"));
	temps.push(d);
	return d;
}

const CATALOG: readonly KnownAgent[] = [
	{
		id: "codex",
		label: "Codex",
		kind: "coding-agent",
		binaries: ["codex"],
		configPaths: [".codex"],
		command: "codex",
	},
];

function fakeProbes(
	overrides: Partial<MachineDiscoveryProbes> = {},
): MachineDiscoveryProbes {
	return {
		which: (binary) =>
			binary === "git"
				? "/usr/bin/git"
				: binary === "codex"
					? "/usr/bin/codex"
					: null,
		exists: () => false,
		env: {},
		platform: "linux",
		arch: "x64",
		nodeVersion: "22.5.0",
		cpuCount: 8,
		memoryBytes: 16 * 1024 ** 3,
		home: "/home/dev",
		probeModelServer: async (host) => ({
			host,
			ok: true,
			models: ["qwen2.5-coder:1.5b"],
		}),
		...overrides,
	};
}

describe("discoverMachine()", () => {
	it("reports host facts, isolation matrix, model server, and harness evidence", async () => {
		const report = await discoverMachine({
			probes: fakeProbes(),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		expect(report.schema).toBe(MACHINE_DISCOVERY_SCHEMA);
		expect(report.host.nodeVersion).toBe("22.5.0");
		expect(report.isolation.platform).toBe("linux-generic");
		expect(report.git).toBe("/usr/bin/git");
		expect(report.modelServer.ok).toBe(true);
		expect(report.harnesses).toEqual([
			{ id: "codex", label: "Codex", evidence: ["bin:/usr/bin/codex"] },
		]);
	});

	it("honors OLLAMA_HOST for the model-server probe destination", async () => {
		const report = await discoverMachine({
			probes: fakeProbes({ env: { OLLAMA_HOST: "http://127.0.0.1:9999" } }),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		expect(report.modelServer.host).toBe("http://127.0.0.1:9999");
	});
});

describe("matchMachineToStation()", () => {
	const now = () => "2026-08-15T00:00:00.000Z";

	it("everything-present machine matches with only CoW rift degraded", async () => {
		const report = await discoverMachine({
			probes: fakeProbes(),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		const manifest = matchMachineToStation({
			stationId: "station:local",
			report,
			now,
		});
		expect(manifest.ok).toBe(true);
		expect(manifest.missingRequired).toEqual([]);
		const byId = new Map(
			manifest.capabilities.map((row) => [row.capability.id, row]),
		);
		expect(byId.get("capability:runtime:node")?.status).toBe("present");
		expect(byId.get("capability:vcs:git")?.status).toBe("present");
		// linux-generic is not CoW-capable until a probe upgrades it (ADR-0139).
		expect(byId.get("capability:isolation-backend:rift")?.status).toBe(
			"missing",
		);
		expect(byId.get("capability:model-server:ollama")?.status).toBe("present");
		// devenv/nix absent on this fake machine → degraded with remediation.
		expect(byId.get("capability:toolchain:devenv")?.status).toBe("missing");
		expect(byId.get("capability:sidecar:dashboard")?.evidence).toEqual([
			"default-supplied",
		]);
	});

	it("fails closed when git is missing (required capability)", async () => {
		const report = await discoverMachine({
			probes: fakeProbes({ which: () => null }),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		const manifest = matchMachineToStation({
			stationId: "station:local",
			report,
			now,
		});
		expect(manifest.ok).toBe(false);
		expect(manifest.missingRequired).toContain("capability:vcs:git");
		expect(manifest.missingRequired).toContain(
			"capability:isolation-backend:worktree",
		);
		expect(manifest.remediation).toContain("install git");
	});

	it("old node fails the runtime requirement with the version in evidence", async () => {
		const report = await discoverMachine({
			probes: fakeProbes({ nodeVersion: "18.19.0" }),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		const observations = observationsFromMachineReport(report);
		const node = observations.find(
			(o) => o.capabilityId === "capability:runtime:node",
		);
		expect(node?.present).toBe(false);
		expect(node?.evidence).toEqual(["node:18.19.0"]);
	});

	it("kill switches turn default-supplied capabilities explicitly absent", async () => {
		const report = await discoverMachine({
			probes: fakeProbes(),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		const manifest = matchMachineToStation({
			stationId: "station:local",
			report,
			env: { HOBO_REPLAY: "0", HOBO_CODE_SIDECARS: "0" },
			now,
		});
		const byId = new Map(
			manifest.capabilities.map((row) => [row.capability.id, row]),
		);
		expect(byId.get("capability:replay:session-replay")?.status).toBe(
			"missing",
		);
		expect(byId.get("capability:sidecar:dashboard")?.status).toBe("missing");
		// Kill switches degrade optional capabilities; they never gate init.
		expect(manifest.ok).toBe(true);
	});
});

describe("report persistence", () => {
	it("writes the durable report under HOBO_HOME/durable/code", async () => {
		const home = tempDir();
		const report = await discoverMachine({
			probes: fakeProbes(),
			packageRoot: tempDir(),
			harnessCatalog: CATALOG,
		});
		const path = persistMachineDiscoveryReport(home, report);
		expect(path).toBe(machineDiscoveryPath(home));
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		expect(parsed.schema).toBe(MACHINE_DISCOVERY_SCHEMA);
	});
});

describe("defaultMachineProbes()", () => {
	it("reads the real host through node:os and PATH", () => {
		const probes = defaultMachineProbes(process.env);
		expect(probes.nodeVersion).toBe(process.versions.node);
		expect(probes.cpuCount).toBeGreaterThan(0);
		expect(probes.memoryBytes).toBeGreaterThan(0);
	});
});
