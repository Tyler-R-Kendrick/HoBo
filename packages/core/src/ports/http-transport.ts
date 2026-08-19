/**
 * The credentialed HTTPS boundary every provider resolver runs over.
 *
 * HoBo's default deployment path talks to provider REST APIs directly — no IaC
 * engine sits in the middle — so this is the single place a deploy leaves the
 * process. Nothing here reaches for a global `fetch`: a host supplies an
 * `HttpTransport`, and `guardTransport` is what makes any supplied transport
 * safe to hand a credential. The request headers on this path carry the
 * sponsoring provider token, so a driver that trusts its transport can be
 * pointed at an attacker's origin by one bad config value.
 *
 * The guard generalizes the hardened Vercel boundary: HTTPS only, exact-match
 * allowlisted hosts, allowlisted path prefixes, no redirect chasing, bounded
 * body, bounded time. Every violation is a `TransportGuardError` carrying its
 * own code — the guard never clamps, never falls back, and never silently
 * downgrades a request into a weaker one, because a downgrade that still
 * reaches the network has already spent the credential.
 *
 * Two normalization rules are deliberate and load-bearing:
 *
 * - Host comparison is **exact** against the policy strings. WHATWG URL
 *   parsing already lowercases an ASCII authority and punycodes a non-ASCII
 *   one, so `https://API.Example.com` and `https://api.example.com` are the
 *   same host and both match an `api.example.com` entry. What the guard will
 *   not do is case-fold the *policy*: a mixed-case allowlist entry matches
 *   nothing. Repairing a policy typo is widening reach on a guess, and this
 *   guard fails closed instead.
 * - Dot segments are refused rather than resolved when they are
 *   percent-encoded. WHATWG resolves a literal `..` before the prefix check
 *   sees it, so `/v1/../admin` is checked as `/admin` and refused; `%2e%2e`
 *   and `%2f` survive parsing and would only be decoded by the provider, past
 *   every check here, so their presence is itself the refusal.
 *
 * Purity: no clock, no randomness, no ambient environment reads. The guard is
 * a pure function of the request, the policy, and the inner transport's reply.
 */

// public-contract: the closed HTTP method vocabulary a resolver may issue.
//
// `HEAD` is here because it is how S3 asks "does this bucket exist" —
// `HeadBucket` is the documented existence check, and the S3-compatible
// providers (DigitalOcean Spaces, Hetzner Object Storage) inherit it. A
// resolver forced to probe with a bodied `GET` instead would transfer a listing
// it does not want in order to learn one bit.
export const TRANSPORT_METHODS = Object.freeze([
	"GET",
	"HEAD",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
] as const);
export type TransportMethod = (typeof TRANSPORT_METHODS)[number];

/** One outbound call. `timeoutMs` and `maxResponseBytes` are never optional:
 *  an unbounded provider call is an outage waiting for a slow origin. */
export interface TransportRequest {
	readonly method: TransportMethod;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body?: string;
	readonly timeoutMs: number;
	readonly maxResponseBytes: number;
}

export interface TransportResponse {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

/**
 * Implementations MUST NOT follow redirects and MUST abort at `timeoutMs`.
 * The guard re-checks both, but a transport that silently follows a 302 has
 * already sent the credentialed request to the redirect target.
 */
export type HttpTransport = (
	request: TransportRequest,
) => Promise<TransportResponse>;

/** What a guarded transport is allowed to reach. Exact hosts, no wildcards:
 *  a wildcard entry turns one compromised subdomain into every subdomain. */
export interface TransportGuardPolicy {
	readonly allowedHosts: readonly string[];
	readonly allowedPathPrefixes: readonly string[];
	readonly maxTimeoutMs: number;
	readonly maxResponseBytes: number;
	/**
	 * Ports the policy admits, as strings, alongside the implicit default.
	 * Omitted means 443 only, which is what every SaaS provider wants and what
	 * this guard enforced before the field existed.
	 *
	 * It exists for the self-hosted case, and the Kubernetes apiserver is the
	 * one that forced it: a cluster's control plane listens on 6443, not 443,
	 * so without this a provider talking to an operator's own control plane
	 * would have to re-implement the whole guard to change one number — and a
	 * second copy of a security rule set drifts from the first. Widening is
	 * explicit, per policy, and visible in review; the default stays closed.
	 */
	readonly allowedPorts?: readonly string[];
}

// public-contract: every refusal a guarded transport can report.
export const TRANSPORT_GUARD_ERROR_CODES = Object.freeze([
	"TRANSPORT_SCHEME_FORBIDDEN",
	"TRANSPORT_HOST_FORBIDDEN",
	"TRANSPORT_PATH_FORBIDDEN",
	"TRANSPORT_TIMEOUT_EXCEEDED",
	"TRANSPORT_BODY_TOO_LARGE",
	"TRANSPORT_REDIRECT_REFUSED",
] as const);
export type TransportGuardErrorCode =
	(typeof TRANSPORT_GUARD_ERROR_CODES)[number];

/** Refusal from the transport guard. Always carries a code so a caller can
 *  branch on the reason rather than matching on a message. */
export class TransportGuardError extends Error {
	readonly code: TransportGuardErrorCode;

	constructor(code: TransportGuardErrorCode, message: string) {
		super(message);
		this.name = "TransportGuardError";
		this.code = code;
	}
}

/**
 * Wrap any transport so a bad config value cannot point it at an attacker
 * origin. The request headers on this path carry provider credentials.
 */
export function guardTransport(
	inner: HttpTransport,
	policy: TransportGuardPolicy,
): HttpTransport {
	return async (request: TransportRequest): Promise<TransportResponse> => {
		const url = assertAllowedEndpoint(request.url, policy);
		assertBoundedTimeout(request.timeoutMs, policy.maxTimeoutMs);
		const maxResponseBytes = assertBoundedResponseCap(
			request.maxResponseBytes,
			policy.maxResponseBytes,
		);

		const response = await inner({ ...request, url: url.toString() });

		assertNotRedirect(response);
		assertBoundedBody(response, maxResponseBytes);
		return response;
	};
}

/** Ports this policy admits. 443 is always in the set; the rest are declared. */
function allowedPorts(policy: TransportGuardPolicy): readonly string[] {
	const declared = policy.allowedPorts ?? [];
	return declared.includes("443") ? declared : ["443", ...declared];
}

/**
 * Parse an outbound URL against the policy. Returns the parsed URL so the
 * caller cannot accidentally reuse the unchecked string.
 */
function assertAllowedEndpoint(
	url: unknown,
	policy: TransportGuardPolicy,
): URL {
	if (typeof url !== "string" || url.trim().length === 0) {
		throw new TransportGuardError(
			"TRANSPORT_SCHEME_FORBIDDEN",
			"request url must be a non-empty https URL string",
		);
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		// An unparseable URL has no scheme this guard has verified, so it is
		// refused on the scheme rather than guessed at.
		throw new TransportGuardError(
			"TRANSPORT_SCHEME_FORBIDDEN",
			"request url is not a valid absolute URL",
		);
	}
	if (parsed.protocol !== "https:") {
		throw new TransportGuardError(
			"TRANSPORT_SCHEME_FORBIDDEN",
			`request url must use https, got ${parsed.protocol.replace(":", "")}`,
		);
	}
	if (parsed.username !== "" || parsed.password !== "") {
		throw new TransportGuardError(
			"TRANSPORT_HOST_FORBIDDEN",
			"request url must not embed userinfo: credentials belong in headers a host injected, and userinfo hides the real host from a casual read",
		);
	}
	// An empty port is the URL's way of saying 443, so it always passes; any
	// other port must be named by the policy. Naming it is the whole check —
	// the guard never infers a port from the host or repairs a mismatch.
	if (parsed.port !== "" && !allowedPorts(policy).includes(parsed.port)) {
		throw new TransportGuardError(
			"TRANSPORT_HOST_FORBIDDEN",
			`request url must use the default https port or one this policy allows (${allowedPorts(policy).join(", ")}), got ${parsed.port}`,
		);
	}
	if (!policy.allowedHosts.includes(parsed.hostname)) {
		throw new TransportGuardError(
			"TRANSPORT_HOST_FORBIDDEN",
			`host ${parsed.hostname} is not exactly one of the allowlisted provider hosts (${policy.allowedHosts.join(", ") || "none"})`,
		);
	}
	assertAllowedPath(parsed, policy);
	return parsed;
}

/**
 * `parsed.pathname` has already had literal dot segments resolved by WHATWG
 * parsing, so the prefix check sees the path the origin will route on — with
 * one exception: percent-encoded separators survive parsing and are decoded
 * only by the provider, past every check here. Their presence is the refusal.
 */
function assertAllowedPath(parsed: URL, policy: TransportGuardPolicy): void {
	const path = parsed.pathname;
	if (/%2e|%2f|%5c/iu.test(path)) {
		throw new TransportGuardError(
			"TRANSPORT_PATH_FORBIDDEN",
			`path ${path} percent-encodes a path separator or dot segment, which this guard refuses rather than decodes: only the origin would resolve it, after every check here has passed`,
		);
	}
	if (!policy.allowedPathPrefixes.some((prefix) => path.startsWith(prefix))) {
		throw new TransportGuardError(
			"TRANSPORT_PATH_FORBIDDEN",
			`path ${path} is outside the allowlisted prefixes (${policy.allowedPathPrefixes.join(", ") || "none"})`,
		);
	}
}

/** A request over the policy cap is refused, never clamped: a clamp turns an
 *  authoring mistake into a mystery timeout instead of a named refusal. */
function assertBoundedTimeout(timeoutMs: unknown, maxTimeoutMs: number): void {
	if (
		typeof timeoutMs !== "number" ||
		!Number.isFinite(timeoutMs) ||
		timeoutMs <= 0
	) {
		throw new TransportGuardError(
			"TRANSPORT_TIMEOUT_EXCEEDED",
			`request timeoutMs must be a positive finite number, received ${String(timeoutMs)}`,
		);
	}
	if (!Number.isFinite(maxTimeoutMs) || maxTimeoutMs <= 0) {
		throw new TransportGuardError(
			"TRANSPORT_TIMEOUT_EXCEEDED",
			`policy maxTimeoutMs must be a positive finite number, received ${String(maxTimeoutMs)}`,
		);
	}
	if (timeoutMs > maxTimeoutMs) {
		throw new TransportGuardError(
			"TRANSPORT_TIMEOUT_EXCEEDED",
			`request timeoutMs ${timeoutMs} exceeds the policy cap of ${maxTimeoutMs}`,
		);
	}
}

function assertBoundedResponseCap(
	maxResponseBytes: unknown,
	policyCap: number,
): number {
	if (
		typeof maxResponseBytes !== "number" ||
		!Number.isFinite(maxResponseBytes) ||
		maxResponseBytes <= 0
	) {
		throw new TransportGuardError(
			"TRANSPORT_BODY_TOO_LARGE",
			`request maxResponseBytes must be a positive finite number, received ${String(maxResponseBytes)}`,
		);
	}
	if (!Number.isFinite(policyCap) || policyCap <= 0) {
		throw new TransportGuardError(
			"TRANSPORT_BODY_TOO_LARGE",
			`policy maxResponseBytes must be a positive finite number, received ${String(policyCap)}`,
		);
	}
	if (maxResponseBytes > policyCap) {
		throw new TransportGuardError(
			"TRANSPORT_BODY_TOO_LARGE",
			`request maxResponseBytes ${maxResponseBytes} exceeds the policy cap of ${policyCap}`,
		);
	}
	return maxResponseBytes;
}

/**
 * A 3xx carrying a Location is rejected outright rather than followed: the
 * provider APIs on this path document no redirects, so one is either a
 * contract change or a hijack, and neither should silently resolve with the
 * credential attached. A 3xx without a Location (a 304, say) is a normal
 * cache answer and passes through.
 */
function assertNotRedirect(response: TransportResponse): void {
	if (response.status < 300 || response.status >= 400) return;
	const location = headerValue(response.headers, "location");
	if (location === undefined) return;
	throw new TransportGuardError(
		"TRANSPORT_REDIRECT_REFUSED",
		`provider returned a ${response.status} redirect, which this transport never follows`,
	);
}

function assertBoundedBody(
	response: TransportResponse,
	maxResponseBytes: number,
): void {
	const declared = Number(
		headerValue(response.headers, "content-length") ?? Number.NaN,
	);
	if (Number.isFinite(declared) && declared > maxResponseBytes) {
		throw new TransportGuardError(
			"TRANSPORT_BODY_TOO_LARGE",
			`provider declared a ${declared} byte response, over the ${maxResponseBytes} byte cap`,
		);
	}
	if (utf8ByteLength(response.body) > maxResponseBytes) {
		throw new TransportGuardError(
			"TRANSPORT_BODY_TOO_LARGE",
			`provider response exceeded the ${maxResponseBytes} byte cap`,
		);
	}
}

/** Case-insensitive header lookup: header names are not case-significant, and
 *  a guard that only matched one casing would be trivially bypassed. */
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
 * UTF-8 byte length without allocating an encoded copy. A `TextEncoder` round
 * trip would materialize a second buffer the size of a body the guard is about
 * to refuse for being too large, which is the wrong way round.
 */
function utf8ByteLength(value: string): number {
	let bytes = 0;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code < 0x80) {
			bytes += 1;
		} else if (code < 0x800) {
			bytes += 2;
		} else if (code >= 0xd800 && code <= 0xdbff) {
			const next = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
			if (next >= 0xdc00 && next <= 0xdfff) {
				bytes += 4;
				index += 1;
			} else {
				// A lone surrogate encodes as U+FFFD, which is three bytes.
				bytes += 3;
			}
		} else {
			bytes += 3;
		}
	}
	return bytes;
}
