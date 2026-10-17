/**
 * What a record that claims `passed` must also hold, per gate. The other
 * statuses describe what happened and carry no claim, so they are not held to
 * these. Constraints mirror data-models/stage_gate_record.cue.
 */
import type { StageGateRecord } from "./types.js";

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

/**
 * The release gate attests that the documented scenarios replayed: all three
 * acceptance checks, in order, and the digest of the report that says so. An
 * empty or partial check list would pass "every check passed" vacuously.
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
	const replay = record.checks.find(
		(check) => check.checkId === "acceptance-replay",
	);
	if (!DIGEST_RE.test(replay?.evidence.report_digest ?? "")) {
		issues.push(
			"passed release record requires acceptance-replay evidence report_digest",
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
