import type { BillingPlane } from "./planes.js";
import type { RejectionReason } from "./types.js";

// Metering-backed billing plane: instead of trusting static policy fields for
// consumption, fold the Yard's `meter.UsageRecorded` facts (usage-metering.md)
// into observed spend, then authorize the estimate against what the budget
// has actually left. The event stream is truth; the fold rebuilds from zero.

// public-contract: the metering fact family the billing plane folds.
export const METER_USAGE_RECORDED_EVENT = "meter.UsageRecorded";

export interface MeteredUsageFold {
	spentUsd: number;
	sampleCount: number;
}

export function foldMeteredUsage(
	events: Iterable<{ type: string; data?: unknown }>,
): MeteredUsageFold {
	let spentUsd = 0;
	let sampleCount = 0;
	for (const event of events) {
		if (event.type !== METER_USAGE_RECORDED_EVENT) continue;
		const data = (event.data ?? {}) as Record<string, unknown>;
		const cost = data.costUsd;
		if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
			spentUsd += cost;
			sampleCount += 1;
		}
	}
	return { spentUsd, sampleCount };
}

export function createMeteredBillingPlane(
	events: Iterable<{ type: string; data?: unknown }>,
): BillingPlane {
	const usage = foldMeteredUsage(events);
	return {
		authorize({ spendEstimateUsd, billing }) {
			const reasons: RejectionReason[] = [];
			if (billing.spendCapUsd > 0 && spendEstimateUsd > billing.spendCapUsd) {
				reasons.push({
					plane: "billing",
					code: "spend-cap-exceeded",
					message: `estimated spend ${spendEstimateUsd} USD exceeds per-resolution cap ${billing.spendCapUsd} USD`,
				});
			}
			const remaining = billing.budgetUsd - usage.spentUsd;
			if (billing.budgetUsd > 0 && spendEstimateUsd > remaining) {
				reasons.push({
					plane: "billing",
					code: "budget-exceeded",
					message: `estimated spend ${spendEstimateUsd} USD exceeds metered remaining budget ${remaining} USD (${usage.spentUsd} USD observed across ${usage.sampleCount} meter.UsageRecorded facts)`,
				});
			}
			return { ok: reasons.length === 0, reasons };
		},
	};
}
