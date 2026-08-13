/**
 * Station occupancy sidecars for a coding session.
 * Dashboard + Evidence SPA start with the session and die with it.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { startSessionControlServer } from "./session-control-server.js";
import { startLocalDashboard } from "./session-dashboard.js";
import {
	type AuthedStationView,
	describeAuthedStationSession,
} from "./station-session.js";

// public-contract: Station sidecar discovery snapshot
export const STATION_SIDECARS_SCHEMA = "hobo.code.station-sidecars/v1" as const;

export interface StationSidecarSnapshot {
	readonly schema: typeof STATION_SIDECARS_SCHEMA;
	readonly stationId: string;
	readonly environment: string;
	readonly dashboardUrl: string;
	readonly evidenceUrl: string;
	readonly evidenceReportUrl: string;
	readonly evidenceControlsUrl: string;
	readonly otlpHttpUrl: string;
	readonly startedAt: string;
}

interface RunningSidecars {
	readonly sidecars: StationSidecars;
	refs: number;
}

const running = new Map<string, RunningSidecars>();

function sidecarKey(hoboHome: string, stationId: string): string {
	return `${hoboHome}::${stationId}`;
}

export interface StationSidecars extends StationSidecarSnapshot {
	readonly close: () => Promise<void>;
}

export interface StartStationSidecarsOptions {
	readonly hoboHome: string;
	readonly projectRoot?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly dashboardPort?: number;
	readonly evidencePort?: number;
	readonly otlpHttpPort?: number;
	readonly otlpGrpcPort?: number;
	readonly ensureLocalLogin?: boolean;
}

function safeLabel(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function stationSidecarsPath(
	hoboHome: string,
	stationId: string,
): string {
	return join(hoboHome, "stations", safeLabel(stationId), "sidecars.json");
}

export function sidecarsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	const raw = env.HOBO_CODE_SIDECARS?.trim();
	if (raw === "0" || raw === "false" || raw === "off") return false;
	return true;
}

export function readStationSidecars(
	hoboHome: string,
	stationId: string,
): StationSidecarSnapshot | null {
	const path = stationSidecarsPath(hoboHome, stationId);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(
			readFileSync(path, "utf8"),
		) as Partial<StationSidecarSnapshot>;
		if (parsed.schema !== STATION_SIDECARS_SCHEMA) return null;
		if (typeof parsed.dashboardUrl !== "string") return null;
		if (typeof parsed.evidenceUrl !== "string") return null;
		return parsed as StationSidecarSnapshot;
	} catch {
		return null;
	}
}

function writeSnapshot(
	hoboHome: string,
	snapshot: StationSidecarSnapshot,
): void {
	const path = stationSidecarsPath(hoboHome, snapshot.stationId);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, {
		mode: 0o600,
	});
	mkdirSync(join(hoboHome, "runtime", "code"), { recursive: true });
	writeFileSync(
		join(hoboHome, "runtime", "code", "evidence-controls-url"),
		`${snapshot.evidenceControlsUrl}\n`,
		{ mode: 0o600 },
	);
}

function occupancy(
	hoboHome: string,
	env: NodeJS.ProcessEnv,
	ensureLocalLogin: boolean,
): AuthedStationView {
	return describeAuthedStationSession({
		hoboHome,
		env,
		ensureLocalLogin,
	});
}

async function startEvidenceServer(
	options: StartStationSidecarsOptions,
): Promise<Awaited<ReturnType<typeof startSessionControlServer>>> {
	const projectRoot = options.projectRoot ?? process.cwd();
	try {
		return await startSessionControlServer({
			hoboHome: options.hoboHome,
			projectRoot,
			port: options.evidencePort ?? 8788,
		});
	} catch {
		return startSessionControlServer({
			hoboHome: options.hoboHome,
			projectRoot,
			port: 0,
		});
	}
}

export async function startStationSidecars(
	options: StartStationSidecarsOptions,
): Promise<StationSidecars> {
	const env = options.env ?? process.env;
	const view = occupancy(
		options.hoboHome,
		env,
		options.ensureLocalLogin !== false,
	);
	if (!view.loggedIn || view.stationId.length === 0) {
		throw new Error(
			view.message || "Not logged in — run: hobo-code auth login",
		);
	}
	const key = sidecarKey(options.hoboHome, view.stationId);
	const existing = running.get(key);
	if (existing) {
		existing.refs += 1;
		return existing.sidecars;
	}

	// Evidence is required for the whole occupancy. Dashboard is best-effort.
	const evidence = await startEvidenceServer(options);
	let dashboardUrl = "";
	let otlpHttpUrl = "";
	let closeDashboard: () => Promise<void> = async () => {};
	try {
		const dashboard = await startLocalDashboard({
			hoboHome: options.hoboHome,
			env,
			port: options.dashboardPort ?? 8787,
			otlpHttpPort: options.otlpHttpPort ?? 0,
			otlpGrpcPort: options.otlpGrpcPort ?? 0,
		});
		dashboardUrl = dashboard.url;
		otlpHttpUrl = dashboard.otlpHttpUrl;
		closeDashboard = () => dashboard.close();
	} catch {
		// Evidence still runs.
	}

	const snapshot: StationSidecarSnapshot = {
		schema: STATION_SIDECARS_SCHEMA,
		stationId: view.stationId,
		environment: view.environment,
		dashboardUrl,
		evidenceUrl: evidence.url,
		evidenceReportUrl: evidence.reportUrl,
		evidenceControlsUrl: evidence.controlsUrlTemplate,
		otlpHttpUrl,
		startedAt: new Date().toISOString(),
	};
	writeSnapshot(options.hoboHome, snapshot);

	const sidecars: StationSidecars = {
		...snapshot,
		async close() {
			const held = running.get(key);
			if (!held || held.sidecars !== sidecars) return;
			held.refs -= 1;
			if (held.refs > 0) return;
			running.delete(key);
			const path = stationSidecarsPath(options.hoboHome, view.stationId);
			await Promise.allSettled([closeDashboard(), evidence.close()]);
			if (existsSync(path)) {
				try {
					const current = readStationSidecars(options.hoboHome, view.stationId);
					if (current?.evidenceUrl === snapshot.evidenceUrl) {
						unlinkSync(path);
					}
				} catch {
					// discovery is best-effort
				}
			}
		},
	};
	running.set(key, { sidecars, refs: 1 });
	return sidecars;
}

/** Attach to the Station Evidence sidecar. Never owns its lifetime. */
export async function attachStationSidecars(
	options: StartStationSidecarsOptions,
): Promise<StationSidecarSnapshot> {
	const env = options.env ?? process.env;
	const view = occupancy(
		options.hoboHome,
		env,
		options.ensureLocalLogin !== false,
	);
	if (!view.loggedIn || view.stationId.length === 0) {
		throw new Error(
			view.message || "Not logged in — run: hobo-code auth login",
		);
	}
	const key = sidecarKey(options.hoboHome, view.stationId);
	const live = running.get(key)?.sidecars;
	if (live) return live;
	// Start if this process has no occupancy yet. Caller must not close —
	// Evidence belongs to the Station session, not /dev.
	return startStationSidecars(options);
}

/** Tear down occupancy sidecars regardless of attach count. */
export async function stopStationSidecars(
	hoboHome: string,
	stationId: string,
): Promise<void> {
	const key = sidecarKey(hoboHome, stationId);
	const held = running.get(key);
	if (!held) return;
	held.refs = 1;
	await held.sidecars.close();
}

export function formatSidecarStrap(
	sidecars: StationSidecarSnapshot,
): readonly string[] {
	const chips: string[] = [];
	if (sidecars.dashboardUrl) {
		chips.push(`dash:${new URL(sidecars.dashboardUrl).host}`);
	}
	if (sidecars.evidenceUrl) {
		chips.push(`evidence:${new URL(sidecars.evidenceUrl).host}`);
	}
	return chips;
}
