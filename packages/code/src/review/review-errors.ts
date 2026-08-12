export type ReviewErrorCode =
	| "malformed-input"
	| "not-found"
	| "stale-revision"
	| "stale-generation"
	| "unsupported-capability"
	| "approval-required"
	| "approval-mismatch"
	| "provider-drift"
	| "ambiguous-outcome"
	| "anchor-stale"
	| "anchor-ambiguous"
	| "patch-conflict"
	| "body-limit"
	| "page-limit"
	| "corrupted-state"
	| "auth-denied"
	| "idempotent-replay";

export class ReviewError extends Error {
	readonly code: ReviewErrorCode;
	readonly details: Readonly<Record<string, string | number | boolean>>;

	constructor(
		code: ReviewErrorCode,
		message: string,
		details: Readonly<Record<string, string | number | boolean>> = {},
	) {
		super(message);
		this.name = "ReviewError";
		this.code = code;
		this.details = details;
	}
}

export function reviewError(
	code: ReviewErrorCode,
	message: string,
	details: Readonly<Record<string, string | number | boolean>> = {},
): ReviewError {
	return new ReviewError(code, message, details);
}
