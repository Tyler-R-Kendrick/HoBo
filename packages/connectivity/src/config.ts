import type {
	DnsManagedBy,
	DnsProviderKind,
	OverlayProviderKind,
	PublicDnsConfig,
} from "@hobo/core";

export interface ConnectivityConfig {
	readonly overlay: {
		readonly provider: OverlayProviderKind;
		readonly magicDnsDomains: readonly string[];
		readonly enableFunnel: boolean;
	};
	readonly dns: {
		readonly public: PublicDnsConfig;
	};
	readonly naming: {
		readonly multiTenant: boolean;
		readonly defaultEnv: string;
		readonly localTld: string;
		readonly overlayTld: string;
	};
	readonly metering: {
		readonly enabled: boolean;
		readonly sinks: readonly ("memory" | "log" | "billing")[];
	};
	readonly tenancy: {
		readonly defaultIsolationMode:
			| "soft"
			| "hard-overlay"
			| "hard-control-plane";
	};
	readonly policy: {
		readonly engine: "tag-acl" | "opa";
		readonly opaUrl?: string;
	};
}

export const DEFAULT_CONNECTIVITY_CONFIG: ConnectivityConfig = {
	overlay: {
		provider: "tailscale",
		magicDnsDomains: ["hobo.test", "hobo.internal"],
		enableFunnel: true,
	},
	dns: {
		public: {
			managedBy: "none",
			provider: "none",
		},
	},
	naming: {
		multiTenant: false,
		defaultEnv: "prod",
		localTld: "localhost",
		overlayTld: "test",
	},
	metering: {
		enabled: true,
		sinks: ["memory", "billing"],
	},
	tenancy: {
		defaultIsolationMode: "soft",
	},
	policy: {
		engine: "tag-acl",
	},
};

export function parseConnectivityConfig(raw: unknown): ConnectivityConfig {
	if (raw === null || raw === undefined || typeof raw !== "object") {
		return DEFAULT_CONNECTIVITY_CONFIG;
	}
	const obj = raw as Record<string, unknown>;
	const overlay = (obj.overlay ?? {}) as Record<string, unknown>;
	const dns = (obj.dns ?? {}) as Record<string, unknown>;
	const dnsPublic = (dns.public ?? {}) as Record<string, unknown>;
	const naming = (obj.naming ?? {}) as Record<string, unknown>;
	const metering = (obj.metering ?? {}) as Record<string, unknown>;
	const tenancy = (obj.tenancy ?? {}) as Record<string, unknown>;
	const policy = (obj.policy ?? {}) as Record<string, unknown>;

	const managedBy = parseManagedBy(dnsPublic.managedBy);
	const provider = parseProvider(dnsPublic.provider);
	const overlayProvider = parseOverlay(overlay.provider);

	return {
		overlay: {
			provider: overlayProvider,
			magicDnsDomains: Array.isArray(overlay.magicDnsDomains)
				? (overlay.magicDnsDomains as unknown[]).filter(
						(s): s is string => typeof s === "string",
					)
				: DEFAULT_CONNECTIVITY_CONFIG.overlay.magicDnsDomains,
			enableFunnel: overlay.enableFunnel !== false,
		},
		dns: {
			public: {
				managedBy,
				provider,
				...(typeof dnsPublic.zone === "string" ? { zone: dnsPublic.zone } : {}),
				...(dnsPublic.credentials &&
				typeof dnsPublic.credentials === "object" &&
				dnsPublic.credentials !== null
					? {
							credentials: Object.fromEntries(
								Object.entries(
									dnsPublic.credentials as Record<string, unknown>,
								).filter(
									(entry): entry is [string, string] =>
										typeof entry[1] === "string",
								),
							),
						}
					: {}),
				...(Array.isArray(dnsPublic.allowedGatewaySuffixes)
					? {
							allowedGatewaySuffixes: (
								dnsPublic.allowedGatewaySuffixes as unknown[]
							).filter((s): s is string => typeof s === "string"),
						}
					: {}),
			},
		},
		naming: {
			multiTenant: naming.multiTenant === true,
			defaultEnv:
				typeof naming.defaultEnv === "string" ? naming.defaultEnv : "prod",
			localTld:
				typeof naming.localTld === "string" ? naming.localTld : "localhost",
			overlayTld:
				typeof naming.overlayTld === "string" ? naming.overlayTld : "test",
		},
		metering: {
			enabled: metering.enabled !== false,
			sinks: Array.isArray(metering.sinks)
				? (metering.sinks as unknown[]).filter(
						(s): s is "memory" | "log" | "billing" =>
							s === "memory" || s === "log" || s === "billing",
					)
				: ["memory", "billing"],
		},
		tenancy: {
			defaultIsolationMode:
				tenancy.defaultIsolationMode === "hard-overlay" ||
				tenancy.defaultIsolationMode === "hard-control-plane"
					? tenancy.defaultIsolationMode
					: "soft",
		},
		policy: {
			engine: policy.engine === "opa" ? "opa" : "tag-acl",
			...(typeof policy.opaUrl === "string" ? { opaUrl: policy.opaUrl } : {}),
		},
	};
}

function parseManagedBy(raw: unknown): DnsManagedBy {
	if (raw === "hobo" || raw === "cloud-provider" || raw === "none") return raw;
	return "none";
}

function parseProvider(raw: unknown): DnsProviderKind {
	const allowed: DnsProviderKind[] = [
		"cloudflare",
		"route53",
		"azure",
		"google",
		"dnscontrol",
		"octodns",
		"memory",
		"none",
	];
	if (typeof raw === "string" && (allowed as string[]).includes(raw)) {
		return raw as DnsProviderKind;
	}
	return "none";
}

function parseOverlay(raw: unknown): OverlayProviderKind {
	if (raw === "netbird") return "netbird";
	return "tailscale";
}
