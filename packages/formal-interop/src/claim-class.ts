/**
 * Claim-class hygiene for cold-start / promotion evidence (ADR-0141 · plan 0016).
 * fixture_or_scratch and missing classes fail closed for cold-start claims.
 */

export type ClaimClass =
	| "executor_parity"
	| "process_warm_pack"
	| "request_cold"
	| "request_local_memo_reuse"
	| "static_macro_edges"
	| "zero_forward"
	| "claim_hygiene"
	| "anti_e237"
	| "fixture_or_scratch"
	| "unknown";

/** Classes that must never promote as cold-start / AOT evidence. */
export const NON_PROMOTABLE_COLD_CLAIM_CLASSES: readonly ClaimClass[] = [
	"fixture_or_scratch",
	"unknown",
];

export interface ClaimClassGateInput {
	readonly claimClass: ClaimClass | string | undefined | null;
	/** When true, this evidence is offered for cold-start / AOT claims. */
	readonly coldStartClaim: boolean;
}

export interface ClaimClassGateResult {
	readonly ok: boolean;
	readonly code?: string;
	readonly detail: string;
	readonly claimClass: string;
}

/**
 * Fail-closed gate: cold-start claims require a non-scratch claim_class.
 */
export function evaluateClaimClassGate(
	input: ClaimClassGateInput,
): ClaimClassGateResult {
	const raw = input.claimClass;
	if (raw === undefined || raw === null || String(raw).trim() === "") {
		return Object.freeze({
			ok: false,
			code: "MISSING_CLAIM_CLASS",
			detail: "claim_class missing (fail closed for evidence)",
			claimClass: "",
		});
	}
	const claimClass = String(raw).trim();
	if (!input.coldStartClaim) {
		return Object.freeze({
			ok: true,
			detail: "non-cold-start evidence; claim_class recorded",
			claimClass,
		});
	}
	if (
		claimClass === "fixture_or_scratch" ||
		claimClass === "unknown" ||
		NON_PROMOTABLE_COLD_CLAIM_CLASSES.includes(claimClass as ClaimClass)
	) {
		return Object.freeze({
			ok: false,
			code: "NON_PROMOTABLE_CLAIM_CLASS",
			detail: `claim_class ${claimClass} cannot promote cold-start/AOT evidence`,
			claimClass,
		});
	}
	if (claimClass === "request_local_memo_reuse") {
		return Object.freeze({
			ok: false,
			code: "MEMO_LABELED_AS_COLD",
			detail:
				"request_local_memo_reuse must not be used as cold-start/AOT evidence (E9)",
			claimClass,
		});
	}
	return Object.freeze({
		ok: true,
		detail: "claim_class accepted for cold-start evidence",
		claimClass,
	});
}
