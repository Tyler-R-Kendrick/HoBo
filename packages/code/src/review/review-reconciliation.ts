import type {
	ReviewDeliveryLedgerRecord,
	ReviewDeliveryLedgerStatus,
} from "./review-delivery-ledger.js";
import {
	loadReviewDeliveryLedger,
	markReviewDeliveryLedger,
} from "./review-delivery-ledger.js";
// Classify none/one/multiple provider evidence before any review retry.
import { reviewError } from "./review-errors.js";
import type {
	ReviewExactEffectOperation,
	ReviewProvider,
} from "./review-ports.js";

export type ReviewProviderEvidence =
	| { readonly kind: "none" }
	| {
			readonly kind: "one";
			readonly receiptHash?: string;
			readonly providerReviewId?: string;
	  }
	| { readonly kind: "multiple"; readonly count: number }
	| { readonly kind: "unknown" };

export function classifyReviewProviderEvidence(input: {
	readonly matches: number;
	readonly receiptHash?: string;
	readonly providerReviewId?: string;
}): ReviewProviderEvidence {
	if (input.matches <= 0) return { kind: "none" };
	if (input.matches === 1) {
		return {
			kind: "one",
			...(input.receiptHash === undefined
				? {}
				: { receiptHash: input.receiptHash }),
			...(input.providerReviewId === undefined
				? {}
				: { providerReviewId: input.providerReviewId }),
		};
	}
	return { kind: "multiple", count: input.matches };
}

export async function gatherReviewProviderEvidence(
	provider: ReviewProvider,
	input: {
		readonly commandId: string;
		readonly digest: string;
		readonly operation: ReviewExactEffectOperation;
	},
): Promise<ReviewProviderEvidence> {
	try {
		const result = await provider.reconcile(input);
		return classifyReviewProviderEvidence(result);
	} catch {
		return { kind: "unknown" };
	}
}

export function ledgerStatusForEvidence(
	evidence: ReviewProviderEvidence,
	partial = false,
): ReviewDeliveryLedgerStatus {
	if (partial && evidence.kind !== "one") return "ambiguous";
	if (evidence.kind === "one") return "applied";
	if (evidence.kind === "none") return "failed";
	return "ambiguous";
}

export async function reconcileReviewDelivery(input: {
	readonly rootDir: string;
	readonly commandId: string;
	readonly provider: ReviewProvider;
	readonly partial?: boolean;
}): Promise<ReviewDeliveryLedgerRecord> {
	const existing = await loadReviewDeliveryLedger(
		input.rootDir,
		input.commandId,
	);
	if (!existing) {
		throw reviewError(
			"not-found",
			`review ledger ${input.commandId} does not exist`,
		);
	}
	if (existing.status === "complete" || existing.status === "failed")
		return existing;
	const evidence = await gatherReviewProviderEvidence(input.provider, {
		commandId: existing.commandId,
		digest: existing.digest,
		operation: existing.effect.operation,
	});
	const status = ledgerStatusForEvidence(evidence, input.partial === true);
	if (status === existing.status && status !== "applied") return existing;
	return markReviewDeliveryLedger(input.rootDir, input.commandId, status, {
		...(evidence.kind === "one" && evidence.receiptHash !== undefined
			? { receiptHash: evidence.receiptHash }
			: {}),
		...(evidence.kind === "one" && evidence.providerReviewId !== undefined
			? { providerReviewId: evidence.providerReviewId }
			: {}),
		...(status === "ambiguous" ? { failureCode: "ambiguous-outcome" } : {}),
	});
}
