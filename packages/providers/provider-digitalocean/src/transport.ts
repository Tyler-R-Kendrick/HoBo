/**
 * The DigitalOcean-scoped guard policy for the injected HTTP transport.
 *
 * Why this module exists: the resolvers in `./resolvers.ts` call the
 * DigitalOcean API directly — there is no IaC engine in the middle — and every
 * one of those requests carries a live personal access token in its
 * `authorization` header. A driver that trusts whatever transport (and whatever
 * URL) it is handed can be pointed at an attacker's origin by one bad config
 * value, and the token goes with it. So the transport is always injected, and
 * the policy below is what makes an injected transport safe on this path:
 * HTTPS only, one exact host, one path prefix, no redirect chasing, bounded
 * body, bounded time. Enforcement itself lives in `guardTransport()` in
 * `@hobo/core`; this module owns only the DigitalOcean-specific numbers and
 * hosts, so the rule set cannot drift per provider package.
 *
 * DigitalOcean is the easy case for a guard and this module does not pretend
 * otherwise: the whole v2 control plane is one host and one prefix, so the
 * policy is a constant rather than something built per region. The one API
 * surface that is *not* on this host is Spaces, which speaks S3 on
 * `<region>.digitaloceanspaces.com` with SigV4 — a different host, a different
 * signature, and therefore deliberately not allowlisted here. That is why
 * `digitalocean.spaces/v1` ships no resolver rather than a resolver reaching a
 * host this policy would have to be widened for.
 *
 * Nothing here reaches for a global `fetch`. Reaching the network is always
 * something a host decided to hand over, never something a library reached for.
 *
 * HONEST SCOPE: the guard constrains the request this package composes and the
 * response it accepts. It cannot prove the injected transport honours
 * `timeoutMs`, refuses to follow a 302 itself, or terminates TLS against the
 * real DigitalOcean certificate — those are the host's obligations. Passing the
 * guard is not evidence that a live call was made.
 */

import {
	guardTransport,
	type HttpTransport,
	type TransportGuardPolicy,
} from "@hobo/core";

// public-contract: the single host every DigitalOcean control-plane call reaches.
export const DIGITALOCEAN_API_HOST = "api.digitalocean.com";

// public-contract: the path allowlist for the DigitalOcean transport guard.
export const DIGITALOCEAN_ALLOWED_PATH_PREFIXES = Object.freeze([
	"/v2/",
] as const);

/**
 * Caps. These are control-plane calls: small bodies, quick answers. A response
 * larger or slower than this is a contract change, not a big success.
 */
export const DIGITALOCEAN_MAX_TIMEOUT_MS = 20_000;
export const DIGITALOCEAN_MAX_RESPONSE_BYTES = 512 * 1024;

/** Refusal from this module, kept structural so callers can branch on it. */
export class DigitalOceanTransportConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DigitalOceanTransportConfigError";
	}
}

/**
 * The DigitalOcean guard policy. A function rather than a constant so a caller
 * always receives the frozen policy this package stands behind and can never
 * mutate a shared object out from under another caller.
 */
export function digitaloceanTransportPolicy(): TransportGuardPolicy {
	return Object.freeze({
		allowedHosts: Object.freeze([DIGITALOCEAN_API_HOST]),
		allowedPathPrefixes: DIGITALOCEAN_ALLOWED_PATH_PREFIXES,
		maxTimeoutMs: DIGITALOCEAN_MAX_TIMEOUT_MS,
		maxResponseBytes: DIGITALOCEAN_MAX_RESPONSE_BYTES,
	});
}

/**
 * Wrap an injected transport with the DigitalOcean policy. This is the only
 * transport the resolvers should ever be handed; passing an unguarded one is
 * legal TypeScript and a security defect.
 */
export function guardedDigitalOceanTransport(
	inner: HttpTransport,
): HttpTransport {
	return guardTransport(inner, digitaloceanTransportPolicy());
}

/**
 * Build an absolute DigitalOcean API URL.
 *
 * Callers pass an already-encoded path (and query); this only joins, so a
 * caller that forgets to encode a name gets a URL the guard will judge, not a
 * silently repaired one.
 */
export function digitaloceanApiUrl(path: string): string {
	const suffix = path.startsWith("/") ? path : `/${path}`;
	if (!suffix.startsWith("/v2/")) {
		throw new DigitalOceanTransportConfigError(
			`digitalocean api path ${JSON.stringify(path)} does not start with /v2/; the guard allowlists that prefix only, and a path outside it would be refused at the transport with a less useful message`,
		);
	}
	return `https://${DIGITALOCEAN_API_HOST}${suffix}`;
}
