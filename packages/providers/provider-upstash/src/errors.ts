/**
 * Stable HoBo error codes for the Upstash temporary-Redis driver.
 *
 * The redaction here is not decoration. The provider's create response is a
 * markdown document with a bearer token in it, and the two places a whole
 * response body most often ends up are a parse error and a log line. So every
 * message and every detail value goes through {@link redactProviderText}
 * before it can be constructed, not after someone remembers to call it.
 */

/**
 * Two codes here are additions to the platform's baseline set, and both are
 * recorded in the README so the coordinator can promote or rename them:
 *
 * - `CLAIM_NOT_VERIFIED` — ownership could not be *proved*, which is different
 *   from a claim window having expired. Collapsing it into `CLAIM_EXPIRED`
 *   would tell an operator to re-run a ceremony that may already have worked.
 * - `SECRET_CUSTODY_UNAVAILABLE` — the deposit side failed. Reporting that as
 *   `SECRET_REFERENCE_INVALID` would blame a reference that was never issued.
 */
export const PROVIDER_ERROR_CODES = [
	"PROVIDER_AUTH_FAILED",
	"PROVIDER_RATE_LIMITED",
	"PROVIDER_CONTRACT_CHANGED",
	"PROVIDER_OPERATION_AMBIGUOUS",
	"LEASE_EXPIRED",
	"CLAIM_EXPIRED",
	"CLAIM_NOT_VERIFIED",
	"SECRET_REFERENCE_INVALID",
	"SECRET_CUSTODY_UNAVAILABLE",
	"CLEANUP_FAILED",
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

/**
 * Shapes that must never survive into a message, a log line, or a receipt.
 *
 * The generic opaque-blob rule is the important one: Upstash REST tokens are
 * long base64url strings with no fixed prefix to match on, so the rule is
 * structural — any unbroken run of 40+ token characters is treated as
 * credential material. A UUID is 36 characters and survives; a hostname
 * contains dots and survives; a token does not.
 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	/\*\*\s*Token\s*:?\s*\*\*\s*\S+/giu,
	/\bBearer\s+\S+/giu,
	/\bUPSTASH_REDIS_REST_TOKEN\s*[=:]\s*\S+/giu,
	/\b(?:token|password|pwd)\s*[=:]\s*\S+/giu,
	/\brediss?:\/\/\S+/giu,
	/[A-Za-z0-9_-]{40,}/gu,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu,
];

// Stripping control characters out of provider text is the point: a newline in
// an error message is how untrusted text forges a log record.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the purpose
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/gu;

/**
 * Replace anything credential-shaped with a marker and flatten control
 * characters so provider text cannot forge a log record.
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

function redactDetail(detail: ProviderErrorDetail): ProviderErrorDetail {
	const safe: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(detail)) {
		safe[key] =
			typeof value === "string" ? redactProviderText(value, 160) : value;
	}
	return Object.freeze(safe);
}

export class UpstashProviderError extends Error {
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
		this.name = "UpstashProviderError";
		this.code = code;
		this.retryable = options.retryable ?? false;
		if (options.retryAfterMs !== undefined)
			this.retryAfterMs = options.retryAfterMs;
		this.detail = redactDetail(options.detail ?? {});
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

export function isProviderError(value: unknown): value is UpstashProviderError {
	return value instanceof UpstashProviderError;
}

/**
 * Map an HTTP status onto a HoBo code.
 *
 * The interesting case is 5xx on a create. `POST /start-redis` is idempotent
 * on the `Idempotency-Key`, so an unacknowledged create is recoverable — but
 * it is still not *known* to have failed, and calling it retryable would let a
 * caller treat "unknown" as "safe to redo blindly". It is reported as
 * ambiguous, and the client resolves it by re-POSTing the same key, which
 * adopts rather than duplicates.
 */
export function providerErrorForStatus(
	status: number,
	options: {
		readonly method: "GET" | "POST";
		readonly body?: string;
		readonly retryAfterMs?: number;
	},
): UpstashProviderError {
	const body =
		options.body === undefined ? "" : redactProviderText(options.body, 160);
	const detail: ProviderErrorDetail = {
		status,
		method: options.method,
		...(body !== "" ? { body } : {}),
	};
	if (status === 429) {
		return new UpstashProviderError(
			"PROVIDER_RATE_LIMITED",
			"upstash.com returned 429",
			{
				retryable: true,
				...(options.retryAfterMs !== undefined
					? { retryAfterMs: options.retryAfterMs }
					: {}),
				detail,
			},
		);
	}
	if (status === 401 || status === 403) {
		return new UpstashProviderError(
			"PROVIDER_AUTH_FAILED",
			`upstash.com returned ${status}; the no-signup surface should never require authorization, so this is either a contract change or a credential being sent that should not be`,
			{ detail },
		);
	}
	if (status >= 500) {
		return options.method === "POST"
			? new UpstashProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`upstash.com returned ${status} to a create; the database may or may not exist, so the same idempotency key must be reused`,
					{ detail },
				)
			: new UpstashProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`upstash.com returned ${status}`,
					{
						retryable: true,
						detail,
					},
				);
	}
	return new UpstashProviderError(
		"PROVIDER_CONTRACT_CHANGED",
		`upstash.com returned an unexpected ${status}`,
		{ detail },
	);
}
