/**
 * Thin remote broker client over discovery + place/claim/anonymous-session.
 *
 * HONEST SCOPE: live multi-broker production transport is mock-capable. The
 * in-memory mock implements faithful shapes; HTTP path uses fetch against
 * discovery endpoints. Real hosted brokers plug in without changing CLI control flow.
 */
import type { PrincipalRef } from "@hobo/core";
import { mustGet } from "@hobo/core/total-access";
import {
	type BrokerDiscoveryClient,
	type BrokerDiscoveryDocument,
	createBrokerDiscoveryClient,
	defaultMockDiscovery,
	parseBrokerDiscoveryDocument,
} from "./broker-discovery.js";
import {
	authorizationHeaders,
	type PresentedCredential,
} from "./credential-presenter.js";

export interface AnonymousSessionResult {
	readonly ephemeralPrincipal: PrincipalRef;
	readonly accessToken: string;
	readonly claimToken: string;
	readonly claimUrl: string;
	readonly primaryUrl: string;
	readonly expiresAt: string;
	readonly ttlSeconds: number;
	readonly deploymentId: string;
	readonly restrictions: readonly string[];
}

export interface RemotePlaceRequest {
	readonly bindleName: string;
	readonly projectDir: string;
	readonly camp?: string | null;
	readonly credential: PresentedCredential;
	readonly anonymous?: boolean;
	readonly claimToken?: string;
}

export interface RemotePlaceResult {
	readonly deploymentId: string;
	readonly primaryUrl: string;
	readonly status: string;
	readonly brokerId: string;
	readonly resources: Readonly<Record<string, string>>;
	readonly claimToken?: string;
	readonly claimUrl?: string;
	readonly expiresAt?: string;
	readonly ttlSeconds?: number;
	readonly principal: PrincipalRef;
	readonly humanPrincipal?: PrincipalRef;
	readonly credentialScheme: string;
}

export interface RemoteClaimRequest {
	readonly claimToken: string;
	readonly account: string;
	readonly credential?: PresentedCredential;
}

export interface RemoteClaimResult {
	readonly deploymentId: string;
	readonly owner: PrincipalRef;
	readonly previousOwner: PrincipalRef | null;
	readonly primaryUrl: string;
	readonly status: string;
	readonly resources: Readonly<Record<string, string>>;
	readonly alreadyClaimed: boolean;
}

export interface RemoteBrokerClient {
	discover(): Promise<BrokerDiscoveryDocument>;
	createAnonymousSession(input?: {
		readonly bindleName?: string;
	}): Promise<AnonymousSessionResult>;
	place(request: RemotePlaceRequest): Promise<RemotePlaceResult>;
	claim(request: RemoteClaimRequest): Promise<RemoteClaimResult>;
	readonly brokerUri: string;
}

export class RemoteBrokerClientError extends Error {
	readonly code: string;
	readonly data?: Readonly<Record<string, unknown>>;
	constructor(
		message: string,
		code: string,
		data?: Readonly<Record<string, unknown>>,
	) {
		super(message);
		this.name = "RemoteBrokerClientError";
		this.code = code;
		if (data !== undefined) this.data = data;
	}
}

export function createRemoteBrokerClient(options: {
	readonly brokerUri: string;
	readonly discovery?: BrokerDiscoveryClient;
	readonly fetchImpl?: typeof fetch;
	/**
	 * In-process mock store. When set, no network is used for place/claim/session.
	 * HONEST SCOPE for live remote lane when mock is injected in tests.
	 */
	readonly mock?: MockRemoteBrokerState;
}): RemoteBrokerClient {
	const brokerUri = options.brokerUri.replace(/\/+$/, "");
	const discovery =
		options.discovery ??
		createBrokerDiscoveryClient({
			...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
			...(options.mock
				? {
						fixed: new Map([[brokerUri, options.mock.discovery]]),
					}
				: {}),
		});
	const fetchImpl = options.fetchImpl ?? fetch;
	let cachedDiscovery: BrokerDiscoveryDocument | null = null;

	async function getDiscovery(): Promise<BrokerDiscoveryDocument> {
		if (cachedDiscovery) return cachedDiscovery;
		cachedDiscovery = await discovery.discover(brokerUri);
		return cachedDiscovery;
	}

	function resolveUrl(endpoint: string): string {
		if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
			return endpoint;
		}
		return `${brokerUri}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
	}

	return {
		brokerUri,
		async discover() {
			return getDiscovery();
		},
		async createAnonymousSession(input = {}) {
			const doc = await getDiscovery();
			if (!doc.supportsAnonymous) {
				throw new RemoteBrokerClientError(
					"broker does not advertise anonymous support",
					"HOBO_ANON_NOT_SUPPORTED",
					{ brokerId: doc.brokerId },
				);
			}
			if (options.mock) {
				return options.mock.createAnonymousSession(input.bindleName);
			}
			const res = await fetchImpl(resolveUrl(doc.anonymousSessionEndpoint), {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					bindleName: input.bindleName ?? "unknown",
				}),
			});
			if (!res.ok) {
				throw new RemoteBrokerClientError(
					`anonymous session failed (HTTP ${res.status})`,
					"HOBO_ANON_SESSION_FAILED",
				);
			}
			return parseAnonymousSession(await res.json());
		},
		async place(request) {
			const doc = await getDiscovery();
			if (options.mock) {
				return options.mock.place(request, doc);
			}
			const headers = {
				"content-type": "application/json",
				accept: "application/json",
				...authorizationHeaders(request.credential),
			};
			const res = await fetchImpl(resolveUrl(doc.placeEndpoint), {
				method: "POST",
				headers,
				body: JSON.stringify({
					bindleName: request.bindleName,
					projectDir: request.projectDir,
					camp: request.camp ?? null,
					anonymous: request.anonymous === true,
					claimToken: request.claimToken,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as Record<
					string,
					unknown
				>;
				throw new RemoteBrokerClientError(
					typeof body.message === "string"
						? body.message
						: `remote place failed (HTTP ${res.status})`,
					"HOBO_REMOTE_PLACE_FAILED",
					body,
				);
			}
			return parsePlaceResult(await res.json(), request.credential);
		},
		async claim(request) {
			const doc = await getDiscovery();
			if (options.mock) {
				return options.mock.claim(request);
			}
			const headers: Record<string, string> = {
				"content-type": "application/json",
				accept: "application/json",
			};
			if (request.credential) {
				Object.assign(headers, authorizationHeaders(request.credential));
			}
			const res = await fetchImpl(resolveUrl(doc.claimEndpoint), {
				method: "POST",
				headers,
				body: JSON.stringify({
					claimToken: request.claimToken,
					account: request.account,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as Record<
					string,
					unknown
				>;
				const code =
					typeof body.code === "string"
						? body.code
						: res.status === 401 || res.status === 403
							? "HOBO_CLAIM_TOKEN_INVALID"
							: "HOBO_REMOTE_CLAIM_FAILED";
				throw new RemoteBrokerClientError(
					typeof body.message === "string"
						? body.message
						: `remote claim failed (HTTP ${res.status})`,
					code,
					body,
				);
			}
			return parseClaimResult(await res.json());
		},
	};
}

export interface MockRemoteBrokerState {
	readonly discovery: BrokerDiscoveryDocument;
	createAnonymousSession(bindleName?: string): AnonymousSessionResult;
	place(
		request: RemotePlaceRequest,
		discovery: BrokerDiscoveryDocument,
	): RemotePlaceResult;
	claim(request: RemoteClaimRequest): RemoteClaimResult;
}

/**
 * Faithful in-process mock for control-flow tests (anonymous → claim preserves URL).
 */
export function createMockRemoteBrokerState(options?: {
	readonly brokerUri?: string;
	readonly supportsAnonymous?: boolean;
	readonly now?: () => number;
}): MockRemoteBrokerState {
	const brokerUri = (
		options?.brokerUri ?? "https://public.example.com"
	).replace(/\/+$/, "");
	const supportsAnonymous = options?.supportsAnonymous !== false;
	const now = options?.now ?? (() => Date.now());
	const deployments = new Map<
		string,
		{
			deploymentId: string;
			primaryUrl: string;
			resources: Record<string, string>;
			status: string;
			owner: PrincipalRef | null;
			claimToken: string;
			expiresAt: number;
			bindleName: string;
		}
	>();
	const tokens = new Map<string, string>(); // claimToken → deploymentId

	const discovery = defaultMockDiscovery(brokerUri, {
		supportsAnonymous,
		authMethods: supportsAnonymous
			? ["svid", "oidc", "dpop", "anonymous"]
			: ["svid", "oidc", "dpop"],
	});

	return {
		discovery,
		createAnonymousSession(bindleName = "app") {
			if (!supportsAnonymous) {
				throw new RemoteBrokerClientError(
					"broker does not advertise anonymous support",
					"HOBO_ANON_NOT_SUPPORTED",
				);
			}
			const deploymentId = `dep-anon-${Math.random().toString(36).slice(2, 10)}`;
			const claimToken = `claim_${deploymentId}_${Math.random().toString(36).slice(2, 10)}`;
			const ttlSeconds = discovery.ttlHintSeconds ?? 3600;
			const expiresAtMs = now() + ttlSeconds * 1000;
			const primaryUrl = `https://${deploymentId}.anon.hobo.example.com`;
			const ephemeralPrincipal: PrincipalRef = {
				kind: "user",
				id: `anonymous:${deploymentId}`,
			};
			const resources = {
				web: "provisioned",
				api: "provisioned",
			};
			deployments.set(deploymentId, {
				deploymentId,
				primaryUrl,
				resources,
				status: "deployed",
				owner: null,
				claimToken,
				expiresAt: expiresAtMs,
				bindleName,
			});
			tokens.set(claimToken, deploymentId);
			return {
				ephemeralPrincipal,
				accessToken: `anon-access-${deploymentId}`,
				claimToken,
				claimUrl: `${brokerUri}/claim?token=${encodeURIComponent(claimToken)}`,
				primaryUrl,
				expiresAt: new Date(expiresAtMs).toISOString(),
				ttlSeconds,
				deploymentId,
				restrictions: discovery.restrictions ?? [],
			};
		},
		place(request, doc) {
			if (request.anonymous && request.claimToken) {
				const deploymentId = tokens.get(request.claimToken);
				if (!deploymentId) {
					throw new RemoteBrokerClientError(
						"unknown claim token for anonymous place",
						"HOBO_CLAIM_TOKEN_INVALID",
					);
				}
				const dep = mustGet(deployments, deploymentId, "deployments");
				if (dep.expiresAt < now()) {
					throw new RemoteBrokerClientError(
						"anonymous claim token expired",
						"HOBO_CLAIM_TOKEN_EXPIRED",
					);
				}
				return {
					deploymentId: dep.deploymentId,
					primaryUrl: dep.primaryUrl,
					status: dep.status,
					brokerId: doc.brokerId,
					resources: dep.resources,
					claimToken: dep.claimToken,
					claimUrl: `${brokerUri}/claim?token=${encodeURIComponent(dep.claimToken)}`,
					expiresAt: new Date(dep.expiresAt).toISOString(),
					ttlSeconds: Math.max(0, Math.floor((dep.expiresAt - now()) / 1000)),
					principal: request.credential.principal,
					...(request.credential.humanPrincipal
						? { humanPrincipal: request.credential.humanPrincipal }
						: {}),
					credentialScheme: request.credential.scheme,
				};
			}

			const deploymentId = `dep-auth-${Math.random().toString(36).slice(2, 10)}`;
			const primaryUrl = `https://${deploymentId}.broker.hobo.example.com`;
			const resources = { web: "provisioned", api: "provisioned" };
			deployments.set(deploymentId, {
				deploymentId,
				primaryUrl,
				resources,
				status: "deployed",
				owner: request.credential.principal,
				claimToken: "",
				expiresAt: now() + 86400_000,
				bindleName: request.bindleName,
			});
			return {
				deploymentId,
				primaryUrl,
				status: "deployed",
				brokerId: doc.brokerId,
				resources,
				principal: request.credential.principal,
				...(request.credential.humanPrincipal
					? { humanPrincipal: request.credential.humanPrincipal }
					: {}),
				credentialScheme: request.credential.scheme,
			};
		},
		claim(request) {
			const deploymentId = tokens.get(request.claimToken);
			if (!deploymentId) {
				throw new RemoteBrokerClientError(
					"invalid claim token",
					"HOBO_CLAIM_TOKEN_INVALID",
				);
			}
			const dep = mustGet(deployments, deploymentId, "deployments");
			if (dep.expiresAt < now() && dep.owner === null) {
				throw new RemoteBrokerClientError(
					"claim token expired",
					"HOBO_CLAIM_TOKEN_EXPIRED",
				);
			}
			const newOwner: PrincipalRef = { kind: "user", id: request.account };
			if (dep.owner?.kind === newOwner.kind && dep.owner?.id === newOwner.id) {
				return {
					deploymentId: dep.deploymentId,
					owner: newOwner,
					previousOwner: dep.owner,
					primaryUrl: dep.primaryUrl,
					status: dep.status,
					resources: dep.resources,
					alreadyClaimed: true,
				};
			}
			const previousOwner = dep.owner;
			dep.owner = newOwner;
			// Preserve URL and resources — rebind only.
			return {
				deploymentId: dep.deploymentId,
				owner: newOwner,
				previousOwner,
				primaryUrl: dep.primaryUrl,
				status: dep.status,
				resources: { ...dep.resources },
				alreadyClaimed: false,
			};
		},
	};
}

function parseAnonymousSession(raw: unknown): AnonymousSessionResult {
	if (raw === null || typeof raw !== "object") {
		throw new RemoteBrokerClientError(
			"anonymous session payload invalid",
			"HOBO_ANON_SESSION_INVALID",
		);
	}
	const obj = raw as Record<string, unknown>;
	const principal = obj.ephemeralPrincipal as PrincipalRef | undefined;
	if (
		!principal ||
		typeof principal.id !== "string" ||
		typeof principal.kind !== "string"
	) {
		throw new RemoteBrokerClientError(
			"anonymous session missing ephemeralPrincipal",
			"HOBO_ANON_SESSION_INVALID",
		);
	}
	return {
		ephemeralPrincipal: principal,
		accessToken: requireField(obj, "accessToken"),
		claimToken: requireField(obj, "claimToken"),
		claimUrl: requireField(obj, "claimUrl"),
		primaryUrl: requireField(obj, "primaryUrl"),
		expiresAt: requireField(obj, "expiresAt"),
		ttlSeconds: Number(obj.ttlSeconds ?? 3600),
		deploymentId: requireField(obj, "deploymentId"),
		restrictions: Array.isArray(obj.restrictions)
			? obj.restrictions.filter((r): r is string => typeof r === "string")
			: [],
	};
}

function parsePlaceResult(
	raw: unknown,
	credential: PresentedCredential,
): RemotePlaceResult {
	if (raw === null || typeof raw !== "object") {
		throw new RemoteBrokerClientError(
			"place payload invalid",
			"HOBO_REMOTE_PLACE_INVALID",
		);
	}
	const obj = raw as Record<string, unknown>;
	const resources =
		obj.resources && typeof obj.resources === "object"
			? (obj.resources as Record<string, string>)
			: {};
	return {
		deploymentId: requireField(obj, "deploymentId"),
		primaryUrl: requireField(obj, "primaryUrl"),
		status: typeof obj.status === "string" ? obj.status : "deployed",
		brokerId: requireField(obj, "brokerId"),
		resources,
		...(typeof obj.claimToken === "string"
			? { claimToken: obj.claimToken }
			: {}),
		...(typeof obj.claimUrl === "string" ? { claimUrl: obj.claimUrl } : {}),
		...(typeof obj.expiresAt === "string" ? { expiresAt: obj.expiresAt } : {}),
		...(typeof obj.ttlSeconds === "number"
			? { ttlSeconds: obj.ttlSeconds }
			: {}),
		principal: credential.principal,
		...(credential.humanPrincipal
			? { humanPrincipal: credential.humanPrincipal }
			: {}),
		credentialScheme: credential.scheme,
	};
}

function parseClaimResult(raw: unknown): RemoteClaimResult {
	if (raw === null || typeof raw !== "object") {
		throw new RemoteBrokerClientError(
			"claim payload invalid",
			"HOBO_REMOTE_CLAIM_INVALID",
		);
	}
	const obj = raw as Record<string, unknown>;
	const owner = obj.owner as PrincipalRef;
	if (!owner || typeof owner.id !== "string") {
		throw new RemoteBrokerClientError(
			"claim payload missing owner",
			"HOBO_REMOTE_CLAIM_INVALID",
		);
	}
	const resources =
		obj.resources && typeof obj.resources === "object"
			? (obj.resources as Record<string, string>)
			: {};
	return {
		deploymentId: requireField(obj, "deploymentId"),
		owner,
		previousOwner:
			obj.previousOwner && typeof obj.previousOwner === "object"
				? (obj.previousOwner as PrincipalRef)
				: null,
		primaryUrl: requireField(obj, "primaryUrl"),
		status: typeof obj.status === "string" ? obj.status : "claimed",
		resources,
		alreadyClaimed: obj.alreadyClaimed === true,
	};
}

function requireField(obj: Record<string, unknown>, field: string): string {
	const value = obj[field];
	if (typeof value !== "string" || value.length === 0) {
		throw new RemoteBrokerClientError(
			`missing field ${field}`,
			"HOBO_REMOTE_PAYLOAD_INVALID",
		);
	}
	return value;
}

// re-export parse for tests
export { parseBrokerDiscoveryDocument };
