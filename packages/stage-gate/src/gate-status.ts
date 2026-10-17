/**
 * How a check's exit code becomes its status, and how the checks of a run
 * become the record's status and the runner's exit code (ADR-0172).
 *
 * A gate is a conjunction: the record passes only when every check passed. A
 * failed check makes it `failed`. A check that could not be carried out (an
 * exit code its definition lists in `notRunExitCodes`) is `not_run`, and with
 * no failure beside it the record is `not_run`: it says nothing about the
 * product either way, so it is neither passed nor failed. A check whose
 * `requires` did not all pass is `skipped` and never started.
 */
import type {
	CheckResult,
	CheckStatus,
	RecordStatus,
	StageGateCheck,
} from "./types.js";

/** The exit code recorded for a check that was never started. */
export const NOT_STARTED_EXIT_CODE = -1;

/** The runner's exit code for a record with a `not_run` check and no failed one (ai-bdd's infrastructure code). */
export const NOT_RUN_EXIT_CODE = 3;

export function checkStatusOf(
	check: StageGateCheck,
	exitCode: number,
): CheckStatus {
	if (exitCode === 0) return "passed";
	return check.notRunExitCodes?.includes(exitCode) ? "not_run" : "failed";
}

/** The `requires` of a check that have not passed in this run, in the order the check lists them. */
export function unmetRequirements(
	check: StageGateCheck,
	passed: ReadonlySet<string>,
): readonly string[] {
	return (check.requires ?? []).filter((checkId) => !passed.has(checkId));
}

export function recordStatusOf(checks: readonly CheckResult[]): RecordStatus {
	if (checks.some((check) => check.status === "failed")) return "failed";
	if (checks.some((check) => check.status === "not_run")) return "not_run";
	// A skipped check beside no failure is a definition whose requirement can never pass: not a pass.
	return checks.every((check) => check.status === "passed")
		? "passed"
		: "failed";
}

export function runnerExitCodeOf(status: RecordStatus): number {
	if (status === "passed") return 0;
	return status === "not_run" ? NOT_RUN_EXIT_CODE : 1;
}
