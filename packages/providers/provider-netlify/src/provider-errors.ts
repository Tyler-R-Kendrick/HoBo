/**
 * Stable HoBo error codes for the Netlify anonymous-static claim strategy.
 *
 * The anonymous path is the one where redaction matters most. An unauthenticated
 * deploy hands back a claim URL that *is* the site: whoever opens it owns the
 * project. CLI output and API bodies are therefore treated as hostile text and
 * scrubbed before they can reach a message, a log line, or a receipt.
 */

export const PROVIDER_ERROR_CODES = [
	"PROVIDER_RATE_LIMITED",
	"PROVIDER_AUTH_FAILED",
	"PROVIDER_CONTRACT_CHANGED",
	"PROVIDER_OPERATION_AMBIGUOUS",
	"PROVIDER_TOOL_UNAVAILABLE",
	"PROVIDER_TOOL_VERSION_UNSUPPORTED",
	"CAPABILITY_NOT_SUPPORTED",
	"CLAIM_EXPIRED",
	"CLAIM_NOT_VERIFIED",
	"CLAIM_PARTIALLY_COMPLETED",
	"CLAIM_REPAIR_REQUIRED",
	"BINDING_ROTATION_REQUIRED",
	"BOOTSTRAP_AUTHORITY_REMAINS",
	"CLEANUP_FAILED",
	"SECRET_CUSTODY_UNAVAILABLE",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export type ProviderErrorDetail = Readonly<
	Record<string, string | number | boolean>
>;

export type ProviderErrorOptions = {
	/** Safe to repeat the operation verbatim. Ambiguity is never retryable. */
	readonly retryable?: boolean;
	readonly retryAfterMs?: number;
	readonly detail?: ProviderErrorDetail;
	readonly cause?: unknown;
};

/** Shapes that must never survive into an error message, log line, or receipt. */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	// The claim URL carries its session material in the fragment, so the
	// fragment has to go with it.
	/https?:\/\/[^\s"']*app\.netlify\.com\/claim\S*/giu,
	/\bBearer\s+\S+/giu,
	// nfp_… is Netlify's personal access token prefix; nf_ covers session ids.
	/\bnf(?:p)?_[A-Za-z0-9]{8,}/giu,
	// A database URL with inline credentials. CLI and build output carries
	// `DATABASE_URL` more often than it carries anything Netlify-shaped, and
	// the password sits in the authority section where no other pattern looks.
	/\b[a-z][a-z0-9+.-]*:\/\/[^\s"':/@]+:[^\s"'/@]+@\S+/giu,
	// The key name may be prefixed (`NETLIFY_AUTH_TOKEN`), and `_` is a word
	// character, so a leading \b would not match. Anchor on the separator
	// instead and let the prefix be anything non-spacing.
	/[A-Za-z0-9_-]*(?:access[_-]?token|auth[_-]?token|api[_-]?key|secret[_-]?key|session[_-]?id)\s*[=:]\s*\S+/giu,
	/[A-Za-z0-9_-]*(?:password|passwd|pwd)\s*[=:]\s*\S+/giu,
	/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.\S*/giu,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu,
];

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point — CLI output is full of them and an unflattened escape sequence can forge a log record.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/gu;

/**
 * Replace anything credential-shaped with a marker and flatten control
 * characters, which CLI output has plenty of and which can otherwise forge a
 * log record.
 */
export function redactProviderText(text: string, maxLength = 256): string {
	let out = text;
	for (const pattern of CREDENTIAL_PATTERNS)
		out = out.replace(pattern, "[redacted]");
	out = out
		.replace(CONTROL_CHARS, " ")
		.replace(/\s{2,}/gu, " ")
		.trim();
	return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

export class NetlifyProviderError extends Error {
	readonly code: ProviderErrorCode;
	readonly retryable: boolean;
	readonly retryAfterMs?: number;
	readonly detail: ProviderErrorDetail;

	constructor(
		code: ProviderErrorCode,
		message: string,
		options: ProviderErrorOptions = {},
	) {
		super(
			redactProviderText(message),
			options.cause !== undefined ? { cause: options.cause } : {},
		);
		this.name = "NetlifyProviderError";
		this.code = code;
		this.retryable = options.retryable ?? false;
		if (options.retryAfterMs !== undefined)
			this.retryAfterMs = options.retryAfterMs;
		this.detail = Object.freeze({ ...(options.detail ?? {}) });
	}

	/** Receipt-safe projection. Already redacted by construction. */
	toJSON(): {
		readonly name: string;
		readonly code: ProviderErrorCode;
		readonly message: string;
		readonly retryable: boolean;
		readonly retryAfterMs?: number;
		readonly detail: ProviderErrorDetail;
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

export function isNetlifyProviderError(
	value: unknown,
): value is NetlifyProviderError {
	return value instanceof NetlifyProviderError;
}

export type ProviderStatusContext = {
	readonly method: "GET" | "POST" | "PUT" | "DELETE";
	readonly operation: string;
	readonly body?: string;
	readonly retryAfterMs?: number;
};

/**
 * Map a Netlify API status onto a HoBo code.
 *
 * 401/403 is load-bearing rather than incidental on this path: after a claim,
 * losing access with the anonymous credential is the evidence that the
 * credential no longer controls the site.
 */
export function providerErrorForStatus(
	status: number,
	context: ProviderStatusContext,
): NetlifyProviderError {
	const body =
		context.body === undefined ? "" : redactProviderText(context.body, 180);
	const detail: ProviderErrorDetail = {
		status,
		method: context.method,
		operation: context.operation,
		...(body ? { body } : {}),
	};
	if (status === 429) {
		return new NetlifyProviderError(
			"PROVIDER_RATE_LIMITED",
			`netlify api returned 429 for ${context.operation}`,
			{
				retryable: true,
				...(context.retryAfterMs !== undefined
					? { retryAfterMs: context.retryAfterMs }
					: {}),
				detail,
			},
		);
	}
	if (status === 401 || status === 403) {
		return new NetlifyProviderError(
			"PROVIDER_AUTH_FAILED",
			`netlify api returned ${status} for ${context.operation}`,
			{ detail },
		);
	}
	if (status === 404) {
		// An unclaimed anonymous project is removed one hour after the deploy,
		// so a missing site is an expiry rather than a generic not-found.
		return new NetlifyProviderError(
			"CLAIM_EXPIRED",
			`netlify api returned 404 for ${context.operation}; an unclaimed anonymous project is removed one hour after it is deployed`,
			{ detail },
		);
	}
	if (status >= 500) {
		return context.method === "GET"
			? new NetlifyProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`netlify api returned ${status} for ${context.operation}`,
					{ retryable: true, detail },
				)
			: new NetlifyProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`netlify api returned ${status} to ${context.operation}; the mutation may or may not have applied`,
					{ detail },
				);
	}
	return new NetlifyProviderError(
		"PROVIDER_CONTRACT_CHANGED",
		`netlify api returned an unexpected ${status} for ${context.operation}`,
		{ detail },
	);
}
