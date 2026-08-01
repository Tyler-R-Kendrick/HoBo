/**
 * hobo:secrets residual port (ADR-0113) + resolution ladder (ADR-0027).
 * Preferred paths: bound-resource / provider-federation. Static hatch is last.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";

import type { SecretSourceRank } from "./config-types.js";

export type SecretsAccessResult =
	| Readonly<{
			status: "ok";
			/** Opaque reference or redacted placeholder — never log this as a secret in production paths that leave the broker. */
			valueRef: string;
			/** Short-lived material for mediated use only. */
			material?: string;
			versionId?: string;
			source: SecretSourceRank;
			expiresAt?: string;
	  }>
	| Readonly<{ status: "denied"; reason: string; code: string }>;

/**
 * Residual managed-secrets store (ADR-0113). Prefer identity federation.
 * `openbao` is a residual KV/JWT backend (OpenSSF OpenBao) — never primary identity.
 */
export interface SecretsPort {
	readonly id: string;
	readonly kind:
		| "vault-jwt"
		| "openbao"
		| "aws-sm"
		| "azure-kv"
		| "memory-fixture";
	put(
		name: string,
		value: string,
	): Promise<{ versionId: string }>;
	access(name: string): Promise<SecretsAccessResult>;
	accessVersion(
		name: string,
		versionId: string,
	): Promise<SecretsAccessResult>;
	listVersions(name: string): Promise<readonly string[]>;
}

/** In-memory fixture store for tests / hobo dev (contract-asserted). */
export function createMemorySecretsPort(options?: {
	readonly id?: string;
}): SecretsPort & {
	/** Test-only: inspect without returning raw values in events. */
	readonly names: () => readonly string[];
} {
	const store = new Map<string, { versions: string[]; values: string[] }>();
	return {
		id: options?.id ?? "secrets:memory",
		kind: "memory-fixture",
		async put(name, value) {
			const entry = store.get(name) ?? { versions: [], values: [] };
			const versionId = `v${entry.versions.length + 1}-${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
			entry.versions.push(versionId);
			entry.values.push(value);
			store.set(name, entry);
			return { versionId };
		},
		async access(name) {
			const entry = store.get(name);
			if (!entry || entry.values.length === 0) {
				return {
					status: "denied",
					reason: `secret ${name} not found`,
					code: "secret-not-found",
				};
			}
			const idx = entry.values.length - 1;
			return {
				status: "ok",
				valueRef: `secref://${name}/${entry.versions[idx]}`,
				material: entry.values[idx],
				versionId: entry.versions[idx],
				source: "provider-federation",
			};
		},
		async accessVersion(name, versionId) {
			const entry = store.get(name);
			if (!entry) {
				return {
					status: "denied",
					reason: `secret ${name} not found`,
					code: "secret-not-found",
				};
			}
			const idx = entry.versions.indexOf(versionId);
			if (idx < 0) {
				return {
					status: "denied",
					reason: `version ${versionId} not found`,
					code: "secret-version-not-found",
				};
			}
			return {
				status: "ok",
				valueRef: `secref://${name}/${versionId}`,
				material: entry.values[idx],
				versionId,
				source: "provider-federation",
			};
		},
		async listVersions(name) {
			return Object.freeze([...(store.get(name)?.versions ?? [])]);
		},
		names: () => Object.freeze([...store.keys()]),
	};
}

/**
 * Vault adapter that authenticates via JWT/OIDC (SVID) — no static Vault token.
 * Offline/stub mode mints deterministic material from the JWT subject.
 */
export function createVaultJwtSecretsPort(options: {
	readonly vaultAddr: string;
	readonly role: string;
	/** Minted SVID JWT for Vault login (never a static vault token). */
	readonly svidJwt: string;
	readonly id?: string;
}): SecretsPort {
	const root = createHash("sha256")
		.update(`vault-jwt:${options.vaultAddr}:${options.role}:${options.svidJwt}`)
		.digest();
	const store = new Map<string, { versions: string[]; seeds: string[] }>();

	return {
		id: options.id ?? `secrets:vault-jwt:${options.role}`,
		kind: "vault-jwt",
		async put(name, value) {
			const entry = store.get(name) ?? { versions: [], seeds: [] };
			const versionId = `vv${entry.versions.length + 1}`;
			entry.versions.push(versionId);
			entry.seeds.push(value);
			store.set(name, entry);
			return { versionId };
		},
		async access(name) {
			const entry = store.get(name);
			const seed =
				entry?.seeds[entry.seeds.length - 1] ??
				createHmac("sha256", root).update(name).digest("base64url");
			const versionId =
				entry?.versions[entry.versions.length - 1] ?? "vv-dynamic";
			const material = createHmac("sha256", root)
				.update(`${name}:${versionId}:${seed}`)
				.digest("base64url");
			return {
				status: "ok",
				valueRef: `vault://${options.vaultAddr}/secret/${name}@${versionId}`,
				material,
				versionId,
				source: "provider-federation",
				expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
			};
		},
		async accessVersion(name, versionId) {
			const entry = store.get(name);
			const idx = entry?.versions.indexOf(versionId) ?? -1;
			const seed =
				idx >= 0 && entry
					? entry.seeds[idx]!
					: createHmac("sha256", root).update(`${name}:${versionId}`).digest(
							"hex",
						);
			const material = createHmac("sha256", root)
				.update(`${name}:${versionId}:${seed}`)
				.digest("base64url");
			return {
				status: "ok",
				valueRef: `vault://${options.vaultAddr}/secret/${name}@${versionId}`,
				material,
				versionId,
				source: "provider-federation",
				expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
			};
		},
		async listVersions(name) {
			return Object.freeze([...(store.get(name)?.versions ?? ["vv-dynamic"])]);
		},
	};
}

export type FetchLike = (
	input: string,
	init?: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
	},
) => Promise<{
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
}>;

/**
 * AWS Secrets Manager adapter (Camp-scoped).
 * Uses brokered short-lived credentials via injected signer headers — never static long-lived keys in the adapter.
 * Offline mode (no fetch) falls back to deterministic HMAC material for local/dev parity.
 */
export function createAwsSecretsManagerPort(options?: {
	readonly region?: string;
	readonly endpoint?: string;
	/** Injected authenticated fetch (caller attaches SigV4 / brokered session). */
	readonly fetch?: FetchLike;
	/** Brokered bearer for local HTTP mock / gateway. */
	readonly accessToken?: string;
	readonly id?: string;
}): SecretsPort {
	const region = options?.region ?? "us-east-1";
	const endpoint =
		options?.endpoint ?? `https://secretsmanager.${region}.amazonaws.com`;
	const memory = createMemorySecretsPort({
		id: options?.id ?? `secrets:aws-sm:${region}`,
	});
	const root = createHash("sha256")
		.update(`aws-sm:${region}:${options?.accessToken ?? "offline"}`)
		.digest();

	async function liveAccess(
		name: string,
		versionId?: string,
	): Promise<SecretsAccessResult | null> {
		if (!options?.fetch) return null;
		const body = JSON.stringify({
			SecretId: name,
			...(versionId !== undefined ? { VersionId: versionId } : {}),
		});
		const res = await options.fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-amz-json-1.1",
				"X-Amz-Target": versionId
					? "secretsmanager.GetSecretValue"
					: "secretsmanager.GetSecretValue",
				...(options.accessToken
					? { Authorization: `Bearer ${options.accessToken}` }
					: {}),
			},
			body,
		});
		if (!res.ok) {
			return {
				status: "denied",
				reason: `aws-sm http ${res.status}`,
				code: "aws-sm-http-error",
			};
		}
		const data = (await res.json()) as {
			ARN?: string;
			VersionId?: string;
			SecretString?: string;
		};
		const vid = data.VersionId ?? versionId ?? "AWSCURRENT";
		return {
			status: "ok",
			valueRef: `aws-sm://${region}/${name}@${vid}`,
			material: data.SecretString,
			versionId: vid,
			source: "provider-federation",
			expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
		};
	}

	return {
		id: memory.id,
		kind: "aws-sm",
		async put(name, value) {
			if (options?.fetch) {
				await options.fetch(endpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/x-amz-json-1.1",
						"X-Amz-Target": "secretsmanager.PutSecretValue",
						...(options.accessToken
							? { Authorization: `Bearer ${options.accessToken}` }
							: {}),
					},
					body: JSON.stringify({ SecretId: name, SecretString: value }),
				});
			}
			return memory.put(name, value);
		},
		async access(name) {
			const live = await liveAccess(name);
			if (live) return live;
			const local = await memory.access(name);
			if (local.status === "ok") {
				return {
					...local,
					valueRef: `aws-sm://${region}/${name}@${local.versionId ?? "local"}`,
					source: "provider-federation",
				};
			}
			// Offline dynamic: deterministic material so mediation still works.
			const material = createHmac("sha256", root)
				.update(name)
				.digest("base64url");
			return {
				status: "ok",
				valueRef: `aws-sm://${region}/${name}@dynamic`,
				material,
				versionId: "dynamic",
				source: "provider-federation",
				expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
			};
		},
		async accessVersion(name, versionId) {
			const live = await liveAccess(name, versionId);
			if (live) return live;
			return memory.accessVersion(name, versionId);
		},
		async listVersions(name) {
			return memory.listVersions(name);
		},
	};
}

/** @deprecated Prefer createAwsSecretsManagerPort — alias for Camp adapter registry. */
export const createAwsSecretsManagerStub = createAwsSecretsManagerPort;

/**
 * Azure Key Vault adapter (Camp-scoped).
 * Authenticates via brokered OAuth token (SVID→federation), not a static vault key.
 */
export function createAzureKeyVaultPort(options?: {
	readonly vaultName?: string;
	readonly vaultUrl?: string;
	readonly fetch?: FetchLike;
	readonly accessToken?: string;
	readonly id?: string;
}): SecretsPort {
	const vaultName = options?.vaultName ?? "default";
	const vaultUrl =
		options?.vaultUrl ?? `https://${vaultName}.vault.azure.net`;
	const memory = createMemorySecretsPort({
		id: options?.id ?? `secrets:azure-kv:${vaultName}`,
	});
	const root = createHash("sha256")
		.update(`azure-kv:${vaultName}:${options?.accessToken ?? "offline"}`)
		.digest();

	async function liveGet(
		name: string,
		versionId?: string,
	): Promise<SecretsAccessResult | null> {
		if (!options?.fetch) return null;
		const path =
			versionId !== undefined
				? `${vaultUrl}/secrets/${encodeURIComponent(name)}/${encodeURIComponent(versionId)}?api-version=7.4`
				: `${vaultUrl}/secrets/${encodeURIComponent(name)}?api-version=7.4`;
		const res = await options.fetch(path, {
			method: "GET",
			headers: {
				...(options.accessToken
					? { Authorization: `Bearer ${options.accessToken}` }
					: {}),
			},
		});
		if (!res.ok) {
			return {
				status: "denied",
				reason: `azure-kv http ${res.status}`,
				code: "azure-kv-http-error",
			};
		}
		const data = (await res.json()) as {
			id?: string;
			value?: string;
			attributes?: { exp?: number };
		};
		const vid =
			versionId ??
			(data.id?.split("/").pop() || "current");
		return {
			status: "ok",
			valueRef: `azure-kv://${vaultName}/${name}@${vid}`,
			material: data.value,
			versionId: vid,
			source: "provider-federation",
			expiresAt: data.attributes?.exp
				? new Date(data.attributes.exp * 1000).toISOString()
				: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
		};
	}

	return {
		id: memory.id,
		kind: "azure-kv",
		async put(name, value) {
			if (options?.fetch) {
				await options.fetch(
					`${vaultUrl}/secrets/${encodeURIComponent(name)}?api-version=7.4`,
					{
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
							...(options.accessToken
								? { Authorization: `Bearer ${options.accessToken}` }
								: {}),
						},
						body: JSON.stringify({ value }),
					},
				);
			}
			return memory.put(name, value);
		},
		async access(name) {
			const live = await liveGet(name);
			if (live) return live;
			const local = await memory.access(name);
			if (local.status === "ok") {
				return {
					...local,
					valueRef: `azure-kv://${vaultName}/${name}@${local.versionId ?? "local"}`,
					source: "provider-federation",
				};
			}
			const material = createHmac("sha256", root)
				.update(name)
				.digest("base64url");
			return {
				status: "ok",
				valueRef: `azure-kv://${vaultName}/${name}@dynamic`,
				material,
				versionId: "dynamic",
				source: "provider-federation",
				expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
			};
		},
		async accessVersion(name, versionId) {
			const live = await liveGet(name, versionId);
			if (live) return live;
			return memory.accessVersion(name, versionId);
		},
		async listVersions(name) {
			return memory.listVersions(name);
		},
	};
}

/** @deprecated Prefer createAzureKeyVaultPort. */
export const createAzureKeyVaultStub = createAzureKeyVaultPort;

/**
 * OpenBao residual secrets adapter (ADR-0113 / ADR-0027).
 *
 * OpenBao is the community OpenSSF fork of Vault; HTTP API is Vault-compatible
 * (KV v2, auth/jwt). Authenticate **only** with a short-lived SVID JWT — never a
 * long-lived OpenBao token stored in the adapter.
 *
 * Ranking: residual under provider-federation (rank 2). Bound-resource and pure
 * federation remain preferred; static-escape stays last.
 *
 * Offline mode (default when `offline` is true **or** no `fetch` is injected)
 * never touches the network and mints deterministic HMAC material (hobo dev /
 * unit tests). Live path uses injected `fetch` for JWT login + KV v2.
 *
 * Extension point: dynamic secret engines / PKI can later share the same JWT
 * login cache; not implemented here.
 */
export function createOpenBaoSecretsPort(options: {
	readonly openbaoAddr: string;
	readonly role: string;
	/** Short-lived SVID JWT for auth/jwt login (never a static OpenBao token). */
	readonly svidJwt: string;
	/** KV v2 mount path (default `secret`). */
	readonly mountPath?: string;
	/** OpenBao free namespace → `X-Vault-Namespace` header. */
	readonly namespace?: string;
	readonly fetch?: FetchLike;
	readonly id?: string;
	/**
	 * When true, never call the network (deterministic HMAC).
	 * Defaults to true when `fetch` is omitted; false only when `fetch` is set
	 * and `offline` is explicitly false.
	 */
	readonly offline?: boolean;
}): SecretsPort {
	const addr = options.openbaoAddr.replace(/\/$/, "");
	const mount = options.mountPath ?? "secret";
	const offline =
		options.offline === true ||
		(options.offline !== false && options.fetch === undefined);
	const root = createHash("sha256")
		.update(
			`openbao:${addr}:${options.role}:${options.svidJwt}:${mount}:${options.namespace ?? ""}`,
		)
		.digest();
	const store = new Map<string, { versions: string[]; seeds: string[] }>();

	type TokenCache = { token: string; expiresAtMs: number };
	let tokenCache: TokenCache | null = null;

	function valueRef(name: string, versionId: string): string {
		const ns = options.namespace ? `${options.namespace}/` : "";
		return `openbao://${addr}/${ns}${mount}/${name}@${versionId}`;
	}

	function offlineMaterial(name: string, versionId: string, seed: string): string {
		return createHmac("sha256", root)
			.update(`${name}:${versionId}:${seed}`)
			.digest("base64url");
	}

	function offlineAccess(
		name: string,
		versionId?: string,
	): SecretsAccessResult {
		const entry = store.get(name);
		if (versionId !== undefined) {
			const idx = entry?.versions.indexOf(versionId) ?? -1;
			const seed =
				idx >= 0 && entry
					? entry.seeds[idx]!
					: createHmac("sha256", root)
							.update(`${name}:${versionId}`)
							.digest("hex");
			const material = offlineMaterial(name, versionId, seed);
			return {
				status: "ok",
				valueRef: valueRef(name, versionId),
				material,
				versionId,
				source: "provider-federation",
				expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
			};
		}
		const seed =
			entry?.seeds[entry.seeds.length - 1] ??
			createHmac("sha256", root).update(name).digest("base64url");
		const vid =
			entry?.versions[entry.versions.length - 1] ?? "ob-dynamic";
		const material = offlineMaterial(name, vid, seed);
		return {
			status: "ok",
			valueRef: valueRef(name, vid),
			material,
			versionId: vid,
			source: "provider-federation",
			expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
		};
	}

	function nsHeaders(
		extra?: Record<string, string>,
	): Record<string, string> {
		return {
			"Content-Type": "application/json",
			...(options.namespace
				? { "X-Vault-Namespace": options.namespace }
				: {}),
			...extra,
		};
	}

	async function jwtLogin(): Promise<
		| { status: "ok"; token: string; leaseDurationSec: number }
		| { status: "denied"; reason: string; code: string }
	> {
		if (!options.fetch) {
			return {
				status: "denied",
				reason: "openbao live path requires injected fetch",
				code: "openbao-no-fetch",
			};
		}
		const now = Date.now();
		if (tokenCache && tokenCache.expiresAtMs > now + 5_000) {
			return {
				status: "ok",
				token: tokenCache.token,
				leaseDurationSec: Math.max(
					0,
					Math.floor((tokenCache.expiresAtMs - now) / 1000),
				),
			};
		}
		const res = await options.fetch(`${addr}/v1/auth/jwt/login`, {
			method: "POST",
			headers: nsHeaders(),
			body: JSON.stringify({
				role: options.role,
				jwt: options.svidJwt,
			}),
		});
		if (!res.ok) {
			return {
				status: "denied",
				reason: `openbao jwt login http ${res.status}`,
				code: "openbao-auth-failed",
			};
		}
		const data = (await res.json()) as {
			auth?: {
				client_token?: string;
				lease_duration?: number;
			};
		};
		const token = data.auth?.client_token;
		if (!token) {
			return {
				status: "denied",
				reason: "openbao jwt login missing client_token",
				code: "openbao-auth-missing-token",
			};
		}
		// Never persist; cache only for lease duration in-process.
		const lease = Math.max(1, data.auth?.lease_duration ?? 900);
		tokenCache = { token, expiresAtMs: now + lease * 1000 };
		return { status: "ok", token, leaseDurationSec: lease };
	}

	async function liveGet(
		name: string,
		versionId?: string,
	): Promise<SecretsAccessResult> {
		const login = await jwtLogin();
		if (login.status === "denied") {
			return {
				status: "denied",
				reason: login.reason,
				code: login.code,
			};
		}
		if (!options.fetch) {
			return {
				status: "denied",
				reason: "openbao live path requires injected fetch",
				code: "openbao-no-fetch",
			};
		}
		const q =
			versionId !== undefined
				? `?version=${encodeURIComponent(versionId)}`
				: "";
		const path = `${addr}/v1/${mount}/data/${name.replace(/^\//, "")}${q}`;
		const res = await options.fetch(path, {
			method: "GET",
			headers: nsHeaders({ "X-Vault-Token": login.token }),
		});
		if (!res.ok) {
			return {
				status: "denied",
				reason: `openbao kv get http ${res.status}`,
				code:
					res.status === 404
						? "openbao-secret-not-found"
						: "openbao-kv-http-error",
			};
		}
		const data = (await res.json()) as {
			data?: {
				data?: { value?: string; [k: string]: unknown };
				metadata?: {
					version?: number;
					// lease-ish fields if present
				};
				lease_duration?: number;
			};
			lease_duration?: number;
		};
		const body = data.data?.data;
		const material =
			typeof body?.value === "string"
				? body.value
				: body !== undefined
					? JSON.stringify(body)
					: undefined;
		const metaVersion = data.data?.metadata?.version;
		const vid =
			versionId ??
			(metaVersion !== undefined ? `obv${metaVersion}` : "ob-current");
		const leaseSec =
			data.lease_duration ??
			data.data?.lease_duration ??
			login.leaseDurationSec ??
			900;
		if (material === undefined) {
			return {
				status: "denied",
				reason: `openbao secret ${name} empty`,
				code: "openbao-secret-empty",
			};
		}
		return {
			status: "ok",
			valueRef: valueRef(name, vid),
			material,
			versionId: vid,
			source: "provider-federation",
			expiresAt: new Date(Date.now() + leaseSec * 1000).toISOString(),
		};
	}

	async function livePut(
		name: string,
		value: string,
	): Promise<{ versionId: string } | { status: "denied"; reason: string; code: string }> {
		const login = await jwtLogin();
		if (login.status === "denied") {
			return login;
		}
		if (!options.fetch) {
			return {
				status: "denied",
				reason: "openbao live path requires injected fetch",
				code: "openbao-no-fetch",
			};
		}
		const path = `${addr}/v1/${mount}/data/${name.replace(/^\//, "")}`;
		const res = await options.fetch(path, {
			method: "POST",
			headers: nsHeaders({ "X-Vault-Token": login.token }),
			body: JSON.stringify({ data: { value } }),
		});
		if (!res.ok) {
			return {
				status: "denied",
				reason: `openbao kv put http ${res.status}`,
				code: "openbao-kv-put-http-error",
			};
		}
		const data = (await res.json()) as {
			data?: { version?: number };
		};
		const versionId =
			data.data?.version !== undefined
				? `obv${data.data.version}`
				: `obv-${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
		return { versionId };
	}

	async function liveListVersions(
		name: string,
	): Promise<readonly string[] | null> {
		if (!options.fetch) return null;
		const login = await jwtLogin();
		if (login.status === "denied") return null;
		const path = `${addr}/v1/${mount}/metadata/${name.replace(/^\//, "")}`;
		const res = await options.fetch(path, {
			method: "GET",
			headers: nsHeaders({ "X-Vault-Token": login.token }),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			data?: { versions?: Record<string, unknown> };
		};
		const versions = data.data?.versions;
		if (!versions) return null;
		return Object.freeze(
			Object.keys(versions)
				.map((k) => `obv${k}`)
				.sort(),
		);
	}

	return {
		id: options.id ?? `secrets:openbao:${options.role}`,
		kind: "openbao",
		async put(name, value) {
			if (!offline) {
				const live = await livePut(name, value);
				if (!("status" in live)) {
					const entry = store.get(name) ?? { versions: [], seeds: [] };
					entry.versions.push(live.versionId);
					entry.seeds.push(value);
					store.set(name, entry);
					return { versionId: live.versionId };
				}
				// Live put denied — keep offline bookkeeping for fixtures only.
			}
			const entry = store.get(name) ?? { versions: [], seeds: [] };
			const versionId = `obv${entry.versions.length + 1}`;
			entry.versions.push(versionId);
			entry.seeds.push(value);
			store.set(name, entry);
			return { versionId };
		},
		async access(name) {
			if (!offline) {
				return liveGet(name);
			}
			return offlineAccess(name);
		},
		async accessVersion(name, versionId) {
			if (!offline) {
				return liveGet(name, versionId);
			}
			return offlineAccess(name, versionId);
		},
		async listVersions(name) {
			if (!offline) {
				const live = await liveListVersions(name);
				if (live && live.length > 0) return live;
			}
			return Object.freeze([
				...(store.get(name)?.versions ?? ["ob-dynamic"]),
			]);
		},
	};
}

/**
 * Local Station residual secrets (wasm / local Camp host).
 *
 * Default backend is **OpenBao offline** so residual `provider-federation`
 * paths work on a local Station + wasm component host without a live OpenBao
 * process or network. Guests never receive material — only host-mediated
 * redacted config / mesh env (see bare-metal / runtime-wasm `x-hobo-env-*`).
 *
 * Live residual OpenBao (still JWT-only):
 *   HOBO_OPENBAO_LIVE=1
 *   HOBO_OPENBAO_ADDR=http://127.0.0.1:8200
 *   HOBO_SVID_JWT=<short-lived JWT>
 *   HOBO_OPENBAO_ROLE=hobo-station-local
 *
 * Other residual backends: HOBO_LOCAL_SECRETS_BACKEND=memory|vault-jwt|openbao
 */
export function createLocalStationSecretsPort(options?: {
	readonly stationId?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly fetch?: FetchLike;
	readonly id?: string;
	/** Force offline OpenBao even when LIVE=1 (tests). */
	readonly offline?: boolean;
}): SecretsPort {
	const env = options?.env ?? process.env;
	const backend = (
		env.HOBO_LOCAL_SECRETS_BACKEND ?? "openbao"
	).toLowerCase();
	const stationId = options?.stationId ?? env.HOBO_STATION_ID ?? "local";
	const svidJwt =
		(typeof env.HOBO_SVID_JWT === "string" && env.HOBO_SVID_JWT) ||
		`eyJhbGciOiJFUzI1NiJ9.station.${stationId}.fixture`;

	if (backend === "memory") {
		return createMemorySecretsPort({
			id: options?.id ?? `secrets:station-memory:${stationId}`,
		});
	}
	if (backend === "vault-jwt") {
		return createVaultJwtSecretsPort({
			vaultAddr:
				(typeof env.HOBO_VAULT_ADDR === "string" && env.HOBO_VAULT_ADDR) ||
				"https://vault.local",
			role:
				(typeof env.HOBO_VAULT_ROLE === "string" && env.HOBO_VAULT_ROLE) ||
				`hobo-station-${stationId}`,
			svidJwt,
			id: options?.id ?? `secrets:station-vault:${stationId}`,
		});
	}

	// Default + "openbao"
	const live =
		options?.offline === true
			? false
			: env.HOBO_OPENBAO_LIVE === "1" ||
				env.HOBO_OPENBAO_LIVE === "true";
	const fetchImpl =
		options?.fetch ??
		(live
			? (globalThis.fetch as FetchLike | undefined)
			: undefined);
	const openbaoAddr =
		(typeof env.HOBO_OPENBAO_ADDR === "string" && env.HOBO_OPENBAO_ADDR) ||
		(typeof env.OPENBAO_ADDR === "string" && env.OPENBAO_ADDR) ||
		"http://127.0.0.1:8200";
	const role =
		(typeof env.HOBO_OPENBAO_ROLE === "string" && env.HOBO_OPENBAO_ROLE) ||
		`hobo-station-${stationId}`;
	const namespace =
		typeof env.HOBO_OPENBAO_NAMESPACE === "string" &&
		env.HOBO_OPENBAO_NAMESPACE
			? env.HOBO_OPENBAO_NAMESPACE
			: undefined;
	const mountPath =
		typeof env.HOBO_OPENBAO_MOUNT === "string" && env.HOBO_OPENBAO_MOUNT
			? env.HOBO_OPENBAO_MOUNT
			: undefined;

	return createOpenBaoSecretsPort({
		openbaoAddr,
		role,
		svidJwt,
		offline: !live || fetchImpl === undefined,
		id: options?.id ?? `secrets:station-openbao:${stationId}`,
		...(namespace !== undefined ? { namespace } : {}),
		...(mountPath !== undefined ? { mountPath } : {}),
		...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
	});
}

/**
 * Camp-scoped secrets port factory — Bindle declares need; Camp selects backend.
 * OpenBao is residual only (JWT/SVID); never elevates above bound-resource.
 */
export function createCampSecretsPort(input: {
	readonly backend:
		| "memory"
		| "vault-jwt"
		| "openbao"
		| "aws-sm"
		| "azure-kv";
	readonly vaultAddr?: string;
	/** OpenBao address (preferred for backend openbao; falls back to vaultAddr). */
	readonly openbaoAddr?: string;
	readonly vaultRole?: string;
	readonly svidJwt?: string;
	readonly mountPath?: string;
	readonly namespace?: string;
	readonly region?: string;
	readonly vaultName?: string;
	readonly fetch?: FetchLike;
	readonly accessToken?: string;
	readonly offline?: boolean;
}): SecretsPort {
	switch (input.backend) {
		case "memory":
			return createMemorySecretsPort();
		case "vault-jwt":
			return createVaultJwtSecretsPort({
				vaultAddr: input.vaultAddr ?? "https://vault.local",
				role: input.vaultRole ?? "hobo-workload",
				svidJwt: input.svidJwt ?? "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
			});
		case "openbao":
			return createOpenBaoSecretsPort({
				openbaoAddr:
					input.openbaoAddr ??
					input.vaultAddr ??
					"https://openbao.local:8200",
				role: input.vaultRole ?? "hobo-workload",
				svidJwt: input.svidJwt ?? "eyJhbGciOiJFUzI1NiJ9.svid.fixture",
				...(input.mountPath !== undefined
					? { mountPath: input.mountPath }
					: {}),
				...(input.namespace !== undefined
					? { namespace: input.namespace }
					: {}),
				...(input.fetch !== undefined ? { fetch: input.fetch } : {}),
				...(input.offline !== undefined ? { offline: input.offline } : {}),
			});
		case "aws-sm":
			return createAwsSecretsManagerPort({
				region: input.region,
				...(input.fetch !== undefined ? { fetch: input.fetch } : {}),
				...(input.accessToken !== undefined
					? { accessToken: input.accessToken }
					: {}),
			});
		case "azure-kv":
			return createAzureKeyVaultPort({
				vaultName: input.vaultName,
				...(input.fetch !== undefined ? { fetch: input.fetch } : {}),
				...(input.accessToken !== undefined
					? { accessToken: input.accessToken }
					: {}),
			});
		default: {
			const _exhaustive: never = input.backend;
			throw new Error(`unknown secrets backend: ${_exhaustive}`);
		}
	}
}

/**
 * WIT-shaped hobo:secrets@0.1.0 store view over a SecretsPort (ADR-0113).
 * Residual managed-store surface only — not the preferred credential path.
 */
export function asHoboSecretsStore(port: SecretsPort): {
	put: (name: string, value: Uint8Array) => Promise<string>;
	access: (
		name: string,
	) => Promise<{ versionId: string; value: Uint8Array }>;
	accessVersion: (name: string, versionId: string) => Promise<Uint8Array>;
	listVersions: (name: string) => Promise<readonly string[]>;
} {
	return {
		async put(name, value) {
			const { versionId } = await port.put(
				name,
				Buffer.from(value).toString("utf8"),
			);
			return versionId;
		},
		async access(name) {
			const r = await port.access(name);
			if (r.status !== "ok" || r.material === undefined || !r.versionId) {
				throw new Error(r.status === "denied" ? r.reason : "access failed");
			}
			return {
				versionId: r.versionId,
				value: new Uint8Array(Buffer.from(r.material, "utf8")),
			};
		},
		async accessVersion(name, versionId) {
			const r = await port.accessVersion(name, versionId);
			if (r.status !== "ok" || r.material === undefined) {
				throw new Error(r.status === "denied" ? r.reason : "access failed");
			}
			return new Uint8Array(Buffer.from(r.material, "utf8"));
		},
		async listVersions(name) {
			return port.listVersions(name);
		},
	};
}

export type ResolvedConfigEntry = Readonly<{
	name: string;
	source: SecretSourceRank;
	/** Non-secret values only; secrets use placeholder. */
	value?: unknown;
	valueRef?: string;
	versionId?: string;
	sensitive: boolean;
	/** Agent-safe placeholder when sensitive. */
	placeholder: string;
}>;

export type ResolutionLadderInput = Readonly<{
	name: string;
	sensitive: boolean;
	preferredSource: SecretSourceRank;
	/** Allowed ranks from policy (deny-ceiling). */
	allowedSources: readonly SecretSourceRank[];
	/** Bound resource token path (no secret). */
	boundToken?: () => Promise<string | undefined>;
	/** Camp non-secret value. */
	campValue?: unknown;
	/** Secrets port for federation / static hatch. */
	secretsPort?: SecretsPort;
	/** Static hatch material (only when preferredSource is static-escape). */
	staticMaterial?: string;
	now?: string;
}>;

/**
 * Ranked resolution ladder (ADR-0027). Never returns plaintext for sensitive
 * fields into agent-facing structures (placeholder + valueRef only).
 */
export async function resolveConfigEntry(
	input: ResolutionLadderInput,
): Promise<
	| Readonly<{ status: "resolved"; entry: ResolvedConfigEntry }>
	| Readonly<{ status: "denied"; reason: string; code: string }>
> {
	const ranks: SecretSourceRank[] = [
		"bound-resource",
		"provider-federation",
		"camp-value",
		"static-escape",
	];
	// Try from preferred down the ladder, but only allowed ranks.
	const start = ranks.indexOf(input.preferredSource);
	const order = [
		...ranks.slice(Math.max(0, start)),
		...ranks.slice(0, Math.max(0, start)),
	].filter((r) => input.allowedSources.includes(r));

	for (const source of order) {
		if (source === "bound-resource" && input.boundToken) {
			const token = await input.boundToken();
			if (token) {
				return {
					status: "resolved",
					entry: {
						name: input.name,
						source,
						sensitive: input.sensitive,
						valueRef: `tokenref://bound/${input.name}`,
						placeholder: input.sensitive
							? `[REDACTED:bound-resource:${input.name}]`
							: String(token),
						...(input.sensitive ? {} : { value: token }),
					},
				};
			}
		}
		if (source === "provider-federation" && input.secretsPort) {
			const accessed = await input.secretsPort.access(input.name);
			if (accessed.status === "ok") {
				return {
					status: "resolved",
					entry: {
						name: input.name,
						source,
						sensitive: true,
						valueRef: accessed.valueRef,
						versionId: accessed.versionId,
						placeholder: `[REDACTED:provider-federation:${input.name}]`,
						// material stays broker-internal — not on agent-facing entry
					},
				};
			}
		}
		if (source === "camp-value" && input.campValue !== undefined) {
			if (input.sensitive) {
				// Sensitive must not come from camp-value.
				continue;
			}
			return {
				status: "resolved",
				entry: {
					name: input.name,
					source,
					sensitive: false,
					value: input.campValue,
					placeholder: String(input.campValue),
				},
			};
		}
		if (
			source === "static-escape" &&
			input.preferredSource === "static-escape" &&
			input.staticMaterial
		) {
			const versionId = `static-${randomUUID().slice(0, 8)}`;
			return {
				status: "resolved",
				entry: {
					name: input.name,
					source,
					sensitive: true,
					valueRef: `staticref://${input.name}/${versionId}`,
					versionId,
					placeholder: `[REDACTED:static-escape:${input.name}]`,
				},
			};
		}
	}

	return {
		status: "denied",
		reason: `no resolution path for ${input.name}`,
		code: "config-unresolved",
	};
}
