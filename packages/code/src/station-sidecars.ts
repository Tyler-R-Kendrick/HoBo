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

	const dashboard = await startLocalDashboard({
		hoboHome: options.hoboHome,
		env,
		port: options.dashboardPort ?? 8787,
		otlpHttpPort: options.otlpHttpPort ?? 0,
		otlpGrpcPort: options.otlpGrpcPort ?? 0,
	});
	let evidence: Awaited<ReturnType<typeof startSessionControlServer>>;
	try {
		evidence = await startSessionControlServer({
			hoboHome: options.hoboHome,
			projectRoot: options.projectRoot ?? process.cwd(),
			port: options.evidencePort ?? 8788,
		});
	} catch {
		evidence = await startSessionControlServer({
			hoboHome: options.hoboHome,
			projectRoot: options.projectRoot ?? process.cwd(),
			port: 0,
		});
	}

	const snapshot: StationSidecarSnapshot = {
		schema: STATION_SIDECARS_SCHEMA,
		stationId: view.stationId,
		environment: view.environment,
		dashboardUrl: dashboard.url,
		evidenceUrl: evidence.url,
		evidenceReportUrl: evidence.reportUrl,
		evidenceControlsUrl: evidence.controlsUrlTemplate,
		otlpHttpUrl: dashboard.otlpHttpUrl,
		startedAt: new Date().toISOString(),
	};
	writeSnapshot(options.hoboHome, snapshot);

	return {
		...snapshot,
		async close() {
			const path = stationSidecarsPath(options.hoboHome, view.stationId);
			await Promise.allSettled([dashboard.close(), evidence.close()]);
			if (existsSync(path)) {
				try {
					const current = readStationSidecars(options.hoboHome, view.stationId);
					if (current?.dashboardUrl === snapshot.dashboardUrl) {
						unlinkSync(path);
					}
				} catch {
					// discovery is best-effort
				}
			}
		},
	};
}

export function formatSidecarStrap(
	sidecars: StationSidecarSnapshot,
): readonly string[] {
	return [
		`dash:${new URL(sidecars.dashboardUrl).host}`,
		`evidence:${new URL(sidecars.evidenceUrl).host}`,
	];
}
