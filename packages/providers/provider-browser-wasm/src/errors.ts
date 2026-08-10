/**
 * Stable HoBo error codes for the browser WebAssembly provider.
 *
 * Host text is never interpolated verbatim. The strings available to a page —
 * the document URL, a fetch failure, a host fault message — routinely carry
 * query-string session tokens, and an error message is the one string that
 * reliably reaches a console, a receipt and a bug report.
 */

export const BROWSER_WASM_ERROR_CODES = [
	/** The document cannot support what the placement asked for. */
	"HOST_UNSUPPORTED",
	/** The origin did not serve the guest bundle. */
	"BUNDLE_UNAVAILABLE",
	/** The bytes are not the bytes the manifest described. */
	"BUNDLE_DIGEST_MISMATCH",
	/** A core module, or something else, where a component was expected. */
	"BUNDLE_NOT_A_COMPONENT",
	"PROVIDER_CONTRACT_CHANGED",
	"PLACEMENT_REJECTED",
	/** Durable storage was asked for and the context has none. */
	"PERSISTENCE_UNAVAILABLE",
	"GUEST_INSTANTIATION_FAILED",
	"CLEANUP_INCOMPLETE",
] as const;

export type BrowserWasmErrorCode = (typeof BROWSER_WASM_ERROR_CODES)[number];

export type BrowserWasmErrorDetail = Readonly<
	Record<string, string | number | boolean>
>;

export type BrowserWasmErrorOptions = {
	readonly retryable?: boolean;
	readonly detail?: BrowserWasmErrorDetail;
	readonly cause?: unknown;
};

/** Shapes that must never survive into a message, console line, or receipt. */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	/\bBearer\s+\S+/giu,
	/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
	// The usual way a secret reaches a browser: in the URL.
	/\b(?:access_token|id_token|session|api[_-]?key|token)=[^&\s"']+/giu,
	/\b(?:sk|pk)[-_][A-Za-z0-9_-]{8,}/gu,
];

// biome-ignore lint/suspicious/noControlCharactersInRegex: flattening control characters out of host text is the point; a raw CR/LF in a message is log forging.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/gu;

export function redactHostText(text: string, maxLength = 256): string {
	let out = text;
	for (const pattern of CREDENTIAL_PATTERNS) {
		out = out.replace(pattern, "[redacted]");
	}
	out = out.replace(CONTROL_CHARS, " ").trim();
	return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

export class BrowserWasmProviderError extends Error {
	readonly code: BrowserWasmErrorCode;
	readonly retryable: boolean;
	readonly detail: BrowserWasmErrorDetail;

	constructor(
		code: BrowserWasmErrorCode,
		message: string,
		options: BrowserWasmErrorOptions = {},
	) {
		super(
			redactHostText(message),
			options.cause !== undefined ? { cause: options.cause } : {},
		);
		this.name = "BrowserWasmProviderError";
		this.code = code;
		this.retryable = options.retryable ?? false;
		this.detail = Object.freeze({ ...(options.detail ?? {}) });
	}
}

export function isBrowserWasmProviderError(
	value: unknown,
): value is BrowserWasmProviderError {
	return value instanceof BrowserWasmProviderError;
}

export function contractChanged(
	message: string,
	detail?: BrowserWasmErrorDetail,
): never {
	throw new BrowserWasmProviderError("PROVIDER_CONTRACT_CHANGED", message, {
		...(detail !== undefined ? { detail } : {}),
	});
}
