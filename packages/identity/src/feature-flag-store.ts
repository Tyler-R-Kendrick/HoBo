/**
 * Built-in OpenFeature-compatible feature-flag store (ADR-0044 / ADR-0083).
 * Default air-gap engine; migration cohort ramps use this — no parallel flag system.
 */
import { createHash, randomUUID } from "node:crypto";

// public-contract: flag event schema version.
export const FLAG_EVENT_SCHEMA_VERSION = "hobo.flag-events/v1" as const;

export const FLAG_EVENTS = Object.freeze({
	Defined: "flag.Defined",
	Changed: "flag.Changed",
	Evaluated: "flag.Evaluated",
	Archived: "flag.Archived",
} as const);

export type FlagEventType = (typeof FLAG_EVENTS)[keyof typeof FLAG_EVENTS];

export type FlagEvent = Readonly<{
	id: string;
	type: FlagEventType;
	schemaVersion: typeof FLAG_EVENT_SCHEMA_VERSION;
	seq: number;
	time: string;
	data: Readonly<Record<string, unknown>>;
}>;

export type FlagDefinition = Readonly<{
	key: string;
	/** Boolean default; percentage ramp uses targeting.percentage. */
	defaultValue: boolean;
	/** 0–100 progressive ramp (OpenFeature percentage targeting). */
	percentage: number;
	enabled: boolean;
	/** Optional migration binding. */
	migrationId?: string;
	/** Auto-abort when dual oracle fails (migration flags). */
	autoAbortOnDualFailure: boolean;
	seq: number;
	updatedAt: string;
}>;

export type FlagEvaluation = Readonly<{
	flagKey: string;
	value: boolean;
	reason: "targeting-match" | "default" | "disabled" | "fail-safe-default";
	variant: "on" | "off";
	rulesetSeq: number;
	/** OpenFeature-compatible evaluation context hash (no PII). */
	contextDigest: string;
}>;

export type FlagEvalContext = Readonly<{
	/** PrincipalRef or opaque targeting key. */
	targetingKey: string;
	tenant?: string;
}>;

/**
 * In-process deterministic flag store. Evaluation is pure over (ruleset@seq, context).
 */
export class FeatureFlagStore {
	private seq = 0;
	private readonly flags = new Map<string, FlagDefinition>();
	readonly events: FlagEvent[] = [];
	private readonly now: () => string;

	constructor(options?: { readonly now?: () => string }) {
		this.now = options?.now ?? (() => new Date().toISOString());
	}

	list(): readonly FlagDefinition[] {
		return Object.freeze([...this.flags.values()]);
	}

	get(key: string): FlagDefinition | undefined {
		return this.flags.get(key);
	}

	/** Define or replace a flag (emits flag.Defined or flag.Changed). */
	define(input: {
		readonly key: string;
		readonly defaultValue?: boolean;
		readonly percentage?: number;
		readonly enabled?: boolean;
		readonly migrationId?: string;
		readonly autoAbortOnDualFailure?: boolean;
	}): FlagDefinition {
		const existing = this.flags.get(input.key);
		const t = this.now();
		const nextSeq = this.nextSeq();
		const def: FlagDefinition = Object.freeze({
			key: input.key,
			defaultValue: input.defaultValue ?? false,
			percentage: clampPercent(input.percentage ?? existing?.percentage ?? 0),
			enabled: input.enabled ?? existing?.enabled ?? true,
			...(input.migrationId !== undefined
				? { migrationId: input.migrationId }
				: existing?.migrationId !== undefined
					? { migrationId: existing.migrationId }
					: {}),
			autoAbortOnDualFailure:
				input.autoAbortOnDualFailure ??
				existing?.autoAbortOnDualFailure ??
				false,
			seq: nextSeq,
			updatedAt: t,
		});
		this.flags.set(input.key, def);
		const type = existing ? FLAG_EVENTS.Changed : FLAG_EVENTS.Defined;
		this.events.push(
			Object.freeze({
				id: `evt-${type}-${input.key}-${nextSeq}`,
				type,
				schemaVersion: FLAG_EVENT_SCHEMA_VERSION,
				seq: nextSeq,
				time: t,
				data: Object.freeze({
					key: def.key,
					defaultValue: def.defaultValue,
					percentage: def.percentage,
					enabled: def.enabled,
					...(def.migrationId !== undefined
						? { migrationId: def.migrationId }
						: {}),
					autoAbortOnDualFailure: def.autoAbortOnDualFailure,
				}),
			}),
		);
		return def;
	}

	/**
	 * OpenFeature-shaped boolean evaluation. Deterministic: hash targetingKey
	 * into 0–99 bucket vs percentage.
	 */
	evaluateBoolean(
		key: string,
		context: FlagEvalContext,
		defaultValue = false,
	): FlagEvaluation {
		const def = this.flags.get(key);
		const contextDigest = `sha256:${createHash("sha256")
			.update(`${context.tenant ?? ""}:${context.targetingKey}`)
			.digest("hex")
			.slice(0, 16)}`;

		if (!def || !def.enabled) {
			const evaluation: FlagEvaluation = Object.freeze({
				flagKey: key,
				value: defaultValue,
				reason: def ? ("disabled" as const) : ("fail-safe-default" as const),
				variant: defaultValue ? ("on" as const) : ("off" as const),
				rulesetSeq: def?.seq ?? 0,
				contextDigest,
			});
			this.sampleEval(evaluation);
			return evaluation;
		}

		const inCohort = bucket(context.targetingKey) < def.percentage;
		const value = inCohort ? true : def.defaultValue;
		const evaluation: FlagEvaluation = Object.freeze({
			flagKey: key,
			value,
			reason: inCohort ? ("targeting-match" as const) : ("default" as const),
			variant: value ? ("on" as const) : ("off" as const),
			rulesetSeq: def.seq,
			contextDigest,
		});
		this.sampleEval(evaluation);
		return evaluation;
	}

	archive(key: string): void {
		const def = this.flags.get(key);
		if (!def) return;
		this.flags.delete(key);
		const seq = this.nextSeq();
		this.events.push(
			Object.freeze({
				id: `evt-${FLAG_EVENTS.Archived}-${key}-${seq}`,
				type: FLAG_EVENTS.Archived,
				schemaVersion: FLAG_EVENT_SCHEMA_VERSION,
				seq,
				time: this.now(),
				data: Object.freeze({ key }),
			}),
		);
	}

	private sampleEval(evaluation: FlagEvaluation): void {
		// Sampled flag.Evaluated for experiment analytics (always record in-process;
		// production sampling is a policy knob on the event stream consumer).
		const seq = this.nextSeq();
		this.events.push(
			Object.freeze({
				id: `evt-${FLAG_EVENTS.Evaluated}-${evaluation.flagKey}-${seq}`,
				type: FLAG_EVENTS.Evaluated,
				schemaVersion: FLAG_EVENT_SCHEMA_VERSION,
				seq,
				time: this.now(),
				data: Object.freeze({ ...evaluation }),
			}),
		);
	}

	private nextSeq(): number {
		this.seq += 1;
		return this.seq;
	}
}

function clampPercent(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(100, Math.floor(n)));
}

function bucket(targetingKey: string): number {
	let h = 0;
	for (let i = 0; i < targetingKey.length; i++) {
		h = (h * 31 + targetingKey.charCodeAt(i)) >>> 0;
	}
	return h % 100;
}

/** Stable flag key for a migration cohort (OpenFeature key). */
export function migrationCohortFlagKey(migrationId: string): string {
	return `identity-migration.${migrationId}`;
}

export function createMigrationFlagId(): string {
	return `flag_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
