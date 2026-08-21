// Progressive routing cutover: the zero-downtime swap executor behind the
// control loop's "act" step. Mirrors the Trail runner's cutover semantics
// (staged ramp percents, mid-ramp abort, compensate-to-source — ADR-0134) but
// drives a TrafficRoutingPort with staged weight plans instead of a
// progressive cohort flag, and health-gates every ramp step.
//
// Canonical home of the promoted `domain-cutover-saga-contract` draft proof
// (scripts/promotions.json): the proof's DNS-shaped saga is re-expressed over
// the routing port, keeping its fail-closed preconditions (validated change,
// live incumbent, TTL/RTO wait) and its rollback hysteresis. Event names follow
// the designed saga: domain.CutoverRefused | (domain.TtlLowered →
// domain.CutoverStarted → routing.RampAdvanced* → domain.RoutingChanged |
// domain.RolledBack).
import type {
	ApplyResult,
	PolicyDecision,
	RoutingPlan,
	RoutingPlanId,
	TrafficRoutingPort,
} from "@hobo/core";
import type { DispatchFact } from "@hobo/dispatcher";

import {
	type RoutingSynthesisDenial,
	type RoutingTopology,
	synthesizeRoutingPlan,
} from "./synthesize.js";

export const CUTOVER_EVENTS = Object.freeze({
	Refused: "domain.CutoverRefused",
	TtlLowered: "domain.TtlLowered",
	Started: "domain.CutoverStarted",
	RampAdvanced: "routing.RampAdvanced",
	RoutingChanged: "domain.RoutingChanged",
	RolledBack: "domain.RolledBack",
} as const);

export const DEFAULT_RAMP_STEPS: readonly number[] = Object.freeze([
	10, 50, 100,
]);

/** Default consecutive health-gate failures tolerated before rollback. */
export const DEFAULT_CONSECUTIVE_FAILURES_TO_ROLLBACK = 1;

/** Health gate between ramp steps; false aborts the ramp and rolls back. */
export type CutoverHealthGate = (input: {
	percent: number;
	plan: RoutingPlan;
	applyResult: ApplyResult;
}) => boolean | Promise<boolean>;

/**
 * Resolver-cache precondition promoted from the cutover saga proof. A
 * DNS-fronted provider cannot roll back faster than the TTL clients already
 * cached, so the effective RTO is the *previous* TTL: lower it first, wait out
 * the old value, then move traffic.
 */
// domain-view: parse-time precondition type; traffic_cutover.proto documents its wire form (no codegen lane for stations yet).
export interface CutoverTtlPrecondition {
	readonly previousTtlSeconds: number;
	readonly loweredTtlSeconds: number;
	readonly waitedSeconds: number;
}

/** Fail-closed preconditions checked before any traffic shifts. */
export interface CutoverPrecondition {
	/** Domain-validation outcome; only `"validated"` may proceed. */
	readonly validation: { readonly status: string; readonly changeId?: string };
	readonly ttl: CutoverTtlPrecondition;
	/**
	 * Plan expected to be serving today. When present the port must report it
	 * active — the routing analogue of "last-known-good matches the live zone".
	 */
	readonly incumbentPlanId?: RoutingPlanId;
}

export interface RoutingCutoverOptions {
	topology: RoutingTopology;
	policyDecision: PolicyDecision;
	port: TrafficRoutingPort;
	fromBackendId: string;
	toBackendId: string;
	/** Ascending percents ending at 100 (default 10 → 50 → 100). */
	rampSteps?: readonly number[];
	healthGate?: CutoverHealthGate;
	/**
	 * Consecutive health-gate failures tolerated before rollback (default 1 —
	 * roll back on the first failure). Higher values absorb single-sample flaps.
	 */
	consecutiveFailuresToRollback?: number;
	precondition?: CutoverPrecondition;
	clock?: () => string;
	planIdPrefix?: string;
	onFact?: (fact: DispatchFact) => void;
}

export type RoutingCutoverResult = Readonly<{
	ok: boolean;
	cutover: boolean;
	rolledBack: boolean;
	/** Refused before any traffic moved (precondition or shape failure). */
	refused: boolean;
	finalPercent: number;
	/** Every plan applied during the ramp, in order (rollback plan last if any). */
	plans: readonly RoutingPlan[];
	finalApplyResult?: ApplyResult;
	reasons: readonly (
		| RoutingSynthesisDenial
		| { code: string; message: string }
	)[];
	facts: readonly DispatchFact[];
}>;

export async function executeRoutingCutover(
	options: RoutingCutoverOptions,
): Promise<RoutingCutoverResult> {
	const clock = options.clock ?? (() => new Date().toISOString());
	const rampSteps = options.rampSteps ?? DEFAULT_RAMP_STEPS;
	const facts: DispatchFact[] = [];
	const plans: RoutingPlan[] = [];
	const prefix =
		options.planIdPrefix ??
		`cutover:${options.topology.service}:${options.toBackendId}`;

	const emit = (fact: DispatchFact) => {
		facts.push(fact);
		options.onFact?.(fact);
	};
	const finish = (input: {
		ok: boolean;
		cutover: boolean;
		rolledBack: boolean;
		refused?: boolean;
		finalPercent: number;
		finalApplyResult?: ApplyResult;
		reasons?: readonly (
			| RoutingSynthesisDenial
			| { code: string; message: string }
		)[];
	}): RoutingCutoverResult =>
		Object.freeze({
			plans: Object.freeze([...plans]),
			facts: Object.freeze([...facts]),
			reasons: Object.freeze([...(input.reasons ?? [])]),
			ok: input.ok,
			cutover: input.cutover,
			rolledBack: input.rolledBack,
			refused: input.refused ?? false,
			finalPercent: input.finalPercent,
			...(input.finalApplyResult !== undefined
				? { finalApplyResult: input.finalApplyResult }
				: undefined),
		});

	/**
	 * Refuse before any traffic moves. Emits `domain.CutoverRefused` so a
	 * refusal is as visible in the trace as a rollback, and never touches the
	 * port — the incumbent keeps serving untouched.
	 */
	const refuse = (code: string, message: string): RoutingCutoverResult => {
		const reasons = [{ code, message }];
		emit({
			type: CUTOVER_EVENTS.Refused,
			data: {
				service: options.topology.service,
				fromBackendId: options.fromBackendId,
				toBackendId: options.toBackendId,
				reasons,
				refusedAt: clock(),
			},
		});
		return finish({
			ok: false,
			cutover: false,
			rolledBack: false,
			refused: true,
			finalPercent: 0,
			reasons,
		});
	};

	if (
		rampSteps.length === 0 ||
		rampSteps.some(
			(p, i) =>
				!Number.isInteger(p) ||
				p <= 0 ||
				p > 100 ||
				p <= (rampSteps[i - 1] ?? 0),
		) ||
		rampSteps[rampSteps.length - 1] !== 100
	) {
		return refuse(
			"invalid-ramp",
			"rampSteps must be ascending integers in (0,100] ending at 100",
		);
	}

	const failuresToRollback =
		options.consecutiveFailuresToRollback ??
		DEFAULT_CONSECUTIVE_FAILURES_TO_ROLLBACK;
	if (!Number.isInteger(failuresToRollback) || failuresToRollback <= 0) {
		return refuse(
			"invalid-hysteresis",
			"consecutiveFailuresToRollback must be a positive integer",
		);
	}

	const from = options.topology.backends.find(
		(backend) => backend.id === options.fromBackendId,
	);
	const to = options.topology.backends.find(
		(backend) => backend.id === options.toBackendId,
	);
	if (!from || !to) {
		return refuse(
			"unknown-backend",
			`cutover requires both ${options.fromBackendId} and ${options.toBackendId} in the topology`,
		);
	}

	// Preconditions promoted from the cutover saga proof. Fail closed: an
	// unvalidated change, a stale view of what is live, or an un-waited TTL each
	// mean a rollback could not actually restore service in time.
	const precondition = options.precondition;
	if (precondition) {
		if (precondition.validation.status !== "validated") {
			return refuse(
				"validation-unvalidated",
				`cutover requires a validated domain change, got "${precondition.validation.status}"`,
			);
		}
		const ttl = precondition.ttl;
		for (const [field, value] of [
			["previousTtlSeconds", ttl.previousTtlSeconds],
			["loweredTtlSeconds", ttl.loweredTtlSeconds],
			["waitedSeconds", ttl.waitedSeconds],
		] as const) {
			if (!Number.isInteger(value) || value <= 0) {
				return refuse(
					"ttl-invalid",
					`${field} must be a positive integer, got ${String(value)}`,
				);
			}
		}
		if (ttl.loweredTtlSeconds >= ttl.previousTtlSeconds) {
			return refuse(
				"ttl-not-lowered",
				`lowered TTL ${ttl.loweredTtlSeconds}s must be below previous TTL ${ttl.previousTtlSeconds}s`,
			);
		}
		if (ttl.waitedSeconds < ttl.previousTtlSeconds) {
			return refuse(
				"ttl-wait-incomplete",
				`waited ${ttl.waitedSeconds}s, below previous TTL ${ttl.previousTtlSeconds}s`,
			);
		}
		if (precondition.incumbentPlanId !== undefined) {
			const live = await options.port.status(precondition.incumbentPlanId);
			if (!live?.active) {
				return refuse(
					"incumbent-not-live",
					`incumbent plan ${precondition.incumbentPlanId} is not active on ${options.port.provider}; refusing to ramp from a stale view`,
				);
			}
		}
		emit({
			type: CUTOVER_EVENTS.TtlLowered,
			data: {
				service: options.topology.service,
				previousTtlSeconds: ttl.previousTtlSeconds,
				loweredTtlSeconds: ttl.loweredTtlSeconds,
				waitedSeconds: ttl.waitedSeconds,
				// Rollback can only be as fast as the TTL clients already cached.
				effectiveRtoSeconds: ttl.previousTtlSeconds,
				loweredAt: clock(),
			},
		});
	}

	emit({
		type: CUTOVER_EVENTS.Started,
		data: {
			service: options.topology.service,
			fromBackendId: options.fromBackendId,
			toBackendId: options.toBackendId,
			rampSteps: [...rampSteps],
			...(precondition?.validation.changeId !== undefined
				? { validationChangeId: precondition.validation.changeId }
				: undefined),
			...(precondition !== undefined
				? { effectiveRtoSeconds: precondition.ttl.previousTtlSeconds }
				: undefined),
			startedAt: clock(),
		},
	});

	// Ramp plans route only between source and target with exact weights so a
	// weight-only provider (simple adapter, Vercel rolling release) realizes
	// each step in full.
	const synthesizeAt = (percent: number) => {
		const pair =
			percent >= 100
				? [Object.freeze({ ...to, weight: 100 })]
				: percent <= 0
					? [Object.freeze({ ...from, weight: 100 })]
					: [
							Object.freeze({ ...from, weight: 100 - percent }),
							Object.freeze({ ...to, weight: percent }),
						];
		return synthesizeRoutingPlan({
			topology: Object.freeze({
				...options.topology,
				backends: Object.freeze(pair),
			}),
			policyDecision: options.policyDecision,
			now: clock(),
			planId: `${prefix}:p${percent}`,
			weightStrategy: "static",
		});
	};

	const rollback = async (
		reasons: readonly (
			| RoutingSynthesisDenial
			| { code: string; message: string }
		)[],
		atPercent: number,
	): Promise<RoutingCutoverResult> => {
		const synthesis = synthesizeAt(0);
		if (synthesis.kind === "plan") {
			plans.push(synthesis.plan);
			await options.port.apply(synthesis.plan);
		}
		emit({
			type: CUTOVER_EVENTS.RolledBack,
			data: {
				service: options.topology.service,
				fromBackendId: options.fromBackendId,
				toBackendId: options.toBackendId,
				abortedAtPercent: atPercent,
				reasons,
				...(precondition !== undefined
					? { effectiveRtoSeconds: precondition.ttl.previousTtlSeconds }
					: undefined),
				rolledBackAt: clock(),
			},
		});
		return finish({
			ok: false,
			cutover: false,
			rolledBack: true,
			finalPercent: 0,
			reasons,
		});
	};

	let lastApply: ApplyResult | undefined;
	// Hysteresis promoted from the saga proof: a single unhealthy sample is a
	// flap, not a regression. Only `failuresToRollback` *consecutive* failures
	// abort the ramp; a healthy probe resets the streak. Below the threshold
	// the ramp HOLDS at the current percent and re-probes rather than
	// advancing — bounded because the streak either resets or reaches the
	// rollback threshold.
	let consecutiveFailures = 0;
	let stepIndex = 0;
	while (stepIndex < rampSteps.length) {
		// SAFETY: assertion required at this I/O or test boundary.
		const percent = rampSteps[stepIndex] as number;
		const synthesis = synthesizeAt(percent);
		if (synthesis.kind === "denied") {
			return rollback(synthesis.reasons, percent);
		}
		plans.push(synthesis.plan);
		lastApply = await options.port.apply(synthesis.plan);
		if (lastApply.realized !== "full") {
			return rollback(
				[
					{
						code: "apply-degraded",
						message: `provider realized ${lastApply.realized} at ${percent}%; cutover requires full realization`,
					},
				],
				percent,
			);
		}
		if (options.healthGate) {
			const healthy = await options.healthGate({
				percent,
				plan: synthesis.plan,
				applyResult: lastApply,
			});
			if (!healthy) {
				consecutiveFailures += 1;
				if (consecutiveFailures >= failuresToRollback) {
					return rollback(
						[
							{
								code: "health-gate-failed",
								message: `health gate failed at ${percent}% (${consecutiveFailures} consecutive failure(s), threshold ${failuresToRollback})`,
							},
						],
						percent,
					);
				}
				// Hold at this percent and re-probe on the next pass.
				continue;
			}
			consecutiveFailures = 0;
		}
		emit({
			type: CUTOVER_EVENTS.RampAdvanced,
			data: {
				service: options.topology.service,
				toBackendId: options.toBackendId,
				percent,
				planId: synthesis.plan.planId,
			},
		});
		stepIndex += 1;
	}

	emit({
		type: CUTOVER_EVENTS.RoutingChanged,
		data: {
			service: options.topology.service,
			fromBackendId: options.fromBackendId,
			toBackendId: options.toBackendId,
			changedAt: clock(),
		},
	});
	return finish({
		ok: true,
		cutover: true,
		rolledBack: false,
		finalPercent: 100,
		...(lastApply !== undefined ? { finalApplyResult: lastApply } : undefined),
	});
}
