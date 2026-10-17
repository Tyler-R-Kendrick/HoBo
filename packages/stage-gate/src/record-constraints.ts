/**
 * What a record that claims `passed` must also hold, per gate. The other
 * statuses describe what happened and carry no claim, so they are not held to
 * these. Constraints mirror data-models/stage_gate_record.cue.
 */
import type { CheckEvidence, StageGateRecord } from "./types.js";

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

/** The release gate's checks, in order (definition.ts builds them; ADR-0172). */
export const RELEASE_CHECK_IDS = [
	"acceptance-plans-fresh",
	"acceptance-replay",
	"acceptance-evidence-intact",
] as const;

/** S0 attests a built, signed component. */
function validatePassedS0(record: StageGateRecord, issues: string[]): void {
	if (!record.signature.verified) {
		issues.push("passed record requires signature.verified === true");
	}
	if (!DIGEST_RE.test(record.artifact.digestSha256)) {
		issues.push("passed record requires artifact.digest_sha256");
	}
}

/** What acceptance-replay records, as strings, for a replay-only run that passed. */
const REPLAY_ONLY = {
	model_calls: "0",
	frozen: "true",
	no_agent: "true",
	report_exit_code: "0",
} as const;

function countIn(evidence: CheckEvidence | undefined, key: string): number {
	const text = evidence?.[key] ?? "";
	return /^\d+$/u.test(text) ? Number(text) : 0;
}

function validateReplayEvidence(
	replay: CheckEvidence | undefined,
	issues: string[],
): void {
	if (!DIGEST_RE.test(replay?.report_digest ?? "")) {
		issues.push(
			"passed release record requires acceptance-replay evidence report_digest",
		);
	}
	if ((replay?.run_id ?? "") === "") {
		issues.push(
			"passed release record requires acceptance-replay evidence run_id",
		);
	}
	for (const [key, value] of Object.entries(REPLAY_ONLY)) {
		if (replay?.[key] !== value) {
			issues.push(
				`passed release record requires acceptance-replay evidence ${key} "${value}"`,
			);
		}
	}
	const replayed =
		countIn(replay, "scenarios_passed") + countIn(replay, "scenarios_healed");
	if (countIn(replay, "scenarios_total") === 0 || replayed === 0) {
		issues.push(
			"passed release record requires acceptance-replay evidence that a scenario replayed (scenarios_total above 0, scenarios_passed + scenarios_healed above 0)",
		);
	}
}

/**
 * The release gate attests that the documented scenarios replayed: all three
 * acceptance checks, in order; the replay's evidence of a replay-only run that
 * replayed something; and evidence-intact naming the same run and report the
 * replay judged. An empty or partial check list would pass "every check
 * passed" vacuously, and an evidence-intact about another run would vouch for
 * a report nobody judged.
 */
function validatePassedRelease(
	record: StageGateRecord,
	issues: string[],
): void {
	const ids = record.checks.map((check) => check.checkId);
	if (ids.join(",") !== RELEASE_CHECK_IDS.join(",")) {
		issues.push(
			`passed release record requires exactly the checks ${RELEASE_CHECK_IDS.join(", ")} in that order`,
		);
	}
	const evidenceOf = (checkId: string): CheckEvidence | undefined =>
		record.checks.find((check) => check.checkId === checkId)?.evidence;
	const replay = evidenceOf("acceptance-replay");
	validateReplayEvidence(replay, issues);
	const intact = evidenceOf("acceptance-evidence-intact");
	if (
		intact?.run_id !== replay?.run_id ||
		intact?.report_digest !== replay?.report_digest ||
		(intact?.run_id ?? "") === ""
	) {
		issues.push(
			"passed release record requires acceptance-evidence-intact to name the replay's run_id and report_digest",
		);
	}
}

export function validatePassedRecordConstraints(
	record: StageGateRecord,
	issues: string[],
): void {
	if (record.status !== "passed") {
		return;
	}
	if (record.gateId !== "s0" && record.gateId !== "release") {
		issues.push('gate_id must be "s0" or "release" for passed records');
	}
	for (const check of record.checks) {
		if (check.status !== "passed") {
			issues.push(
				`passed record requires every check passed (${check.checkId})`,
			);
		}
	}
	if (record.gateId === "release") {
		validatePassedRelease(record, issues);
	} else {
		validatePassedS0(record, issues);
	}
}
