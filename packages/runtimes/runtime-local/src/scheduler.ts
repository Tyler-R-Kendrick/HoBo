import {
	CronExpressionUnsupportedError,
	type CronSchedule,
	type FiredTimer,
	type IntervalCronSpec,
	parseIntervalCronSpec,
	parseScheduleId,
	SCHEDULER_PORT,
	type ScheduleId,
	type SchedulerPort,
	type VirtualClock,
} from "@hobo/core";

// Local hobo:scheduler port served over the deterministic clock's cron
// (src/clock.ts) — the D14 delegation seam. A scheduled bindle resource
// (manifest kind `schedule`, catalog portRef `hobo:scheduler`) registers its
// interval job through this port; fires ride the clock's `advance` loop so
// scheduling stays deterministic and replayable.
//
// v1 LIMITATION (recorded decision, D14): interval-only (`IntervalCronSpec`).
// The WIT `cron(expr)` cron-expression form fails closed
// (`CronExpressionUnsupportedError`) — there is NO cron-expression parser in
// the repo; adding one is a separate, flagged cost.

export type ScheduledJobHandler = (fire: FiredTimer) => void;

export interface LocalScheduler extends SchedulerPort {
	/** Register an interval job: cron schedule plus a handler run per fire. */
	registerJob(
		scheduleId: ScheduleId,
		spec: IntervalCronSpec,
		onFire: ScheduledJobHandler,
	): CronSchedule;
	/** Advance virtual time, dispatching registered job handlers on cron fires. */
	advance(deltaMs: number): readonly FiredTimer[];
	/**
	 * Provider export table for serving this port to components — the same
	 * shape `CapabilityLinkTable.registerProvider` / the component host accept
	 * (see capability/link-table.ts), keyed by the `hobo:scheduler` port token.
	 */
	providerExports(): Record<
		string,
		Record<string, (...args: unknown[]) => unknown>
	>;
}

export function createLocalScheduler(clock: VirtualClock): LocalScheduler {
	const jobs = new Map<string, ScheduledJobHandler>();

	const scheduler: LocalScheduler = {
		every(scheduleId: ScheduleId, spec: IntervalCronSpec): CronSchedule {
			return clock.cron(scheduleId, spec);
		},

		registerJob(
			scheduleId: ScheduleId,
			spec: IntervalCronSpec,
			onFire: ScheduledJobHandler,
		): CronSchedule {
			const schedule = clock.cron(scheduleId, spec);
			jobs.set(schedule.scheduleId, onFire);
			return schedule;
		},

		advance(deltaMs: number): readonly FiredTimer[] {
			const fired = clock.advance(deltaMs);
			for (const fire of fired) {
				if (fire.kind !== "cron" || fire.scheduleId === undefined) {
					continue;
				}
				jobs.get(fire.scheduleId)?.(fire);
			}
			return fired;
		},

		providerExports() {
			return {
				[SCHEDULER_PORT]: {
					every: (payload: unknown): CronSchedule => {
						const record = (payload ?? {}) as {
							scheduleId?: unknown;
							everyMs?: unknown;
							startAtMs?: unknown;
						};
						const spec = parseIntervalCronSpec({
							every_ms: record.everyMs as number,
							...(record.startAtMs !== undefined
								? { start_at_ms: record.startAtMs as number }
								: {}),
						});
						return scheduler.every(
							parseScheduleId(String(record.scheduleId ?? "")),
							spec,
						);
					},
					cron: (payload: unknown): never => {
						const expr = (payload as { expr?: unknown } | undefined)?.expr;
						throw new CronExpressionUnsupportedError(String(expr ?? ""));
					},
				},
			};
		},
	};

	return Object.freeze(scheduler);
}
