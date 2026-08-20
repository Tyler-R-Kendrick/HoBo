/**
 * Live occupancy facts: process liveness + loopback listen probes.
 * Snapshot / seed rows must not look serving without these checks.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loopbackFetchUrl } from "./occupancy-endpoints.js";

export interface OccupancyRunRecord {
	readonly projectDir?: string;
	readonly bindleName?: string;
	readonly pid?: number;
	readonly sessionId?: string;
}

function sessionRunPath(
	hoboHome: string,
	stationId: string,
	environment: string,
): string {
	return join(
		hoboHome,
		"durable",
		"code",
		"sessions",
		stationId.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		environment.replace(/[^a-zA-Z0-9._-]+/g, "_"),
		"run.json",
	);
}

function readRunRecord(path: string): OccupancyRunRecord | undefined {
	if (!existsSync(path)) return undefined;
	try {
		// SAFETY: parsed or fixture value is the named domain type after this assertion.
		return JSON.parse(readFileSync(path, "utf8")) as OccupancyRunRecord;
	} catch {
		return undefined;
	}
}

/** True when the recorded /dev pid is still alive. */
export function isOccupancyRunProcessLive(
	hoboHome: string,
	stationId: string,
	environment: string,
): boolean {
	const record = readRunRecord(
		sessionRunPath(hoboHome, stationId, environment),
	);
	if (record?.pid === undefined) return false;
	try {
		process.kill(record.pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function readOccupancyRunRecord(
	hoboHome: string,
	stationId: string,
	environment: string,
): OccupancyRunRecord | undefined {
	return readRunRecord(sessionRunPath(hoboHome, stationId, environment));
}

function listenPortOf(url: string): number | undefined {
	try {
		const parsed = new URL(loopbackFetchUrl(url));
		const host = parsed.hostname;
		const loopback =
			host === "127.0.0.1" ||
			host === "localhost" ||
			host === "[::1]" ||
			host === "::1" ||
			host.endsWith(".localhost");
		if (!loopback) return undefined;
		const port = Number(parsed.port);
		if (Number.isInteger(port) && port > 0) return port;
		if (parsed.protocol === "https:") return 443;
		if (parsed.protocol === "http:") return 80;
	} catch {
		return undefined;
	}
	return undefined;
}

/**
 * Sync TCP connect probe for a loopback URL. Mesh / remote URLs are never
 * treated as listening from a snapshot alone.
 */
export function isLoopbackUrlListening(url: string, timeoutMs = 120): boolean {
	return listeningByUrl([url], timeoutMs).get(url) === true;
}

/**
 * Wall clock allowed for the probe child *on top of* the connect timeout,
 * covering Node interpreter startup. Measured at 30–40 ms idle and 65–90 ms
 * under eight competing CPU-bound processes on a four-core box; two seconds is
 * far above the worst observed, deliberately, because overshooting costs a
 * slower probe and undershooting costs a wrong answer.
 */
const PROBE_STARTUP_BUDGET_MS = 2_000;

/** Batched listen map for many URLs in one assemble pass. */
export function listeningByUrl(
	urls: readonly string[],
	timeoutMs = 120,
): ReadonlyMap<string, boolean> {
	const out = new Map<string, boolean>();
	const ports = new Map<number, string[]>();
	for (const url of urls) {
		const port = listenPortOf(url);
		if (port === undefined) {
			out.set(url, false);
			continue;
		}
		const list = ports.get(port) ?? [];
		list.push(url);
		ports.set(port, list);
	}
	if (ports.size === 0) return out;

	const portList = [...ports.keys()];
	const script = `
const net=require("net");
const ports=${JSON.stringify(portList)};
const timeout=${timeoutMs};
let left=ports.length;
const open={};
if(left===0){process.stdout.write("{}");process.exit(0)}
for(const port of ports){
  const s=net.connect(port,"127.0.0.1",()=>{open[port]=true;s.destroy();done()});
  s.on("error",()=>{open[port]=false;done()});
  setTimeout(()=>{if(open[port]===undefined){open[port]=false;s.destroy();done()}},timeout);
}
function done(){if(--left===0)process.stdout.write(JSON.stringify(open));}
`;
	// `timeoutMs` is a judgement about the *network*: how long a loopback TCP
	// connect may take before the port counts as closed. The child's budget is a
	// different quantity — it must also cover starting a Node interpreter, and
	// that cost is a function of how loaded the machine is, not of the network.
	//
	// Charging both to `timeoutMs + 250` conflates them, and the failure is
	// silent and wrong in the dangerous direction: when the child is killed,
	// `result.status !== 0`, `open` stays `{}`, and every URL is reported *not
	// listening*. A running service is shown as stale. Measured against a server
	// that was demonstrably listening: 0/40 false negatives idle, **5/40 under
	// CPU load**.
	//
	// So the startup allowance is separate and generous. It is not a network
	// timeout and must never be tuned as one — a slow box should make this
	// probe slower, never wrong.
	const result = spawnSync(process.execPath, ["-e", script], {
		timeout: timeoutMs + PROBE_STARTUP_BUDGET_MS,
		encoding: "utf8",
	});
	let open: Record<string, boolean> = {};
	if (result.status === 0 && result.stdout) {
		try {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			open = JSON.parse(result.stdout) as Record<string, boolean>;
		} catch {
			open = {};
		}
	}
	for (const [port, urlsForPort] of ports) {
		const live = open[String(port)] === true;
		for (const url of urlsForPort) out.set(url, live);
	}
	return out;
}
