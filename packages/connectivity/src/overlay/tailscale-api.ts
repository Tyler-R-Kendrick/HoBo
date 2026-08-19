/**
 * Tailscale control-plane API helpers (MagicDNS split DNS, device status).
 * Auth: TS_API_KEY or options.apiKey (OAuth client credentials also accepted
 * via access token). Never logs the key.
 *
 * Docs: https://tailscale.com/api
 */
export interface TailscaleApiOptions {
	readonly apiKey: string;
	readonly tailnet?: string;
	readonly apiBase?: string;
	readonly fetchImpl?: typeof fetch;
}

export interface TailscaleSplitDnsMap {
	/** domain suffix → nameserver IPs */
	readonly [domain: string]: readonly string[];
}

export interface TailscaleDnsPreferences {
	readonly magicDNS?: boolean;
	readonly overrideLocalDNS?: boolean;
}

export interface TailscaleApiClient {
	readonly tailnet: string;
	getSplitDns(): Promise<TailscaleSplitDnsMap>;
	/**
	 * Merge domains into the tailnet split DNS map (preserves other domains).
	 */
	putSplitDns(
		domains: readonly string[],
		nameservers: readonly string[],
	): Promise<TailscaleSplitDnsMap>;
	getDnsPreferences(): Promise<TailscaleDnsPreferences>;
	setDnsPreferences(
		prefs: TailscaleDnsPreferences,
	): Promise<TailscaleDnsPreferences>;
	listDevices(): Promise<
		readonly {
			readonly id: string;
			readonly name: string;
			readonly addresses: readonly string[];
			readonly tags?: readonly string[];
		}[]
	>;
}

export function createTailscaleApiClient(
	options: TailscaleApiOptions,
): TailscaleApiClient {
	const base = (options.apiBase ?? "https://api.tailscale.com/api/v2").replace(
		/\/$/,
		"",
	);
	const tailnet = options.tailnet ?? "-";
	const fetchImpl = options.fetchImpl ?? fetch;

	async function api(
		method: string,
		path: string,
		body?: unknown,
	): Promise<unknown> {
		const res = await fetchImpl(`${base}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				accept: "application/json",
				...(body !== undefined ? { "content-type": "application/json" } : {}),
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(
				`tailscale api ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`,
			);
		}
		if (res.status === 204) return {};
		return res.json();
	}

	return {
		tailnet,
		async getSplitDns() {
			const data = (await api(
				"GET",
				`/tailnet/${encodeURIComponent(tailnet)}/dns/split-dns`,
			)) as Record<string, string[]>;
			return normalizeSplit(data);
		},
		async putSplitDns(domains, nameservers) {
			const existing = await this.getSplitDns();
			const next: Record<string, string[]> = { ...asMutable(existing) };
			for (const domain of domains) {
				const key = domain.startsWith(".") ? domain : domain;
				next[key] = [...nameservers];
			}
			const data = (await api(
				"PATCH",
				`/tailnet/${encodeURIComponent(tailnet)}/dns/split-dns`,
				next,
			)) as Record<string, string[]>;
			// Some API versions return the map; if empty, re-GET.
			if (data && Object.keys(data).length > 0) {
				return normalizeSplit(data);
			}
			// Fallback PUT full map
			await api(
				"PUT",
				`/tailnet/${encodeURIComponent(tailnet)}/dns/split-dns`,
				next,
			);
			return this.getSplitDns();
		},
		async getDnsPreferences() {
			const data = (await api(
				"GET",
				`/tailnet/${encodeURIComponent(tailnet)}/dns/preferences`,
			)) as TailscaleDnsPreferences;
			return data ?? {};
		},
		async setDnsPreferences(prefs) {
			const data = (await api(
				"POST",
				`/tailnet/${encodeURIComponent(tailnet)}/dns/preferences`,
				prefs,
			)) as TailscaleDnsPreferences;
			return data ?? prefs;
		},
		async listDevices() {
			const data = (await api(
				"GET",
				`/tailnet/${encodeURIComponent(tailnet)}/devices`,
			)) as {
				devices?: readonly {
					id?: string;
					name?: string;
					hostname?: string;
					addresses?: string[];
					tags?: string[];
				}[];
			};
			return (data.devices ?? []).map((d) => ({
				id: d.id ?? "",
				name: d.name ?? d.hostname ?? "",
				addresses: d.addresses ?? [],
				...(d.tags !== undefined ? { tags: d.tags } : {}),
			}));
		},
	};
}

function normalizeSplit(
	data: Record<string, string[] | readonly string[]>,
): TailscaleSplitDnsMap {
	const out: Record<string, readonly string[]> = {};
	for (const [k, v] of Object.entries(data ?? {})) {
		if (Array.isArray(v)) out[k] = [...v];
	}
	return out;
}

function asMutable(map: TailscaleSplitDnsMap): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(map)) {
		out[k] = [...v];
	}
	return out;
}
