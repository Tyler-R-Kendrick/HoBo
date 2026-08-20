/**
 * `hobo-code init` machine discovery (ADR-0155): inspect the machine the
 * harness is running on and match the evidence against the default localhost
 * capability set declared on the dev-scenario Station.
 *
 * Discovery is evidence-based and injectable (same idiom as agent detection
 * and devenv inspection) so it is testable without depending on the box the
 * tests run on. Every claim carries auditable evidence rows; a capability
 * the probes cannot see is missing — discovery never assumes.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { delimiter, join } from "node:path";

import {
	matchStationCapabilities,
	type StationCapabilityManifest,
	type StationCapabilityObservation,
} from "@hobo/stations";
import {
	knownAgentsFrom,
	loadHarnessCatalog,
} from "./agent-harness-catalog.js";
import {
	type DetectProbes,
	detectAgents,
	type KnownAgent,
} from "./agent-registry.js";
import { DEFAULT_LOCALHOST_CAPABILITIES } from "./dev-stations.js";
import { type DevenvStatus, inspectDevenv } from "./devenv.js";
import { DEFAULT_OLLAMA_HOST, probeOllama } from "./ollama-engine.js";
import { matrixForPlatform } from "./platform-matrix.js";
import type { PlatformMatrixRow } from "./types.js";

// public-contract: wire schema of a persisted machine-discovery report.
export const MACHINE_DISCOVERY_SCHEMA =
	"hobo.code.machine-discovery/v1" as const;

/** Minimum Node.js major the harness supports. */
export const MIN_NODE_MAJOR = 20;

export interface ModelServerProbeResult {
	readonly host: string;
	readonly ok: boolean;
	readonly models: readonly string[];
	readonly reason?: string;
}

/** Injectable host probes — discovery reads the machine only through these. */
export interface MachineDiscoveryProbes {
	readonly which: (binary: string) => string | null;
	readonly exists: (path: string) => boolean;
	readonly env: NodeJS.ProcessEnv;
	readonly platform: NodeJS.Platform;
	readonly arch: string;
	readonly nodeVersion: string;
	readonly cpuCount: number;
	readonly memoryBytes: number;
	readonly home: string;
	readonly probeModelServer: (host: string) => Promise<ModelServerProbeResult>;
}

/** Real probes over PATH, node:os, and the local model server. */
export function defaultMachineProbes(
	env: NodeJS.ProcessEnv = process.env,
): MachineDiscoveryProbes {
	const paths = (env.PATH ?? "").split(delimiter).filter((p) => p.length > 0);
	return {
		which: (binary) => {
			for (const dir of paths) {
				const candidate = join(dir, binary);
				if (existsSync(candidate)) return candidate;
			}
			return null;
		},
		exists: (path) => existsSync(path),
		env,
		platform: process.platform,
		arch: process.arch,
		nodeVersion: process.versions.node,
		cpuCount: cpus().length,
		memoryBytes: totalmem(),
		home: env.HOME ?? "/root",
		probeModelServer: async (host) => {
			const probe = await probeOllama(host, 1500);
			return {
				host,
				ok: probe.ok,
				models: probe.models,
				...(probe.reason !== undefined ? { reason: probe.reason } : undefined),
			};
		},
	};
}

export interface MachineDiscoveryReport {
	readonly schema: typeof MACHINE_DISCOVERY_SCHEMA;
	readonly host: {
		readonly platform: NodeJS.Platform;
		readonly arch: string;
		readonly nodeVersion: string;
		readonly cpus: number;
		readonly memoryBytes: number;
	};
	readonly isolation: PlatformMatrixRow;
	readonly devenv: DevenvStatus;
	readonly modelServer: ModelServerProbeResult;
	readonly git: string | null;
	readonly harnesses: readonly {
		readonly id: string;
		readonly label: string;
		readonly evidence: readonly string[];
	}[];
}

/**
 * Inspect the machine. Pure over the injected probes; the only network touch
 * is the local model-server probe (loopback, bounded timeout).
 */
export async function discoverMachine(options: {
	readonly probes: MachineDiscoveryProbes;
	readonly packageRoot: string;
	readonly hoboHome?: string;
	readonly cwd?: string;
	readonly harnessCatalog?: readonly KnownAgent[];
}): Promise<MachineDiscoveryReport> {
	const { probes } = options;
	const modelHost =
		(Object.prototype.toString.call(probes.env.HOBO_CODE_LOCAL_BASE_URL) ===
			"[object String]" &&
			probes.env.HOBO_CODE_LOCAL_BASE_URL) ||
		(Object.prototype.toString.call(probes.env.OLLAMA_HOST) ===
			"[object String]" &&
			probes.env.OLLAMA_HOST) ||
		DEFAULT_OLLAMA_HOST;
	const detectProbes: DetectProbes = {
		which: probes.which,
		exists: probes.exists,
		home: probes.home,
	};
	const catalog =
		options.harnessCatalog ??
		knownAgentsFrom(
			loadHarnessCatalog({
				...(options.hoboHome !== undefined
					? { hoboHome: options.hoboHome }
					: undefined),
				...(options.cwd !== undefined ? { cwd: options.cwd } : undefined),
			}),
		);
	const harnesses = detectAgents(detectProbes, catalog)
		.filter((agent) => agent.kind === "coding-agent")
		.map((agent) => ({
			id: agent.id,
			label: agent.label,
			evidence: agent.evidence,
		}));
	return {
		schema: MACHINE_DISCOVERY_SCHEMA,
		host: {
			platform: probes.platform,
			arch: probes.arch,
			nodeVersion: probes.nodeVersion,
			cpus: probes.cpuCount,
			memoryBytes: probes.memoryBytes,
		},
		isolation: matrixForPlatform(probes.platform),
		devenv: inspectDevenv(options.packageRoot, {
			which: probes.which,
			exists: probes.exists,
			env: probes.env,
			platform: probes.platform,
		}),
		modelServer: await probes.probeModelServer(modelHost),
		git: probes.which("git"),
		harnesses,
	};
}

/**
 * Translate a discovery report into fail-closed capability observations for
 * the DEFAULT_LOCALHOST_CAPABILITIES ids. Kill switches (HOBO_REPLAY=0,
 * HOBO_CODE_SIDECARS=0) turn the default-supplied rows explicitly absent.
 */
export function observationsFromMachineReport(
	report: MachineDiscoveryReport,
	env: NodeJS.ProcessEnv = {},
): readonly StationCapabilityObservation[] {
	const nodeMajor = Number.parseInt(report.host.nodeVersion, 10);
	const observations: StationCapabilityObservation[] = [
		{
			capabilityId: "capability:runtime:node",
			present: Number.isInteger(nodeMajor) && nodeMajor >= MIN_NODE_MAJOR,
			evidence: [`node:${report.host.nodeVersion}`],
			...(Number.isInteger(nodeMajor) && nodeMajor < MIN_NODE_MAJOR
				? {
						detail: `Node ${report.host.nodeVersion} < required ${MIN_NODE_MAJOR}`,
					}
				: undefined),
		},
		{
			capabilityId: "capability:vcs:git",
			present: report.git !== null,
			evidence: report.git !== null ? [`bin:${report.git}`] : [],
		},
		{
			capabilityId: "capability:isolation-backend:worktree",
			present: report.git !== null,
			evidence: [
				...(report.git !== null ? [`bin:${report.git}`] : []),
				`matrix:${report.isolation.platform}`,
			],
		},
		{
			capabilityId: "capability:isolation-backend:rift",
			present: report.isolation.cowCapable,
			evidence: [`matrix:${report.isolation.platform}`],
			detail: report.isolation.notes,
		},
		{
			capabilityId: "capability:model-server:ollama",
			present: report.modelServer.ok,
			evidence: [
				`http:${report.modelServer.host}`,
				...(report.modelServer.ok
					? [`models:${report.modelServer.models.length}`]
					: []),
			],
			...(report.modelServer.reason !== undefined
				? { detail: report.modelServer.reason }
				: undefined),
		},
		{
			capabilityId: "capability:toolchain:devenv",
			present:
				report.devenv.active ||
				(report.devenv.devenvAvailable && report.devenv.nixAvailable),
			evidence: [
				...(report.devenv.nixAvailable ? ["bin:nix"] : []),
				...(report.devenv.devenvAvailable ? ["bin:devenv"] : []),
				...(report.devenv.active ? ["env:devenv-shell-active"] : []),
			],
		},
		{
			capabilityId: "capability:harness:coding-agent",
			present: report.harnesses.length > 0,
			evidence: report.harnesses.flatMap((h) =>
				h.evidence.map((e) => `${h.id}:${e}`),
			),
		},
	];
	if (env.HOBO_CODE_SIDECARS === "0") {
		observations.push({
			capabilityId: "capability:sidecar:dashboard",
			present: false,
			evidence: ["env:HOBO_CODE_SIDECARS=0"],
		});
	}
	if (env.HOBO_REPLAY === "0") {
		observations.push({
			capabilityId: "capability:replay:session-replay",
			present: false,
			evidence: ["env:HOBO_REPLAY=0"],
		});
	}
	return observations;
}

/** Match the report against a declared capability set (default: localhost set). */
export function matchMachineToStation(input: {
	readonly stationId: string;
	readonly report: MachineDiscoveryReport;
	readonly declared?: readonly (typeof DEFAULT_LOCALHOST_CAPABILITIES)[number][];
	readonly env?: NodeJS.ProcessEnv;
	readonly now?: () => string;
}): StationCapabilityManifest {
	return matchStationCapabilities({
		stationId: input.stationId,
		declared: input.declared ?? DEFAULT_LOCALHOST_CAPABILITIES,
		observations: observationsFromMachineReport(input.report, input.env ?? {}),
		...(input.now !== undefined ? { now: input.now } : undefined),
	});
}

/** Durable location of the last discovery report. */
export function machineDiscoveryPath(hoboHome: string): string {
	return join(hoboHome, "durable", "code", "machine-discovery.json");
}

export function persistMachineDiscoveryReport(
	hoboHome: string,
	report: MachineDiscoveryReport,
): string {
	const path = machineDiscoveryPath(hoboHome);
	mkdirSync(join(hoboHome, "durable", "code"), { recursive: true });
	writeFileSync(path, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
	return path;
}
