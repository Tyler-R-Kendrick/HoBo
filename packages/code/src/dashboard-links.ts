/**
 * Dashboard-only endpoint links. Named URL stays the public handle;
 * listen IP is shown here and nowhere else.
 */

export interface DashboardEndpointRef {
	readonly preferredUrl?: string;
	readonly namedUrl?: string;
	readonly backendUrl?: string;
	readonly resolvedAddresses?: readonly string[];
	readonly listenPort?: number;
}

export function dashboardNamedUrl(endpoint: DashboardEndpointRef): string {
	return endpoint.preferredUrl || endpoint.namedUrl || "";
}

export function isDashboardOpenableUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return false;
		}
		const port = parsed.port
			? Number(parsed.port)
			: parsed.protocol === "https:"
				? 443
				: 80;
		return Number.isInteger(port) && port > 0;
	} catch {
		return false;
	}
}

export function dashboardListenUrl(endpoint: DashboardEndpointRef): string {
	const named = dashboardNamedUrl(endpoint);
	const backend = endpoint.backendUrl ?? "";
	const address = endpoint.resolvedAddresses?.[0];
	const rewritten = rewriteOntoIp(backend || named, address);
	if (rewritten && rewritten !== named && isDashboardOpenableUrl(rewritten)) {
		return rewritten;
	}
	if (backend && isLoopbackIpUrl(backend) && isDashboardOpenableUrl(backend)) {
		return backend;
	}
	if (address && endpoint.listenPort && endpoint.listenPort > 0) {
		return `http://${address}:${endpoint.listenPort}/`;
	}
	return "";
}

function isLoopbackIpUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname;
		return host === "127.0.0.1" || host === "[::1]" || host === "::1";
	} catch {
		return false;
	}
}

function rewriteOntoIp(url: string, address: string | undefined): string {
	if (!url) return "";
	try {
		const parsed = new URL(url);
		if (!isDashboardOpenableUrl(url)) return "";
		const host = parsed.hostname;
		const alreadyIp =
			host === "127.0.0.1" || host === "[::1]" || host === "::1";
		if (alreadyIp) return parsed.href;
		parsed.hostname = address || "127.0.0.1";
		return parsed.href;
	} catch {
		return "";
	}
}
