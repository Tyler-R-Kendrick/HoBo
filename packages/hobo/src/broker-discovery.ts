/**
 * Broker discovery document — mandatory before remote/anonymous deploy.
 * Parse-don't-validate: invalid payloads fail closed.
 */

export type BrokerAuthMethod =
	| "svid"
	| "oidc"
	| "dpop"
	| "anonymous"
	| "bearer";

// public-contract: discovery document schema id.
export const BROKER_DISCOVERY_SCHEMA = "hobo.broker-discovery/v1" as const;

export interface BrokerDiscoveryDocument {
	readonly schemaVersion: typeof BROKER_DISCOVERY_SCHEMA;
	readonly brokerId: string;
	readonly issuer: string;
	readonly authMethods: readonly BrokerAuthMethod[];
	readonly supportsAnonymous: boolean;
	readonly claimEndpoint: string;
	readonly placeEndpoint: string;
	readonly anonymousSessionEndpoint: string;
	readonly ttlHintSeconds?: number;
	readonly restrictions?: readonly string[];
	readonly resourceMetadataUrl?: string;
}

export interface BrokerDiscoveryClient {
	discover(brokerUri: string): Promise<BrokerDiscoveryDocument>;
}

export function parseBrokerDiscoveryDocument(
	raw: unknown,
): BrokerDiscoveryDocument {
	if (raw === null || typeof raw !== "object") {
		throw new BrokerDiscoveryError(
			"discovery document must be a JSON object",
			"HOBO_DISCOVERY_INVALID",
		);
	}
	const obj = raw as Record<string, unknown>;
	if (obj.schemaVersion !== BROKER_DISCOVERY_SCHEMA) {
		throw new BrokerDiscoveryError(
			`discovery schemaVersion must be ${BROKER_DISCOVERY_SCHEMA}`,
			"HOBO_DISCOVERY_INVALID",
		);
	}
	const brokerId = requireString(obj.brokerId, "brokerId");
	const issuer = requireString(obj.issuer, "issuer");
	const claimEndpoint = requireString(obj.claimEndpoint, "claimEndpoint");
	const placeEndpoint = requireString(obj.placeEndpoint, "placeEndpoint");
	const anonymousSessionEndpoint = requireString(
		obj.anonymousSessionEndpoint,
		"anonymousSessionEndpoint",
	);
	if (!Array.isArray(obj.authMethods) || obj.authMethods.length === 0) {
		throw new BrokerDiscoveryError(
			"discovery.authMethods must be a non-empty array",
			"HOBO_DISCOVERY_INVALID",
		);
	}
	const authMethods = obj.authMethods.map((m, i) => {
		if (
			m !== "svid" &&
			m !== "oidc" &&
			m !== "dpop" &&
			m !== "anonymous" &&
			m !== "bearer"
		) {
			throw new BrokerDiscoveryError(
				`discovery.authMethods[${i}] unsupported: ${String(m)}`,
				"HOBO_DISCOVERY_INVALID",
			);
		}
		return m as BrokerAuthMethod;
	});
	const supportsAnonymous =
		obj.supportsAnonymous === true || authMethods.includes("anonymous");
	if (typeof obj.supportsAnonymous !== "boolean") {
		// If omitted, derive from authMethods only when anonymous is listed.
		// Explicit false must be respected when present.
	}
	const explicitAnon =
		typeof obj.supportsAnonymous === "boolean"
			? obj.supportsAnonymous
			: supportsAnonymous;

	return {
		schemaVersion: BROKER_DISCOVERY_SCHEMA,
		brokerId,
		issuer,
		authMethods,
		supportsAnonymous: explicitAnon,
		claimEndpoint,
		placeEndpoint,
		anonymousSessionEndpoint,
		...(typeof obj.ttlHintSeconds === "number" &&
		Number.isFinite(obj.ttlHintSeconds)
			? { ttlHintSeconds: obj.ttlHintSeconds }
			: {}),
		...(Array.isArray(obj.restrictions)
			? {
					restrictions: obj.restrictions.filter(
						(r): r is string => typeof r === "string",
					),
				}
			: {}),
		...(typeof obj.resourceMetadataUrl === "string"
			? { resourceMetadataUrl: obj.resourceMetadataUrl }
			: {}),
	};
}

export class BrokerDiscoveryError extends Error {
	readonly code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = "BrokerDiscoveryError";
		this.code = code;
	}
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new BrokerDiscoveryError(
			`discovery.${field} must be a non-empty string`,
			"HOBO_DISCOVERY_INVALID",
		);
	}
	return value.trim();
}

/**
 * Fetch discovery from well-known paths under the broker URI.
 * HONEST SCOPE: production brokers may serve protected-resource metadata;
 * this client tries the HoBo well-known first, then /.well-known/oauth-protected-resource.
 */
export function createBrokerDiscoveryClient(options?: {
	readonly fetchImpl?: typeof fetch;
	/** Inject a fixed document (tests / in-process mock broker). */
	readonly fixed?: ReadonlyMap<string, BrokerDiscoveryDocument | unknown>;
}): BrokerDiscoveryClient {
	const fetchImpl = options?.fetchImpl ?? fetch;
	return {
		async discover(brokerUri: string) {
			const base = brokerUri.replace(/\/+$/, "");
			if (options?.fixed?.has(base)) {
				return parseBrokerDiscoveryDocument(options.fixed.get(base));
			}
			const candidates = [
				`${base}/.well-known/hobo-broker`,
				`${base}/.well-known/oauth-protected-resource`,
				`${base}/discovery`,
			];
			const errors: string[] = [];
			for (const url of candidates) {
				try {
					const res = await fetchImpl(url, {
						headers: { accept: "application/json" },
					});
					if (!res.ok) {
						errors.push(`${url} → HTTP ${res.status}`);
						continue;
					}
					const body = await res.json();
					// Protected-resource metadata may wrap our document.
					const candidate =
						body &&
						typeof body === "object" &&
						"schemaVersion" in (body as object)
							? body
							: ((body as { hobo_broker?: unknown }).hobo_broker ?? body);
					return parseBrokerDiscoveryDocument(candidate);
				} catch (error) {
					errors.push(
						`${url}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
			throw new BrokerDiscoveryError(
				`broker discovery failed for ${base}: ${errors.join("; ")}`,
				"HOBO_DISCOVERY_UNREACHABLE",
			);
		},
	};
}

export function defaultMockDiscovery(
	brokerUri: string,
	overrides: Partial<BrokerDiscoveryDocument> = {},
): BrokerDiscoveryDocument {
	const base = brokerUri.replace(/\/+$/, "");
	return {
		schemaVersion: BROKER_DISCOVERY_SCHEMA,
		brokerId: `broker:${new URL(base).host}`,
		issuer: base,
		authMethods: ["svid", "oidc", "dpop", "anonymous"],
		supportsAnonymous: true,
		claimEndpoint: `${base}/v1/claim`,
		placeEndpoint: `${base}/v1/place`,
		anonymousSessionEndpoint: `${base}/v1/anonymous-session`,
		ttlHintSeconds: 3600,
		restrictions: ["no-custom-domains", "ephemeral-only"],
		...overrides,
	};
}
