/**
 * Stable HoBo error codes for the Prisma Postgres claimable driver.
 *
 * The provider surface here is a CLI, so "provider text" means child-process
 * stdout and stderr — which, for a tool whose whole job is printing a
 * connection string, is the most credential-dense text in the system. Nothing
 * from it reaches a message without going through {@link redactProviderText}.
 */

export const PROVIDER_ERROR_CODES = [
	"PROVIDER_RATE_LIMITED",
	"PROVIDER_AUTH_FAILED",
	"PROVIDER_CONTRACT_CHANGED",
	"PROVIDER_OPERATION_AMBIGUOUS",
	"PROVISIONING_CONFLICT",
	"LEASE_EXPIRED",
	"CLAIM_EXPIRED",
	"CLAIM_NOT_VERIFIED",
	"BINDING_ROTATION_REQUIRED",
	"MIGRATION_FAILED",
	"SECRET_CUSTODY_UNAVAILABLE",
	"SECRET_REFERENCE_INVALID",
	"CLEANUP_FAILED",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export type ProviderErrorDetail = Readonly<
	Record<string, string | number | boolean>
>;

export type ProviderErrorOptions = {
	readonly retryable?: boolean;
	readonly retryAfterMs?: number;
	readonly detail?: ProviderErrorDetail;
	readonly cause?: unknown;
};

const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	/postgres(?:ql)?:\/\/\S+/giu,
	/prisma\+postgres:\/\/\S+/giu,
	/\bBearer\s+\S+/giu,
	/\b(?:password|pgpassword|pwd)\s*[=:]\s*\S+/giu,
	/\bapi_key=\S+/giu,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu,
];

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters out of CLI output is the point; a raw CR/LF in a message is log forging.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/gu;

export function redactProviderText(text: string, maxLength = 256): string {
	let out = text;
	for (const pattern of CREDENTIAL_PATTERNS)
		out = out.replace(pattern, "[redacted]");
	out = out.replace(CONTROL_CHARS, " ").trim();
	return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

export class PrismaProviderError extends Error {
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
		this.name = "PrismaProviderError";
		this.code = code;
		this.retryable = options.retryable ?? false;
		if (options.retryAfterMs !== undefined)
			this.retryAfterMs = options.retryAfterMs;
		this.detail = Object.freeze({ ...(options.detail ?? {}) });
	}

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

export function isProviderError(value: unknown): value is PrismaProviderError {
	return value instanceof PrismaProviderError;
}
