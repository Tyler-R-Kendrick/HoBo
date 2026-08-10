/**
 * Stable HoBo error codes for the ttl.sh ephemeral artifact transport.
 *
 * Two of these codes carry most of the meaning of this package.
 *
 * `CREDENTIAL_REFUSED` is not a failure to authenticate — it is this package
 * refusing to *try*. ttl.sh documents no authentication, so a credential heading
 * towards it could only be an accident (an ambient Docker config, a proxy that
 * adds a header, a helper written for a private registry), and the consequence of
 * that accident is a secret mailed to an anonymous public service.
 *
 * `LEASE_EXPIRED` is the registry's only teardown. There is nothing to delete and
 * nothing to release; artifacts simply stop existing. A 404 is therefore the
 * expected end state rather than a failure to explain away, which is why it maps
 * here and is **not** retryable: the fix is a new push, and a retry loop against a
 * reaped artifact is a loop that ends at a timeout.
 *
 * Registry and tool text is never interpolated verbatim. Anyone can push a
 * repository name to ttl.sh, so its error bodies are attacker-influenced, and an
 * error message is the one string that reliably reaches a log, a receipt, and a
 * support ticket.
 */

export const TTL_SH_ERROR_CODES = [
	/** A host, scheme, port, or path outside the single allowlisted origin. */
	"TRANSPORT_NOT_ALLOWED",
	/** Credential-shaped material heading for a registry that authenticates nobody. */
	"CREDENTIAL_REFUSED",
	/** A malformed reference, digest, or push instant. */
	"INVALID_IMAGE_REFERENCE",
	/** A name a stranger could try. On an anonymous registry the name is the lock. */
	"GUESSABLE_ARTIFACT_NAME",
	/** A TTL outside the documented minutes-to-24-hours window, or in a unit ttl.sh does not document. */
	"TTL_OUT_OF_RANGE",
	/** An argv this package will not spawn: unknown binary, unallowlisted flag, control character. */
	"UNSAFE_TOOL_INVOCATION",
	/** The push definitely did not land. */
	"ARTIFACT_PUSH_FAILED",
	/** A live reference already carries different content. */
	"REFERENCE_REUSED",
	/** The TTL has elapsed, so the registry has deleted the artifact. */
	"LEASE_EXPIRED",
	/** Asked to hold something this transport must not hold. */
	"ARTIFACT_DURABLE_USE_REFUSED",
	/** The promotion destination is not a registry anybody is responsible for. */
	"PROMOTION_TARGET_INVALID",
	"PROVIDER_RATE_LIMITED",
	"PROVIDER_UNAVAILABLE",
	/** The request did not complete, so the registry's state is unknown. */
	"PROVIDER_OPERATION_AMBIGUOUS",
	/** The registry answered in a way its documented contract does not describe. */
	"PROVIDER_CONTRACT_CHANGED",
] as const;

export type TtlShErrorCode = (typeof TTL_SH_ERROR_CODES)[number];

export type TtlShErrorDetail = Readonly<
	Record<string, string | number | boolean>
>;

export type TtlShErrorOptions = {
	/** Safe to repeat the operation verbatim. Ambiguity is never retryable. */
	readonly retryable?: boolean;
	readonly retryAfterMs?: number;
	readonly detail?: TtlShErrorDetail;
	readonly cause?: unknown;
};

/**
 * A digest is the artifact's identity, not a secret, and neither is the
 * content-addressed name derived from it. Both are masked out before the credential
 * rules run and restored afterwards.
 */
const DIGEST_SHAPED = /\bsha(?:256|512)[:-][0-9a-f]{32,128}\b/giu;

const DIGEST_PLACEHOLDER = "\u0001DIGEST\u0002";

const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	/\b(?:Bearer|Basic)\s+\S+/giu,
	/\b(?:password|passwd|token|secret|auth)\s*[=:]\s*\S+/giu,
	/\b(?:sk|pk|ghp|gho|ghs|glpat)[-_][A-Za-z0-9_-]{8,}/giu,
	/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/giu,
	/\/\/[^/\s:@]+:[^/\s:@]+@/giu,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/giu,
	// A long opaque run with no recognisable prefix, for credential formats nobody
	// has catalogued yet. Deliberately excludes `/` and `.`, so a URL path is not
	// mistaken for one long token — the identifiers worth keeping (digests,
	// content-addressed names) are masked out above, but a redaction that ate every
	// registry path would make the error messages useless.
	/\b[A-Za-z0-9+_-]{40,}={0,2}\b/gu,
];

// biome-ignore lint/suspicious/noControlCharactersInRegex: flattening control characters out of registry text is the point; a raw CR/LF in a message is log forging.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/gu;

/**
 * Redact credential-shaped material and flatten control characters.
 *
 * Digests survive: they identify the artifact, they appear in every receipt, and a
 * redaction that ate them would make the audit trail useless.
 */
export function redactProviderText(text: string, maxLength = 256): string {
	const digests: string[] = [];
	let out = text.replace(DIGEST_SHAPED, (match) => {
		digests.push(match);
		return DIGEST_PLACEHOLDER;
	});
	for (const pattern of CREDENTIAL_PATTERNS)
		out = out.replace(pattern, "[redacted]");
	let index = 0;
	out = out.replace(
		new RegExp(DIGEST_PLACEHOLDER, "gu"),
		() => digests[index++] ?? "",
	);
	out = out.replace(CONTROL_CHARS, " ").trim();
	return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

function redactDetail(
	detail: TtlShErrorDetail,
): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(detail)) {
		out[key] =
			typeof value === "string" ? redactProviderText(value, 180) : value;
	}
	return out;
}

export class TtlShProviderError extends Error {
	readonly code: TtlShErrorCode;
	readonly retryable: boolean;
	readonly retryAfterMs?: number;
	readonly detail: TtlShErrorDetail;

	constructor(
		code: TtlShErrorCode,
		message: string,
		options: TtlShErrorOptions = {},
	) {
		super(
			redactProviderText(message),
			options.cause !== undefined ? { cause: options.cause } : {},
		);
		this.name = "TtlShProviderError";
		this.code = code;
		this.retryable = options.retryable ?? false;
		if (options.retryAfterMs !== undefined)
			this.retryAfterMs = options.retryAfterMs;
		// Detail is redacted as well as the message. A detail field is the more
		// likely leak of the two: it is where tool stderr and response bodies end
		// up, and it is serialised verbatim into receipts and log records.
		this.detail = Object.freeze(redactDetail(options.detail ?? {}));
	}

	/** Receipt-safe projection. Already redacted by construction. */
	toJSON(): {
		readonly name: string;
		readonly code: TtlShErrorCode;
		readonly message: string;
		readonly retryable: boolean;
		readonly retryAfterMs?: number;
		readonly detail: TtlShErrorDetail;
	} {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			retryable: this.retryable,
			...(this.retryAfterMs !== undefined
				? { retryAfterMs: this.retryAfterMs }
				: {}),
			detail: this.detail,
		};
	}
}

export function isTtlShProviderError(
	value: unknown,
): value is TtlShProviderError {
	return value instanceof TtlShProviderError;
}

/** Methods whose repetition is free of consequence. */
const IDEMPOTENT: readonly string[] = ["GET", "HEAD"];

/**
 * Map a registry HTTP status onto a HoBo code.
 *
 * A `401` or `403` is a **contract change**, not an auth failure: the service this
 * package was written against asks for nothing, so being challenged means the thing
 * on the other end is not that service. There is no code path that answers.
 */
export function ttlShErrorForStatus(
	status: number,
	options: {
		readonly method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
		readonly body?: string;
		readonly retryAfterMs?: number;
	},
): TtlShProviderError {
	const body =
		options.body === undefined ? "" : redactProviderText(options.body, 180);
	const detail: TtlShErrorDetail = {
		status,
		method: options.method,
		...(body ? { body } : {}),
	};
	if (status === 401 || status === 403) {
		return new TtlShProviderError(
			"PROVIDER_CONTRACT_CHANGED",
			`ttl.sh returned ${status}; this transport is anonymous by design, holds no credentials, and will not answer an authentication challenge`,
			{ detail },
		);
	}
	if (status === 404) {
		return new TtlShProviderError(
			"LEASE_EXPIRED",
			"ttl.sh returned 404; the artifact's TTL has elapsed or it was never pushed. Push again rather than retrying.",
			{ detail },
		);
	}
	if (status === 429) {
		return new TtlShProviderError(
			"PROVIDER_RATE_LIMITED",
			"ttl.sh rate limited the request",
			{
				retryable: true,
				...(options.retryAfterMs !== undefined
					? { retryAfterMs: options.retryAfterMs }
					: {}),
				detail,
			},
		);
	}
	if (status >= 500) {
		// A 5xx on a read is safe to repeat. A 5xx on an upload is
		// indistinguishable from "stored but not acknowledged".
		return IDEMPOTENT.includes(options.method)
			? new TtlShProviderError(
					"PROVIDER_UNAVAILABLE",
					`ttl.sh returned ${status}`,
					{
						retryable: true,
						detail,
					},
				)
			: new TtlShProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`ttl.sh returned ${status} to a ${options.method}; the artifact may or may not be there`,
					{ detail },
				);
	}
	return new TtlShProviderError(
		"PROVIDER_CONTRACT_CHANGED",
		`ttl.sh returned an unexpected ${status}`,
		{ detail },
	);
}
