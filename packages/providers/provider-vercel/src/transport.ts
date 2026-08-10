/**
 * The HTTP boundary for the Vercel REST API, as an injected port.
 *
 * Nothing in this package reaches for a global `fetch`. A host supplies a
 * transport; the guard below is what makes any supplied transport safe — HTTPS
 * only, allowlisted official hosts, allowlisted path prefixes, no redirect
 * chasing, bounded body, bounded time. A driver that trusts its transport can
 * be pointed at an attacker's origin by one bad config value, and on this path
 * the request headers carry the sponsoring credential.
 */
import { redactProviderText, VercelProviderError } from "./provider-errors.js";

export type TransportMethod = "GET" | "POST" | "PUT" | "DELETE";

export type TransportRequest = {
	readonly method: TransportMethod;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly timeoutMs: number;
	readonly maxResponseBytes: number;
};

export type TransportResponse = {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
};

/**
 * Implementations MUST NOT follow redirects and MUST abort at `timeoutMs`.
 * The guard re-checks both, but a transport that silently follows a 302 has
 * already sent the credentialed request to the redirect target.
 */
export interface VercelTransport {
	request(request: TransportRequest): Promise<TransportResponse>;
}

export type TransportPolicy = {
	readonly allowedHosts: readonly string[];
	readonly allowedPathPrefixes: readonly string[];
	readonly maxResponseBytes: number;
	readonly timeoutMs: number;
};

/** The documented official REST origin. Nothing else is reachable. */
export const VERCEL_API_ALLOWED_HOSTS = ["api.vercel.com"] as const;

/** The dashboard host that serves the human claim ceremony. Never called. */
// public-contract: only host accepted for ownership-claim actions.
export const VERCEL_CLAIM_HOST = "vercel.com" as const;

/**
 * Path prefixes this driver uses, each pinned to a documented endpoint:
 * `POST /projects/{idOrName}/transfer-request`, `GET /v9/projects/{idOrName}`,
 * `DELETE /v3/user/tokens/{tokenId}`, and the marketplace installation surface.
 */
export const VERCEL_ALLOWED_PATH_PREFIXES = [
	"/projects/",
	"/v9/projects/",
	"/v3/user/tokens/",
	"/v1/installations/",
] as const;

export const DEFAULT_TRANSPORT_POLICY: TransportPolicy = {
	allowedHosts: VERCEL_API_ALLOWED_HOSTS,
	allowedPathPrefixes: VERCEL_ALLOWED_PATH_PREFIXES,
	maxResponseBytes: 256 * 1024,
	timeoutMs: 15_000,
};

/**
 * Parse an outbound URL against the policy. Returns the parsed URL so callers
 * cannot accidentally use the unchecked string.
 */
export function assertAllowedEndpoint(
	url: string,
	policy: TransportPolicy,
): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new VercelProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"request url is not a valid URL",
		);
	}
	if (parsed.protocol !== "https:") {
		throw new VercelProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			`request url must use https, got ${parsed.protocol.replace(":", "")}`,
		);
	}
	if (parsed.username !== "" || parsed.password !== "") {
		throw new VercelProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			"request url must not embed userinfo",
		);
	}
	if (parsed.port !== "" && parsed.port !== "443") {
		throw new VercelProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			`request url must use the default https port, got ${parsed.port}`,
		);
	}
	const host = parsed.hostname.toLowerCase();
	if (!policy.allowedHosts.includes(host)) {
		throw new VercelProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			`host ${host} is not an allowlisted official provider host`,
			{ detail: { host, allowed: policy.allowedHosts.join(",") } },
		);
	}
	if (
		!policy.allowedPathPrefixes.some((prefix) =>
			parsed.pathname.startsWith(prefix),
		)
	) {
		throw new VercelProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			`path ${parsed.pathname} is outside the allowlisted prefixes`,
			{ detail: { allowed: policy.allowedPathPrefixes.join(",") } },
		);
	}
	return parsed;
}

function headerValue(
	headers: Readonly<Record<string, string>>,
	name: string,
): string | undefined {
	const lower = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === lower) return value;
	}
	return undefined;
}

/**
 * Wrap any transport with the request/response invariants.
 *
 * A 3xx is rejected outright rather than followed: the REST API documents no
 * redirects on these endpoints, so one is either a contract change or a hijack,
 * and neither should silently resolve with the credential attached.
 */
export function createGuardedTransport(
	inner: VercelTransport,
	policy: TransportPolicy = DEFAULT_TRANSPORT_POLICY,
): VercelTransport {
	return {
		async request(request) {
			const url = assertAllowedEndpoint(request.url, policy);
			const timeoutMs = Math.min(request.timeoutMs, policy.timeoutMs);
			const maxResponseBytes = Math.min(
				request.maxResponseBytes,
				policy.maxResponseBytes,
			);
			if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
				throw new VercelProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					"request timeout must be positive",
				);
			}

			const response = await inner.request({
				...request,
				url: url.toString(),
				timeoutMs,
				maxResponseBytes,
			});

			if (response.status >= 300 && response.status < 400) {
				const location = headerValue(response.headers, "location") ?? "";
				throw new VercelProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`provider returned a ${response.status} redirect, which this driver never follows`,
					{
						detail: {
							status: response.status,
							location: redactProviderText(location, 120),
						},
					},
				);
			}

			const declared = Number(
				headerValue(response.headers, "content-length") ?? Number.NaN,
			);
			if (Number.isFinite(declared) && declared > maxResponseBytes) {
				throw new VercelProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`provider declared a ${declared} byte response, over the ${maxResponseBytes} byte cap`,
				);
			}
			if (Buffer.byteLength(response.body, "utf8") > maxResponseBytes) {
				throw new VercelProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`provider response exceeded the ${maxResponseBytes} byte cap`,
				);
			}

			return response;
		},
	};
}

/**
 * Minimal WHATWG-fetch adapter. `fetchImpl` is required — the point of the port
 * is that reaching the network is always something a host decided to hand over,
 * never something a library reached for.
 */
export function createFetchTransport(options: {
	readonly fetchImpl: typeof globalThis.fetch;
}): VercelTransport {
	const { fetchImpl } = options;
	return {
		async request(request) {
			const controller = new AbortController();
			const timer = setTimeout(() => {
				controller.abort();
			}, request.timeoutMs);
			try {
				const response = await fetchImpl(request.url, {
					method: request.method,
					headers: { ...request.headers },
					...(request.body !== undefined ? { body: request.body } : {}),
					redirect: "manual",
					signal: controller.signal,
				});
				const headers: Record<string, string> = {};
				response.headers.forEach((value, key) => {
					headers[key.toLowerCase()] = value;
				});
				const text = await response.text();
				if (Buffer.byteLength(text, "utf8") > request.maxResponseBytes) {
					throw new VercelProviderError(
						"PROVIDER_CONTRACT_CHANGED",
						`provider response exceeded the ${request.maxResponseBytes} byte cap`,
					);
				}
				return { status: response.status, headers, body: text };
			} catch (cause) {
				if (cause instanceof VercelProviderError) throw cause;
				// A timed-out or dropped request never proves the server did
				// nothing, so it can only be reported as ambiguous.
				throw new VercelProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`${request.method} to the provider did not complete`,
					{ cause, detail: { method: request.method } },
				);
			} finally {
				clearTimeout(timer);
			}
		},
	};
}
