/**
 * The registry HTTP boundary, as an injected port.
 *
 * Nothing here reaches for a global `fetch`. A host supplies a transport, and the
 * guard below is what makes any supplied transport safe: HTTPS only, one
 * allowlisted origin, the `/v2/` distribution surface only, no redirect chasing,
 * bounded body, bounded time.
 *
 * Two of the rules are specific to an anonymous registry and worth stating plainly.
 *
 * **No credential leaves this package.** The guard refuses to send `authorization`,
 * `proxy-authorization`, `cookie`, or `x-registry-auth`, and it refuses a URL with
 * userinfo in it. ttl.sh authenticates nobody, so a credential on a request to it
 * could only be an accident, and the cost of that accident is a secret mailed to a
 * public service. The refusal happens before the request leaves the process.
 *
 * **A 401 is a contract change, not a prompt.** There is no token exchange here and
 * no code path that could acquire one. Being challenged means the thing answering
 * is not the service this package was written against, and continuing would be
 * guessing.
 *
 * Everything else — including a 404, which is the registry's normal end state, and
 * a 429 — is returned to the caller to interpret through `ttlShErrorForStatus`.
 */
import {
	redactProviderText,
	TtlShProviderError,
	ttlShErrorForStatus,
} from "./errors.js";
import { TTL_SH_REGISTRY_HOST } from "./reference.js";

export type TransportMethod =
	| "GET"
	| "HEAD"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE";

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
 * already sent the request to the redirect target.
 */
export interface TtlShTransport {
	request(request: TransportRequest): Promise<TransportResponse>;
}

export type TransportPolicy = {
	readonly allowedHosts: readonly string[];
	readonly allowedPathPrefix: string;
	readonly maxResponseBytes: number;
	readonly timeoutMs: number;
};

/**
 * One origin, exact match.
 *
 * Deliberately not a suffix match: `registry.ttl.sh` and `ttl.sh.evil.example.com`
 * both pass a naive `endsWith`, and one of them is somebody else's host.
 */
export const TTL_SH_REGISTRY_POLICY: TransportPolicy = {
	allowedHosts: [TTL_SH_REGISTRY_HOST],
	allowedPathPrefix: "/v2/",
	maxResponseBytes: 64 * 1024,
	timeoutMs: 15_000,
};

/** Headers that must never leave this package. */
export const FORBIDDEN_REQUEST_HEADERS = [
	"authorization",
	"proxy-authorization",
	"cookie",
	"x-registry-auth",
] as const;

function notAllowed(detail: string, extra: Record<string, string> = {}): never {
	throw new TtlShProviderError("TRANSPORT_NOT_ALLOWED", detail, {
		detail: extra,
	});
}

export function assertAllowedEndpoint(
	url: string,
	policy: TransportPolicy,
): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		notAllowed("request url is not a valid URL");
	}
	if (parsed.username !== "" || parsed.password !== "") {
		// Reported as a credential rather than as a malformed URL: userinfo in a
		// registry URL is a secret in every log line that records the URL.
		throw new TtlShProviderError(
			"CREDENTIAL_REFUSED",
			`refusing a request url with embedded userinfo; ${TTL_SH_REGISTRY_HOST} authenticates nobody, so a credential here could only leak`,
		);
	}
	if (parsed.protocol !== "https:") {
		notAllowed(
			`request url must use https, got ${parsed.protocol.replace(":", "")}`,
		);
	}
	if (parsed.port !== "" && parsed.port !== "443") {
		notAllowed(
			`request url must use the default https port, got ${parsed.port}`,
			{
				port: parsed.port,
			},
		);
	}
	const host = parsed.hostname.toLowerCase();
	if (!policy.allowedHosts.includes(host)) {
		notAllowed(
			`host ${host} is not the allowlisted ephemeral registry origin`,
			{
				host,
				allowed: policy.allowedHosts.join(","),
			},
		);
	}
	if (!parsed.pathname.startsWith(policy.allowedPathPrefix)) {
		notAllowed(
			`path ${parsed.pathname} is outside the allowlisted ${policy.allowedPathPrefix} distribution surface`,
		);
	}
	return parsed;
}

export function assertNoCredentialHeaders(
	headers: Readonly<Record<string, string>>,
): void {
	for (const key of Object.keys(headers)) {
		if (
			(FORBIDDEN_REQUEST_HEADERS as readonly string[]).includes(
				key.toLowerCase(),
			)
		) {
			throw new TtlShProviderError(
				"CREDENTIAL_REFUSED",
				`refusing to send ${key.toLowerCase()} to ${TTL_SH_REGISTRY_HOST}; the service documents no authentication, so a credential here could only be an accident`,
				{ detail: { header: key.toLowerCase() } },
			);
		}
	}
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

export function createGuardedTransport(
	inner: TtlShTransport,
	policy: TransportPolicy = TTL_SH_REGISTRY_POLICY,
): TtlShTransport {
	return {
		async request(request) {
			const url = assertAllowedEndpoint(request.url, policy);
			assertNoCredentialHeaders(request.headers);
			const timeoutMs = Math.min(request.timeoutMs, policy.timeoutMs);
			const maxResponseBytes = Math.min(
				request.maxResponseBytes,
				policy.maxResponseBytes,
			);
			if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
				notAllowed("request timeout must be positive");
			}

			const response = await inner.request({
				...request,
				url: url.toString(),
				timeoutMs,
				maxResponseBytes,
			});

			if (response.status >= 300 && response.status < 400) {
				const location = headerValue(response.headers, "location") ?? "";
				throw new TtlShProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`ttl.sh returned a ${response.status} redirect, which this transport never follows`,
					{
						detail: {
							status: response.status,
							location: redactProviderText(location, 120),
						},
					},
				);
			}
			if (response.status === 401 || response.status === 403) {
				// Raised here rather than returned: there is no credential to
				// supply and no retry that would help, so handing the challenge
				// back would only invite a caller to invent one.
				throw ttlShErrorForStatus(response.status, {
					method: request.method,
					body: response.body,
				});
			}

			const declared = Number(
				headerValue(response.headers, "content-length") ?? Number.NaN,
			);
			if (Number.isFinite(declared) && declared > maxResponseBytes) {
				throw new TtlShProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`ttl.sh declared a ${declared} byte response, over the ${maxResponseBytes} byte cap`,
				);
			}
			if (Buffer.byteLength(response.body, "utf8") > maxResponseBytes) {
				throw new TtlShProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`ttl.sh response exceeded the ${maxResponseBytes} byte cap`,
				);
			}

			return response;
		},
	};
}

/**
 * Minimal WHATWG-fetch adapter. `fetchImpl` is required — the point of the port is
 * that reaching the network is always something a host decided to hand over, never
 * something a library reached for.
 */
export function createFetchTransport(options: {
	readonly fetchImpl: typeof globalThis.fetch;
}): TtlShTransport {
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
					throw new TtlShProviderError(
						"PROVIDER_CONTRACT_CHANGED",
						`ttl.sh response exceeded the ${request.maxResponseBytes} byte cap`,
					);
				}
				return { status: response.status, headers, body: text };
			} catch (cause) {
				if (cause instanceof TtlShProviderError) throw cause;
				// A dropped request never proves the registry did nothing.
				throw new TtlShProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`${request.method} to ${TTL_SH_REGISTRY_HOST} did not complete`,
					{ cause, detail: { method: request.method } },
				);
			} finally {
				clearTimeout(timer);
			}
		},
	};
}
