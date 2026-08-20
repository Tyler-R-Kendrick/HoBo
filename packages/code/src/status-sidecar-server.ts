/**
 * Station status-page sidecar (ADR-0077). Occupancy-hosted, default-on:
 * every Station gets a githubstatus-style page of its own capability
 * surfaces for free, fed by live probes of the sibling sidecar fleet.
 * Rendering, projection, and statuspage-v2 JSON come from @hobo/status-page.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
	type ComponentSpec,
	createStatusPageProjection,
	renderStatusPageHtml,
	STATUS_SIGNAL_EVENTS,
	type StatusPageModel,
	stationCapabilityComponents,
	stationStatusScope,
	statusEnvelope,
	toStatusPageModel,
	toStatuspageStatus,
	toStatuspageSummary,
} from "@hobo/status-page";

import {
	loopbackFetchUrl,
	occupancyNamedOrigin,
} from "./occupancy-endpoints.js";
import { readStationSidecars } from "./station-sidecars.js";

// public-contract: occupancy name of the station status sidecar
export const STATUS_SIDECAR_NAME = "status" as const;
// public-contract: status sidecar is occupancy-hosted, not a Bindle kind
export const STATUS_SIDECAR_HOSTING = "station" as const;

/** Sibling probe timeout — sidecars answer on loopback in single-digit ms. */
const PROBE_TIMEOUT_MS = 400;

export type StatusProbe = (url: string) => Promise<boolean>;

export interface StatusSidecarServer {
	readonly url: string;
	readonly port: number;
	readonly close: () => Promise<void>;
}

export interface StartStatusSidecarOptions {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly environment: string;
	readonly port?: number;
	/** Injectable sibling probe (tests); defaults to a loopback fetch. */
	readonly probe?: StatusProbe;
	/** Injectable clock (tests); defaults to wall time. */
	readonly now?: () => Date;
}

async function defaultProbe(url: string): Promise<boolean> {
	try {
		const response = await fetch(loopbackFetchUrl(url), {
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		return response.ok;
	} catch {
		return false;
	}
}

interface SidecarTarget {
	readonly slug: string;
	readonly url: string;
}

function sidecarTargets(
	hoboHome: string,
	stationId: string,
): readonly SidecarTarget[] {
	const snapshot = readStationSidecars(hoboHome, stationId);
	if (!snapshot) return [];
	const targets: SidecarTarget[] = [];
	const add = (slug: string, url: string | undefined): void => {
		if (url) targets.push({ slug, url });
	};
	add("dashboard", snapshot.dashboardUrl);
	add("evidence", snapshot.evidenceUrl);
	add("otlp", snapshot.otlpHttpUrl);
	add("evals", snapshot.evalsUrl);
	add("rollout", snapshot.rolloutUrl);
	add("experiment", snapshot.experimentUrl);
	add("kms", snapshot.kmsUrl);
	add("history", snapshot.historyUrl);
	return targets;
}

/**
 * Probe the sibling fleet and evaluate the station status model. Probes are
 * folded through the shared status-page projection as synthetic
 * `slo.Measured` signals so station pages and event-sourced pages share one
 * tested code path.
 */
export async function evaluateStationStatus(options: {
	readonly hoboHome: string;
	readonly stationId: string;
	readonly probe?: StatusProbe;
	readonly now?: () => Date;
}): Promise<StatusPageModel> {
	const probe = options.probe ?? defaultProbe;
	const now = (options.now ?? (() => new Date()))().toISOString();
	const targets = sidecarTargets(options.hoboHome, options.stationId);
	const results = await Promise.all(
		targets.map(async (target) => ({
			target,
			up: await probe(target.url),
		})),
	);
	const declared: ComponentSpec[] = [
		...stationCapabilityComponents(
			targets.map((target) => ({ kind: "sidecar", slug: target.slug })),
		),
	];
	const projection = createStatusPageProjection();
	const scopeKey = `station:${options.stationId}`;
	const events = results.map((result, index) =>
		statusEnvelope(
			STATUS_SIGNAL_EVENTS.SloMeasured,
			{
				scopeKey,
				componentId: `sidecar-${result.target.slug}`,
				componentLabel: `${result.target.slug} (sidecar)`,
				sloName: "sidecar-liveness",
				attainment: result.up ? 1 : 0,
				target: 0.999,
				measuredAt: now,
			},
			{
				streamId: scopeKey,
				seq: index + 1,
				ts: now,
			},
		),
	);
	const row = projection.fold(events).rows[scopeKey];
	return toStatusPageModel(row, {
		scope: stationStatusScope(options.stationId),
		evaluatedAt: now,
		declaredComponents: declared,
	});
}

export async function startStatusSidecar(
	options: StartStatusSidecarOptions,
): Promise<StatusSidecarServer> {
	const server = createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			const path = url.pathname.replace(/\/+$/u, "") || "/";
			try {
				if (path === "/health") {
					writeJson(response, 200, {
						name: STATUS_SIDECAR_NAME,
						hosting: STATUS_SIDECAR_HOSTING,
						live: true,
						stationId: options.stationId,
					});
					return;
				}
				const model = await evaluateStationStatus(options);
				if (path === "/") {
					const html = renderStatusPageHtml(model);
					response.writeHead(200, {
						"content-type": "text/html; charset=utf-8",
						"cache-control": "no-store",
					});
					response.end(html);
					return;
				}
				if (path === "/api/v2/summary.json") {
					writeJson(response, 200, toStatuspageSummary(model));
					return;
				}
				if (path === "/api/v2/status.json") {
					writeJson(response, 200, toStatuspageStatus(model));
					return;
				}
				writeJson(response, 404, { error: "not found" });
			} catch (error) {
				writeJson(response, 500, {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		})();
	});
	const port = await listen(server, options.port ?? 0);
	return {
		url: occupancyNamedOrigin("status", port),
		port,
		close: () => closeServer(server),
	};
}

function writeJson<T>(
	response: import("node:http").ServerResponse,
	status: number,
	body: T,
): void {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	response.end(JSON.stringify(body));
}

function listen(server: Server, port: number): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			// SAFETY: parsed or fixture value is the named domain type after this assertion.
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}
