/**
 * The one error type of the pin code: every refusal carries a code a caller
 * (and a test) can match, and its message starts with that code.
 *
 * Erasable TypeScript with node builtins only.
 */
export type PinsErrorCode =
	| "PINS_MALFORMED"
	| "TARGET_UNSUPPORTED"
	| "ASSET_UNPUBLISHED"
	| "DIGEST_MISMATCH"
	| "SIZE_EXCEEDED"
	| "SIZE_MISMATCH"
	| "HTTP_STATUS"
	| "NETWORK"
	| "REDIRECT_REFUSED"
	| "SUMS_MALFORMED"
	| "TARGET_DROPPED"
	| "GIT_FAILED"
	| "SUBMODULE_STATE"
	| "NOT_PUSHED"
	| "CACHE_UNSAFE"
	| "OVERRIDE_IN_CI"
	| "INTERRUPTED"
	| "NET_TIMEOUT"
	| "GITMODULES_AMBIGUOUS"
	| "ARCHIVE_MALFORMED"
	| "ARCHIVE_UNSUPPORTED"
	| "ARCHIVE_MEMBER_MISSING"
	| "ARCHIVE_UNSAFE"
	| "USAGE";

/** Every refusal is named; a bare Error would be untraceable. */
export class PinsError extends Error {
	readonly code: PinsErrorCode;
	constructor(code: PinsErrorCode, message: string) {
		super(`${code}: ${message}`);
		this.name = "PinsError";
		this.code = code;
	}
}
