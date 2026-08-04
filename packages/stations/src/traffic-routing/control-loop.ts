// Closed routing control loop: budget/health signals in, re-synthesized and
// re-applied routing plans out. Composes the pieces that already exist —
// observation folding (observations.ts), policy-gated plan synthesis
// (synthesize.ts, fails closed), the ADR-0071 Dispatcher as the picker, and a
// TrafficRoutingPort adapter as the actuator — and adds the minimal
// StabilityPolicy subset (cooldown, hysteresis, flip limit) from the FinOps
// control-plane design so the loop cannot flap.
import type {
	ApplyResult,
	MinAvailabilitySpec,
	PolicyDecision,
	RoutingPlan,
	TrafficRoutingPort,
} from "@hobo/core";
import {
	type CreditLedgerView,
	createDispatcherRegistry,
	type DispatchFact,
	decideDispatch,
} from "@hobo/dispatcher";

import {
	type CutoverHealthGate,
	type CutoverPrecondition,
	executeRoutingCutover,
} from "./cutover.js";
import {
	applyRoutingObservations,
	type RoutingObservations,
} from "./observations.js";
import {
	type RoutingSynthesisDenial,
	type RoutingTopology,
	synthesizeRoutingPlan,
} from "./synthesize.js";

export const ROUTING_LOOP_EVENTS = Object.freeze({
	ReplanProposed: "routing.ReplanProposed",
	Reapplied: "routing.Reapplied",
	ReplanHeld: "routing.ReplanHeld",
	ReplanDenied: "routing.ReplanDenied",
} as const);

/** Minimal StabilityPolicy subset (FinOps control-plane design). */
export interface RoutingStabilityPolicy {
	/** Minimum seconds between applied swaps. */
	cooldownSeconds: number;
	/** Dispatcher hysteresis: hold the incumbent unless savings clear this. */
	hysteresisMinSavingsUsd?: number;
	/** Maximum applied swaps within windowSeconds. */
	maxSwapsPerWindow?: number;
	windowSeconds?: number;
}

/** Per-backend cost facts the Dispatcher ranks (operator/station supplied). */
export interface BackendCostModel {
	backendId: string;
	listUnitCost: number;
	switchingCost?: number;
}

export type RoutingControlSignal =
	| Readonly<{
			kind: "budget";
			/** A budget.ThresholdCrossed / budget.Recovered fact. */
			fact: { type: string; data?: unknown };
	  }>
	| Readonly<{ kind: "health"; observations: RoutingObservations }>;

export type RoutingControlOutcome =
	| Readonly<{
			action: "reapplied";
			plan: RoutingPlan;
			applyResult: ApplyResult;
			selectedBackendId: string;
			facts: readonly DispatchFact[];
	  }>
	| Readonly<{
			action: "held";
			reason: "cooldown" | "flip-limit";
			selectedBackendId: string;
			facts: readonly DispatchFact[];
	  }>
	| Readonly<{
			action: "noop";
			reason: "incumbent-optimal";
			facts: readonly DispatchFact[];
	  }>
	| Readonly<{
			action: "rolled-back";
			reasons: readonly { code: string; message: string }[];
			selectedBackendId: string;
			facts: readonly DispatchFact[];
	  }>
	| Readonly<{
			action: "denied";
			reasons: readonly (
				| RoutingSynthesisDenial
				| { code: string; message: string }
			)[];
			facts: readonly DispatchFact[];
	  }>;

export interface RoutingControlLoopOptions {
	topology: RoutingTopology;
	availability?: MinAvailabilitySpec;
	/** Context-bound policy decision for `routing.plan` on the service. */
	policyDecision: PolicyDecision;
	/** Cost facts per backend; backends without a model never win a swap. */
	costModel: readonly BackendCostModel[];
	/** Pinned credit/budget ledger snapshot provider for dispatch ranking. */
	ledgerView?: () => CreditLedgerView;
	port: TrafficRoutingPort;
	stability: RoutingStabilityPolicy;
	/** Initially active backend id (the incumbent). */
	incumbentBackendId: string;
	/**
	 * When set, swaps execute as a progressive health-gated cutover
	 * (domain.CutoverStarted → routing.RampAdvanced* → domain.RoutingChanged)
	 * instead of a single reweighted apply; a failed ramp compensates back to
	 * the incumbent (domain.RolledBack).
	 */
	cutover?: {
		rampSteps?: readonly number[];
		healthGate?: CutoverHealthGate;
		/** Consecutive health-gate failures tolerated before rollback. */
		consecutiveFailuresToRollback?: number;
		/** Fail-closed saga preconditions (validated change, TTL wait, live incumbent). */
		precondition?: CutoverPrecondition;
	};
	units?: number;
	clock?: () => string;
	/** Observer for emitted facts (dispatch.Decided, routing.*). */
	onFact?: (fact: DispatchFact) => void;
}

export interface RoutingControlLoop {
	handleSignal(signal: RoutingControlSignal): Promise<RoutingControlOutcome>;
	incumbent(): string;
	revision(): number;
}

export function createRoutingControlLoop(
	options: RoutingControlLoopOptions,
): RoutingControlLoop {
	const clock = options.clock ?? (() => new Date().toISOString());
	const stability = options.stability;
	let incumbentBackendId = options.incumbentBackendId;
	let observations: RoutingObservations | undefined;
	let revision = 0;
	let lastSwapAtMs: number | undefined;
	let swapTimesMs: number[] = [];

	function emit(facts: DispatchFact[], fact: DispatchFact): void {
		facts.push(fact);
		options.onFact?.(fact);
	}

	async function handleSignal(
		signal: RoutingControlSignal,
	): Promise<RoutingControlOutcome> {
		const facts: DispatchFact[] = [];
		const now = clock();
		const nowMs = Date.parse(now);

		if (signal.kind === "health") {
			observations = signal.observations;
		}

		// Observe: fold the latest health observations into the topology.
		const topology = applyRoutingObservations(options.topology, observations);
		const healthy = topology.backends.filter(
			(backend) => backend.healthy !== false,
		);

		// Decide (picker): rank healthy backends by effective marginal cost
		// against the pinned ledger view, holding the incumbent via hysteresis.
		const modelled = new Map(
			options.costModel.map((entry) => [entry.backendId, entry] as const),
		);
		const candidates = healthy
			.filter((backend) => modelled.has(backend.id))
			.map((backend) => {
				const model = modelled.get(backend.id);
				return {
					id: backend.id,
					providerId: backend.id,
					category: "traffic-backend" as const,
					listUnitCost: model?.listUnitCost ?? 0,
					switchingCost: model?.switchingCost ?? 0,
				};
			});
		const ledgerView =
			options.ledgerView?.() ??
			({ view: "CreditLedgerView", seq: 0, accounts: [] } as CreditLedgerView);
		const decision = decideDispatch({
			registry: createDispatcherRegistry(candidates),
			category: "traffic-backend",
			dispatchId: `route:${topology.service}:r${revision + 1}`,
			units: options.units ?? 1,
			ledgerView,
			incumbentProviderId: incumbentBackendId,
			...(stability.hysteresisMinSavingsUsd !== undefined
				? {
						hysteresis: {
							incumbentProviderId: incumbentBackendId,
							minimumSavings: stability.hysteresisMinSavingsUsd,
							dwellWindow: `PT${stability.cooldownSeconds}S`,
							observedAt: now,
						},
					}
				: {}),
		});
		if (!decision.ok) {
			const denial = {
				code: "dispatch-failed",
				message: decision.reason ?? "dispatch failed",
			};
			emit(facts, {
				type: ROUTING_LOOP_EVENTS.ReplanDenied,
				data: { service: topology.service, reasons: [denial] },
			});
			return Object.freeze({ action: "denied", reasons: [denial], facts });
		}
		emit(facts, decision.dispatchEvent);
		const selectedBackendId = decision.selectedProvider;

		if (selectedBackendId === incumbentBackendId) {
			return Object.freeze({
				action: "noop",
				reason: "incumbent-optimal",
				facts,
			});
		}

		// Plan: re-synthesize with the winner promoted; fails closed on policy
		// deny and availability shortfalls BEFORE any stability accounting.
		const targetTopology = Object.freeze({
			...topology,
			backends: Object.freeze(
				topology.backends.map((backend) =>
					Object.freeze({
						...backend,
						weight: backend.id === selectedBackendId ? 100 : 1,
					}),
				),
			),
		});
		const synthesis = synthesizeRoutingPlan({
			topology: targetTopology,
			...(options.availability !== undefined
				? { availability: options.availability }
				: {}),
			policyDecision: options.policyDecision,
			now,
			planId: `plan:${topology.service}:${topology.stationId}:r${revision + 1}`,
			weightStrategy: "static",
		});
		if (synthesis.kind === "denied") {
			emit(facts, {
				type: ROUTING_LOOP_EVENTS.ReplanDenied,
				data: { service: topology.service, reasons: synthesis.reasons },
			});
			return Object.freeze({
				action: "denied",
				reasons: synthesis.reasons,
				facts,
			});
		}

		// Stability guards: cooldown, then flip limit inside the window.
		if (
			lastSwapAtMs !== undefined &&
			nowMs - lastSwapAtMs < stability.cooldownSeconds * 1000
		) {
			emit(facts, {
				type: ROUTING_LOOP_EVENTS.ReplanHeld,
				data: {
					service: topology.service,
					reason: "cooldown",
					selectedBackendId,
					cooldownSeconds: stability.cooldownSeconds,
				},
			});
			return Object.freeze({
				action: "held",
				reason: "cooldown",
				selectedBackendId,
				facts,
			});
		}
		const windowSeconds = stability.windowSeconds;
		if (
			stability.maxSwapsPerWindow !== undefined &&
			windowSeconds !== undefined
		) {
			swapTimesMs = swapTimesMs.filter(
				(time) => nowMs - time < windowSeconds * 1000,
			);
			if (swapTimesMs.length >= stability.maxSwapsPerWindow) {
				emit(facts, {
					type: ROUTING_LOOP_EVENTS.ReplanHeld,
					data: {
						service: topology.service,
						reason: "flip-limit",
						selectedBackendId,
						maxSwapsPerWindow: stability.maxSwapsPerWindow,
						windowSeconds: stability.windowSeconds,
					},
				});
				return Object.freeze({
					action: "held",
					reason: "flip-limit",
					selectedBackendId,
					facts,
				});
			}
		}

		// Act: propose, apply through the port, then record the swap.
		revision += 1;
		emit(facts, {
			type: ROUTING_LOOP_EVENTS.ReplanProposed,
			data: {
				service: topology.service,
				planId: synthesis.plan.planId,
				fromBackendId: incumbentBackendId,
				toBackendId: selectedBackendId,
				revision,
			},
		});

		if (options.cutover) {
			const result = await executeRoutingCutover({
				topology,
				policyDecision: options.policyDecision,
				port: options.port,
				fromBackendId: incumbentBackendId,
				toBackendId: selectedBackendId,
				...(options.cutover.rampSteps !== undefined
					? { rampSteps: options.cutover.rampSteps }
					: {}),
				...(options.cutover.healthGate !== undefined
					? { healthGate: options.cutover.healthGate }
					: {}),
				...(options.cutover.consecutiveFailuresToRollback !== undefined
					? {
							consecutiveFailuresToRollback:
								options.cutover.consecutiveFailuresToRollback,
						}
					: {}),
				...(options.cutover.precondition !== undefined
					? { precondition: options.cutover.precondition }
					: {}),
				clock,
				planIdPrefix: `plan:${topology.service}:${topology.stationId}:r${revision}`,
				onFact: (fact) => emit(facts, fact),
			});
			if (result.refused) {
				// Refused before any traffic moved (saga precondition or shape
				// failure): a denial, not a rollback — no cooldown, the loop may
				// replan as soon as the precondition is satisfied.
				emit(facts, {
					type: ROUTING_LOOP_EVENTS.ReplanDenied,
					data: { service: topology.service, reasons: result.reasons },
				});
				return Object.freeze({
					action: "denied",
					reasons: result.reasons,
					facts,
				});
			}
			if (!result.ok) {
				// A rolled-back attempt still starts the cooldown so the loop
				// does not immediately retry a failing target.
				lastSwapAtMs = nowMs;
				return Object.freeze({
					action: "rolled-back",
					reasons: result.reasons,
					selectedBackendId,
					facts,
				});
			}
			const finalPlan = result.plans[result.plans.length - 1];
			const finalApplyResult = result.finalApplyResult;
			if (!finalPlan || !finalApplyResult) {
				const denial = {
					code: "cutover-incomplete",
					message: "cutover reported ok without a final applied plan",
				};
				emit(facts, {
					type: ROUTING_LOOP_EVENTS.ReplanDenied,
					data: { service: topology.service, reasons: [denial] },
				});
				return Object.freeze({ action: "denied", reasons: [denial], facts });
			}
			const previous = incumbentBackendId;
			incumbentBackendId = selectedBackendId;
			lastSwapAtMs = nowMs;
			swapTimesMs.push(nowMs);
			emit(facts, {
				type: ROUTING_LOOP_EVENTS.Reapplied,
				data: {
					service: topology.service,
					planId: finalPlan.planId,
					fromBackendId: previous,
					toBackendId: selectedBackendId,
					realized: finalApplyResult.realized,
					revision,
				},
			});
			return Object.freeze({
				action: "reapplied",
				plan: finalPlan,
				applyResult: finalApplyResult,
				selectedBackendId,
				facts,
			});
		}

		const applyResult = await options.port.apply(synthesis.plan);
		if (applyResult.realized === "none") {
			const denial = {
				code: "apply-unrealized",
				message: `provider realized none of plan ${synthesis.plan.planId}`,
			};
			emit(facts, {
				type: ROUTING_LOOP_EVENTS.ReplanDenied,
				data: { service: topology.service, reasons: [denial] },
			});
			return Object.freeze({ action: "denied", reasons: [denial], facts });
		}
		const previousIncumbent = incumbentBackendId;
		incumbentBackendId = selectedBackendId;
		lastSwapAtMs = nowMs;
		swapTimesMs.push(nowMs);
		emit(facts, {
			type: ROUTING_LOOP_EVENTS.Reapplied,
			data: {
				service: topology.service,
				planId: synthesis.plan.planId,
				fromBackendId: previousIncumbent,
				toBackendId: selectedBackendId,
				realized: applyResult.realized,
				revision,
			},
		});
		return Object.freeze({
			action: "reapplied",
			plan: synthesis.plan,
			applyResult,
			selectedBackendId,
			facts,
		});
	}

	return {
		handleSignal,
		incumbent: () => incumbentBackendId,
		revision: () => revision,
	};
}
