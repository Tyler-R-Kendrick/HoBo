/**
 * Stable HoBo error codes for the Vercel sponsored-project-transfer driver.
 *
 * Provider text is never interpolated verbatim. A Vercel API error body can
 * echo a request payload, and a payload on this path carries a transfer code or
 * a marketplace resource secret — and an error message is the one string that
 * reliably reaches a log, a receipt, and a support ticket.
 */

export const PROVIDER_ERROR_CODES = [
	"PROVIDER_RATE_LIMITED",
	"PROVIDER_AUTH_FAILED",
	"PROVIDER_CONTRACT_CHANGED",
	"PROVIDER_OPERATION_AMBIGUOUS",
	"CLAIM_EXPIRED",
	"CLAIM_NOT_VERIFIED",
	"CLAIM_PARTIALLY_COMPLETED",
	"CLAIM_REPAIR_REQUIRED",
	"BINDING_ROTATION_REQUIRED",
	"BOOTSTRAP_AUTHORITY_REMAINS",
	"CLEANUP_FAILED",
	"SPONSOR_BUDGET_EXCEEDED",
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
	// Prisma Postgres hands out prisma+postgres://…?api_key=… as well as a
	// direct postgres:// string, so both shapes are stripped.
	/prisma\+postgres:\/\/\S+/giu,
	/postgres(?:ql)?:\/\/\S+/giu,
	/\bapi[_-]?key\s*[=:]\s*\S+/giu,
	/\bBearer\s+\S+/giu,
	/\b(?:password|pgpassword|pwd)\s*[=:]\s*\S+/giu,
	// Vercel claim/transfer codes are bearer authority on this path.
	/\bcode\s*[=:]\s*[A-Za-z0-9-]{8,}/giu,
	/\b(?:sk|pk)[-_][A-Za-z0-9_-]{8,}/giu,
	/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.\S*/giu,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu,
];

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point — provider output is full of them and an unflattened escape sequence can forge a log record.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/gu;

/**
 * Replace anything credential-shaped with a marker and flatten control
 * characters so provider text cannot forge a log record.
 */
export function redactProviderText(text: string, maxLength = 256): string {
	let out = text;
	for (const pattern of CREDENTIAL_PATTERNS)
		out = out.replace(pattern, "[redacted]");
	out = out.replace(CONTROL_CHARS, " ").trim();
	return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

export class VercelProviderError extends Error {
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
		this.name = "VercelProviderError";
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

export function isVercelProviderError(
	value: unknown,
): value is VercelProviderError {
	return value instanceof VercelProviderError;
}

export type ProviderStatusContext = {
	readonly method: "GET" | "POST" | "PUT" | "DELETE";
	readonly operation: string;
	readonly body?: string;
	readonly retryAfterMs?: number;
};

/**
 * Map a Vercel REST status onto a HoBo code.
 *
 * A 410 is specifically called out by the transfer-request endpoint, and it is
 * the expiry of a 24-hour code rather than a generic gone.
 */
export function providerErrorForStatus(
	status: number,
	context: ProviderStatusContext,
): VercelProviderError {
	const body =
		context.body === undefined ? "" : redactProviderText(context.body, 180);
	const detail: ProviderErrorDetail = {
		status,
		method: context.method,
		operation: context.operation,
		...(body ? { body } : {}),
	};
	if (status === 429) {
		return new VercelProviderError(
			"PROVIDER_RATE_LIMITED",
			`vercel api returned 429 for ${context.operation}`,
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
		return new VercelProviderError(
			"PROVIDER_AUTH_FAILED",
			`vercel api returned ${status} for ${context.operation}`,
			{ detail },
		);
	}
	if (status === 410) {
		return new VercelProviderError(
			"CLAIM_EXPIRED",
			`vercel api returned 410 for ${context.operation}; the transfer code is past its documented 24 hour window`,
			{ detail },
		);
	}
	if (status >= 500) {
		// A 5xx on a mutation is indistinguishable from "applied but not
		// acknowledged", so it is ambiguous rather than retryable. A 5xx on a
		// read is safe to repeat.
		return context.method === "GET"
			? new VercelProviderError(
					"PROVIDER_CONTRACT_CHANGED",
					`vercel api returned ${status} for ${context.operation}`,
					{ retryable: true, detail },
				)
			: new VercelProviderError(
					"PROVIDER_OPERATION_AMBIGUOUS",
					`vercel api returned ${status} to ${context.operation}; the mutation may or may not have applied`,
					{ detail },
				);
	}
	return new VercelProviderError(
		"PROVIDER_CONTRACT_CHANGED",
		`vercel api returned an unexpected ${status} for ${context.operation}`,
		{ detail },
	);
}
