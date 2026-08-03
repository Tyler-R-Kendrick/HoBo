// Budget signal plane: turns the static spend-cap check (planes.ts /
// metering.ts) into a stream. The same `meter.UsageRecorded` facts the metered
// billing plane folds are folded here into per-tenant budget state, and
// threshold transitions emit `budget.ThresholdCrossed` / `budget.Recovered`
// facts a routing control loop can subscribe to (the "decide" trigger the
// FinOps control-plane design defers — only the threshold evaluator is lifted,
// not the Pareto pipeline).
//
// Exactly-once under journal replay, twice over:
// - the fold derives state ONLY from usage/credit facts, and skips emitting
//   any signal whose deterministic `signalKey` already appears in the input
//   stream (a re-fold over a journal that contains previously appended
//   signals emits nothing new);
// - `budgetSignalEventInputs` carries the signalKey as `meta.idempotencyKey`,
//   so even a blind re-append is deduped by the SQLite journal (ADR-0135).
import { METER_USAGE_RECORDED_EVENT } from "./metering.js";

export const BUDGET_EVENTS = Object.freeze({
	ThresholdCrossed: "budget.ThresholdCrossed",
	Recovered: "budget.Recovered",
	// Operator-appended fact that restores headroom (grant, top-up, correction).
	CreditApplied: "budget.CreditApplied",
} as const);

export interface BudgetSignalPolicy {
	/** Hard budget in USD; must be > 0 for signals to fire. */
	budgetUsd: number;
	/** Threshold fractions of budgetUsd in (0, 1]; default [1]. */
	thresholds?: readonly number[];
	/** Scope: only facts with this data.tenantId are folded (absent = all). */
	tenantId?: string;
}

export interface BudgetSignalState {
	tenantId: string | null;
	budgetUsd: number;
	spentUsd: number;
	creditUsd: number;
	netSpentUsd: number;
	sampleCount: number;
	/** thresholdFraction -> currently crossed */
	crossed: Record<string, boolean>;
}

export interface BudgetSignalData {
	tenantId: string | null;
	thresholdFraction: number;
	thresholdUsd: number;
	budgetUsd: number;
	netSpentUsd: number;
	/** 1-based count of crossings/recoveries for this threshold — identity. */
	cycle: number;
	signalKey: string;
}

export interface BudgetSignal {
	type: typeof BUDGET_EVENTS.ThresholdCrossed | typeof BUDGET_EVENTS.Recovered;
	data: BudgetSignalData;
}

interface FactLike {
	type: string;
	data?: unknown;
}

export interface BudgetSignalFold {
	state: BudgetSignalState;
	signals: BudgetSignal[];
}

// Deterministic fold: same stream + same policy -> same state and the same
// signal facts (stable signalKey identity), so projections rebuilt from zero
// converge instead of re-firing.
export function foldBudgetSignals(
	events: Iterable<FactLike>,
	policy: BudgetSignalPolicy,
): BudgetSignalFold {
	const budgetUsd = policy.budgetUsd;
	if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
		throw new TypeError("policy.budgetUsd must be a positive number");
	}
	const thresholds = [...(policy.thresholds ?? [1])].sort((a, b) => a - b);
	if (
		thresholds.length === 0 ||
		thresholds.some((t) => !Number.isFinite(t) || t <= 0 || t > 1)
	) {
		throw new TypeError("policy.thresholds must be fractions in (0, 1]");
	}
	const tenantId = policy.tenantId ?? null;

	const state: BudgetSignalState = {
		tenantId,
		budgetUsd,
		spentUsd: 0,
		creditUsd: 0,
		netSpentUsd: 0,
		sampleCount: 0,
		crossed: Object.fromEntries(thresholds.map((t) => [String(t), false])),
	};
	const cycles: Record<string, number> = Object.fromEntries(
		thresholds.map((t) => [String(t), 0]),
	);
	const signals: BudgetSignal[] = [];

	// Pre-scan for already-recorded signal identities BEFORE folding: appended
	// signals sit after the usage facts in global order, and dedupe must not
	// depend on where in the stream they landed.
	const buffered = Array.isArray(events) ? events : [...events];
	const seenKeys = new Set<string>();
	for (const event of buffered) {
		if (
			event.type === BUDGET_EVENTS.ThresholdCrossed ||
			event.type === BUDGET_EVENTS.Recovered
		) {
			const key = (event.data as BudgetSignalData | undefined)?.signalKey;
			if (typeof key === "string" && key.length > 0) seenKeys.add(key);
		}
	}

	for (const event of buffered) {
		if (
			event.type === BUDGET_EVENTS.ThresholdCrossed ||
			event.type === BUDGET_EVENTS.Recovered
		) {
			continue;
		}

		const data = (event.data ?? {}) as Record<string, unknown>;
		if (tenantId !== null && data.tenantId !== tenantId) continue;

		if (event.type === METER_USAGE_RECORDED_EVENT) {
			const cost = data.costUsd;
			if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
				continue;
			}
			state.spentUsd += cost;
			state.sampleCount += 1;
		} else if (event.type === BUDGET_EVENTS.CreditApplied) {
			const amount = data.amountUsd;
			if (
				typeof amount !== "number" ||
				!Number.isFinite(amount) ||
				amount < 0
			) {
				continue;
			}
			state.creditUsd += amount;
		} else {
			continue;
		}

		state.netSpentUsd = round(state.spentUsd - state.creditUsd);
		for (const threshold of thresholds) {
			const key = String(threshold);
			const crossedNow = state.netSpentUsd >= round(threshold * budgetUsd);
			if (crossedNow === state.crossed[key]) continue;
			state.crossed[key] = crossedNow;
			const cycle = (cycles[key] ?? 0) + 1;
			cycles[key] = cycle;
			const signal: BudgetSignal = {
				type: crossedNow
					? BUDGET_EVENTS.ThresholdCrossed
					: BUDGET_EVENTS.Recovered,
				data: {
					tenantId,
					thresholdFraction: threshold,
					thresholdUsd: round(threshold * budgetUsd),
					budgetUsd,
					netSpentUsd: state.netSpentUsd,
					cycle,
					signalKey: `budget:${tenantId ?? "*"}:${threshold}:${
						crossedNow ? "crossed" : "recovered"
					}:${cycle}`,
				},
			};
			if (seenKeys.has(signal.data.signalKey)) continue;
			seenKeys.add(signal.data.signalKey);
			signals.push(signal);
		}
	}

	return { state, signals };
}

// EventInput-shaped (core eventstore) rows for appending fold output to a
// journal; the signalKey rides as meta.idempotencyKey so the journal dedupes
// a re-append of the same signal.
export function budgetSignalEventInputs(signals: readonly BudgetSignal[]): {
	type: string;
	data: BudgetSignalData;
	meta: { idempotencyKey: string };
}[] {
	return signals.map((signal) => ({
		type: signal.type,
		data: signal.data,
		meta: { idempotencyKey: signal.data.signalKey },
	}));
}

function round(value: number): number {
	return Number(value.toFixed(9));
}
