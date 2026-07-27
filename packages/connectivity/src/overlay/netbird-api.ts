/**
 * Netbird management API client (self-hosted or cloud).
 * Auth: setup key for agent enrollment; PAT / service user token for admin DNS.
 *
 * Endpoints follow Netbird Management HTTP API shapes (peers, setup-keys, dns).
 */
export interface NetbirdApiOptions {
	readonly managementUrl: string;
	/** Admin/service token for management API. */
	readonly accessToken?: string;
	/** Setup key for peer enrollment (agent join). */
	readonly setupKey?: string;
	readonly fetchImpl?: typeof fetch;
}

export interface NetbirdPeer {
	readonly id: string;
	readonly name: string;
	readonly ip: string;
	readonly connected: boolean;
	readonly dnsLabel?: string;
}

export interface NetbirdDnsNameserverGroup {
	readonly id?: string;
	readonly name: string;
	readonly description?: string;
	readonly nameservers: readonly { readonly ip: string; readonly nsType?: string }[];
	readonly domains: readonly string[];
	readonly enabled: boolean;
	readonly primary?: boolean;
}

export interface NetbirdApiClient {
	readonly managementUrl: string;
	/** Register/enroll this host via setup key (returns peer identity when supported). */
	enrollPeer(input: {
		readonly name: string;
		readonly setupKey?: string;
	}): Promise<{
		readonly enrolled: boolean;
		readonly peer?: NetbirdPeer;
		readonly notes: readonly string[];
	}>;
	listPeers(): Promise<readonly NetbirdPeer[]>;
	listDnsNameserverGroups(): Promise<readonly NetbirdDnsNameserverGroup[]>;
	upsertDnsNameserverGroup(
		group: NetbirdDnsNameserverGroup,
	): Promise<NetbirdDnsNameserverGroup>;
	createSetupKey(input: {
		readonly name: string;
		readonly type?: "reusable" | "one-off";
		readonly expiresInSeconds?: number;
	}): Promise<{ readonly key: string; readonly id: string }>;
}

export function createNetbirdApiClient(
	options: NetbirdApiOptions,
): NetbirdApiClient {
	const base = options.managementUrl.replace(/\/+$/, "");
	const fetchImpl = options.fetchImpl ?? fetch;

	async function api(
		method: string,
		path: string,
		body?: unknown,
		auth: "admin" | "setup" | "none" = "admin",
	): Promise<{ ok: boolean; status: number; body: unknown }> {
		const headers: Record<string, string> = {
			accept: "application/json",
		};
		if (auth === "admin" && options.accessToken) {
			headers.authorization = `Bearer ${options.accessToken}`;
		}
		if (auth === "setup" && (options.setupKey || body)) {
			// setup-key may ride in body; also send header when present
			if (options.setupKey) {
				headers["authorization"] = `Token ${options.setupKey}`;
			}
		}
		if (body !== undefined) {
			headers["content-type"] = "application/json";
		}
		const res = await fetchImpl(`${base}${path}`, {
			method,
			headers,
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
		const text = await res.text();
		let parsed: unknown = {};
		if (text.length > 0) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = { raw: text };
			}
		}
		return { ok: res.ok, status: res.status, body: parsed };
	}

	return {
		managementUrl: base,
		async enrollPeer(input) {
			const setupKey = input.setupKey ?? options.setupKey;
			if (!setupKey) {
				return {
					enrolled: false,
					notes: ["netbird: setupKey required for peer enrollment"],
				};
			}
			// Netbird agent typically uses gRPC; HTTP management exposes setup-keys validation.
			const res = await api(
				"POST",
				"/api/setup-keys/validate",
				{ key: setupKey, name: input.name },
				"none",
			);
			if (!res.ok) {
				// Try alternate enrollment path used by some versions.
				const alt = await api(
					"POST",
					"/api/peers",
					{ name: input.name, setupKey },
					"setup",
				);
				if (!alt.ok) {
					return {
						enrolled: false,
						notes: [
							`netbird enroll failed (${res.status}/${alt.status}); ensure management URL and setup key`,
						],
					};
				}
				const peer = normalizePeer(alt.body);
				return {
					enrolled: true,
					...(peer ? { peer } : {}),
					notes: ["enrolled via /api/peers"],
				};
			}
			const peer = normalizePeer(res.body);
			return {
				enrolled: true,
				...(peer ? { peer } : {}),
				notes: ["setup key validated"],
			};
		},
		async listPeers() {
			const res = await api("GET", "/api/peers");
			if (!res.ok) {
				throw new Error(`netbird list peers failed (${res.status})`);
			}
			const list = Array.isArray(res.body)
				? res.body
				: ((res.body as { peers?: unknown[] }).peers ?? []);
			return list
				.map((p) => normalizePeer(p))
				.filter((p): p is NetbirdPeer => p !== null);
		},
		async listDnsNameserverGroups() {
			const res = await api("GET", "/api/dns/nameservers");
			if (!res.ok) {
				// Older path
				const alt = await api("GET", "/api/dns/nameserver-groups");
				if (!alt.ok) {
					throw new Error(`netbird list dns failed (${res.status})`);
				}
				return normalizeDnsList(alt.body);
			}
			return normalizeDnsList(res.body);
		},
		async upsertDnsNameserverGroup(group) {
			const path = group.id
				? `/api/dns/nameservers/${group.id}`
				: "/api/dns/nameservers";
			const method = group.id ? "PUT" : "POST";
			const res = await api(method, path, {
				name: group.name,
				description: group.description ?? "hobo hierarchical DNS",
				nameservers: group.nameservers.map((ns) => ({
					ip: ns.ip,
					ns_type: ns.nsType ?? "udp",
					port: 53,
				})),
				domains: group.domains,
				enabled: group.enabled,
				primary: group.primary ?? false,
			});
			if (!res.ok) {
				throw new Error(`netbird upsert dns failed (${res.status})`);
			}
			const normalized = normalizeDnsGroup(res.body);
			return normalized ?? group;
		},
		async createSetupKey(input) {
			const res = await api("POST", "/api/setup-keys", {
				name: input.name,
				type: input.type ?? "reusable",
				expires_in: input.expiresInSeconds ?? 86400,
				auto_groups: [],
				usage_limit: 0,
			});
			if (!res.ok) {
				throw new Error(`netbird create setup key failed (${res.status})`);
			}
			const body = res.body as { id?: string; key?: string };
			if (!body.key || !body.id) {
				throw new Error("netbird create setup key: missing id/key in response");
			}
			return { id: body.id, key: body.key };
		},
	};
}

function normalizePeer(raw: unknown): NetbirdPeer | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const id = String(o.id ?? o.ID ?? "");
	const name = String(o.name ?? o.Name ?? "");
	const ip = String(o.ip ?? o.IP ?? o.address ?? "");
	if (!id && !name) return null;
	return {
		id: id || name,
		name: name || id,
		ip,
		connected: o.connected === true || o.Connected === true,
		...(typeof o.dns_label === "string"
			? { dnsLabel: o.dns_label }
			: typeof o.dnsLabel === "string"
				? { dnsLabel: o.dnsLabel }
				: {}),
	};
}

function normalizeDnsList(raw: unknown): NetbirdDnsNameserverGroup[] {
	const list = Array.isArray(raw)
		? raw
		: ((raw as { groups?: unknown[] })?.groups ?? []);
	return list
		.map((g) => normalizeDnsGroup(g))
		.filter((g): g is NetbirdDnsNameserverGroup => g !== null);
}

function normalizeDnsGroup(raw: unknown): NetbirdDnsNameserverGroup | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const nameserversRaw = (o.nameservers ?? o.NameServers ?? []) as unknown[];
	const domains = (o.domains ?? o.Domains ?? []) as unknown[];
	return {
		...(typeof o.id === "string" ? { id: o.id } : {}),
		name: String(o.name ?? o.Name ?? "hobo"),
		nameservers: nameserversRaw.map((ns) => {
			const n = ns as Record<string, unknown>;
			return {
				ip: String(n.ip ?? n.IP ?? ""),
				...(typeof n.ns_type === "string" ? { nsType: n.ns_type } : {}),
			};
		}),
		domains: domains.map(String),
		enabled: o.enabled !== false,
		primary: o.primary === true,
	};
}
