/**
 * Progressive dual-ramp via Harness-shaped cohort flags (no parallel flag system).
 * Auto-abort / compensate on dual-consistency failure.
 */
import type { IdentityMigrationService } from "./migration-aggregate.js";

// public-contract: migration cohort flag schema (OpenFeature-compatible shape).
export const MIGRATION_COHORT_FLAG_SCHEMA =
	"hobo.identity-migration-cohort-flag/v1" as const;

export type MigrationCohortFlag = Readonly<{
	schemaVersion: typeof MIGRATION_COHORT_FLAG_SCHEMA;
	flagId: string;
	migrationId: string;
	tenant: string;
	/** 0–100 ramp percent. */
	percentage: number;
	enabled: boolean;
	/** Harness auto-abort when dual oracle fails. */
	autoAbortOnDualFailure: true;
}>;

export function createMigrationCohortFlag(input: {
	readonly migrationId: string;
	readonly tenant: string;
	readonly percentage?: number;
}): MigrationCohortFlag {
	return Object.freeze({
		schemaVersion: MIGRATION_COHORT_FLAG_SCHEMA,
		flagId: `flag:identity-migration:${input.migrationId}`,
		migrationId: input.migrationId,
		tenant: input.tenant,
		percentage: input.percentage ?? 0,
		enabled: true,
		autoAbortOnDualFailure: true as const,
	});
}

/**
 * Advance ramp under Harness discipline. Auto-aborts + compensates on failures.
 */
export function advanceMigrationRamp(input: {
	readonly service: IdentityMigrationService;
	readonly targetPercent: number;
	readonly dualConsistencyOk: boolean;
}): {
	flag: MigrationCohortFlag;
	aborted: boolean;
	record: ReturnType<IdentityMigrationService["snapshot"]>;
} {
	const snap = input.service.snapshot();
	if (!snap) {
		throw Object.assign(new Error("no active migration"), {
			code: "migration-not-active",
		});
	}

	if (!input.dualConsistencyOk) {
		input.service.abort({
			reason: "Harness auto-abort: dual-consistency Golden failure",
			code: "dual-consistency-failed",
		});
		input.service.compensate({
			reason: "auto-compensate to source after dual-consistency failure",
		});
		const flag = createMigrationCohortFlag({
			migrationId: snap.id,
			tenant: snap.tenant,
			percentage: snap.rampPercent,
		});
		return {
			flag: Object.freeze({ ...flag, enabled: false, percentage: 0 }),
			aborted: true,
			record: input.service.snapshot(),
		};
	}

	const record = input.service.advanceRamp({
		rampPercent: input.targetPercent,
		cohortFlagId: snap.cohortFlagId,
	});
	const flag = createMigrationCohortFlag({
		migrationId: record.id,
		tenant: record.tenant,
		percentage: record.rampPercent,
	});
	return { flag, aborted: false, record };
}

/**
 * Evaluate whether a principal is in the migration ramp cohort (OpenFeature-style).
 * Deterministic: hash principal into 0–99 bucket.
 */
export function principalInMigrationCohort(input: {
	readonly principalRef: string;
	readonly percentage: number;
}): boolean {
	if (input.percentage >= 100) return true;
	if (input.percentage <= 0) return false;
	let h = 0;
	for (let i = 0; i < input.principalRef.length; i++) {
		h = (h * 31 + input.principalRef.charCodeAt(i)) >>> 0;
	}
	return h % 100 < input.percentage;
}
