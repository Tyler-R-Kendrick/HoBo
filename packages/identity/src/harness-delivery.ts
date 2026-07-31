/**
 * OpenDelivery port (hobo:delivery) — canary / staged rollouts / auto-rollback.
 * Built-in default reuses flag percentage + gateway-weighted traffic signal.
 * External Argo/Flagger adapters are ranked optionals (not required).
 */
import { createHash, randomUUID } from "node:crypto";

import type { FeatureFlagStore } from "./feature-flag-store.js";

// public-contract: OpenDelivery port id.
export const DELIVERY_PORT = "hobo:delivery" as const;

// public-contract: rollout event schema.
export const ROLLOUT_EVENT_SCHEMA = "hobo.rollout-events/v1" as const;

export const ROLLOUT_EVENTS = Object.freeze({
	Started: "rollout.Started",
	Stepped: "rollout.Stepped",
	Promoted: "rollout.Promoted",
	RolledBack: "rollout.RolledBack",
	Failed: "rollout.Failed",
} as const);

export type RolloutEvent = Readonly<{
	id: string;
	type: (typeof ROLLOUT_EVENTS)[keyof typeof ROLLOUT_EVENTS];
	schemaVersion: typeof ROLLOUT_EVENT_SCHEMA;
	seq: number;
	time: string;
	data: Readonly<Record<string, unknown>>;
}>;

export type RolloutStage = Readonly<{
	percent: number;
	duration?: string;
	analysis?: Readonly<{
		slo?: string;
		golden?: boolean;
		guardrailMetric?: string;
	}>;
}>;

export type RolloutPolicy = Readonly<{
	name: string;
	flag: string;
	stages: readonly RolloutStage[];
	traffic: "flag-only" | "gateway-weighted";
	autoRollback: boolean;
	/** Gateway weight signal (0–100) when traffic is gateway-weighted. */
	gatewayWeightPercent?: number;
}>;

export type RolloutState = Readonly<{
	id: string;
	policy: RolloutPolicy;
	status: "running" | "promoted" | "rolled_back" | "failed";
	stageIndex: number;
	percent: number;
	gatewayWeightPercent: number;
	startedAt: string;
	updatedAt: string;
	reason?: string;
}>;

export type DeliveryHealthSignal = Readonly<{
	sloBurning?: boolean;
	goldenFailed?: boolean;
	guardrailRegressed?: boolean;
}>;

/**
 * Built-in OpenDelivery engine: advances flag percentage through stages,
 * optionally mirrors gateway weight, auto-rollbacks on health signals.
 */
export class OpenDeliveryEngine {
	readonly events: RolloutEvent[] = [];
	private seq = 0;
	private readonly rollouts = new Map<string, RolloutState>();
	private readonly now: () => string;
	private readonly store: FeatureFlagStore;

	constructor(options: {
		readonly store: FeatureFlagStore;
		readonly now?: () => string;
	}) {
		this.store = options.store;
		this.now = options.now ?? (() => new Date().toISOString());
	}

	list(): readonly RolloutState[] {
		return Object.freeze([...this.rollouts.values()]);
	}

	get(id: string): RolloutState | undefined {
		return this.rollouts.get(id);
	}

	start(policy: RolloutPolicy): RolloutState {
		if (!policy.stages.length) {
			throw new TypeError("rollout requires at least one stage");
		}
		const id = `rollout_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
		const t = this.now();
		const stage0 = policy.stages[0]!;
		const state: RolloutState = Object.freeze({
			id,
			policy: freezePolicy(policy),
			status: "running",
			stageIndex: 0,
			percent: clamp(stage0.percent),
			gatewayWeightPercent:
				policy.traffic === "gateway-weighted"
					? clamp(policy.gatewayWeightPercent ?? stage0.percent)
					: 0,
			startedAt: t,
			updatedAt: t,
		});
		this.rollouts.set(id, state);
		this.applyFlagPercent(policy.flag, state.percent);
		this.emit(ROLLOUT_EVENTS.Started, {
			rolloutId: id,
			flag: policy.flag,
			percent: state.percent,
			traffic: policy.traffic,
		});
		return state;
	}

	/**
	 * Advance to next stage or promote. Auto-rollback when health fails and
	 * policy.autoRollback is true (durable obligation shape).
	 */
	step(rolloutId: string, health: DeliveryHealthSignal = {}): RolloutState {
		const prev = this.require(rolloutId);
		if (prev.status !== "running") return prev;

		if (
			prev.policy.autoRollback &&
			(health.sloBurning || health.goldenFailed || health.guardrailRegressed)
		) {
			return this.rollback(rolloutId, {
				sloBurning: health.sloBurning === true,
				goldenFailed: health.goldenFailed === true,
				guardrailRegressed: health.guardrailRegressed === true,
			});
		}

		const nextIndex = prev.stageIndex + 1;
		const t = this.now();
		if (nextIndex >= prev.policy.stages.length) {
			const promoted: RolloutState = Object.freeze({
				...prev,
				status: "promoted",
				percent: 100,
				gatewayWeightPercent:
					prev.policy.traffic === "gateway-weighted"
						? 100
						: prev.gatewayWeightPercent,
				updatedAt: t,
			});
			this.rollouts.set(rolloutId, promoted);
			this.applyFlagPercent(prev.policy.flag, 100);
			this.emit(ROLLOUT_EVENTS.Promoted, {
				rolloutId,
				flag: prev.policy.flag,
				percent: 100,
			});
			return promoted;
		}

		const stage = prev.policy.stages[nextIndex]!;
		const stepped: RolloutState = Object.freeze({
			...prev,
			stageIndex: nextIndex,
			percent: clamp(stage.percent),
			gatewayWeightPercent:
				prev.policy.traffic === "gateway-weighted"
					? clamp(stage.percent)
					: prev.gatewayWeightPercent,
			updatedAt: t,
		});
		this.rollouts.set(rolloutId, stepped);
		this.applyFlagPercent(prev.policy.flag, stepped.percent);
		this.emit(ROLLOUT_EVENTS.Stepped, {
			rolloutId,
			flag: prev.policy.flag,
			stageIndex: nextIndex,
			percent: stepped.percent,
			gatewayWeightPercent: stepped.gatewayWeightPercent,
		});
		return stepped;
	}

	rollback(
		rolloutId: string,
		reason: Readonly<Record<string, boolean | string>>,
	): RolloutState {
		const prev = this.require(rolloutId);
		const t = this.now();
		const rolled: RolloutState = Object.freeze({
			...prev,
			status: "rolled_back",
			percent: 0,
			gatewayWeightPercent: 0,
			updatedAt: t,
			reason: JSON.stringify(reason),
		});
		this.rollouts.set(rolloutId, rolled);
		this.applyFlagPercent(prev.policy.flag, 0);
		// Kill-switch fast path for safety
		this.store.activateKillSwitch(prev.policy.flag, "open-delivery-rollback");
		this.emit(ROLLOUT_EVENTS.RolledBack, {
			rolloutId,
			flag: prev.policy.flag,
			reason,
			obligation: "auto-rollback",
		});
		return rolled;
	}

	/** Gateway weight signal for ADR-0035 weighted routing composition. */
	gatewayWeight(rolloutId: string): number {
		return this.get(rolloutId)?.gatewayWeightPercent ?? 0;
	}

	private applyFlagPercent(flag: string, percent: number): void {
		const existing = this.store.get(flag);
		// Never clear an active kill-switch on ramp start/step — treatment must stay dark.
		const killSwitch = existing?.killSwitch === true;
		this.store.define({
			key: flag,
			// Kill-switch forces zero percent; otherwise apply the stage percent.
			percentage: killSwitch ? 0 : percent,
			enabled: true,
			state: "ENABLED",
			killSwitch,
			defaultValue: existing?.defaultValue ?? false,
			variants: existing?.variants,
			defaultVariant: existing?.defaultVariant,
			...(existing?.migrationId !== undefined
				? { migrationId: existing.migrationId }
				: {}),
			...(existing?.metadata !== undefined
				? { metadata: existing.metadata }
				: {}),
			...(existing?.targeting !== undefined
				? { targeting: existing.targeting }
				: {}),
		});
	}

	private require(id: string): RolloutState {
		const s = this.rollouts.get(id);
		if (!s) {
			throw Object.assign(new Error(`rollout not found: ${id}`), {
				code: "rollout-missing",
			});
		}
		return s;
	}

	private emit(
		type: RolloutEvent["type"],
		data: Readonly<Record<string, unknown>>,
	): void {
		this.seq += 1;
		this.events.push(
			Object.freeze({
				id: `evt-${type}-${this.seq}`,
				type,
				schemaVersion: ROLLOUT_EVENT_SCHEMA,
				seq: this.seq,
				time: this.now(),
				data: Object.freeze({ ...data }),
			}),
		);
	}
}

function freezePolicy(p: RolloutPolicy): RolloutPolicy {
	return Object.freeze({
		name: p.name,
		flag: p.flag,
		stages: Object.freeze(p.stages.map((s) => Object.freeze({ ...s }))),
		traffic: p.traffic,
		autoRollback: p.autoRollback === true,
		...(p.gatewayWeightPercent !== undefined
			? { gatewayWeightPercent: p.gatewayWeightPercent }
			: {}),
	});
}

function clamp(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(100, Math.floor(n)));
}

export function contentHashRollout(policy: RolloutPolicy): `sha256:${string}` {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(policy))
		.digest("hex")}`;
}
