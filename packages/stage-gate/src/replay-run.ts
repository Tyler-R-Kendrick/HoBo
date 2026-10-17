/**
 * Which run a report belongs to (ADR-0172): the report `ai-bdd run` leaves on
 * disk is read only once it is shown to be the one this run wrote. An old one
 * survives exit 2 and 4, a moved runsDir, a wrapper that swallows ai-bdd's
 * failure, and a CLI that never loaded.
 */
import { readdirSync, readFileSync } from "node:fs";
import { relative, sep } from "node:path";

import { type AcceptanceEvidence, parseAiBddRunReport } from "./acceptance.js";
import type { AcceptanceConfig } from "./acceptance-config.js";

export type ReportRead =
	| { readonly bytes: Buffer; readonly evidence: AcceptanceEvidence }
	| { readonly refused: string };

export function readReport(config: AcceptanceConfig): ReportRead {
	let bytes: Buffer;
	try {
		bytes = readFileSync(config.reportFile);
	} catch {
		return { refused: `${shown(config, config.reportFile)} is missing` };
	}
	try {
		return { bytes, evidence: parseAiBddRunReport(bytes) };
	} catch (cause) {
		return { refused: cause instanceof Error ? cause.message : String(cause) };
	}
}

/** A path as a person reads it in a message: relative to the project when inside it. */
export function shown(config: AcceptanceConfig, path: string): string {
	const rel = relative(config.project, path);
	return rel === "" || rel.startsWith("..") ? path : rel.split(sep).join("/");
}

/** The run directories that exist now; none when the runs directory does not. */
export function runIds(config: AcceptanceConfig): ReadonlySet<string> {
	try {
		return new Set(readdirSync(config.runsDir));
	} catch {
		return new Set();
	}
}

/** Allowed difference between this machine's clock and the one that stamped `startedAt`. */
const CLOCK_SKEW_MS = 5000;

/**
 * Whether the report on disk is the one the run just spawned wrote: its run
 * directory is new, and it started no earlier than the spawn (less skew). An
 * old report survives exit 2 and 4, a moved runsDir, a wrapper that swallows
 * ai-bdd's failure, and a CLI that never loaded; none of those is this run.
 */
export function staleBecause(
	config: AcceptanceConfig,
	evidence: AcceptanceEvidence,
	before: ReadonlySet<string>,
	spawnedAt: number,
): string | undefined {
	const runs = shown(config, config.runsDir);
	const stale = "it is not this run's report";
	if (before.has(evidence.runId)) {
		return `report.json names run ${evidence.runId}, which was already in ${runs} before this run started: ${stale}`;
	}
	if (!runIds(config).has(evidence.runId)) {
		return `report.json names run ${evidence.runId}, which ${runs} does not hold: ${stale}`;
	}
	if (Date.parse(evidence.startedAt) < spawnedAt - CLOCK_SKEW_MS) {
		const spawned = new Date(spawnedAt).toISOString();
		return `report.json for run ${evidence.runId} started at ${evidence.startedAt}, before this run was started at ${spawned} (5 s of clock skew allowed): ${stale}`;
	}
	return undefined;
}
