/**
 * Occupancy sidecar public URLs: named endpoints first (ADR-0130).
 * Listeners still bind loopback; *.hobo.localhost is what we print and record.
 */
import { getNamedEndpoint, LOCAL_DEFAULT_TENANT_ID } from "@hobo/core";

// public-contract: occupancy sidecar app label on named endpoints
export const OCCUPANCY_NAMED_APP = "code" as const;

export type OccupancyNamedResource = "evidence" | "dashboard" | "otlp";

export interface OccupancyNameScope {
	readonly tenant?: string;
	readonly environment?: string;
	readonly project?: string;
	readonly branch?: string;
	/** Bindle/app label. Occupancy sidecars default to `code`. */
	readonly app?: string;
}

/** Copy path/query from `source` onto another origin. */
export function retargetUrl(source: string, onto: string): string {
	const from = new URL(source);
	const dest = new URL(onto);
	dest.pathname = from.pathname;
	dest.search = from.search;
	dest.hash = from.hash;
	return dest.href;
}

export function isLoopbackHttpUrl(value: string): boolean {
	try {
		const host = new URL(value).hostname;
		return (
			host === "127.0.0.1" ||
			host === "localhost" ||
			host === "[::1]" ||
			host === "::1"
		);
	} catch {
		return false;
	}
}

function localEnvSegment(environment: string | undefined): string {
	const env = environment?.trim() ?? "";
	if (env.length === 0 || env === "local-dev" || env === "unknown") {
		return "local";
	}
	return env;
}

export function occupancyNamedOrigin(
	resource: string,
	port: number,
	scope: OccupancyNameScope = {},
): string {
	const tenant = scope.tenant?.trim() ?? "";
	const includeTenant =
		tenant.length > 0 && tenant !== String(LOCAL_DEFAULT_TENANT_ID);
	const app = scope.app?.trim() || OCCUPANCY_NAMED_APP;
	return getNamedEndpoint({
		resource,
		app,
		mode: "local",
		scheme: "http",
		port,
		env: localEnvSegment(scope.environment),
		...(includeTenant ? { tenant } : {}),
		...(scope.project ? { project: scope.project } : {}),
		...(scope.branch ? { branch: scope.branch } : {}),
	});
}

/** Named origin first. Loopback listen URLs are rewritten onto the occupancy name. */
export function preferNamedEndpoint(
	url: string,
	resource: string,
	scope: OccupancyNameScope = {},
): string {
	if (!isLoopbackHttpUrl(url)) return url;
	const port = Number(new URL(url).port);
	if (!Number.isInteger(port) || port <= 0) return url;
	return retargetUrl(url, occupancyNamedOrigin(resource, port, scope));
}

export interface OccupancySidecarUrls {
	readonly dashboardUrl?: string;
	readonly evidenceUrl?: string;
	readonly evidenceReportUrl?: string;
	readonly evidenceControlsUrl?: string;
	readonly otlpHttpUrl?: string;
}

export interface OccupancySidecarEndpoint {
	readonly resourceName: "dashboard" | "evidence" | "controls" | "otlp";
	readonly kind: "http" | "otlp";
	readonly backendUrl: string;
	readonly namedUrl: string;
	readonly hostname?: string;
	readonly mode: "local";
	readonly preferredUrl: string;
	readonly fidelity: "simulated";
}

/** Named occupancy sidecar URLs that are actually listening. */
export function occupancySidecarEndpoints(
	urls: OccupancySidecarUrls,
): OccupancySidecarEndpoint[] {
	const rows: OccupancySidecarEndpoint[] = [];
	const add = (
		resourceName: OccupancySidecarEndpoint["resourceName"],
		url: string | undefined,
		namedAs: OccupancyNamedResource,
		kind: OccupancySidecarEndpoint["kind"],
	): void => {
		if (!url) return;
		const named = preferNamedEndpoint(url, namedAs);
		const hostname = new URL(named).hostname;
		rows.push({
			resourceName,
			kind,
			backendUrl: loopbackFetchUrl(url),
			namedUrl: named,
			...(hostname ? { hostname } : {}),
			mode: "local",
			preferredUrl: named,
			fidelity: "simulated",
		});
	};
	add("dashboard", urls.dashboardUrl, "dashboard", "http");
	add(
		"evidence",
		urls.evidenceReportUrl ?? urls.evidenceUrl,
		"evidence",
		"http",
	);
	add("controls", urls.evidenceControlsUrl, "evidence", "http");
	add("otlp", urls.otlpHttpUrl, "otlp", "otlp");
	return rows;
}

/** Node fetch target for a public occupancy URL (named or loopback). */
export function loopbackFetchUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (
			parsed.hostname === "127.0.0.1" ||
			parsed.hostname === "localhost" ||
			parsed.hostname.endsWith(".localhost")
		) {
			parsed.hostname = "127.0.0.1";
			return parsed.href;
		}
	} catch {
		// leave unparsed
	}
	return url;
}
