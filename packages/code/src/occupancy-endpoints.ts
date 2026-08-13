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
	resource: OccupancyNamedResource,
	port: number,
	scope: OccupancyNameScope = {},
): string {
	const tenant = scope.tenant?.trim() ?? "";
	const includeTenant =
		tenant.length > 0 && tenant !== String(LOCAL_DEFAULT_TENANT_ID);
	return getNamedEndpoint({
		resource,
		app: OCCUPANCY_NAMED_APP,
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
	resource: OccupancyNamedResource,
	scope: OccupancyNameScope = {},
): string {
	if (!isLoopbackHttpUrl(url)) return url;
	const port = Number(new URL(url).port);
	if (!Number.isInteger(port) || port <= 0) return url;
	return retargetUrl(url, occupancyNamedOrigin(resource, port, scope));
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
